import mongoose from 'mongoose';

const autoBlogConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false, index: true },
    frequency: {
      type: String,
      enum: ['daily'],
      default: 'daily',
    },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    lastCategoryUsed: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    lastRunAt: { type: Date, default: null },
    runAtHourUTC: { type: Number, default: 3, min: 0, max: 23 },
    runAtMinuteUTC: { type: Number, default: 0, min: 0, max: 59 },
  },
  { timestamps: true }
);

export default mongoose.model('AutoBlogConfig', autoBlogConfigSchema);
