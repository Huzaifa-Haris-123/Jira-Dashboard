// backend/server.js
import express from "express";
import cors from "cors";

import clevelRoutes from "./routes/clevelRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import managerRoutes from "./routes/managerRoutes.js";
import jiraRoutes from "./routes/jiraRoutes.js";

const app = express();

/** Middlewares */
app.use(
  cors({
    origin: true, // you can lock this to your frontend URL later
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

/** Health check */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/** Routes */
app.use("/api/managers", managerRoutes);
app.use("/api/clevel", clevelRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/jira", jiraRoutes); // ✅ all jira endpoints live here

/** Global error handler (last) */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port.. ${PORT}`));
