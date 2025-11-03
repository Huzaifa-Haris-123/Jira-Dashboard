import express from "express";
import db from "../config/db.js";
const router = express.Router();
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const query = "SELECT * FROM clevel WHERE email = ? AND password = ?";
  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (results.length > 0) {
      res.json({ success: true, message: "C-Level login successful" });
    } else {
      res.json({ success: false, message: "Invalid email or password" });
    }
  });
});

export default router;
