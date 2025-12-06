const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },

    email: { 
      type: String, 
      required: true,
      unique: true,        // ensures no duplicate email
      index: true          // speeds up DB lookup
    },

    mobileNumber: { 
      type: String, 
      required: true,
      unique: true,        // ensures no duplicate number
      index: true          // speeds up DB lookup
    },

    state: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Address", addressSchema);
