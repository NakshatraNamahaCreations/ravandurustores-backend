const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    merchantTransactionId: { 
      type: String, 
      unique: true 
    },

    customOrderId: { 
      type: String, 
      unique: true, 
      index: true 
    },

    customerId: { 
      type: String 
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

    items: [
      {
        productName: {
          type: String,
          required: true,
        },

        productImage: {
          type: String,
        },

        price: {
          type: Number,
          required: true,
        },

        quantity: {
          type: Number,
          required: true,
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
            "other"
          ],
          default: "pcs",
        },
      },
    ],

    status: {
      type: String,
      default: "Pending",
    },

    paymentTransactionId: { 
      type: String 
    },
  },
  { timestamps: true }
);

// Auto-generate customOrderId (MO001, MO002, ...)
orderSchema.pre("save", async function (next) {
  if (!this.customOrderId) {
    const lastOrder = await mongoose
      .model("Order")
      .findOne()
      .sort({ createdAt: -1 });

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
