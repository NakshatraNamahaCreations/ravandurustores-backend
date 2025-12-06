const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true   // 🔥 speeds up lookup & prevents duplicates efficiently
    },

    status: { 
      type: String, 
      enum: ["Active", "Inactive"], 
      default: "Active" 
    },
  },
  { timestamps: true }
);

// Ensure index creation even after schema updates
categorySchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Category", categorySchema);
