import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    post: {type: mongoose.Schema.Types.ObjectId,ref: 'BlogPost', required: true,index: true,},
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true,},
    content: { type: String, required: true,trim: true,},
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null, 
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Comment', commentSchema);