// /frontend/src/component/ManagersPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ManagersPage.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

function getInitials(domain = "") {
  const clean = String(domain).replace("https://", "").replace("http://", "");
  const parts = clean.split(".").filter(Boolean);
  const a = (parts[0] || "M").slice(0, 1).toUpperCase();
  const b = (parts[1] || "").slice(0, 1).toUpperCase();
  return (a + b).slice(0, 2);
}

function friendlyDomain(domain = "") {
  return String(domain).replace("https://", "").replace("http://", "").trim();
}

export default function ManagersPage() {
  const navigate = useNavigate();
  const clevel_id = localStorage.getItem("clevel_id");

  const [managers, setManagers] = useState([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  useEffect(() => {
  document.title = "C-Level Dashboard";
}, []);

  // Modal + form
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => ({ total: managers.length }), [managers]); // kept for future use

  const normalizeManagers = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({
        manager_id: r.manager_id ?? r.id ?? r.managerId,
        atlassianDomain: r.atlassianDomain ?? r.domain ?? r.atlassian_domain,
        clevel_id: r.clevel_id ?? r.clevelId,
      }))
      .filter((x) => x.manager_id != null && x.atlassianDomain);
  };

  const fetchManagers = async () => {
    setLoadingManagers(true);
    setErrMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/managers`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }

      if (!res.ok) throw new Error(raw || `Request failed (${res.status})`);

      const list = normalizeManagers(json);

      // if API returns managers for multiple C-levels, filter for this one
      const filtered =
        clevel_id && list.some((m) => String(m.clevel_id) === String(clevel_id))
          ? list.filter((m) => String(m.clevel_id) === String(clevel_id))
          : list;

      setManagers(filtered);
    } catch (e) {
      setManagers([]);
      setErrMsg("Failed to load managers. Make sure backend has GET /api/managers working.");
    } finally {
      setLoadingManagers(false);
    }
  };

  useEffect(() => {
    if (!clevel_id) {
      navigate("/");
      return;
    }
    fetchManagers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenManager = (domain) => {
    const d = friendlyDomain(domain);
    if (!d) return;
    localStorage.setItem("selectedManager", d);
    navigate("/projects", { state: { domain: d } });
  };

  const handleAddManager = async (e) => {
    e.preventDefault();

    const d = friendlyDomain(newDomain);
    if (!d) {
      setErrMsg("Please enter a valid Atlassian domain.");
      return;
    }
    if (!d.includes(".atlassian.net")) {
      setErrMsg("Domain must be like: example.atlassian.net");
      return;
    }
    if (!clevel_id) {
      setErrMsg("Session expired. Please login again.");
      navigate("/");
      return;
    }

    setSaving(true);
    setErrMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/managers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atlassianDomain: d,
          clevel_id: Number(clevel_id),
        }),
      });

      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }

      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || raw || "Failed to add manager");
      }

      setShowAddModal(false);
      setNewDomain("");
      await fetchManagers();
    } catch (err) {
      setErrMsg(err?.message || "Failed to add manager (backend error).");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteManager = async (manager_id) => {
    if (!clevel_id) {
      setErrMsg("Session expired. Please login again.");
      navigate("/");
      return;
    }
    if (!window.confirm("Remove this manager?")) return;

    setErrMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/managers/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manager_id: Number(manager_id),
          clevel_id: Number(clevel_id),
        }),
      });

      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }

      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || raw || "Failed to remove manager");
      }

      await fetchManagers();
    } catch (err) {
      setErrMsg(err?.message || "Failed to remove manager (backend error).");
    }
  };

  return (
    <div className="mp-page">
      <header className="mp-navbar">
        <div className="mp-nav-left">
          <button className="mp-addBtn" onClick={() => setShowAddModal(true)}>
            + Add Manager
          </button>
        </div>

        <div className="mp-nav-title">C Level Dashboard</div>

        <div className="mp-nav-right">
          <button
            className="mp-userBtn"
            onClick={() => {
              localStorage.removeItem("clevel_id");
              localStorage.removeItem("selectedManager");
              window.location.href = "/";
            }}
            title="Logout"
          >
            👤
          </button>
        </div>
      </header>

      <main className="mp-content">
        <div className="mp-heroRow">
          <div>
            <h1 className="clm-h1">Managers</h1>
            <p className="clm-sub">Choose a Jira domain to open its projects</p>
          </div>

          <div className="mp-statCard">
            <div className="mp-statNum">{managers.length}</div>
            <div className="mp-statLbl">Domains</div>
          </div>
        </div>

        {errMsg && <div className="mp-alert mp-alert-danger">{errMsg}</div>}

        {loadingManagers ? (
          <div className="mp-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mp-card mp-skel" />
            ))}
          </div>
        ) : managers.length === 0 ? (
          <div className="mp-empty">
            <div className="mp-emptyTitle">No managers found</div>
            <div className="mp-emptySub">Click “Add Manager” to register an Atlassian domain.</div>
            <div style={{ marginTop: 14 }}>
              <button className="mp-addBtn" onClick={() => setShowAddModal(true)}>
                + Add Manager
              </button>
            </div>
          </div>
        ) : (
          <div className="mp-grid">
            {managers.map((m) => {
              const domain = friendlyDomain(m.atlassianDomain);
              return (
                <div
                  key={m.manager_id}
                  className="mp-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenManager(domain)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleOpenManager(domain);
                  }}
                >
                  <div className="mp-cardTop">
                    <div className="mp-avatar" aria-hidden="true">
                      {getInitials(domain)}
                    </div>

                    <div className="mp-meta">
                      <div className="mp-domain" title={domain}>
                        {domain}
                      </div>
                      <div className="mp-hint">Click the card to open projects</div>
                    </div>

                    <div className="mp-chip">Jira Cloud</div>
                  </div>

                  <div className="mp-actions">
                    <button
                      className="mp-btn mp-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenManager(domain);
                      }}
                    >
                      Open
                    </button>

                    <button
                      className="mp-btn mp-btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteManager(m.manager_id);
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mp-glow" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="mp-modalBackdrop" onClick={() => setShowAddModal(false)}>
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modalHeader">
              <div>
                <div className="mp-modalTitle">Add Manager</div>
                <div className="mp-modalSub">Example: yourorg.atlassian.net</div>
              </div>

              <button className="mp-iconBtn" onClick={() => setShowAddModal(false)} title="Close">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManager}>
              <label className="mp-label">Domain</label>
              <input
                className="mp-input"
                placeholder="example.atlassian.net"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                autoFocus
              />

              <div className="mp-modalActions">
                <button
                  type="button"
                  className="mp-btn mp-btn-ghost"
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button type="submit" className="mp-btn mp-btn-primary" disabled={saving}>
                  {saving ? "Adding..." : "Add Manager"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
