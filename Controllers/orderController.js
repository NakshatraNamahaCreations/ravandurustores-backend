// const Order = require("../models/Order");
// const Address = require("../models/Address");
// const Product = require("../models/Product");

// const orderController = {
//   // Create a new order
// // Replace your createOrder function with this implementation
// createOrder: async (req, res) => {
//   try {
//     // Accept either cart items or simple items array
//     // Expectation: items[] each can be:
//     // { productId, variantId, productName, quantity, qty, unit, price }
//     const { addressId, paymentMode, items, amount: clientAmount } = req.body;

//     if (!addressId || !paymentMode || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({ error: "addressId, paymentMode and non-empty items array are required." });
//     }

//     // Verify address exists
//     const addressExists = await Address.findById(addressId);
//     if (!addressExists) return res.status(404).json({ error: "Address not found." });

//     const orderItems = [];
//     let computedAmount = 0;

//     // Process each cart item
//     for (const incoming of items) {
//       // normalize incoming values
//       const incomingQty = Number(incoming.quantity ?? incoming.qty ?? 0) || 0;
//       if (incomingQty <= 0) {
//         return res.status(400).json({ error: "Each item must have quantity > 0." });
//       }

//       // Identify product: prefer productId, else fallback to productName lookup
//       let product = null;
//       if (incoming.productId) {
//         product = await Product.findById(incoming.productId).lean();
//       } else if (incoming.productName) {
//         // your existing code searched by name; keep fallback but prefer ID
//         product = await Product.findOne({ name: incoming.productName }).lean();
//       }
//       if (!product) {
//         return res.status(404).json({ error: `Product not found for item: ${incoming.productName || incoming.productId}` });
//       }

//       // Choose variant:
//       // 1) if incoming.variantId provided -> pick that
//       // 2) else try to find variant matching incoming.unit and incoming.packSize/quantity
//       // 3) else fallback to first variant if available
//       let selectedVariant = null;
//       if (Array.isArray(product.variants) && product.variants.length > 0) {
//         if (incoming.variantId) {
//           selectedVariant = product.variants.find(v => String(v._id) === String(incoming.variantId));
//         }
//         if (!selectedVariant) {
//           // attempt match on unit + quantity
//           const incomingUnit = (incoming.unit || incoming.packUnit || "").toString().trim().toLowerCase();
//           const incomingPackSize = incoming.packSize ?? incoming.variantQuantity ?? incoming.variantQty ?? null;
//           selectedVariant = product.variants.find(v => {
//             // variant.quantity might be string "200" or number
//             const vQty = v.quantity != null ? String(v.quantity).trim().toLowerCase() : "";
//             const vUnit = v.unit != null ? String(v.unit).trim().toLowerCase() : "";
//             // if both pack size & unit present in incoming, match both
//             if (incomingPackSize && incomingUnit) {
//               return vUnit === incomingUnit && String(v.quantity) === String(incomingPackSize);
//             }
//             // if only unit provided, match unit
//             if (incomingUnit && !incomingPackSize) {
//               return vUnit === incomingUnit;
//             }
//             return false;
//           });
//         }
//         if (!selectedVariant) {
//           // fallback to first variant
//           selectedVariant = product.variants[0];
//         }
//       }

//       // Determine price & packSize/packUnit from variant (or product fallback)
//       let linePrice = 0;
//       let packSize = undefined;
//       let packUnit = undefined;
//       let variantId = null;

//       if (selectedVariant) {
//         linePrice = Number(selectedVariant.price ?? product.price ?? incoming.price ?? 0) || 0;
//         if (selectedVariant.quantity != null && selectedVariant.quantity !== "") {
//           const parsed = Number(String(selectedVariant.quantity).replace(",", "."));
//           if (!Number.isNaN(parsed)) packSize = parsed;
//         }
//         if (selectedVariant.unit) packUnit = String(selectedVariant.unit).trim().toLowerCase();
//         variantId = selectedVariant._id ? selectedVariant._id : null;
//       } else {
//         // no variants present: use product-level values or incoming fallbacks
//         linePrice = Number(product.price ?? incoming.price ?? 0) || 0;
//         if (product.quantity != null && product.quantity !== "") {
//           const parsed = Number(String(product.quantity).replace(",", "."));
//           if (!Number.isNaN(parsed)) packSize = parsed;
//         }
//         if (product.unit) packUnit = String(product.unit).trim().toLowerCase();
//       }

//       // Ordered quantity = how many packs/units user ordered
//       const orderedQty = Number(incomingQty) || 1;

//       // compute totals
//       const lineTotal = linePrice * orderedQty;
//       computedAmount += lineTotal;

//       // Build the order item shape that preserves variant info
//       const orderItem = {
//         productId: product._id,
//         variantId: variantId,
//         productName: product.productName || product.name || incoming.productName || "Item",
//         productImage: (product.images && product.images[0]) || product.productImage || incoming.productImage || "",
//         price: linePrice,
//         quantity: orderedQty,        // number of packs ordered
//       };

