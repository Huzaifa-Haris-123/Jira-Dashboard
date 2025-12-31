import db from "../config/db.js";

// ✅ Fetch managers via relationship table
export const getAllManagers = (req, res) => {
  const query = `
    SELECT 
      m.id AS manager_id,
      m.atlassianDomain,
      c.id AS clevel_id
    FROM manager m
    JOIN clevel_manager cm ON m.id = cm.manager_id
    JOIN clevel c ON cm.clevel_id = c.id
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
};

// ✅ Add manager + link to clevel
export const addManager = (req, res) => {
  const { atlassianDomain, clevel_id } = req.body;

  if (!atlassianDomain || !clevel_id) {
    return res
      .status(400)
      .json({ message: "atlassianDomain and clevel_id required" });
  }

  const insertManager =
    "INSERT INTO manager (atlassianDomain) VALUES (?)";

  db.query(insertManager, [atlassianDomain], (err, result) => {
    if (err) {
      console.error("DB Error (manager):", err);
      return res.status(500).json({ message: "Database error" });
    }

    const manager_id = result.insertId;

    const linkQuery =
      "INSERT INTO clevel_manager (clevel_id, manager_id) VALUES (?, ?)";

    db.query(linkQuery, [clevel_id, manager_id], (linkErr) => {
      if (linkErr) {
        console.error("DB Error (clevel_manager):", linkErr);
        return res
          .status(500)
          .json({ message: "Error linking manager to C-Level" });
      }

      res.json({
        success: true,
        message: "Manager added and linked successfully",
      });
    });
  });
};

// ✅ REMOVE ONLY relationship (NOT manager table)
export const removeManagerFromClevel = (req, res) => {
  const { manager_id, clevel_id } = req.body;

  if (!manager_id || !clevel_id) {
    return res
      .status(400)
      .json({ message: "manager_id and clevel_id required" });
  }

  const query =
    "DELETE FROM clevel_manager WHERE manager_id = ? AND clevel_id = ?";

  db.query(query, [manager_id, clevel_id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Relation not found" });
    }

    res.json({
      success: true,
      message: "Manager removed from C-Level successfully",
    });
  });
};
