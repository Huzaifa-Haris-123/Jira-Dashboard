import React, { useState,useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./AdminLogin.css";

export default function AdminLogin() {
  const [adminName, setAdminName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
  document.title = "Admin Login";
}, []);

  const validatePassword = (password) =>
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,20}$/.test(password);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validatePassword(password)) {
      setError("Invalid password format.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName, password }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`Welcome, Admin ${adminName}!`);
        navigate("/admin-home"); // ✅ correct route
      } else {
        alert("Invalid credentials, please try again.");
      }
    } catch (err) {
      console.error("Error:", err);
      alert("Server error. Please try again later.");
    }
  };

  return (
    <div className="login-page">
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Admin Username"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Login</button>
      </form>

      <p className="admin-link">
        <Link to="/">Back to C-Level Login</Link>
      </p>
    </div>
  );
}
