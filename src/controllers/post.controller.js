import { z } from 'zod';
import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import BlogPost from '../models/BlogPost.model.js';
import { computeReadTimeMinutesFromHtml } from '../utils/readtime.js';
import { uploadBufferToS3 } from '../utils/s3.js';
import PostView from '../models/PostView.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';
import { verifyAccessToken } from '../security/auth.js';
import mongoose from 'mongoose';
import { creditBlogPostReward } from '../utils/wallet.js';

const listQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    category: z.string().optional(),
    tag: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(['latest', 'trending', 'featured']).optional(),
    authorId: z.string().optional(),
});

export async function listPosts(req, res, next) {
    try {
        const q = listQuerySchema.parse(req.query);
        const page = Math.max(parseInt(q.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(q.limit || '10', 10), 1), 50);
        const filter = { status: 'published' };
        if (q.category) filter.category = q.category;
        if (q.tag) filter.tags = q.tag;
        if (q.authorId) {
            filter.author = new mongoose.Types.ObjectId(q.authorId);
        }
        let sort = { publishedAt: -1 };
        if (q.sort === 'featured') sort = { isFeatured: -1, publishedAt: -1 };
        if (q.sort === 'trending') sort = { trendScore: -1 };
        const query = BlogPost.find(filter).populate('author', 'fullName').populate('category', 'name slug').populate('tags', 'name slug');
        if (q.search) {
            const searchRegex = new RegExp(q.search, 'i'); // 'i' for case-insensitive
            query.find({ title: searchRegex });
        }
        const [data, total] = await Promise.all([
            query.sort(sort).skip((page - 1) * limit).limit(limit),
            BlogPost.countDocuments(filter),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

export async function listUserDashboardPosts(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page || "1", 10), 1);
      const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
      const userId = req.user.id;

      const filter = {
        author: userId,
        isDeleted: { $ne: true }, 
        $or: [
            { scheduledAt: null }, // normal posts
            { status: "published", scheduledAt: { $ne: null } } // published scheduled posts
          ],
      };
  
      const [posts, total] = await Promise.all([
        BlogPost.find(filter)
            .sort({
                status: -1,          
                publishedAt: -1,    
                createdAt: -1      
            })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("author", "fullName")
            .populate("category", "name slug"),
  
        BlogPost.countDocuments(filter),
      ]);
  
      const data = posts.map((post) => {
        let uiStatus = 'published';

        if (post.status === 'pending') {
          uiStatus = 'under_review';
        } else if (post.status === 'rejected') {
          uiStatus = 'rejected';
        } else if (post.status === 'draft') {
          uiStatus = 'draft';
        } else if (post.status === 'scheduled') {
          uiStatus = 'scheduled'; 
        }
  
        return {
          ...post.toObject(),
          uiStatus,
        };
      });
  
      res.json({
        success: true,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      next(err);
    }
}

export async function getBySlug(req, res, next) {
    try {
        const { slug } = req.params;
        const post = await BlogPost.findOne({ slug, status: 'published', publishedAt: { $lte: new Date() } })
            .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl')
            .populate('category', 'name slug')
            .populate('tags', 'name slug');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        // Unique view increment for authenticated users
        const userId = req.user && req.user.id;
        if (userId) {
            try {
                const created = await PostView.create({ post: post._id, user: userId });
                if (created) {
                    await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
                    post.views = (post.views || 0) + 1;
                }
            } catch (e) {
                // ignore duplicate key errors (already viewed)
            }
        } else {
            // For unauthenticated, still increment a soft view (optional). Comment out if strict unique is desired
            await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
            post.views = (post.views || 0) + 1;
        }
        const previous = await BlogPost.findOne({ status: 'published', publishedAt: { $lt: post.publishedAt } })
            .sort({ publishedAt: -1 })
            .select('title slug');
        const nextPost = await BlogPost.findOne({ status: 'published', publishedAt: { $gt: post.publishedAt } })
            .sort({ publishedAt: 1 })
            .select('title slug');
        const readNext = await BlogPost.find({ status: 'published', _id: { $ne: post._id }, category: post.category })
            .sort({ trendScore: -1 })
            .limit(5)
            .select('title slug summary');
        res.json({ success: true, post, previous: previous || null, next: nextPost || null, readNext });
    } catch (err) {
        return next(err);
    }
}

const createSchema = z.object({
    title: z.string().min(3),
    subtitle: z.string().optional(),
    contentHtml: z.string().min(10),
    bannerImageUrl: z.union([z.string().url(), z.literal('')]).optional(),
    imageUrls: z.array(z.union([z.string().url(), z.literal('')])).optional(),
    categoryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['draft', 'published']).optional(),
    scheduledAt: z.string().optional(),
    publishedAt: z.string().optional(), 
});

export async function createPost(req, res, next) {
  try {
    const body = { ...req.body };
    if (typeof body.tags === 'string') body.tags = [body.tags];
    if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
    if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
    if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);
    const files = req.files || {};
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

    if (files.bannerImage?.[0]) {
      const file = files.bannerImage[0];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(422).json({
          success: false,
          error: { message: 'Invalid banner image type' },
        });
      }
      const uploaded = await uploadBufferToS3({
        buffer: file.buffer,
        contentType: file.mimetype,
        keyPrefix: 'post-banners',
      });
      body.bannerImageUrl = uploaded.publicUrl;
    }

    if (Array.isArray(files.images) && files.images.length > 0) {
      const uploads = files.images
        .filter(f => allowedTypes.includes(f.mimetype))
        .map(f =>
          uploadBufferToS3({
            buffer: f.buffer,
            contentType: f.mimetype,
            keyPrefix: 'post-images',
          })
        );
      const results = await Promise.all(uploads);
      body.imageUrls = results.map(r => r.publicUrl);
    }

    const input = createSchema.parse(body);
    let baseSlug = slugify(input.title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    while (await BlogPost.exists({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }
    const sanitizedHtml = sanitizeHtml(input.contentHtml);
    const readingTimeMinutes = computeReadTimeMinutesFromHtml(sanitizedHtml);
    const isAdmin = req.user.role === 'admin';
    const finalStatus = isAdmin ? 'published' : 'pending';
    const finalPublishedAt = isAdmin ? new Date() : null;
    const post = await BlogPost.create({
      title: input.title,
      subtitle: input.subtitle,
      contentHtml: sanitizedHtml,
      summary: sanitizedHtml.replace(/<[^>]+>/g, '').slice(0, 250),
      bannerImageUrl: input.bannerImageUrl,
      imageUrls: input.imageUrls || [],
      category: input.categoryId || undefined,
      tags: input.tags || [],
      author: req.user.id,
      status: finalStatus,           
      publishedAt: finalPublishedAt,  
      slug,
      readingTimeMinutes,
    });

    if (post.status === 'published') {
      creditBlogPostReward(post._id, req.user.id).catch(err => {
        console.error('Wallet credit failed:', err);
      });
    }

    res.status(201).json({
      success: true,
      post: {
        _id: post._id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        publishedAt: post.publishedAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({
        success: false,
        error: {
          message: 'Invalid input',
          details: err.flatten(),
        },
      });
    }
    next(err);
  }
}

const updateSchema = createSchema.partial();

export async function updatePost(req, res, next) {
    try {
        const { id } = req.params;
        const body = { ...req.body };

        if (req.user.role !== "admin") {
            delete body.status;
        }

        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);
        const files = req.files || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

        if (files.bannerImage && files.bannerImage[0]) {
            const file = files.bannerImage[0];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid banner image type' },
                });
            }
            const uploaded = await uploadBufferToS3({
                buffer: file.buffer,
                contentType: file.mimetype,
                keyPrefix: 'post-banners',
            });
            body.bannerImageUrl = uploaded.publicUrl;
        }

        if (files.images && Array.isArray(files.images) && files.images.length > 0) {
            const uploads = [];
            for (const file of files.images) {
                if (!allowed.includes(file.mimetype)) continue;
                uploads.push(
                    uploadBufferToS3({
                        buffer: file.buffer,
                        contentType: file.mimetype,
                        keyPrefix: 'post-images',
                    })
                );
            }
            const results = await Promise.all(uploads);
            const urls = results.map((r) => r.publicUrl);
            body.imageUrls = urls;
        }

        const input = updateSchema.parse(body);

        // Convert empty strings to undefined for optional image fields
        if (input.bannerImageUrl === '') input.bannerImageUrl = undefined;
        if (input.imageUrls) {
            input.imageUrls = input.imageUrls.filter(url => url && url !== '');
            if (input.imageUrls.length === 0) input.imageUrls = undefined;
        }

        // Fetch post
        const post = await BlogPost.findById(id);

        if (!post)
            return res
                .status(404)
                .json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });

        // Permission check
        if (String(post.author) !== req.user.id && req.user.role !== 'admin')
            return res
                .status(403)
                .json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot edit' } });
                
        if ( post.status === "rejected" && req.user.role !== "admin" ) {
            post.status = "pending";
            post.publishedAt = null;
            if (input.scheduledAt) {
                post.scheduledAt = new Date(input.scheduledAt);
            }
        }

        if ( post.status === "scheduled" && req.user.role !== "admin" && input.scheduledAt ) {
            post.status = "pending";
            post.publishedAt = null;
            post.scheduledAt = new Date(input.scheduledAt);
        }
        // Apply updates
        if (input.title) post.title = input.title;
        if (input.subtitle !== undefined) post.subtitle = input.subtitle;
        if (input.contentHtml) {
            post.contentHtml = sanitizeHtml(input.contentHtml);
            post.readingTimeMinutes = computeReadTimeMinutesFromHtml(post.contentHtml);
        }
        if (input.bannerImageUrl !== undefined) post.bannerImageUrl = input.bannerImageUrl;

        // ✅ Replace imageUrls instead of appending
        if (Array.isArray(input.imageUrls)) {
            post.imageUrls = input.imageUrls;
        }

        if (Array.isArray(input.tags)) {
            post.tags = input.tags;
        }

        if (input.categoryId !== undefined) post.category = input.categoryId;
        // ✅ Save scheduledAt if provided (GENERAL CASE)
        if (input.scheduledAt !== undefined) {
            post.scheduledAt = input.scheduledAt
                ? new Date(input.scheduledAt)
                : null;
        }
        
        if (input.scheduledAt && post.publishedAt) {
            post.publishedAt = null;
        }
        
        if (input.status && req.user.role === "admin") {
            post.status = input.status;
        }
        if (input.publishedAt !== undefined) post.publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;

        // Slug update logic
        if (input.title) {
            let baseSlug = slugify(input.title, { lower: true, strict: true });
            let slug = baseSlug;
            let n = 1;
            while (await BlogPost.exists({ slug, _id: { $ne: id } })) {
                slug = `${baseSlug}-${n++}`;
            }
            post.slug = slug;
        }

        await post.save();
        res.json({ success: true, post });
    } catch (err) {
        if (err instanceof z.ZodError)
            return res.status(422).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() },
            });
        return next(err);
    }
}

