const Order = require("../models/Order");
const Address = require("../models/Address");
const Product = require("../models/Product");

const orderController = {
  // Create a new order
  createOrder: async (req, res) => {
    try {
      const { addressId, amount, paymentMode, items } = req.body;

      // Validate required fields
      if (!addressId || !amount || !paymentMode || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "All required fields must be provided, including items." });
      }

      // Check address existence
      const addressExists = await Address.findById(addressId);
      if (!addressExists) {
        return res.status(404).json({ error: "Address not found." });
      }

      // Validate and update product stock
      for (const item of items) {
        const { productName, quantity } = item;

        // Check for missing fields
        if (!productName || !quantity || quantity <= 0) {
          return res.status(400).json({ error: "Each item must have a valid productName and quantity > 0." });
        }

        const product = await Product.findOne({ name: productName });
        if (!product) {
          return res.status(404).json({ error: `Product '${productName}' not found.` });
        }

        if (product.stock < quantity) {
          return res.status(400).json({ error: `Insufficient stock for '${productName}'. Available: ${product.stock}` });
        }

        // Update stock and soldStock
        product.stock -= quantity;
        product.soldStock = (product.soldStock || 0) + quantity;
        await product.save();
      }

      // All validations passed, create order
      const newOrder = new Order({
        address: addressId,
        amount,
        paymentMode,
        items,
      });

      await newOrder.save();
      res.status(201).json({ message: "Order created successfully", order: newOrder });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Server error while creating order" });
    }
  },

  // Get all orders
  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find().populate("address").sort({ createdAt: -1 });
      res.status(200).json(orders);
    } catch (error) {
      res.status(500).json({ error: "Server error while fetching orders" });
    }
  },

  // Get single order
  getOrderById: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).populate("address");
      if (!order) return res.status(404).json({ error: "Order not found" });

      res.status(200).json(order);
    } catch (error) {
      res.status(500).json({ error: "Server error while fetching order" });
    }
  },

  // Delete an order
  deleteOrder: async (req, res) => {
    try {
      const order = await Order.findByIdAndDelete(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });

      res.status(200).json({ message: "Order deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Server error while deleting order" });
    }
  },

  // Update order status
  updateOrderStatus: async (req, res) => {
    try {
      const { status } = req.body;
      const updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate("address");

      if (!updatedOrder) return res.status(404).json({ error: "Order not found" });

      res.status(200).json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ error: "Server error while updating status" });
    }
  },
};

module.exports = orderController;
