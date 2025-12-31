import express from "express";
import db from "../config/db.js";

const router = express.Router();

router.post("/login", (req, res) => {
  const { adminName, password } = req.body;

  const query = "SELECT * FROM admin WHERE adminName = ? AND password = ?";
  db.query(query, [adminName, password], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length > 0) {
      res.json({ success: true, message: "Admin login successful" });
    } else {
      res.json({ success: false, message: "Invalid admin credentials" });
    }
  });
});

export default router;
