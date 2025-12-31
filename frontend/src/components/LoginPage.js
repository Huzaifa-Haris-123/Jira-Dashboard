import React, { useState,useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
  document.title = "C-Level Login";
}, []);

  // ✅ Validate Gmail address
  const validateEmail = (email) => /^[^\s@]+@gmail\.com$/.test(email);

  // ✅ Validate password (8–20 chars, at least one letter, one number, and one special character)
  const validatePassword = (password) =>
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,20}$/.test(password);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      setError("Email must be a valid Gmail address.");
      return;
    }
    if (!validatePassword(password)) {
      setError("Invalid password format.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/clevel/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        // ✅ store clevel_id for HomePage Add Manager (domain only)
        localStorage.setItem("clevel_id", data.clevel_id);

        alert("Login successful!");
        navigate("/home");
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
      <h2>C-Level Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="C-Level Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <Link to="/adminlogin">Continue as Admin</Link>
      </p>
    </div>
  );
}
