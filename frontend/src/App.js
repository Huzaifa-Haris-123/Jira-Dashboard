// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./components/LoginPage";
import AdminLogin from "./components/AdminLogin";
import HomePage from "./components/HomePage";
import ManagersPage from "./components/ManagersPage";
import ProjectsPage from "./components/ProjectsPage";
import ProjectDashboard from "./components/ProjectDashboard";
import AdminHomePage from "./components/AdminHomePage";

export default function App() {
  return (
    <Routes>
      {/* Main */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/home" element={<ManagersPage />} />
      {/* If you still use old HomePage (combined managers+projects), swap ManagersPage with HomePage */}
      {/* <Route path="/home" element={<HomePage />} /> */}

      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/project-dashboard" element={<ProjectDashboard />} />

      {/* Admin */}
      <Route path="/adminlogin" element={<AdminLogin />} />
      <Route path="/admin-home" element={<AdminHomePage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
