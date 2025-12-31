// /frontend/src/component/ProjectsPage.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./ProjectsPage.css";

/* ---------- small helpers ---------- */
function formatMonthYear(d) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function isAbortError(e) {
  const msg = String(e?.message || "").toLowerCase();
  return e?.name === "AbortError" || (msg.includes("abort") && msg.includes("signal"));
}

// simple concurrency pool (prevents 50 parallel requests)
async function asyncPool(limit, arr, iterator) {
  const ret = [];
  const executing = [];
  for (const item of arr) {
    const p = Promise.resolve().then(() => iterator(item));
    ret.push(p);
    if (limit <= arr.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
useEffect(() => {
  document.title = "C-Level Dashboard";
}, []);

  // ✅ keep API_BASE inside component so ESLint doesn't complain about dependencies
  const API_BASE = useMemo(
    () => process.env.REACT_APP_API_URL || "http://localhost:5000",
    []
  );

  const clevel_id = localStorage.getItem("clevel_id");
  const domain = state?.domain || localStorage.getItem("selectedManager");

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // ✅ important: "hasLoadedOnce" prevents flash of "No projects found"
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [errMsg, setErrMsg] = useState("");

  // ✅ Full width (override .App max-width)
  useEffect(() => {
    document.body.classList.add("clm-full");
    return () => document.body.classList.remove("clm-full");
  }, []);

  // ✅ Enrich projects so cards show same progress as dashboard (project-kpis)
  const enrichProjects = useCallback(
    async (rawProjects, controller, ctx) => {
      const list = Array.isArray(rawProjects) ? rawProjects : [];
      const { apiBase, domainVal, clevelVal } = ctx;

      const enriched = await asyncPool(4, list, async (p) => {
        const base = {
          key: p.key,
          name: p.name,
          progress: 0,
          status: "Active",
          peopleCount: 0,
          startDate: null,
          ownerName: null,
          description: null,
        };

        // 1) Prefer KPI endpoint (matches dashboard)
        try {
          const kpiRes = await fetch(`${apiBase}/api/jira/project-kpis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              domain: domainVal,
              projectKey: p.key,
              clevel_id: Number(clevelVal),
            }),
            signal: controller.signal,
          });

          const kpiText = await kpiRes.text();
          let kpiJson = null;
          try {
            kpiJson = JSON.parse(kpiText);
          } catch {
            kpiJson = null;
          }

          if (kpiRes.ok && kpiJson?.success) {
            const counts = kpiJson.counts || {};
            const total = Number(counts.total ?? 0);
            const done = Number(counts.done ?? 0);

            const progress =
              typeof kpiJson.overallProgress === "number"
                ? kpiJson.overallProgress
                : total > 0
                ? Math.round((done / total) * 100)
                : 0;

            const status = progress >= 100 ? "Completed" : "Active";

            return {
              ...base,
              progress,
              status,
              startDate: kpiJson.startDate || null,
              ownerName: kpiJson.project?.lead?.displayName || null,
              description: kpiJson.project?.description || null,
              // optional extras if you add them later
              peopleCount: Number(kpiJson.peopleCount ?? 0) || 0,
            };
          }
        } catch (e) {
          if (isAbortError(e)) return base;
        }

        // 2) Fallback to project-details (if KPI not available)
        try {
          const detailRes = await fetch(`${apiBase}/api/jira/project-details`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              domain: domainVal,
              projectKey: p.key,
              clevel_id: Number(clevelVal),
            }),
            signal: controller.signal,
          });

          const detail = await detailRes.json().catch(() => ({}));
          const tickets = Array.isArray(detail.tickets) ? detail.tickets : [];

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

          const progress =
            typeof detail.progress === "number"
              ? detail.progress
              : totalIssues != null && doneIssues != null
              ? totalIssues === 0
                ? 0
                : Math.round((doneIssues / totalIssues) * 100)
              : (() => {
                  const total = tickets.length;
                  const done = tickets.filter(
                    (t) => t.fields?.status?.statusCategory?.key === "done"
                  ).length;
                  return total === 0 ? 0 : Math.round((done / total) * 100);
                })();

          const isArchived =
            detail.project?.archived === true || detail.project?.archived === "true";

          const status =
            typeof detail.status === "string"
              ? detail.status
              : isArchived || progress === 100
              ? "Completed"
              : "Active";

          const peopleCount =
            typeof detail.peopleCount === "number"
              ? detail.peopleCount
              : new Set(
                  tickets
                    .map((t) => t.fields?.assignee?.accountId)
                    .filter(Boolean)
                ).size;

          const startDate =
            detail.startDate ||
            (() => {
              const createdDates = tickets.map((t) => t.fields?.created).filter(Boolean);
              if (createdDates.length === 0) return null;
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
            ...base,
            progress,
            status,
            peopleCount,
            startDate,
            ownerName: detail.project?.lead?.displayName || null,
            description: detail.project?.description || null,
          };
        } catch (e) {
          if (isAbortError(e)) return base;
          return base;
        }
      });

      return enriched;
    },
    []
  );

  useEffect(() => {
    if (!clevel_id) {
      navigate("/");
      return;
    }
    if (!domain) {
      navigate("/home");
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setErrMsg("");
      setLoadingProjects(true);

      try {
        // 1) Fetch base list
        const res = await fetch(`${API_BASE}/api/jira/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clevel_id: Number(clevel_id), domain }),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "Failed to fetch projects");
        }

        // 2) Enrich (matches dashboard numbers)
        const enriched = await enrichProjects(data.projects || [], controller, {
          apiBase: API_BASE,
          domainVal: domain,
          clevelVal: clevel_id,
        });

        setProjects(enriched);
        setHasLoadedOnce(true);
      } catch (e) {
        if (isAbortError(e)) return;
        setErrMsg(e?.message || "Backend error");
        setHasLoadedOnce(true);
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    load();
    return () => controller.abort();
  }, [API_BASE, clevel_id, domain, navigate, enrichProjects]);

  const handleProjectCardClick = (project) => {
    if (!clevel_id || !domain) return;
    const projectKey = project.key;
    localStorage.setItem("projectKey", projectKey);

    navigate("/project-dashboard", {
      state: {
        domain,
        projectKey,
        clevel_id: Number(clevel_id),
      },
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("clevel_id");
    localStorage.removeItem("selectedManager");
    localStorage.removeItem("projectKey");
    window.location.href = "/";
  };

  const showSkeleton = loadingProjects || !hasLoadedOnce; // ✅ key fix

  return (
    <div className="clm-page">
      <header className="clm-navbar">
        <div className="clm-nav-left">
          <button className="clm-managers-btn" onClick={() => navigate("/home")}>
            ← Managers
          </button>
        </div>

        <div className="clm-nav-title">C Level Dashboard</div>

        <div className="clm-nav-right">
          <button className="clm-user-btn" onClick={handleLogout} title="Logout">
            👤
          </button>
        </div>
      </header>

      <main className="clm-content">
        <div className="pp-heroRow">
          <div>
            <h1 className="clm-h1">Projects</h1>
            <p className="clm-sub">
              Domain: <b>{domain}</b>
            </p>
          </div>

          <div className="pp-statCard">
            <div className="pp-statNum">{projects.length}</div>
            <div className="pp-statLbl">Projects</div>
          </div>
        </div>

        {errMsg && <div className="pp-alert">{errMsg}</div>}

        {showSkeleton ? (
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
                className="clm-card pp-cardPro"
                onClick={() => handleProjectCardClick(p)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleProjectCardClick(p);
                }}
              >
                <div className="clm-card-top">
                  <div className="clm-card-title">{p.name}</div>
                  <div className="pp-pillKey" title={p.key}>
                    {p.key}
                  </div>
                </div>

                <div className="clm-card-desc">
                  {p.description || "Comprehensive initiative tracked via Jira project data."}
                </div>

                <div className="clm-badge-row pp-badgeRow">
                  <span className={`clm-badge ${p.status === "Completed" ? "done" : "active"}`}>
                    {p.status}
                  </span>
                </div>

                <div className="clm-progress-row">
                  <span className="clm-progress-label">Progress</span>
                  <span className="clm-progress-value">{Number(p.progress || 0)}%</span>
                </div>

                <div className="clm-progressbar">
                  <div
                    className="clm-progressfill"
                    style={{ width: `${Number(p.progress || 0)}%` }}
                  />
                </div>

                <div className="clm-card-footer">
                  

                  <div className="clm-footer-item">
                    <span className="clm-footer-ico">📅</span>
                    <span>{formatMonthYear(p.startDate)}</span>
                  </div>

                  <div className="clm-footer-item right">
                    <span className="clm-footer-ico">📈</span>
                    <span>{p.ownerName || domain}</span>
                  </div>
                </div>

                <div className="pp-cardGlow" aria-hidden="true" />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
