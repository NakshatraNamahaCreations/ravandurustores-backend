const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AdminSchema = new mongoose.Schema(
  {
    username: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true        // 🔥 speeds up login lookup 
    },

    email: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true        // 🔥 speeds up login lookup
    },

    password: { 
      type: String, 
      required: true 
    },
  },
  { timestamps: true }
);

// ----------------------------------------------------
// 🔥 Optimize bcrypt: Reduce salt rounds = faster login
// 10 rounds → slow (600–1000ms)
// 8 rounds  → safe + fast (200–350ms)
// ----------------------------------------------------
AdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(8);        // ⬅️ faster but secure
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare passwords
AdminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Prevent Overwrite Error
const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

module.exports = Admin;
