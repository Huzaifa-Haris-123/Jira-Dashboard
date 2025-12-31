// frontend/src/component/ProjectDashboard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "./ProjectDashboard.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtShortDate(iso) {
  try {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatYMD(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a simple burndown series across the full project timeline:
 * - Ideal: linear BAC -> 0
 * - Actual: based on EV achieved by "today" (smoothly decreases to current remaining)
 */
function buildBurndown({ startISO, endISO, bac, ev }) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const now = Date.now();

  const safeStart = Number.isFinite(start) ? start : now;
  const safeEnd = Number.isFinite(end) && end > safeStart ? end : safeStart + 30 * 86400000;

  const totalMs = safeEnd - safeStart;
  const elapsedMs = clamp(now - safeStart, 0, totalMs);

  const bacSafe = Number.isFinite(Number(bac)) ? Number(bac) : 0;
  const evSafe = Number.isFinite(Number(ev)) ? Number(ev) : 0;

  const currentRemaining = Math.max(0, bacSafe - evSafe);
  const elapsedPct = totalMs > 0 ? elapsedMs / totalMs : 0;

  const N = 12;
  const xs = [];
  const ideal = [];
  const actual = [];
  const labels = [];

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const ts = safeStart + t * totalMs;
    xs.push(t);

    // Ideal remaining: BAC -> 0
    ideal.push(bacSafe * (1 - t));

    // Actual remaining
    if (t <= elapsedPct) {
      const prog = elapsedPct > 0 ? t / elapsedPct : 0;
      const rem = bacSafe - (bacSafe - currentRemaining) * prog;
      actual.push(rem);
    } else {
      actual.push(currentRemaining);
    }

    labels.push(fmtShortDate(new Date(ts).toISOString()));
  }

  return { xs, ideal, actual, labels, nowPct: elapsedPct };
}

