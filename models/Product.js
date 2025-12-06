const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    // Product name – often used for search
    name: { 
      type: String, 
      required: true, 
      trim: true,
      index: true          // 🔍 speeds up name-based search
    },

    // Category – used in filters and listing pages
    category: { 
      type: String, 
      trim: true,
      index: true          // 🔥 filter by category quickly
    },

    stock: { 
      type: Number, 
      default: 0,
      index: true          // useful if you sort/filter by stock
    },

    soldStock: { 
      type: Number, 
      default: 0,
      index: true          // useful for "bestsellers"
    },

    description: { type: String },
    ingredientsDescription: { type: String },

    images: [String],

    discountPercentage: { 
      type: Number, 
      default: 0,
      index: true          // for "on offer" / "discount" filters
    },

    variants: [
      {
        quantity: { type: String, required: true }, // e.g., '500g', '1kg'
        price:    { type: Number, required: true }, // e.g., 120, 150
        unit:     { type: String, required: true }, // e.g., 'g', 'kg', 'ml'
      },
    ],
  },
  { timestamps: true }
);

// Optional: text index for search on name + description
// This helps with keyword search like "oil", "ghee", etc.
productSchema.index({ name: "text", description: "text" });

module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);