//       // keep backward compatible 'unit' if you want
//       if (packUnit) orderItem.unit = packUnit;
//       if (packSize !== undefined) orderItem.packSize = packSize;
//       if (variantId) orderItem.variantId = variantId;

//       orderItems.push(orderItem);

//       // ---- STOCK UPDATE ----
//       // Prefer decreasing variant-level stock if present; otherwise product-level stock.
//       // Example: product.variants[i].stock OR product.stock
//       try {
//         // Use atomic updates where possible
//         if (variantId && product.variants && product.variants.length > 0) {
//           // find if variant stored with stock in DB (not lean copy)
//           // Best effort: update variant stock with an update query
//           const variantStockField = product.variants.reduce((acc, v, idx) => {
//             if (String(v._id) === String(variantId)) return idx; 
//             return acc;
//           }, -1);

//           // if variant index found, attempt to decrement product.variants[index].stock
//           if (variantStockField >= 0 && product.variants[variantStockField].stock != null) {
//             // update using positional operator
//             const updateQuery = { _id: product._id, "variants._id": variantId };
//             const updateAction = { $inc: { "variants.$.stock": -orderedQty, soldStock: orderedQty } };
//             await Product.updateOne(updateQuery, updateAction);
//           } else {
//             // fallback decrement product.stock
//             await Product.updateOne({ _id: product._id }, { $inc: { stock: -orderedQty, soldStock: orderedQty } });
//           }
//         } else {
//           // no variant information -> decrement product level
//           await Product.updateOne({ _id: product._id }, { $inc: { stock: -orderedQty, soldStock: orderedQty } });
//         }
//       } catch (stockErr) {
//         // don't fail the whole order due to stock update race here, but log it
//         console.warn("Warning: failed to update stock for product", product._id, stockErr);
//       }
//     } // end for each item

//     // If you prefer server to compute amount, use computedAmount.
//     // To preserve backwards compatibility, if client provided amount and you trust it, you could use that.
//     const finalAmount = Number(computedAmount) || Number(clientAmount) || 0;

//     // Create order
//     const newOrder = new Order({
//       address: addressId,
//       amount: finalAmount,
//       paymentMode,
//       items: orderItems,
//     });

//     await newOrder.save();

//     return res.status(201).json({ message: "Order created successfully", order: newOrder });
//   } catch (error) {
//     console.error("Error creating order:", error);
//     return res.status(500).json({ error: "Server error while creating order" });
//   }
// },



//   // Get all orders
//   getAllOrders: async (req, res) => {
//     try {
//       const orders = await Order.find().populate("address").sort({ createdAt: -1 });
//       res.status(200).json(orders);
//     } catch (error) {
//       res.status(500).json({ error: "Server error while fetching orders" });
//     }
//   },

//   // Get single order
//   getOrderById: async (req, res) => {
//     try {
//       const order = await Order.findById(req.params.id).populate("address");
//       if (!order) return res.status(404).json({ error: "Order not found" });

//       res.status(200).json(order);
//     } catch (error) {
//       res.status(500).json({ error: "Server error while fetching order" });
//     }
//   },

//   // Delete an order
//   deleteOrder: async (req, res) => {
//     try {
//       const order = await Order.findByIdAndDelete(req.params.id);
//       if (!order) return res.status(404).json({ error: "Order not found" });

//       res.status(200).json({ message: "Order deleted successfully" });
//     } catch (error) {
//       res.status(500).json({ error: "Server error while deleting order" });
//     }
//   },

//   // Update order status
//   updateOrderStatus: async (req, res) => {
//     try {
//       const { status } = req.body;
//       const updatedOrder = await Order.findByIdAndUpdate(
//         req.params.id,
//         { status },
//         { new: true }
//       ).populate("address");

//       if (!updatedOrder) return res.status(404).json({ error: "Order not found" });

//       res.status(200).json(updatedOrder);
//     } catch (error) {
//       console.error("Error updating order status:", error);
//       res.status(500).json({ error: "Server error while updating status" });
//     }
//   },
// };

// module.exports = orderController;



// controllers/orderController.js
const Order = require("../models/Order");
const Address = require("../models/Address");
const Product = require("../models/Product");

