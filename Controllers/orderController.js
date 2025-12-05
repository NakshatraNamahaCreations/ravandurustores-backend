const Order = require("../models/Order");
const Address = require("../models/Address");
const Product = require("../models/Product");

const orderController = {
  // -----------------------------
  // CREATE ORDER
  // -----------------------------
  createOrder: async (req, res) => {
    try {
      const { addressId, amount, paymentMode, items } = req.body;

      if (!addressId || !amount || !paymentMode || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Invalid or missing fields." });
      }

      const address = await Address.findById(addressId);
      if (!address) return res.status(404).json({ message: "Address not found" });

      let calculatedAmount = 0;

      // Validate items, stock, and calculate total
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) return res.status(404).json({ message: `Product not found: ${item.productId}` });

        // Variant-level stock check if variantId exists
        let variantStock = product.stock;
        if (item.variantId) {
          const variant = product.variants.id(item.variantId);
          if (!variant) return res.status(404).json({ message: `Variant not found: ${item.variantId}` });
          variantStock = variant.stock;
        }

        if (variantStock < item.qty) {
          return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
        }

        // Use variant price if provided
        const price = item.price ?? (item.variantId ? product.variants.id(item.variantId)?.price : product.price);
        calculatedAmount += price * item.qty;
      }

      if (amount !== calculatedAmount) {
        return res.status(400).json({
          message: "Amount mismatch. Please refresh cart.",
          calculatedAmount,
        });
      }

      // Reduce stock
      for (const item of items) {
        if (item.variantId) {
          await Product.updateOne(
            { _id: item.productId, "variants._id": item.variantId },
            { $inc: { "variants.$.stock": -item.qty } }
          );
        } else {
          await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.qty } });
        }
      }

      // Format items for order
     // inside createOrder, replace the formattedItems building loop with this:
const formattedItems = [];

for (const item of items) {
  const product = await Product.findById(item.productId);
  if (!product) return res.status(404).json({ message: `Product not found: ${item.productId}` });

  // pick productName and productImage from product (or accept from client if provided)
  const productName = item.productName ?? product.name ?? "Unknown product";
  const productImage = item.productImage ?? (product.images && product.images[0]) ?? "";

  // quantity = how many packs customer ordered (qty vs quantity)
  const quantity = item.qty ?? item.quantity ?? 1;

  // DEFAULT unit fallback
  const fallbackUnit = item.unit ?? product.unit ?? "pcs";

  // Try to obtain packSize/packUnit in this priority:
  // 1. item.packSize + item.packUnit (client explicitly submitted)
  // 2. variant-level fields (if variantId provided and variant has weight/size fields)
  // 3. product-level default size/unit (if product has them)
  let packSize = item.packSize ?? item.weight ?? null;
  let packUnit = item.packUnit ?? item.selectedUnit ?? null;

  if ((!packSize || !packUnit) && item.variantId) {
    const variant = product.variants?.id(item.variantId);
    if (variant) {
      // adapt these keys to whatever your variant schema uses: weight, size, packSize, unit, packUnit, label, etc.
      packSize = packSize ?? variant.packSize ?? variant.weight ?? variant.size ?? variant.selectedWeight ?? null;
      packUnit = packUnit ?? variant.packUnit ?? variant.unit ?? variant.selectedUnit ?? null;
    }
  }

  // fallback to product-level descriptors if still missing
  packSize = packSize ?? product.packSize ?? product.weight ?? null;
  packUnit = packUnit ?? product.packUnit ?? product.unit ?? null;

  // Normalize numeric packSize if it's a string like "200 gm"
  if (typeof packSize === "string") {
    const m = packSize.match(/([\d.]+)/);
    if (m) packSize = Number(m[1]);
  }

  // price normalize - prefer item.price, else variant price, else product.price
  const price = item.price ?? (item.variantId ? (product.variants?.id(item.variantId)?.price ?? product.price) : product.price) ?? 0;

  formattedItems.push({
    productId: item.productId,
    variantId: item.variantId ?? null,
    productName,
    productImage,
    price,
    quantity,               // how many packs ordered
    unit: fallbackUnit,     // unit for the ordering quantity (usually pcs)
    packSize: packSize ?? undefined,   // numeric pack size (e.g. 200)
    packUnit: packUnit ?? undefined,   // unit for pack size (e.g. 'gm')
  });
}


      // The Order model expects `address` (per your schema). Use that field name.
      const newOrder = new Order({
        userId: req.user?._id,
        address: addressId,     // <- IMPORTANT: set `address`, not `addressId`
        amount,
        paymentMode,
        items: formattedItems,
        status: "Pending",
      })

      const savedOrder = await newOrder.save();

      res.status(201).json({
        message: "Order placed successfully",
        order: savedOrder,
      });
    } catch (error) {
      console.error("createOrder error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },

  // -----------------------------
  // GET ALL ORDERS (Admin)
  // -----------------------------
  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        .populate("userId", "name email")
        .populate("addressId")
        .populate("items.productId", "name images price")
        .sort({ createdAt: -1 });

      res.status(200).json(orders);
    } catch (error) {
      console.error("getAllOrders error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },

  // -----------------------------
  // GET SINGLE ORDER
  // -----------------------------
  getOrderById: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate("userId", "name email")
        .populate("addressId")
        .populate("items.productId", "name images price");

      if (!order) return res.status(404).json({ message: "Order not found" });

      res.status(200).json(order);
    } catch (error) {
      console.error("getOrderById error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },

  // -----------------------------
  // UPDATE ORDER STATUS
  // -----------------------------
  updateOrderStatus: async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });

      const updatedOrder = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
      if (!updatedOrder) return res.status(404).json({ message: "Order not found" });

      res.status(200).json({ message: "Status updated successfully", order: updatedOrder });
    } catch (error) {
      console.error("updateOrderStatus error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },

  // -----------------------------
  // DELETE ORDER
  // -----------------------------
  deleteOrder: async (req, res) => {
    try {
      const deletedOrder = await Order.findByIdAndDelete(req.params.id);
      if (!deletedOrder) return res.status(404).json({ message: "Order not found" });

      res.status(200).json({ message: "Order deleted successfully", order: deletedOrder });
    } catch (error) {
      console.error("deleteOrder error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },
};

module.exports = orderController;