export async function deletePost(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        if (String(post.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete' } });
        await post.deleteOne();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}

export async function publishPost(req, res, next) {
    try {
      const { id } = req.params;
  
      const post = await BlogPost.findById(id);
      if (!post)
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Post not found' },
        });
  
      if (
        String(post.author) !== req.user.id &&
        req.user.role !== 'admin'
      ) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot publish' },
        });
      }
  
      const wasScheduled = post.status === 'scheduled';
  
      post.status = 'published';
  
      if (wasScheduled && post.scheduledAt) {
        // ✅ MAIN FIX
        post.publishedAt = post.scheduledAt;
        post.scheduledAt = null;
      } else {
        post.publishedAt = new Date();
      }
  
      post.rejectionReason = null;
  
      await post.save();
  
      if (wasScheduled) {
        creditBlogPostReward(post._id, post.author).catch((err) => {
          console.error('Failed to credit wallet for published post:', err);
        });
      }
  
      res.json({ success: true, post });
    } catch (err) {
      return next(err);
    }
}

const listScheduledSchema = z.object({ page: z.string().optional(), limit: z.string().optional(), q: z.string().optional(), userId: z.string().optional() });

export async function listScheduledPosts(req, res, next) {
    try {
        const input = listScheduledSchema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '20', 10), 1), 100);
        const match = { status: 'scheduled' };
        if (input.userId) match.author = input.userId;
        if (input.q) match.title = { $regex: input.q, $options: 'i' };

        const [posts, total] = await Promise.all([
            BlogPost.find(match)
                .sort({ publishedAt: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('title status author readingTimeMinutes tags bannerImageUrl imageUrls createdAt publishedAt isFeatured views slug')
                .populate('author', 'fullName email avatarUrl role'),
            BlogPost.countDocuments(match),
        ]);
        res.json({ success: true, data: posts, total: total, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

export async function listUserScheduledPosts(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10), 1);
      const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
  
      const filter = {
        author: req.user.id,
        isDeleted: false,
        scheduledAt: { $ne: null },
        status: { $ne: "published" },
      };
  
      const [posts, total] = await Promise.all([
        BlogPost.find(filter)
          .sort({ scheduledAt: 1 }) 
          .skip((page - 1) * limit)
          .limit(limit)
          .select(
            'title slug status scheduledAt publishedAt rejectionReason createdAt'
          )
          .populate('category', 'name slug'),
  
        BlogPost.countDocuments(filter),
      ]);
  
      const data = posts.map((post) => {
        let uiStatus = '';
  
        if (post.status === 'pending') {
          uiStatus = 'under_review';
        } else if (post.status === 'rejected') {
          uiStatus = 'rejected';
        } else if (post.status === 'scheduled') {
          uiStatus = 'scheduled';
        } else if (post.status === 'published') {
          uiStatus = 'published';
        }
  
        return {
          ...post.toObject(),
          uiStatus,
        };
      });
  
      res.json({
        success: true,
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
}

const createScheduledSchema = createSchema.extend({ status: z.literal('scheduled'), publishedAt: z.string() });

export async function userCreateScheduledPost(req, res, next) {
    try {
        const body = { ...req.body };
        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);
       
        const files = req.files || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
        if (files.bannerImage && files.bannerImage[0]) {
            const file = files.bannerImage[0];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid banner image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-banners' });
            body.bannerImageUrl = uploaded.publicUrl;
        }
        if (files.images && Array.isArray(files.images) && files.images.length > 0) {
            const uploads = [];
            for (const file of files.images) {
                if (!allowed.includes(file.mimetype)) continue;
                uploads.push(uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-images' }));
            }
            const results = await Promise.all(uploads);
            const urls = results.map(r => r.publicUrl);
            body.imageUrls = Array.isArray(body.imageUrls) ? [...body.imageUrls, ...urls] : urls;
        }
        const input = createScheduledSchema.parse(body);
        // Convert empty strings to undefined for optional image fields
        if (input.bannerImageUrl === '') input.bannerImageUrl = undefined;
        if (input.imageUrls) {
            input.imageUrls = input.imageUrls.filter(url => url && url !== '');
            if (input.imageUrls.length === 0) input.imageUrls = undefined;
        }
        // Force scheduled; publishedAt must be in future
        const when = new Date(input.publishedAt);
        if (!(when instanceof Date) || Number.isNaN(when.getTime())) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid publishedAt' } });
        if (when <= new Date()) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'publishedAt must be in the future' } });

        let baseSlug = slugify(input.title, { lower: true, strict: true });
        let slug = baseSlug;
        let n = 1;
        while (await BlogPost.exists({ slug })) {
            slug = `${baseSlug}-${n++}`;
        }
        const sanitized = sanitizeHtml(input.contentHtml);
        const readingTimeMinutes = computeReadTimeMinutesFromHtml(sanitized);
        const post = await BlogPost.create({
            title: input.title,
            subtitle: input.subtitle,
            contentHtml: sanitized,
            summary: sanitized.replace(/<[^>]+>/g, '').slice(0, 250),
            bannerImageUrl: input.bannerImageUrl,
            imageUrls: input.imageUrls || [],
            category: input.categoryId || undefined,
            tags: input.tags || [],
            author: input.authorId || req.user.id,
            status: 'pending',      
            scheduledAt: when,          
            publishedAt: null,
            slug,
            readingTimeMinutes,
        });
        res.status(201).json({ success: true, post });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function getPostMeta(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findOne({ _id: id, status: 'published', $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }, { publishedAt: { $exists: false } }] })
            .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl')
            .populate('category', 'name slug');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        // increment view count
        await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
        const newViews = (post.views || 0) + 1;
        const [commentsCount, favoritesCount] = await Promise.all([
            Comment.countDocuments({ post: id }),
            User.countDocuments({ favorites: id }),
        ]);
        let isFavorited = false;
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (token) {
            try {
                const decoded = verifyAccessToken(token);
                const user = await User.findById(decoded.id).select('_id favorites');
                if (user) isFavorited = user.favorites?.some((f) => String(f) === String(id)) || false;
            } catch (_e) {
                // ignore invalid token
            }
        }
        res.json({ success: true, meta: { commentsCount, favoritesCount, isFavorited, views: newViews }, author: post.author, category: post.category });
    } catch (err) {
        return next(err);
    }
}
