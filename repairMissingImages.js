// repairMissingImages.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Order = require("./models/Order");
const Product = require("./models/Product");

dotenv.config();

const API_BASE = "https://api.ravandurustores.com";

// Normalize image like in your app
const normalizeImage = (img) => {
  if (!img) return null;

  // already full URL
  if (img.startsWith("http://") || img.startsWith("https://")) {
    return img.trim();
  }

  // "/uploads/xxx.jpg"
  if (img.startsWith("/uploads/")) {
    return `${API_BASE}${img}`;
  }

  // "uploads/xxx.jpg"
  if (img.startsWith("uploads/")) {
    return `${API_BASE}/${img}`;
  }

  return null;
};

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const orders = await Order.find({});
    let updatedOrders = 0;

    for (const order of orders) {
      let changed = false;

      for (const item of order.items || []) {
        if (!item.productId) continue;

        const product = await Product.findById(item.productId).lean();
        if (!product || !product.images || !product.images.length) continue;

        const productImgRaw = product.images[0]; // first image from product
        const productImgNormalized = normalizeImage(productImgRaw);

        // If order item image is missing or different, overwrite it
        if (!item.productImage || item.productImage !== productImgNormalized) {
          item.productImage = productImgNormalized;
          changed = true;
        }
      }

      if (changed) {
        await order.save();
        updatedOrders++;
        console.log("🔄 Updated order:", order._id.toString());
      }
    }

    console.log(`✅ Done. Updated ${updatedOrders} orders.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error while repairing images:", err);
    process.exit(1);
  }
}

run();
