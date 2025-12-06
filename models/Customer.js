// In models/Customer.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname:  { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      index: true,          // 🔥 speeds up login / register lookups
      trim: true,
      lowercase: true,
    },

    password: { type: String, required: true },

    mobilenumber: {
      type: String,
      required: true,
      unique: true,         // 🔥 prevents duplicate accounts
      index: true,          // 🔥 speeds up checks by mobile
      trim: true,
    },

    resetToken: String,
    resetTokenExpiry: Date,
  },
  { timestamps: true }
);

// Extra safety: ensure indexes exist
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobilenumber: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
