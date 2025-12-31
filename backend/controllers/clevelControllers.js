import db from "../config/db.js";

// ✅ Fetch all C-Level users
export const getAllClevels = (req, res) => {
  const query = "SELECT * FROM clevel";
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
};

// ✅ Add a new C-Level user
export const addClevel = (req, res) => {
  const { email, password, apiToken } = req.body;

  if (!email || !password || !apiToken) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const query = "INSERT INTO clevel (email, password, apiToken) VALUES (?, ?, ?)";
  db.query(query, [email, password, apiToken], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({
      success: true,
      message: "C-Level user added successfully",
      id: result.insertId,
    });
  });
};

// ✅ Update an existing C-Level user
export const updateClevel = (req, res) => {
  const { id } = req.params;
  const { email, password, apiToken } = req.body;

  if (!email || !password || !apiToken) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const query = "UPDATE clevel SET email = ?, password = ?, apiToken = ? WHERE id = ?";
  db.query(query, [email, password, apiToken, id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "C-Level user not found" });
    }
    res.json({ success: true, message: "C-Level user updated successfully" });
  });
};

// ✅ Delete a C-Level user
export const deleteClevel = (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM clevel WHERE id = ?";
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "C-Level user not found" });
    }
    res.json({ success: true, message: "C-Level user deleted successfully" });
  });
};
