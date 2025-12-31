import React, { useEffect, useMemo, useState } from "react";
import "./AdminHomePage.css";

export default function AdminHomePage() {
  const [clevels, setClevels] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState("");

  const [editId, setEditId] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editApiToken, setEditApiToken] = useState("");
  useEffect(() => {
  document.title = "Admin Home Page";
}, []);

  useEffect(() => {
    document.body.classList.add("pd-full");
    return () => document.body.classList.remove("pd-full");
  }, []);

  const totalClevels = useMemo(() => clevels.length, [clevels]);

  const fetchClevels = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/clevel");
      const data = await res.json();
      setClevels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching C-Levels:", err);
      alert("Failed to fetch C-Level users.");
      setClevels([]);
    }
  };

  useEffect(() => {
    fetchClevels();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("http://localhost:5000/api/clevel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, apiToken }),
      });

      const data = await res.json();
      alert(data.message || "Added");

      setEmail("");
      setPassword("");
      setApiToken("");
      fetchClevels();
    } catch (err) {
      console.error("Error adding C-Level:", err);
      alert("Failed to add C-Level user.");
    }
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setEditEmail(c.email);
    setEditPassword(c.password);
    setEditApiToken(c.apiToken);
  };

  // ✅ NEW: cancel editing and restore previous state
  const cancelEdit = () => {
    setEditId(null);
    setEditEmail("");
    setEditPassword("");
    setEditApiToken("");
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch(`http://localhost:5000/api/clevel/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editEmail,
          password: editPassword,
          apiToken: editApiToken,
        }),
      });

      const data = await res.json();
      alert(data.message || "Updated");

      cancelEdit(); // ✅ close edit section after update
      fetchClevels();
    } catch (err) {
      console.error("Error updating C-Level:", err);
      alert("Failed to update C-Level user.");
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this C-Level user?"
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`http://localhost:5000/api/clevel/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      alert(data.message || "Deleted");

      if (editId === id) cancelEdit(); // ✅ if deleting the one being edited

      fetchClevels();
    } catch (err) {
      console.error("Error deleting C-Level:", err);
      alert("Failed to delete C-Level user.");
    }
  };

  const handleLogout = () => {
    window.location.href = "/adminlogin";
  };

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-topbar-left" />
        <div className="admin-topbar-title">C Level Dashboard — Admin</div>
        <div className="admin-topbar-right">
          <button className="admin-iconBtn" onClick={handleLogout} title="Logout">
            👤
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-heroRow">
          <div>
            <h1 className="admin-title">Admin Panel</h1>
            <p className="admin-sub">
              Manage C-Level users (email, password and Jira API token)
            </p>
          </div>

          <div className="admin-statCard">
            <div className="admin-statNum">{totalClevels}</div>
            <div className="admin-statLbl">C-Level Users</div>
          </div>
        </div>

        <div className="admin-card">
          <h3 className="admin-section-title admin-centeredTitle">Add New C-Level</h3>

          <div className="admin-addCenter">
            <form onSubmit={handleAdd} className="admin-form">
              <input
                className="admin-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                className="admin-input"
                type="text"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <input
                className="admin-input"
                type="text"
                placeholder="API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
              />

              <button className="admin-btn" type="submit">
                Add C-Level
              </button>
            </form>
          </div>

          <hr className="admin-divider" />

          <h3 className="admin-section-title">Existing C-Levels</h3>

          {clevels.length === 0 ? (
            <p className="admin-empty">No C-Level users found.</p>
          ) : (
            <ul className="admin-list">
              {clevels.map((c) => (
                <li key={c.id}>
                  <span className="admin-email">{c.email}</span>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="admin-edit-btn"
                      onClick={() => startEdit(c)}
                      type="button"
                    >
                      Edit
                    </button>

                    <button
                      className="admin-edit-btn"
                      onClick={() => handleDelete(c.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editId && (
            <>
              <hr className="admin-divider" />
              <h3 className="admin-section-title admin-centeredTitle">Update C-Level</h3>

              <div className="admin-addCenter">
                <form onSubmit={handleUpdate} className="admin-form">
                  <input
                    className="admin-input"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                  />

                  <input
                    className="admin-input"
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    required
                  />

                  <input
                    className="admin-input"
                    type="text"
                    value={editApiToken}
                    onChange={(e) => setEditApiToken(e.target.value)}
                    required
                  />

                  {/* ✅ NEW: Update + Cancel row */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="admin-btn" type="submit">
                      Update
                    </button>

                    <button
                      className="admin-edit-btn"
                      type="button"
                      onClick={cancelEdit}
                      title="Cancel editing"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
