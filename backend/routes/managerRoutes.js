import express from "express";
import {
  getAllManagers,
  addManager,
  removeManagerFromClevel,
} from "../controllers/managerControllers.js";

const router = express.Router();

// Fetch managers (via clevel_manager)
router.get("/", getAllManagers);

// Add manager
router.post("/", addManager);

// ✅ Remove ONLY relationship (no manager delete)
router.post("/remove", removeManagerFromClevel);

export default router;
