const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,            // 🔍 fast lookups by user
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,            // 🔍 fast lookups by product
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

// ✅ Prevent same product being added multiple times by same user
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports =
  mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
