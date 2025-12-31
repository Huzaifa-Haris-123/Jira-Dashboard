// /frontend/src/component/HomePage.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();

  const [managers, setManagers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedManager, setSelectedManager] = useState(null);

  // UI states
  const [showManagersMenu, setShowManagersMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [loading, setLoading] = useState(false); // add manager loading
  const [loadingProjects, setLoadingProjects] = useState(false); // ✅ skeleton loading
  const [newDomain, setNewDomain] = useState("");

  const managersMenuRef = useRef(null);
  const userMenuRef = useRef(null);
  useEffect(() => {
  document.title = "C-Level Homepage";
}, []);

  // ================= FETCH MANAGERS =================
  const fetchManagers = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/managers");
      const data = await res.json();
      setManagers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching managers:", err);
      setManagers([]);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        managersMenuRef.current &&
        !managersMenuRef.current.contains(e.target)
      ) {
        setShowManagersMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ================= CLICK MANAGER (LIVE JIRA + SKELETON) =================
  const handleManagerClick = async (domain) => {
    const clevel_id = localStorage.getItem("clevel_id");
    if (!clevel_id) {
      alert("Login again");
      return;
    }

    setSelectedManager(domain);
    setProjects([]);
    setShowManagersMenu(false);
    setLoadingProjects(true);

    try {
      // 1️⃣ Fetch project list
      const res = await fetch("http://localhost:5000/api/jira/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clevel_id, domain }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to fetch projects");
        return;
      }

      // 2️⃣ Fetch per project details
      const enrichedProjects = await Promise.all(
        (data.projects || []).map(async (p) => {
          try {
            const detailRes = await fetch(
              "http://localhost:5000/api/jira/project-details",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  domain,
                  projectKey: p.key,
                  clevel_id,
                }),
              }
            );

            const detail = await detailRes.json();
            const tickets = Array.isArray(detail.tickets) ? detail.tickets : [];

            // ---------- LIVE COUNTS (preferred) ----------
            const totalIssues =
              typeof detail.totalIssues === "number"
                ? detail.totalIssues
                : typeof detail.total === "number"
                ? detail.total
                : null;

            const doneIssues =
              typeof detail.doneIssues === "number"
                ? detail.doneIssues
                : typeof detail.done === "number"
                ? detail.done
                : null;

            // ✅ Progress
            const progress =
              typeof detail.progress === "number"
                ? detail.progress
                : totalIssues != null && doneIssues != null
                ? totalIssues === 0
                  ? 0
                  : Math.round((doneIssues / totalIssues) * 100)
                : (() => {
                    // fallback only: based on returned tickets
                    const total = tickets.length;
                    const done = tickets.filter(
                      (t) => t.fields?.status?.statusCategory?.key === "done"
                    ).length;
                    return total === 0 ? 0 : Math.round((done / total) * 100);
                  })();

            // ✅ Status (Completed if archived OR all issues done OR progress 100)
            const isArchived =
              detail.project?.archived === true || detail.project?.archived === "true";

            const isAllDoneByCounts =
              totalIssues != null &&
              doneIssues != null &&
              totalIssues > 0 &&
              doneIssues === totalIssues;

            const status =
              typeof detail.status === "string"
                ? detail.status
                : isArchived || isAllDoneByCounts || progress === 100
                ? "Completed"
                : "Active";

            // ✅ People count
            const peopleCount =
              typeof detail.peopleCount === "number"
                ? detail.peopleCount
                : new Set(
                    tickets
                      .map((t) => t.fields?.assignee?.accountId)
                      .filter(Boolean)
                  ).size;

            // ✅ Start date (prefer backend startDate; else min(created) from tickets)
            const startDate =
              detail.startDate ||
              (() => {
                const createdDates = tickets
                  .map((t) => t.fields?.created)
                  .filter(Boolean);
                if (createdDates.length === 0) return null;
                // choose earliest
                let min = createdDates[0];
                let minTime = new Date(min).getTime();
                for (let i = 1; i < createdDates.length; i++) {
                  const t = createdDates[i];
                  const time = new Date(t).getTime();
                  if (!Number.isNaN(time) && time < minTime) {
                    min = t;
                    minTime = time;
                  }
                }
                return Number.isNaN(minTime) ? null : min;
              })();

            return {
              key: p.key,
              name: p.name,
              progress,
              status,
              peopleCount,
              startDate,
              ownerName: detail.project?.lead?.displayName,
              description: detail.project?.description,
            };
          } catch {
            return {
              key: p.key,
              name: p.name,
              progress: 0,
              status: "Active",
              peopleCount: 0,
              startDate: null,
              ownerName: null,
              description: null,
            };
          }
        })
      );

      setProjects(enrichedProjects);
    } catch (err) {
      console.error(err);
      alert("Backend error");
    } finally {
      setLoadingProjects(false);
    }
  };

  // ================= PROJECT CLICK =================
  const handleProjectCardClick = (project) => {
    const clevel_id = localStorage.getItem("clevel_id");
    if (!clevel_id || !selectedManager) return;

    navigate("/project-dashboard", {
      state: {
        domain: selectedManager,
        projectKey: project.key,
        clevel_id,
      },
    });
  };

  // ================= ADD MANAGER =================
  const handleAddManager = async (e) => {
    e.preventDefault();
    const clevel_id = localStorage.getItem("clevel_id");

    if (!newDomain.trim()) {
      alert("Please enter Atlassian domain");
      return;
    }
    if (!newDomain.includes(".atlassian.net")) {
      alert("Domain must be like example.atlassian.net");
      return;
    }
    if (!clevel_id) {
      alert("Login again");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atlassianDomain: newDomain.trim(),
          clevel_id,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setShowAddModal(false);
        setNewDomain("");
        fetchManagers();
      } else {
        alert(data.message || "Failed to add manager");
      }
    } catch (err) {
      console.error(err);
      alert("Server error");
    }
    setLoading(false);
  };

  // ================= DELETE MANAGER RELATION =================
  const handleDelete = async (manager_id) => {
    const clevel_id = localStorage.getItem("clevel_id");
    if (!clevel_id) return;

    if (!window.confirm("Remove this manager?")) return;

    try {
      const res = await fetch("http://localhost:5000/api/managers/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_id, clevel_id }),
      });

      const data = await res.json();
      alert(data.message || "Removed");
      fetchManagers();
    } catch {
      alert("Server error");
    }
  };

  // ================= LOGOUT =================
  const handleLogout = () => {
    localStorage.removeItem("clevel_id");
    window.location.href = "/";
  };

  const isBlurred = showAddModal;

  const formatMonthYear = (d) => {
    if (!d) return "—";
    const date = new Date(d);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString(undefined, { month: "short", year: "numeric" });
  };

  return (
    <div className="clm-page">
      {/* NAVBAR */}
      <header className="clm-navbar">
        {/* LEFT */}
        <div className="clm-nav-left" ref={managersMenuRef}>
          <button
            className="clm-managers-btn"
            onClick={() => setShowManagersMenu((p) => !p)}
          >
            👥 Managers ▾
          </button>

          {showManagersMenu && (
            <div className="clm-managers-menu">
              {managers.length === 0 ? (
                <div className="clm-empty-menu">No managers found</div>
              ) : (
                managers.map((m) => (
                  <button
                    key={m.manager_id}
                    className={`clm-manager-row ${
                      selectedManager === m.atlassianDomain ? "active" : ""
                    }`}
                    onClick={() => handleManagerClick(m.atlassianDomain)}
                  >
                    <div className="clm-avatar">
                      {m.atlassianDomain.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="clm-manager-name" title={m.atlassianDomain}>
                      {m.atlassianDomain}
                    </div>

                    <button
                      className="clm-trash"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(m.manager_id);
                      }}
                    >
                      🗑️
                    </button>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* CENTER */}
        <div className="clm-nav-title">C Level Dashboard</div>

        {/* RIGHT */}
        <div className="clm-nav-right">
          <button className="clm-add-btn" onClick={() => setShowAddModal(true)}>
            + Add Manager
          </button>

          <div className="clm-user" ref={userMenuRef}>
            <button
              className="clm-user-btn"
              onClick={() => setShowUserMenu((p) => !p)}
            >
              👤
            </button>

            {showUserMenu && (
              <div className="clm-user-menu">
                <button className="clm-logout" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className={`clm-content ${isBlurred ? "blurred" : ""}`}>
        <h1 className="clm-h1">Active Projects</h1>
        <p className="clm-sub">
          Overview of all ongoing C-level initiatives and their progress
        </p>

        {!selectedManager ? (
          <div className="clm-hint">Select a manager to load projects</div>
        ) : loadingProjects ? (
          <div className="clm-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="clm-card clm-skeleton-card">
                <div className="clm-card-top">
                  <div className="clm-skel skel-title" />
                  <div className="clm-skel skel-dots" />
                </div>

                <div className="clm-skel skel-desc" />
                <div className="clm-skel skel-desc short" />

                <div className="clm-badge-row">
                  <div className="clm-skel skel-badge" />
                </div>

                <div className="clm-progress-row">
                  <div className="clm-skel skel-small" />
                  <div className="clm-skel skel-small" />
                </div>

                <div className="clm-progressbar">
                  <div className="clm-skel skel-bar" />
                </div>

                <div className="clm-card-footer">
                  <div className="clm-skel skel-foot" />
                  <div className="clm-skel skel-foot" />
                  <div className="clm-skel skel-foot" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="clm-hint">No projects found</div>
        ) : (
          <div className="clm-grid">
            {projects.map((p) => (
              <div
                key={p.key}
                className="clm-card"
                onClick={() => handleProjectCardClick(p)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleProjectCardClick(p);
                }}
              >
                <div className="clm-card-top">
                  <div className="clm-card-title">{p.name}</div>
                  <button
                    className="clm-dots"
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    title="Menu"
                  >
                    ⋮
                  </button>
                </div>

                <div className="clm-card-desc">
                  {p.description ||
                    "Comprehensive initiative tracked via Jira project data."}
                </div>

                <div className="clm-badge-row">
                  <span
                    className={`clm-badge ${
                      p.status === "Completed" ? "done" : "active"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>

                <div className="clm-progress-row">
                  <span className="clm-progress-label">Progress</span>
                  <span className="clm-progress-value">{p.progress}%</span>
                </div>

                <div className="clm-progressbar">
                  <div
                    className="clm-progressfill"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>

                <div className="clm-card-footer">
                  <div className="clm-footer-item">
                    <span className="clm-footer-ico">👥</span>
                    <span>{p.peopleCount}</span>
                  </div>

                  <div className="clm-footer-item">
                    <span className="clm-footer-ico">📅</span>
                    <span>{formatMonthYear(p.startDate)}</span>
                  </div>

                  <div className="clm-footer-item right">
                    <span className="clm-footer-ico">📈</span>
                    <span>{p.ownerName || selectedManager}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ADD MANAGER MODAL */}
      {showAddModal && (
        <div
          className="clm-modal-overlay"
          onClick={() => {
            setShowAddModal(false);
            setNewDomain("");
          }}
        >
          <div className="clm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="clm-modal-title">Add Manager</h2>

            <form onSubmit={handleAddManager}>
              <input
                className="clm-input"
                placeholder="example.atlassian.net"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />

              <div className="clm-modal-actions">
                <button
                  type="button"
                  className="clm-btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="clm-btn-primary"
                  disabled={loading}
                >
                  {loading ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
