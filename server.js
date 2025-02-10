require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const otpGenerator = require("otp-generator");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Define MongoDB Schema
const UserSchema = new mongoose.Schema({
    corporateId: String,
    email: String,
    role: String,
    otp: String,
    otpExpiry: Date
});

const User = mongoose.model("user_credentials", UserSchema);
const Admin = mongoose.model("admin_credentials", UserSchema);

// Email Transporter Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// **Generate and Send OTP**
const sendOtp = async (corporateId, res) => {
    try {
        let user = await User.findOne({ corporateId });
        let collection = User;

        if (!user) {
            user = await Admin.findOne({ corporateId });
            collection = Admin;
        }

        if (!user) return res.status(404).json({ message: "Corporate ID not found" });

        // Generate a strict 4-digit numeric OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Set OTP expiry (5 minutes from now)
        const otpExpiry = new Date(Date.now() + 300 * 1000);

        // Update user record with new OTP
        await collection.updateOne({ corporateId }, { $set: { otp, otpExpiry } });

        // Send OTP via Email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Your OTP Code",
            text: `Your OTP is ${otp}. It expires in 5 minutes.`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "OTP sent successfully" });

    } catch (error) {
        console.error("Error in sendOtp:", error);
        res.status(500).json({ message: "Server error", error });
    }
};


app.post("/request-otp", async (req, res) => {
    const { corporateId } = req.body;
    await sendOtp(corporateId, res);
});

app.post("/resend-otp", async (req, res) => {
    const { corporateId } = req.body;
    await sendOtp(corporateId, res);
});

// **Verify OTP**
app.post("/verify-otp", async (req, res) => {
    const { corporateId, otp } = req.body;

    try {
        let user = await User.findOne({ corporateId, otp });
        let collection = User;

        if (!user) {
            user = await Admin.findOne({ corporateId, otp });
            collection = Admin;
        }

        if (!user) return res.status(400).json({ message: "Invalid OTP" });

        if (user.otpExpiry < new Date()) return res.status(400).json({ message: "OTP expired" });

        // Clear OTP after successful verification
        await collection.updateOne({ corporateId }, { $unset: { otp: 1, otpExpiry: 1 } });

        res.status(200).json({
            message: "Login successful",
            role: user.role // Send role for redirection
        });

    } catch (error) {
        console.error("Error in /verify-otp:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));