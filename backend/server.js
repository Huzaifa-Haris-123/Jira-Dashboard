import express from "express";
import cors from "cors";
import clevelRoutes from "./routes/clevelRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import db from "./config/db.js";

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/clevel", clevelRoutes);
app.use("/api/admin", adminRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
