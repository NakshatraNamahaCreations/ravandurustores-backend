const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    mobilenumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      set: v => v.replace(/\D/g, "").slice(-10), // 🔥 ALWAYS normalize
      match: /^[6-9]\d{9}$/,
    },

    password: {
      type: String,
      required: true,
    },

    resetToken: String,
    resetTokenExpiry: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
