// models/Order.js
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
  },

  productName: {
    type: String,
    required: true,
  },

  productImage: {
    type: String,
  },

  // price per pack / per selected variant
  price: {
    type: Number,
    required: true,
  },

  // how many packs/units the customer ordered (integer)
  quantity: {
    type: Number,
    required: true,
    default: 1,
  },

  // descriptive unit for the item as a whole (kept for backwards compatibility)
  unit: {
    type: String,
    enum: [
      "g",
      "kg",
      "mg",
      "ltr",
      "ml",
      "pcs",
      "packet",
      "box",
      "dozen",
      "unit",
      "other",
    ],
    default: "pcs",
  },

  // NEW: pack size (numeric) and pack unit (e.g. 200, 'g') — taken from product.variant
  packSize: {
    type: Number, // e.g. 200
  },
  packUnit: {
    type: String, // e.g. 'g', 'kg', 'ml', 'pcs'
  },
});

const orderSchema = new mongoose.Schema(
  {
    merchantTransactionId: {
      type: String,
      unique: true,
      sparse: true,
    },

    customOrderId: {
      type: String,
      unique: true,
      index: true,
    },

    customerId: {
      type: String,
    },

    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    paymentMode: {
      type: String,
      enum: ["COD", "Online", "UPI", "Card"],
      required: true,
    },

    items: [orderItemSchema],

    status: {
      type: String,
      default: "Pending",
    },

    paymentTransactionId: {
      type: String,
    },
  },
  { timestamps: true }
);

// Auto-generate customOrderId (MO001, MO002, ...)
orderSchema.pre("save", async function (next) {
  if (!this.customOrderId) {
    const lastOrder = await mongoose.model("Order").findOne().sort({ createdAt: -1 });

    let newId = "MO001";

    if (lastOrder?.customOrderId) {
      const lastNum = parseInt(lastOrder.customOrderId.replace("MO", ""), 10);
      newId = `MO${String(lastNum + 1).padStart(3, "0")}`;
    }

    this.customOrderId = newId;
  }

  next();
});

module.exports = mongoose.model("Order", orderSchema);
