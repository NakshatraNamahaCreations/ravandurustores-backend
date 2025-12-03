const axios = require("axios");
const Order = require("../models/Order");
const getPhonePeToken = require("../utils/getPhonePeToken");
const { v4: uuidv4 } = require("uuid");
const { createShiprocketOrder } = require("../utils/Shiprocket");

// 🔹 INITIATE PAYMENT
exports.initiatePayment = async (req, res) => {
  try {
    const { amount, items, addressId, customerId } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (!items || !Array.isArray(items) || items.length <= 0) {
      return res.status(400).json({ error: "Items are not present" });
    }

    if (!addressId) {
      return res.status(400).json({ error: "addressId is required" });
    }

    // 🔐 Get PhonePe access token
    const accessToken = await getPhonePeToken();

    // Generate unique merchant transaction ID
    const merchantTransactionId = `TX_${uuidv4()}`;

    // Normalize items
    const normalizedItems = items.map((it) => ({
      productName: it.productName || it.name || "Unnamed Product",
      productImage: it.productImage || it.image || "",
      price: it.price,
      quantity: it.quantity,
    }));

    // Create initial pending order
    const pendingOrder = await Order.create({
      merchantTransactionId,
      customerId,
      amount,
      address: addressId,
      items: normalizedItems,
      status: "Pending",
      paymentMode: "Online",
    });

    // PhonePe Payload
    const payload = {
      merchantOrderId: merchantTransactionId,
      amount: amount * 100, // paise
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl: `https://ravandurustores-backend.onrender.com/api/payments/verify?merchantId=${merchantTransactionId}`,
        },
      },
    };

    // PhonePe Payment Call
    const response = await axios.post(
      `${process.env.PHONEPE_API_URL}/checkout/v2/pay`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${accessToken}`,
        },
      }
    );

    const result = response.data;
    console.log("📤 PhonePe initiation response:", result);

    if (!response.status === 200 || !result?.redirectUrl) {
      await Order.deleteOne({ _id: pendingOrder._id });
      throw new Error("PhonePe initiation failed");
    }

    return res.status(200).json({
      success: true,
      phonepeResponse: {
        redirectUrl: result.redirectUrl,
        merchantTransactionId,
      },
    });
  } catch (err) {
    console.error("Payment initiation error:", err);
    return res.status(500).json({ error: "Error initiating payment" });
  }
};

// 🔹 VERIFY PAYMENT
exports.verifyPayment = async (req, res) => {
    try {
      const { merchantId } = req.query;
  
      if (!merchantId) {
        return res.status(400).json({ error: "merchantId is required" });
      }
  
      // Find pending order
      const order = await Order.findOne({
        merchantTransactionId: merchantId,
      }).populate("address");
  
      if (!order) {
        return res.redirect(`https://ravandurustores.com/payment-failed`);
      }
  
      // Get PhonePe token
      const accessToken = await getPhonePeToken();
  
      // PhonePe Status API
      const statusUrl = `https://api.phonepe.com/apis/pg/checkout/v2/order/${merchantId}/status`;
  
      const response = await axios.get(statusUrl, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${accessToken}`,
        },
      });
  
      const statusResult = response.data;
      console.log("📩 PhonePe Verification Response:", statusResult);
  
      // SUCCESS
      if (statusResult?.state === "COMPLETED") {
        order.status = "Paid";
        order.paymentTransactionId = statusResult.transactionId;
        await order.save();
  
        console.log("💸 Payment Success → Creating Shiprocket order...");
  
        try {
          const shipment = await createShiprocketOrder(order._id);
  
          if (shipment) {
            console.log("🚀 Shiprocket order created:", shipment);
  
            await Order.findByIdAndUpdate(order._id, {
              $set: {
                shiprocket: {
                  order_id: shipment.order_id,
                  shipment_id: shipment.shipment_id,
                  status: shipment.status,
                  awb_code: shipment.awb_code || null,
                },
              },
            });
          }
        } catch (error) {
          console.error("❌ Shiprocket creation failed:", error);
        }
  
        // Redirect to thankyou
        return res.redirect("https://ravandurustores.com/thankyou");
      }
  
      // FAILED PAYMENT
      console.log("Payment not successful:", statusResult);
      order.status = "Failed";
      await order.save();
  
      return res.redirect(`https://ravandurustores.com/payment-failed`);
    } catch (err) {
      console.error("💥 Payment verification error:", err);
      return res.status(500).json({ error: "Error verifying payment" });
    }
};
