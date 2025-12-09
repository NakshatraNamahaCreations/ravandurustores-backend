const Order = require("../models/Order");
const Address = require("../models/Address");
const Product = require("../models/Product");

// 🔥 Normalize any stored image string to a clean relative path
const normalizeImagePath = (img) => {
  if (!img || typeof img !== "string") return null;

  // Strip any domain: https://something.com/uploads/xxx.jpg → /uploads/xxx.jpg
  img = img.replace(/^https?:\/\/[^\/]+/, "");

  // If it starts with "uploads/xxx", ensure it becomes "/uploads/xxx"
  if (img.startsWith("uploads/")) img = "/" + img;

  // Only accept paths that start with "/uploads/"
  if (!img.startsWith("/uploads/")) return null;

  return img;
};

const orderController = {
  // -----------------------------
  // CREATE ORDER
  // -----------------------------
  createOrder: async (req, res) => {
    try {
      const {
        addressId,
        amount,
        paymentMode,
        items,
        merchantTransactionId,
      } = req.body;

      if (
        !addressId ||
        !amount ||
        !paymentMode ||
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({ message: "Invalid or missing fields." });
      }

      const address = await Address.findById(addressId);
      if (!address)
        return res.status(404).json({ message: "Address not found" });

      // helper: normalize unit strings
      const normalizeUnit = (u) => {
        if (!u) return null;
        u = String(u).trim().toLowerCase();
        if (u === "gm" || u === "gms" || u === "grams" || u === "gram")
          return "g";
        if (
          u === "kg" ||
          u === "kgs" ||
          u === "kilogram" ||
          u === "kilograms"
        )
          return "kg";
        if (u === "ml") return "ml";
        if (u === "ltr" || u === "l") return "ltr";
        if (u === "pcs" || u === "pc" || u === "piece" || u === "pieces")
          return "pcs";
        if (u === "packet") return "packet";
        if (u === "box") return "box";
        if (u === "dozen") return "dozen";
        return u; // fallback: return as-is
      };

      // Calculate and validate amount
      let calculatedAmount = 0;

      // ---------------------------------
      // First pass: compute amount & validate stock
      // ---------------------------------
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res
            .status(404)
            .json({ message: `Product not found: ${item.productId}` });
        }

        // determine order quantity (number of packs)
        const orderQty = Number(item.qty ?? item.quantity ?? 1);

        // variant-level stock & price
        let variant = null;
        let variantStock = product.stock ?? 0;
        if (item.variantId) {
          variant = product.variants?.id(item.variantId) ?? null;
          if (!variant) {
            return res
              .status(404)
              .json({ message: `Variant not found: ${item.variantId}` });
          }
          // variant might not have numeric stock; fall back to product stock
          variantStock =
            variant.stock ?? variant.quantity ?? product.stock ?? 0;
        }

        // If stock is defined and numeric, check for availability
        if (typeof variantStock === "number" && variantStock < orderQty) {
          return res
            .status(400)
            .json({ message: `Insufficient stock for ${product.name}` });
        }

        // choose price precedence: item.price > variant.price > product.price
        const unitPrice = Number(
          item.price ?? (variant?.price ?? product.price ?? 0)
        );

        calculatedAmount += unitPrice * orderQty;
      }

      // compare amounts with tolerance for floats
      const floatEq = (a, b, eps = 0.001) =>
        Math.abs(Number(a) - Number(b)) < eps;

      if (!floatEq(amount, calculatedAmount)) {
        return res.status(400).json({
          message: "Amount mismatch. Please refresh cart.",
          calculatedAmount,
        });
      }

      // ---------------------------------
      // Second pass: reduce stock & build formatted items
      // ---------------------------------
      const formattedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res
            .status(404)
            .json({ message: `Product not found: ${item.productId}` });
        }

        const orderQty = Number(item.qty ?? item.quantity ?? 1);

        // pick name
        const productName =
          item.productName ?? product.name ?? "Unknown product";

        // 🔥 Normalize & choose product image safely
        let productImage = null;

        // 1) Prefer image from item (if frontend sent one)
        if (item.productImage) {
          productImage = normalizeImagePath(item.productImage);
        }

        // 2) Otherwise, fallback to product's first image
        if (!productImage && product.images && product.images.length > 0) {
          productImage = normalizeImagePath(product.images[0]);
        }

        // 3) Final fallback to a default image (ensure you have this file)
        if (!productImage) {
          productImage = "/uploads/default.jpg";
        }

        // price normalize
        const variant = item.variantId
          ? product.variants?.id(item.variantId)
          : null;
        const price = Number(
          item.price ?? (variant?.price ?? product.price ?? 0)
        );

        // 🔹 determine discountPercentage for this item
        let discountPercentage;

        // 1) Prefer a valid numeric value from the item (if provided)
        if (
          item.discountPercentage !== undefined &&
          item.discountPercentage !== null &&
          item.discountPercentage !== "" &&
          !isNaN(Number(item.discountPercentage))
        ) {
          discountPercentage = Number(item.discountPercentage);
        }
        // 2) Otherwise, fall back to product's stored discount
        else if (
          product.discountPercentage !== undefined &&
          product.discountPercentage !== null &&
          !isNaN(Number(product.discountPercentage))
        ) {
          discountPercentage = Number(product.discountPercentage);
        }
        // 3) Final fallback
        else {
          discountPercentage = 0;
        }

        // stock decrement
        if (item.variantId && variant) {
          // try to decrement variant stock if variant has stock numeric
          if (typeof variant.stock === "number") {
            await Product.updateOne(
              { _id: item.productId, "variants._id": item.variantId },
              { $inc: { "variants.$.stock": -orderQty } }
            );
          } else {
            // decrement product-level stock
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: -orderQty },
            });
          }
        } else {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: -orderQty },
          });
        }

        // Normalize packSize/packUnit from several possible sources
        let packSize = null;
        let packUnit = null;

        // 1) client-provided explicit fields (preferred)
        if (item.packSize) {
          const m = String(item.packSize).match(/([\d.]+)/);
          if (m) packSize = Number(m[1]);
        }
        if (item.packUnit) packUnit = normalizeUnit(item.packUnit);

        // 2) item-level unit/weight fields
        if (
          (!packSize || !packUnit) &&
          (item.weight || item.selectedWeight || item.selectedUnit)
        ) {
          if (!packSize && (item.weight || item.selectedWeight)) {
            const m = String(item.weight ?? item.selectedWeight).match(
              /([\d.]+)/
            );
            if (m) packSize = Number(m[1]);
          }
          if (!packUnit && item.selectedUnit) {
            packUnit = normalizeUnit(item.selectedUnit);
          }
        }

        // 3) variant fields (product.variants entries)
        if ((!packSize || !packUnit) && variant) {
          // variant.quantity (string like "200") -> number
          if (!packSize && variant.quantity) {
            const m = String(variant.quantity).match(/([\d.]+)/);
            if (m) packSize = Number(m[1]);
          }
          if (!packUnit && variant.unit) {
            packUnit = normalizeUnit(variant.unit);
          }
        }

        // 4) product-level fallback (if product stores quantity/unit)
        if (
          (!packSize || !packUnit) &&
          product.variants &&
          product.variants.length > 0
        ) {
          // try the first variant as last fallback
          const v0 = product.variants[0];
          if (!packSize && v0?.quantity) {
            const m = String(v0.quantity).match(/([\d.]+)/);
            if (m) packSize = Number(m[1]);
          }
          if (!packUnit && v0?.unit) {
            packUnit = normalizeUnit(v0.unit);
          }
        }

        // ensure consistent types
        if (packSize !== null) packSize = Number(packSize);
        if (!packUnit) packUnit = String(item.unit ?? product.unit ?? "pcs");

        // final fallback mapping (convert 'gm' -> 'g' etc)
        packUnit = normalizeUnit(packUnit) ?? "pcs";

        formattedItems.push({
          productId: item.productId,
          variantId: item.variantId ?? null,
          productName,
          productImage,          // ✅ normalized, stable path
          discountPercentage,
          price,
          quantity: orderQty,
          unit: item.unit ?? product.unit ?? "pcs",
          packSize: packSize ?? undefined,
          packUnit: packUnit ?? undefined,
        });
      }

      // build order payload but only include merchantTransactionId if provided (avoid saving null)
      const newOrderData = {
        userId: req.user?._id ?? req.body.userId ?? null,
        address: addressId,
        amount,
        paymentMode,
        items: formattedItems,
        status: "Pending",
      };
      if (merchantTransactionId)
        newOrderData.merchantTransactionId = merchantTransactionId;

      const newOrder = new Order(newOrderData);

      try {
        const savedOrder = await newOrder.save();
        return res
          .status(201)
          .json({ message: "Order placed successfully", order: savedOrder });
      } catch (saveErr) {
        // handle duplicate index (11000) explicitly
        if (saveErr.code === 11000) {
          return res.status(400).json({
            message: "Duplicate key error",
            details: saveErr.keyValue,
          });
        }
        throw saveErr; // bubble up to outer catch
      }
    } catch (error) {
      console.error("createOrder error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message || error });
    }
  },

  // -----------------------------
  // GET ALL ORDERS (Admin)
  // -----------------------------
  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        // .populate("userId", "name email")
        // .populate("addressId")
        .populate("address")
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
        .populate(
          "address",
          "firstName lastName address city state pincode phone"
        )
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
      if (!status)
        return res.status(400).json({ message: "Status is required" });

      const newStatus = status;

      // 1️⃣ Fetch the order
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const oldStatus = order.status;

      // 2️⃣ Update status & set tracking dates
      order.status = newStatus;

      // If moved to "Ready for Dispatch" for the first time
      if (newStatus === "Ready for Dispatch" && !order.dispatchDate) {
        order.dispatchDate = new Date();
      }

      // If moved to "Delivered" for the first time
      if (newStatus === "Delivered" && !order.deliveryDate) {
        order.deliveryDate = new Date();

        // Optional: if somehow dispatchDate not set earlier, set it too
        if (!order.dispatchDate) {
          order.dispatchDate = new Date();
        }
      }

      // 3️⃣ Save updated order (with new status + dates)
      const updatedOrder = await order.save();

      // 4️⃣ If transitioning to "Cancelled" from a non-cancelled state,
      //     restore stock and adjust soldStock
      if (oldStatus !== "Cancelled" && newStatus === "Cancelled") {
        for (const item of order.items) {
          const orderQty = Number(item.quantity || 0);
          if (!orderQty || !item.productId) continue;

          const product = await Product.findById(item.productId);
          if (!product) continue;

          const variant =
            item.variantId && product.variants
              ? product.variants.id(item.variantId)
              : null;

          if (
            item.variantId &&
            variant &&
            typeof variant.stock === "number"
          ) {
            // Variant-level stock: restore that and reduce soldStock
            await Product.updateOne(
              { _id: item.productId, "variants._id": item.variantId },
              {
                $inc: {
                  "variants.$.stock": orderQty, // add back variant stock
                  soldStock: -orderQty, // reduce sold count
                },
              }
            );
          } else {
            // Only product-level stock
            await Product.findByIdAndUpdate(item.productId, {
              $inc: {
                stock: orderQty, // add back to stock
                soldStock: -orderQty, // reduce sold count
              },
            });
          }
        }
      }

      res.status(200).json({
        message: "Status updated successfully",
        order: updatedOrder,
      });
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
      if (!deletedOrder)
        return res.status(404).json({ message: "Order not found" });

      res.status(200).json({
        message: "Order deleted successfully",
        order: deletedOrder,
      });
    } catch (error) {
      console.error("deleteOrder error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  },
};

module.exports = orderController;
