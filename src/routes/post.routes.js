import { Router } from 'express';
import { authMiddleware, authMiddlewareOptional } from '../security/auth.js';
import multer from 'multer';
import { Router as _Router } from 'express';
import Comment from '../models/Comment.model.js';
import { z } from 'zod';
import { listPosts,getBySlug,createPost,updatePost,deletePost,publishPost,getPostMeta,listScheduledPosts,userCreateScheduledPost, listUserDashboardPosts, listUserScheduledPosts,} from '../controllers/post.controller.js';
import { fetchPostById } from '../controllers/admin.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.get('/', listPosts);
router.get('/user-dashboard', authMiddleware, listUserDashboardPosts);
router.get('/scheduled', listScheduledPosts);
router.get('/userscheduled',authMiddleware, listUserScheduledPosts);
router.post('/', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), createPost);
router.patch('/:id', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), updatePost);
router.delete('/:id', authMiddleware, deletePost);
router.post('/scheduled', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), userCreateScheduledPost);
router.post('/:id/publish', authMiddleware, publishPost);
router.get('/:id/meta', getPostMeta);
router.get('/:id', fetchPostById);
router.get('/:slug', getBySlug);

// Comments
const commentSchema = z.object({content: z.string().min(1).max(2000), parentId: z.string().optional().nullable(),});

router.get('/:id/comments',authMiddlewareOptional, async (req, res, next) => {
    try {
      const userId = req.user?.id || null; 
      const { id } = req.params;
  
      const comments = await Comment.find({ post: id })
        .sort({ createdAt: -1 })
        .populate('author', 'fullName avatarUrl')
        .lean();
  
      const mapped = comments.map(c => ({
        ...c,
        liked: userId ? c.likedBy.some(u => u.toString() === userId) : false,
        canDelete: userId ? c.author?._id?.toString() === userId : false,
      }));
  
      res.json({ success: true, data: mapped });
    } catch (err) {
      next(err);
    }
});
  
router.post('/comments/:commentId/like', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const comment = await Comment.findById(req.params.commentId);
  
    if (!comment) {
      return res.status(404).json({ success: false });
    }
  
    const alreadyLiked = comment.likedBy.includes(userId);
  
    if (alreadyLiked) {
      comment.likedBy.pull(userId);
      comment.likes -= 1;
    } else {
      comment.likedBy.push(userId);
      comment.likes += 1;
    }
  
    await comment.save();
  
    res.json({
      success: true,
      likes: comment.likes,
      liked: !alreadyLiked,
    });
});
  
router.post('/:id/comments', authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const input = commentSchema.parse(req.body);

        const created = await Comment.create({
        post: id,
        author: req.user.id,
        content: input.content,
        parent: input.parentId || null,
        });

        res.status(201).json({
        success: true,
        comment: await created.populate('author', 'fullName avatarUrl'),
        });
    } catch (err) {
        if (err instanceof z.ZodError)
        return res.status(422).json({ success: false, error: err.flatten() });
        next(err);
    }
});
  
router.delete('/:postId/comments/:commentId', authMiddleware, async (req, res, next) => {
    try {
        const { postId, commentId } = req.params;
        const comment = await Comment.findById(commentId);
        if (!comment || String(comment.post) !== postId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Comment not found' } });
        if (String(comment.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete' } });
        await comment.deleteOne();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
});

router.get('/admin/posts/:id/comments', authMiddleware, async (req, res, next) => {
    try {
      const { id } = req.params;
  
      const comments = await Comment.find({ post: id })
        .sort({ createdAt: -1 })
        .populate('author', 'fullName email avatarUrl')
        .populate('likedBy', 'fullName email')
        .lean();
  
      res.json({
        success: true,
        data: comments.map(c => ({
          _id: c._id,
          content: c.content,
          createdAt: c.createdAt,
          likes: c.likes,
          parent: c.parent,
          author: c.author,
          likedBy: c.likedBy, 
        })),
      });
    } catch (err) {
      next(err);
    }
});

export default router;
