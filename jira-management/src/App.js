import React from "react";
import { Routes, Route } from "react-router-dom";
import LoginPage from "./components/LoginPage";
import AdminLogin from "./components/AdminLogin";
import HomePage from "./components/HomePage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/home" element={<HomePage />} />
    </Routes>
  );
}

export default App;
