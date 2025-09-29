// const fetch = require("node-fetch");
// const Order = require("../models/Order");
// const getPhonePeToken = require("../utils/getPhonePeToken");
// const { v4: uuidv4 } = require("uuid");

// const generateUniqueTransactionId = () => {
//   return `TX_${uuidv4()}`;
// };
// const merchantTransactionId = generateUniqueTransactionId();

// // 🔹 INITIATE PAYMENT
// exports.initiatePayment = async (req, res) => {
//   try {
//     const { amount, items, addressId,   customerId } = req.body;
//     if (!amount) return res.status(400).json({ error: "Amount is required" });
//     if (!items || items.length <= 0) {
//       return res.status(400).json({ error: "Items are not present" });
//     }

//     const accessToken = await getPhonePeToken();
//     const merchantTransactionId = generateUniqueTransactionId();

//     // 1️⃣ Create Pending Order before redirect
//     const pendingOrder = await Order.create({
//    merchantTransactionId,
// customerId,
//       amount,
//       address: addressId,
//       items,
//       status: "Pending",
//       paymentMode: "Online",
//       createdAt: new Date(),
//     });

//     console.log("📝 Pending order created:", pendingOrder._id);

//     // 2️⃣ Prepare PhonePe payload
//     const payload = {
//       merchantOrderId: merchantTransactionId,
//       amount: amount * 100,
//       expireAfter: 1200,
//       paymentFlow: {
//         type: "PG_CHECKOUT",
//         merchantUrls: {
//           redirectUrl: `https://ravandurustores.com/api/payment/verify?merchantId=${merchantTransactionId}`,
//         },
//       },
//     };

 
//     const response = await fetch(
//       `${process.env.PHONEPE_API_URL}/checkout/v2/pay`,
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `O-Bearer ${accessToken}`,
//         },
//         body: JSON.stringify(payload),
//       }
//     );

//     const result = await response.json();

//     if (!response.ok || !result?.redirectUrl) {
   
//       await Order.deleteOne({ _id: pendingOrder._id });
//       throw new Error("PhonePe initiation failed");
//     }

//     res.status(200).json({
//       success: true,
//       phonepeResponse: {
//         redirectUrl: result.redirectUrl,
//         merchantTransactionId,
//       },
//     });
//   } catch (err) {
//     console.error("Payment initiation error:", err);
//     res.status(500).json({ error: "Error initiating payment" });
//   }
// };

// exports.verifyPayment = async (req, res) => {
//   try {
//     const { merchantId } = req.query; 
//     if (!merchantId) {
//       return res.status(400).json({ error: "merchantId is required" });
//     }

//     console.log("👉 Incoming verifyPayment request:", merchantId);

//     // 1️⃣ Fetch pending order
//     const order = await Order.findOne({ merchantTransactionId: merchantId });
//     if (!order) {
//       console.error("❌ No order found for merchantId:", merchantId);
//       return res.redirect(
//         `https://ravandurustores.com/payment-failed?merchantId=${merchantId}`
//       );
//     }

//     // 2️⃣ Get PhonePe token
//     const accessToken = await getPhonePeToken();

//     // 3️⃣ Call PhonePe status API
//     const statusUrl = `https://api.phonepe.com/apis/pg/checkout/v2/order/${merchantId}/status`;

//     const response = await fetch(statusUrl, {
//       method: "GET",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `O-Bearer ${accessToken}`,
//       },
//     });

//     const statusResult = await response.json();
//     console.log("📩 PhonePe Verification Response:", statusResult);

//     if (statusResult?.state === "COMPLETED") {
//       // ✅ Update order
//       order.status = "Paid";
//       order.paymentTransactionId = statusResult.transactionId;
//       order.updatedAt = new Date();
//       await order.save();

//       console.log("✅ Payment Success. Order updated:", order._id);
//       return res.redirect(
//         `https://ravandurustores.com/thankyou?merchantId=${merchantId}`
//       );
//     }

//     // ❌ Payment failed → delete order
//     await Order.deleteOne({ _id: order._id });
//     console.error("❌ Payment not successful. Order deleted:", order._id);

//     return res.redirect(
//       `https://ravandurustores.com/payment-failed?merchantId=${merchantId}`
//     );
//   } catch (err) {
//     console.error("💥 Payment verification error:", err);
//     return res.status(500).json({ error: "Error verifying payment" });
//   }
// };


const fetch = require("node-fetch");
const Order = require("../models/Order");
const getPhonePeToken = require("../utils/getPhonePeToken");
const { v4: uuidv4 } = require("uuid");

const generateUniqueTransactionId = () => {
  return `TX_${uuidv4()}`;
};

// 🔹 INITIATE PAYMENT
exports.initiatePayment = async (req, res) => {
  try {
    const { amount, items, addressId, customerId } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount is required" });
    if (!items || items.length <= 0) {
      return res.status(400).json({ error: "Items are not present" });
    }

    const accessToken = await getPhonePeToken();
    const merchantTransactionId = generateUniqueTransactionId();

    // 🔹 Normalize items so they match schema
    const normalizedItems = items.map((it) => ({
      productName: it.productName || it.name || "Unnamed Product",
      productImage: it.productImage || it.image || "",
      price: it.price,
      quantity: it.quantity,
    }));

    // 1️⃣ Create Pending Order before redirect
    const pendingOrder = await Order.create({
      merchantTransactionId,
      customerId,
      amount,
      address: addressId,
      items: normalizedItems,
      status: "Pending",
      paymentMode: "Online",
    });

    console.log("📝 Pending order created:", pendingOrder._id);

    // 2️⃣ Prepare PhonePe payload
    const payload = {
      merchantOrderId: merchantTransactionId, 
      amount: amount * 100,
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl: `https://ravandurustores.com/api/payments/verify?merchantId=${merchantTransactionId}`,
        },
      },
    };

    const response = await fetch(
      `${process.env.PHONEPE_API_URL}/checkout/v2/pay`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok || !result?.redirectUrl) {
      await Order.deleteOne({ _id: pendingOrder._id });
      throw new Error("PhonePe initiation failed");
    }

    res.status(200).json({
      success: true,
      phonepeResponse: {
        redirectUrl: result.redirectUrl,
        merchantTransactionId,
      },
    });
  } catch (err) {
    console.error("Payment initiation error:", err);
    res.status(500).json({ error: "Error initiating payment" });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { merchantId } = req.query; 
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId is required" });
    }

    const order = await Order.findOne({ merchantTransactionId: merchantId });
    if (!order) {
      return res.redirect(`https://ravandurustores.com/payment-failed?merchantId=${merchantId}`);
    }

    const accessToken = await getPhonePeToken();

    const statusUrl = `https://api.phonepe.com/apis/pg/checkout/v2/order/${merchantId}/status`;
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
    });

    const statusResult = await response.json();
    console.log("📩 PhonePe Verification Response:", statusResult);

    if (statusResult?.success && statusResult?.state === "COMPLETED") {
      order.status = "Paid";
      order.paymentTransactionId = statusResult.transactionId;
      await order.save();

      return res.redirect(`https://ravandurustores.com/thankyou?merchantId=${merchantId}`);
    }
console.log("Payment not successful:", statusResult);
    order.status = "Failed";
    await order.save();
    return res.redirect(`https://ravandurustores.com/payment-failed?merchantId=${merchantId}`);
  } catch (err) {
    console.error("💥 Payment verification error:", err);
    return res.status(500).json({ error: "Error verifying payment" });
  }
};