const orderController = {
  // Create a new order (improved: copies variant pack info into order items)
  createOrder: async (req, res) => {
    try {
      const { addressId, paymentMode, items, amount: clientAmount } = req.body;

      console.log("📥 createOrder called", {
        addressId,
        paymentMode,
        itemsLength: Array.isArray(items) ? items.length : 0,
      });

      if (!addressId || !paymentMode || !Array.isArray(items) || items.length === 0) {
        console.log("❌ createOrder bad request", { addressId, paymentMode, items });
        return res.status(400).json({ error: "addressId, paymentMode and non-empty items array are required." });
      }

      // validate address
      const addressExists = await Address.findById(addressId);
      if (!addressExists) {
        console.log("❌ address not found", addressId);
        return res.status(404).json({ error: "Address not found." });
      }

      const orderItems = [];
      let computedAmount = 0;

      for (const incoming of items) {
        console.log("→ Incoming item:", incoming);

        // normalize incoming quantity
        const incomingQty = Number(incoming.quantity ?? incoming.qty ?? 0);
        if (incomingQty <= 0) {
          return res.status(400).json({ error: "Each item must have quantity > 0." });
        }

        // identify product (prefer productId)
        let product = null;
        if (incoming.productId) {
          product = await Product.findById(incoming.productId).lean();
        } else if (incoming.productName) {
          // fallback by name - keep for compatibility with older clients
          product = await Product.findOne({ name: incoming.productName }).lean();
        }

        if (!product) {
          console.log("❌ Product not found for item", incoming);
          return res.status(404).json({ error: `Product not found for item: ${incoming.productName || incoming.productId}` });
        }

        // select variant
        let selectedVariant = null;
        if (Array.isArray(product.variants) && product.variants.length > 0) {
          if (incoming.variantId) {
            selectedVariant = product.variants.find(v => String(v._id) === String(incoming.variantId));
          }
          if (!selectedVariant) {
            // try match by unit+quantity if provided
            const inUnit = (incoming.unit || "").toString().trim().toLowerCase();
            const inPack = incoming.packSize ?? incoming.variantQuantity ?? incoming.variantQty ?? null;

            selectedVariant = product.variants.find(v => {
              const vUnit = (v.unit || "").toString().trim().toLowerCase();
              const vQty = v.quantity != null ? String(v.quantity).trim() : "";
              if (inPack && inUnit) return vUnit === inUnit && String(vQty) === String(inPack);
              if (inUnit && !inPack) return vUnit === inUnit;
              return false;
            });
          }
          if (!selectedVariant) {
            selectedVariant = product.variants[0];
          }
        }

        // derive price and pack info
        let linePrice = 0;
        let packSize = undefined;
        let packUnit = undefined;
        let variantId = null;

        if (selectedVariant) {
          linePrice = Number(selectedVariant.price ?? product.price ?? incoming.price ?? 0) || 0;
          if (selectedVariant.quantity != null && selectedVariant.quantity !== "") {
            const parsed = Number(String(selectedVariant.quantity).replace(",", "."));
            if (!Number.isNaN(parsed)) packSize = parsed;
          }
          if (selectedVariant.unit) packUnit = String(selectedVariant.unit).trim().toLowerCase();
          variantId = selectedVariant._id ?? null;
        } else {
          // no variant - fallback to product-level fields
          linePrice = Number(product.price ?? incoming.price ?? 0) || 0;
          if (product.quantity) {
            const parsed = Number(String(product.quantity).replace(",", "."));
            if (!Number.isNaN(parsed)) packSize = parsed;
          }
          if (product.unit) packUnit = String(product.unit).trim().toLowerCase();
        }

        console.log("selectedVariant (if any):", selectedVariant ? {
          id: selectedVariant._id,
          quantity: selectedVariant.quantity,
          unit: selectedVariant.unit,
          price: selectedVariant.price
        } : null);

        const orderedQty = Number(incomingQty) || 1;
        const lineTotal = linePrice * orderedQty;
        computedAmount += lineTotal;

        const orderItem = {
          productId: product._id,
          variantId: variantId,
          productName: product.productName || product.name || incoming.productName || "Item",
          productImage: (product.images && product.images[0]) || product.productImage || incoming.productImage || "",
          price: linePrice,
          quantity: orderedQty,
        };

        // keep backwards-compatible unit, and add packSize/packUnit
        if (packUnit) orderItem.unit = packUnit;
        if (packSize !== undefined) orderItem.packSize = packSize;
        if (variantId) orderItem.variantId = variantId;

        console.log("→ Built orderItem:", orderItem);
        orderItems.push(orderItem);

        // update stock (best-effort)
        try {
          if (variantId && product.variants && product.variants.length > 0) {
            const variantHasStock = product.variants.some(v => String(v._id) === String(variantId) && v.stock != null);
            if (variantHasStock) {
              await Product.updateOne({ _id: product._id, "variants._id": variantId }, { $inc: { "variants.$.stock": -orderedQty, soldStock: orderedQty }});
            } else {
              await Product.updateOne({ _id: product._id }, { $inc: { stock: -orderedQty, soldStock: orderedQty }});
            }
          } else {
            await Product.updateOne({ _id: product._id }, { $inc: { stock: -orderedQty, soldStock: orderedQty }});
          }
        } catch (stockErr) {
          console.warn("Warning: failed to update stock for", product._id, stockErr);
          // do not abort order on stock update failures here (but log)
        }
      } // end for each incoming item

      const finalAmount = Number(computedAmount) || Number(clientAmount) || 0;

      const newOrder = new Order({
        address: addressId,
        amount: finalAmount,
        paymentMode,
        items: orderItems,
      });

      await newOrder.save();

      console.log("✅ Order created:", newOrder._id, "amount:", finalAmount);
      return res.status(201).json({ message: "Order created successfully", order: newOrder });
    } catch (error) {
      console.error("Error creating order:", error);
      return res.status(500).json({ error: "Server error while creating order" });
    }
  },

  // Get all orders
  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find().populate("address").sort({ createdAt: -1 });
      res.status(200).json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
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
      console.error("Error fetching order:", error);
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
      console.error("Error deleting order:", error);
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