function BurndownSVG({ startISO, endISO, bac, ev }) {
  const { xs, ideal, actual, labels, nowPct } = useMemo(
    () => buildBurndown({ startISO, endISO, bac, ev }),
    [startISO, endISO, bac, ev]
  );

  const W = 520;
  const H = 220;
  const padL = 42;
  const padR = 18;
  const padT = 18;
  const padB = 34;

  const maxY = Math.max(...ideal, ...actual, 1);
  const minY = 0;

  const xToPx = (t) => padL + t * (W - padL - padR);
  const yToPx = (v) => padT + (1 - (v - minY) / (maxY - minY)) * (H - padT - padB);

  const toPath = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xToPx(xs[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`)
      .join(" ");

  const idealPath = toPath(ideal);
  const actualPath = toPath(actual);

  const nowX = xToPx(nowPct);

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (maxY * i) / ticks).reverse();

  return (
    <div className="pd-chartWrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="pd-svg">
        {tickVals.map((tv, idx) => {
          const y = yToPx(tv);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} className="pd-gridLine" />
              <text x={10} y={y + 4} className="pd-axisText">
                {Math.round(tv)}
              </text>
            </g>
          );
        })}

        <line x1={nowX} y1={padT} x2={nowX} y2={H - padB} className="pd-nowLine" />
        <text x={nowX + 6} y={padT + 12} className="pd-nowText">
          Today
        </text>

        <path d={idealPath} className="pd-lineIdeal" />
        <path d={actualPath} className="pd-lineActual" />

        <text x={padL} y={H - 10} className="pd-axisText">
          {labels[0]}
        </text>
        <text x={W - padR - 55} y={H - 10} className="pd-axisText">
          {labels[labels.length - 1]}
        </text>
      </svg>

      <div className="pd-legendRow">
        <span className="pd-legendItem">
          <span className="pd-dot ideal" /> Estimated
        </span>
        <span className="pd-legendItem">
          <span className="pd-dot actual" /> Actual
        </span>
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const domain = state?.domain || localStorage.getItem("selectedManager");
  const projectKey = state?.projectKey || localStorage.getItem("projectKey");
  const clevel_id = state?.clevel_id || localStorage.getItem("clevel_id");

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => {
  document.title = "C-Level Dashboard";
}, []);

  // ✅ PDF export
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  // ✅ put the body-class effect INSIDE component
  useEffect(() => {
    document.body.classList.add("pd-full");
    return () => document.body.classList.remove("pd-full");
  }, []);

  const tones = useMemo(() => {
    const cpi = Number(data?.cpi ?? 0);
    const spi = Number(data?.spi ?? 0);

    const cpiTone = cpi >= 1 ? "green" : cpi < 0.8 ? "red" : "yellow";
    const spiTone = spi >= 1 ? "green" : spi >= 0.9 ? "yellow" : "red";

    const label = (t) => (t === "green" ? "On Track" : t === "yellow" ? "At Risk" : "Behind");

    return {
      cpi,
      spi,
      cpiTone,
      spiTone,
      cpiLabel: label(cpiTone),
      spiLabel: label(spiTone),
    };
  }, [data]);

  // ✅ Download PDF report (matches on-screen visualization)
  const handleDownloadReport = async () => {
    if (!reportRef.current) return;

    setExporting(true);
    try {
      // let UI settle
      await new Promise((r) => setTimeout(r, 80));

      const node = reportRef.current;

      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f6f8fb",
        scrollY: -window.scrollY,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const projectName = data?.project?.name || data?.project?.key || projectKey || "Project";
      const headerTitle = `Project Report — ${projectName}`;
      const headerSub = `${domain || ""} • Generated: ${new Date().toLocaleString()}`;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(headerTitle, 40, 32);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(headerSub, 40, 50);

      const topOffset = 70;
      const imgWidth = pageWidth; // full width
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, topOffset, imgWidth, imgHeight);

      // multipage
      let heightLeft = imgHeight - (pageHeight - topOffset);
      let page = 1;

      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, topOffset - pageHeight * page, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        page += 1;
      }

      pdf.save(`Project_Report_${projectKey || "project"}_${formatYMD()}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    const load = async () => {
      if (!domain || !projectKey || !clevel_id) {
        setErrMsg("Missing domain/projectKey/clevel_id. Please go back and open the project again.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrMsg("");
      setData(null);

      try {
        const res = await fetch(`${API_BASE}/api/jira/project-kpis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, projectKey, clevel_id: Number(clevel_id) }),
          signal: controller.signal,
        });

        const raw = await res.text();
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {
          json = null;
        }

        if (!res.ok) {
          const msg = json?.message || raw?.slice(0, 300) || `Request failed (${res.status})`;
          if (!ignore) setErrMsg(msg);
          return;
        }

        if (!json?.success) {
          const msg = json?.message || raw?.slice(0, 300) || "Unknown backend response";
          if (!ignore) setErrMsg(msg);
          return;
        }

        if (!ignore) setData(json);
      } catch (e) {
        if (!ignore) setErrMsg(`Fetch failed: ${e?.message || "unknown error"}`);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [domain, projectKey, clevel_id]);

  const projectName = data?.project?.name || data?.project?.key || projectKey || "Project";
  const counts = data?.counts || { todo: 0, inprogress: 0, done: 0, total: 0 };
  const overall = Number(data?.overallProgress ?? 0);
  const completedText = `${counts.done || 0} of ${counts.total || 0} completed`;

  if (loading) {
    return (
      <div className="pd-page">
        <header className="pd-navbar">
          <div className="pd-nav-left" />
          <div className="pd-nav-title">C Level Dashboard</div>
          <div className="pd-nav-right" />
        </header>

        <main className="pd-content">
          <div className="pd-back-row">
            <button className="pd-back" onClick={() => navigate(-1)}>
              ← Back to Projects
            </button>
          </div>

          <div className="pd-title-skel" />
          <div className="pd-sub-skel" />

          <div className="pd-grid2">
            <div className="pd-left-col">
              <div className="pd-kpi-card pd-skel" />
              <div className="pd-kpi-card pd-skel" />
              <div className="pd-panel pd-skel" />
            </div>

            <div className="pd-right-col">
              <div className="pd-card pd-skel pd-burndownTall" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="pd-page">
        <header className="pd-navbar">
          <div className="pd-nav-left" />
          <div className="pd-nav-title">C Level Dashboard</div>
          <div className="pd-nav-right" />
        </header>

        <main className="pd-content">
          <div className="pd-back-row">
            <button className="pd-back" onClick={() => navigate(-1)}>
              ← Back to Projects
            </button>
          </div>

          <div className="pd-errorBox">
            <div className="pd-errorTitle">Error</div>
            <div className="pd-errorMsg">{errMsg}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="pd-page">
      <header className="pd-navbar">
        <div className="pd-nav-left" />
        <div className="pd-nav-title">C Level Dashboard</div>
        <div className="pd-nav-right">
          <button
            className="pd-user-btn"
            onClick={() => {
              localStorage.removeItem("clevel_id");
              window.location.href = "/";
            }}
            title="Logout"
          >
            👤
          </button>
        </div>
      </header>

      {/* ✅ Everything inside this ref gets exported into the PDF */}
      <main className="pd-content" ref={reportRef}>
        <div className="pd-back-row">
          <button className="pd-back" onClick={() => navigate(-1)}>
            ← Back to Projects
          </button>
        </div>

        <div className="pd-head">
          <h1 className="pd-h1">{projectName}</h1>
          <p className="pd-sub">Project Performance Dashboard</p>
        </div>

        <div className="pd-grid2">
          {/* LEFT */}
          <div className="pd-left-col">
            <section className={`pd-kpi-card pd-${tones.cpiTone}`}>
              <div className="pd-kpi-top">
                <div className="pd-kpi-label">COST PERFORMANCE INDEX</div>
                <div className="pd-kpi-ico">📈</div>
              </div>

              <div className="pd-kpi-main">
                <div className="pd-kpi-value">{tones.cpi.toFixed(2)}</div>
                <div className={`pd-kpi-state pd-state-${tones.cpiTone}`}>↗ {tones.cpiLabel}</div>
              </div>

              <div className="pd-kpi-foot">
                Target: 1.00{" "}
                {data?.cpiIsReal === false && (
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                    (proxy used: {Number(data?.cpiProxy ?? 0).toFixed(2)})
                  </span>
                )}
              </div>
            </section>

            <section className={`pd-kpi-card pd-${tones.spiTone}`}>
              <div className="pd-kpi-top">
                <div className="pd-kpi-label">SCHEDULE PERFORMANCE INDEX</div>
                <div className="pd-kpi-ico">📉</div>
              </div>

              <div className="pd-kpi-main">
                <div className="pd-kpi-value">{tones.spi.toFixed(2)}</div>
                <div className={`pd-kpi-state pd-state-${tones.spiTone}`}>↘ {tones.spiLabel}</div>
              </div>

              <div className="pd-kpi-foot">
                Target: 1.00{" "}
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                  ({data?.usedDueDatePV ? "due-date PV" : "fallback PV"} / {data?.kpiBasis || "unknown basis"})
                </span>
              </div>
            </section>

            <section className="pd-panel">
              <div className="pd-panel-title">TICKET STATUS</div>

              <div className="pd-overall">
                <div className="pd-overall-left">
                  <div className="pd-overall-h">Overall Progress</div>
                  <div className="pd-overall-sub">{completedText}</div>
                </div>
                <div className="pd-overall-right">{overall}%</div>
              </div>

              <div className="pd-progressbar">
                <div className="pd-progressfill" style={{ width: `${overall}%` }} />
              </div>

              <div className="pd-status-grid">
                <div className="pd-status-card">
                  <div className="pd-status-pill pd-pill-todo">TO DO</div>
                  <div className="pd-status-num">{counts.todo || 0}</div>
                </div>

                <div className="pd-status-card">
                  <div className="pd-status-pill pd-pill-progress">IN PROGRESS</div>
                  <div className="pd-status-num">{counts.inprogress || 0}</div>
                </div>

                <div className="pd-status-card">
                  <div className="pd-status-pill pd-pill-done">DONE</div>
                  <div className="pd-status-num">{counts.done || 0}</div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT (only burndown) */}
          <div className="pd-right-col">
            <div className="pd-card pd-burndownCard">
              <div className="pd-cardTitle">Burndown</div>

              <div className="pd-metaRow">
                <span>
                  Start: <b>{fmtShortDate(data?.startDate)}</b>
                </span>
                <span>
                  End: <b>{fmtShortDate(data?.endDate)}</b>
                </span>
                <span>
                  BAC: <b>{Number(data?.bac_sp ?? 0).toFixed(0)} SP</b>
                </span>
                <span>
                  EV: <b>{Number(data?.ev_sp ?? 0).toFixed(0)} SP</b>
                </span>
              </div>

              <BurndownSVG
                startISO={data?.startDate}
                endISO={data?.endDate}
                bac={Number(data?.bac_sp ?? 0)}
                ev={Number(data?.ev_sp ?? 0)}
              />

              {/* ✅ New button under burndown */}
              <button
                className="pd-downloadBtn"
                onClick={handleDownloadReport}
                disabled={exporting}
                title="Download a PDF report of this dashboard"
              >
                {exporting ? "Generating PDF..." : "Download Report (PDF)"}
              </button>

              {/* optional helper note (shows in UI and PDF) */}
              <div className="pd-reportHint">
                Includes project KPIs, ticket status, burndown chart, and generated date.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
