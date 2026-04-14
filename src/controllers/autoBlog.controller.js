import { z } from 'zod';
import AutoGenJob from '../models/AutoGenJob.model.js';
import { getAutoBlogConfig, updateAutoBlogConfig, runAutoBlogGeneration, connectPuterForAutomation } from '../services/auto-blog.service.js';

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  categories: z.array(z.string()).optional(),
  runAtHourUTC: z.number().int().min(0).max(23).optional(),
  runAtMinuteUTC: z.number().int().min(0).max(59).optional(),
});

export async function getAutoBlogSettings(req, res, next) {
  try {
    const config = await getAutoBlogConfig();
    res.json({
      success: true,
      data: {
        enabled: config.enabled,
        frequency: config.frequency,
        categories: config.categories,
        lastCategoryUsed: config.lastCategoryUsed,
        lastRunAt: config.lastRunAt,
        runAtHourUTC: config.runAtHourUTC,
        runAtMinuteUTC: config.runAtMinuteUTC,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAutoBlogSettings(req, res, next) {
  try {
    const input = updateSchema.parse(req.body || {});
    const config = await updateAutoBlogConfig(input);
    res.json({ success: true, data: config });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() },
      });
    }
    next(err);
  }
}

export async function runAutoBlogNow(req, res, next) {
  try {
    const result = await runAutoBlogGeneration({ force: true });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function connectPuter(req, res, next) {
  try {
    const result = await connectPuterForAutomation();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listAutoBlogLogs(req, res, next) {
  try {
    const jobs = await AutoGenJob.find({})
      .sort({ jobDate: -1 })
      .limit(60)
      .populate('postId', 'title slug status publishedAt')
      .lean();
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
}
