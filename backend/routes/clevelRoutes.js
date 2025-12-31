import express from "express";
import db from "../config/db.js";
import {
  getAllClevels,
  addClevel,
  updateClevel,
  deleteClevel,
} from "../controllers/clevelControllers.js";

const router = express.Router();

// ✅ C-Level Login Route (now returns clevel_id)
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const query = "SELECT * FROM clevel WHERE email = ? AND password = ?";

  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length > 0) {
      res.json({
        success: true,
        message: "C-Level login successful",
        clevel_id: results[0].id,
      });
    } else {
      res.json({ success: false, message: "Invalid email or password" });
    }
  });
});

// ✅ Admin management routes
router.get("/", getAllClevels);
router.post("/", addClevel);
router.put("/:id", updateClevel);
router.delete("/:id", deleteClevel);

export default router;
