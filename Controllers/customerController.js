const bcrypt = require("bcryptjs");
const User = require("../models/Customer");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Customer = require("../models/Customer");

/* =========================
   REGISTER User
========================= */
exports.register = async (req, res) => {
  try {
    let { firstname, lastname, email, mobilenumber, password } = req.body;

if (!firstname || !lastname || !email || !mobilenumber || !password) {

      return res.status(400).json({ message: "All fields are required." });
    }

    email = email.toLowerCase().trim();
    const cleanPhone = mobilenumber.toString().replace(/\D/g, "").slice(-10);


    // 🔥 FIXED: check mobilenumber instead of phone
    const existingUser = await User.findOne({
      $or: [{ email }, { mobilenumber: cleanPhone }],
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Email or mobile already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const newUser = new User({
      firstname,
      lastname,
      email,
      mobilenumber: cleanPhone, // ✅ FIXED
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =========================
   LOGIN User
========================= */
exports.login = async (req, res) => {
  try {
    const { email, mobilenumber, password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (!email && !mobilenumber) {
      return res
        .status(400)
        .json({ message: "Email or mobile number is required" });
    }

    const query = [];

    if (email) {
      query.push({ email: email.toLowerCase().trim() });
    }

   if (mobilenumber) {
  const cleanPhone = mobilenumber.replace(/\D/g, "").slice(-10);
  query.push(
    { mobilenumber: cleanPhone },
    { phone: cleanPhone }   // 🔥 backward compatibility
  );
}


    const user = await Customer.findOne({ $or: query });


    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        mobilenumber: user.mobilenumber,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};





/* =========================
   FORGOT PASSWORD
========================= */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await Customer.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.MAIL_USER,   // 🔥 lowercase "user"
        pass: process.env.MAIL_PASS,
      },
    });

    const resetLink = `https://aves.in/reset-password/${token}`;

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: user.email,
      subject: "Reset Password",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`,
    });

    res.status(200).json({ message: "Reset link sent to your email." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


/* =========================
   RESET PASSWORD
========================= */
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const user = await Customer.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


/* =========================
   GET User PROFILE
========================= */
exports.getProfile = async (req, res) => {
  try {
    const User = await User.findById(req.params.id).select("-password");
    if (!User) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(User);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   GET ALL UserS
========================= */
exports.getAllUsers = async (req, res) => {
  try {
    const Users = await User.find().select("-password");
    res.status(200).json(Users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   DELETE User
========================= */
exports.deleteUser = async (req, res) => {
  try {
    const User = await User.findByIdAndDelete(req.params.id);
    if (!User) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
