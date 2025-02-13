require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("uploads"));

// **Connect to MongoDB for OTP (Aadhar_Housing_Finance)**
const otpDb = mongoose.createConnection(process.env.OTP_MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
otpDb.on("connected", () => console.log("✅ OTP Database Connected"));
otpDb.on("error", (err) => console.error("❌ OTP DB Connection Error:", err));

// **Connect to MongoDB for Form Submissions (Forms)**
const formDb = mongoose.createConnection(process.env.FORM_MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
formDb.on("connected", () => console.log("✅ Forms Database Connected"));
formDb.on("error", (err) => console.error("❌ Forms DB Connection Error:", err));

// **Define Mongoose Schemas**
const UserSchema = new mongoose.Schema({
  corporateId: String,
  email: String,
  role: String,
  otp: String,
  otpExpiry: Date,
});
const User = otpDb.model("user_credentials", UserSchema);
const Admin = otpDb.model("admin_credentials", UserSchema);

const IdeaSchema = new mongoose.Schema({
  employeeName: String,
  employeeId: String,
  employeeFunction: String,
  location: String,
  ideaTheme: String,
  department: String,
  benefitsCategory: String,
  ideaDescription: String,
  impactedProcess: String,
  expectedBenefitsValue: String,
  attachment: String,
  submittedAt: { type: Date, default: Date.now },
});
const Idea = formDb.model("idea_submissions", IdeaSchema);

// **Email Transporter**
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 300 * 1000);
    await collection.updateOne({ corporateId }, { $set: { otp, otpExpiry } });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error in sendOtp:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// **OTP Routes**
app.post("/request-otp", async (req, res) => {
  const { corporateId } = req.body;
  await sendOtp(corporateId, res);
});

app.post("/resend-otp", async (req, res) => {
  const { corporateId } = req.body;
  await sendOtp(corporateId, res);
});

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

    await collection.updateOne({ corporateId }, { $unset: { otp: 1, otpExpiry: 1 } });
    res.status(200).json({ message: "Login successful", role: user.role });
  } catch (error) {
    console.error("Error in /verify-otp:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// **File Upload Setup**
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    if (!req.body.employeeId) {
      return cb(new Error("Missing employeeId"));
    }
    const sanitizedFilename = file.originalname.replace(/\s+/g, "_"); // Replace spaces with underscores
    cb(null, `${req.body.employeeId}_${sanitizedFilename}`);
  },
});
const upload = multer({ storage: storage });

// **Form Submission Routes**
app.post("/submit-form", upload.single("attachment"), async (req, res) => {
  try {
    if (!req.body.employeeId) {
      return res.status(400).json({ message: "❌ Employee ID is required" });
    }

    const newIdea = new Idea({
      ...req.body,
      attachment: req.file ? req.file.filename : null, // Store filename with Employee ID
    });

    await newIdea.save();
    res.status(201).json({ message: "✅ Form Submitted Successfully!" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Error submitting form", error: error.message });
  }
});

// To allow users to access uploaded files via URL, add a static route:
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Now, users can access their files at:
// http://localhost:5000/uploads/{employeeId}_{originalFilename}


app.get("/submissions", async (req, res) => {
  try {
    const ideas = await Idea.find();
    res.status(200).json(ideas);
  } catch (error) {
    res.status(500).json({ message: "❌ Error fetching submissions", error: error.message });
  }
});

// **Start Server**
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
