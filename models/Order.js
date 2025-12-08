const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    index: true,
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

 
  discountPercentage: {
    type: Number,
    default: 0, // store discount at purchase time
  },

  quantity: {
    type: Number,
    required: true,
    default: 1,
  },

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

  packSize: {
    type: Number,
  },
  packUnit: {
    type: String,
  },
});

const orderSchema = new mongoose.Schema(
  {
    merchantTransactionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    customOrderId: {
      type: String,
      unique: true,
      index: true,
    },

    customerId: {
      type: String,
      index: true,
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
      index: true,
    },

    paymentTransactionId: {
      type: String,
    },

    dispatchDate: { type: Date },
deliveryDate: { type: Date },
  },
  { timestamps: true }
);

// Indexes
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

// Auto-generate customOrderId (MO001, MO002, ...)
orderSchema.pre("save", async function (next) {
  if (!this.customOrderId) {
    const lastOrder = await mongoose
      .model("Order")
      .findOne({}, { customOrderId: 1 })
      .sort({ createdAt: -1 })
      .lean();

    let newId = "MO001";

    if (lastOrder?.customOrderId) {
      const lastNum = parseInt(lastOrder.customOrderId.replace("MO", ""), 10);
      newId = `MO${String(lastNum + 1).padStart(3, "0")}`;
    }

    this.customOrderId = newId;
  }

  next();
});

module.exports =
  mongoose.models.Order || mongoose.model("Order", orderSchema);
