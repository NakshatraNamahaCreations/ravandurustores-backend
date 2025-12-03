const axios = require("axios");
const Order = require("../models/Order");

/**
 * Convert internal payment mode to Shiprocket expected value
 */
const mapPaymentModeToShiprocket = (paymentMode) => {
  if (paymentMode === "COD") return "COD";
  return "Prepaid";
};

/**
 * Format date as Shiprocket expects: YYYY-MM-DD HH:mm
 */
const formatOrderDate = (date = new Date()) => {
  return date.toISOString().slice(0, 16).replace("T", " ");
};

/**
 * Clean phone to 10 digits
 */
const cleanPhone = (phone = "") =>
  phone.toString().replace(/\D/g, "").slice(-10);

/**
 * Clean pincode to 6 digits
 */
const cleanPincode = (pin = "") =>
  pin.toString().replace(/\D/g, "").slice(0, 6);

/**
 * Normalize address fields from DB
 */
const normalizeAddress = (addr = {}) => {
  const fullName =
    addr.name ||
    addr.fullName ||
    `${(addr.firstName || "").trim()} ${(addr.lastName || "").trim()}`.trim() ||
    "Customer";

  const addressLine1 =
    addr.addressLine1 ||
    addr.address ||
    addr.street ||
    addr.line1 ||
    "Not Available";

  const addressLine2 =
    addr.addressLine2 || addr.landmark || addr.line2 || "";

  const city = addr.city || "Bangalore";
  const state = addr.state || addr.province || "Karnataka";
  const pincode = cleanPincode(
    addr.pincode || addr.pinCode || addr.zip || addr.zipCode || ""
  );
  const country = addr.country || "India";
  const phone = cleanPhone(
    addr.mobileNumber || addr.mobile || addr.phone || ""
  );
  const email = (addr.email || addr.mail || "support@ravandurustores.com").trim();

  return {
    fullName,
    addressLine1,
    addressLine2,
    city,
    state,
    pincode,
    country,
    phone,
    email,
  };
};

/**
 * Validate Shiprocket required fields
 */
const validateShiprocketAddress = (addr) => {
  const missing = [];

  if (!addr.fullName || addr.fullName.length < 2)
    missing.push("billing_customer_name");
  if (!addr.addressLine1 || addr.addressLine1.length < 5)
    missing.push("billing_address");
  if (!addr.city) missing.push("billing_city");
  if (!addr.state) missing.push("billing_state");
  if (!addr.pincode || addr.pincode.length !== 6)
    missing.push("billing_pincode");
  if (!addr.phone || addr.phone.length !== 10)
    missing.push("billing_phone");

  return missing;
};

/**
 * CREATE ORDER IN SHIPROCKET
 */
exports.createShiprocketOrder = async (orderId) => {
  try {
    // Fetch Order
    const order = await Order.findById(orderId).populate("address").lean();

    if (!order) throw new Error("Order not found");
    if (!order.address) throw new Error("Address missing in order");

    console.log("📦 RAW ADDRESS:", order.address);

    // Normalize Address
    const addr = normalizeAddress(order.address);
    console.log("📦 NORMALIZED ADDRESS:", addr);

    // Validate
    const missing = validateShiprocketAddress(addr);
    if (missing.length > 0) {
      throw new Error(`❌ Missing/Invalid fields: ${missing.join(", ")}`);
    }

    // Shiprocket Login (Token)
    const login = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }
    );

    const token = login.data.token;
    if (!token) throw new Error("Failed to get Shiprocket token");

    // Final Payload
    const payload = {
      order_id: order.customOrderId || order._id.toString(),
      order_date: formatOrderDate(order.createdAt),
      pickup_location: "Home", 

      billing_customer_name: addr.fullName,
      billing_last_name: "",
      billing_address: addr.addressLine1,
      billing_address_2: addr.addressLine2,
      billing_city: addr.city,
      billing_pincode: addr.pincode,
      billing_state: addr.state,
      billing_country: "India",
      billing_email: addr.email,
      billing_phone: addr.phone,

      shipping_is_billing: 1,
      shipping_customer_name: addr.fullName,
      shipping_last_name: "",
      shipping_address: addr.addressLine1,
      shipping_address_2: addr.addressLine2,
      shipping_city: addr.city,
      shipping_pincode: addr.pincode,
      shipping_state: addr.state,
      shipping_country: "India",
      shipping_email: addr.email,
      shipping_phone: addr.phone,

      order_items: (order.items || []).map((item, index) => ({
        name: item.productName || `Item ${index + 1}`,
        sku: item.sku || `SKU-${index + 1}`,
        units: item.quantity || 1,
        selling_price: item.price || 0,
      })),

      payment_method: mapPaymentModeToShiprocket(order.paymentMode),
      sub_total: Number(order.amount || 0),

      length: Number(order.length || 10),
      breadth: Number(order.breadth || 10),
      height: Number(order.height || 10),
      weight: Number(order.weight || 1),
    };

    console.log("✅ FINAL PAYLOAD:", payload);

    // Create order in Shiprocket
    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SHIPROCKET SUCCESS:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ SHIPROCKET ERROR");

    if (err.response && err.response.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message || err);
    }

    return null;
  }
};
