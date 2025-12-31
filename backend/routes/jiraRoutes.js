// backend/routes/jiraRoutes.js
import express from "express";
import axios from "axios";
import db from "../config/db.js";

const router = express.Router();

/* ===================== FIXED FIELD IDS (YOUR JIRA) ===================== */
const SPRINT_FIELD = "customfield_10020"; // Sprint
const STORY_POINTS_FIELD = "customfield_10016"; // Story point estimate
const START_DATE_FIELD = "customfield_10015"; // Start date (optional)

/* ===================== HELPERS ===================== */
const buildAxiosCfg = (email, apiToken) => ({
  auth: { username: email, password: apiToken },
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  timeout: 30000,
});

const toMs = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

const statusKey = (issue) => issue?.fields?.status?.statusCategory?.key; // new|indeterminate|done
const issueTypeLower = (issue) => (issue?.fields?.issuetype?.name || "").toLowerCase();

const isEpicOrSubtask = (issue) => {
  const t = issueTypeLower(issue);
  return t === "epic" || t === "sub-task" || t === "subtask";
};

const sp = (issue) => {
  const v = issue?.fields?.[STORY_POINTS_FIELD];
  return Number.isFinite(Number(v)) ? Number(v) : 0;
};

const requireFields = (body, fields) => {
  const missing = fields.filter((k) => !body?.[k]);
  return missing.length ? missing : null;
};

const jiraErrMsg = (e) =>
  e?.response?.data?.errorMessages?.[0] ||
  e?.response?.data?.message ||
  e?.message ||
  "Jira API error";
/* ===================== SPRINT SUMMARY HELPERS ===================== */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const pickSprintDates = (s) => ({
  startISO: s?.startDate || s?.activatedDate || null,
  endISO: s?.endDate || s?.completeDate || null,
});

const computeSprintBadge = ({ startISO, endISO, donePct }) => {
  const now = Date.now();
  const s = startISO ? new Date(startISO).getTime() : NaN;
  const e = endISO ? new Date(endISO).getTime() : NaN;

  // if dates missing, fallback only on donePct
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
    if (donePct >= 0.8) return { label: "On Track", tone: "green" };
    if (donePct >= 0.5) return { label: "At Risk", tone: "yellow" };
    return { label: "Behind", tone: "red" };
  }

  const total = e - s;
  const elapsed = clamp(now - s, 0, total);
  const plannedPct = total > 0 ? elapsed / total : 0;

  if (donePct >= plannedPct) return { label: "On Track", tone: "green" };
  if (donePct + 0.1 >= plannedPct) return { label: "At Risk", tone: "yellow" };
  return { label: "Behind", tone: "red" };
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ===================== SEARCH PAGINATION ===================== */
/** Enhanced search pagination (/rest/api/3/search/jql) -> nextPageToken */
async function fetchAllIssuesEnhanced({ domain, jql, fields, axiosCfg, safetyCap = 4000 }) {
  const maxResults = 100;
  let all = [];
  let nextPageToken = undefined;

  let loops = 0;
  const LOOP_CAP = 250;

  while (true) {
    const body = { jql, maxResults, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const r = await axios.post(`https://${domain}/rest/api/3/search/jql`, body, axiosCfg);

    const issues = r.data?.issues || [];
    all.push(...issues);

    const isLast = r.data?.isLast === true;
    nextPageToken = r.data?.nextPageToken;

    if (!issues.length) break;
    if (isLast) break;
    if (!nextPageToken) break;
    if (all.length >= safetyCap) break;

    loops++;
    if (loops >= LOOP_CAP) break;
  }

  return all.slice(0, safetyCap);
}

/** Legacy search pagination fallback (/rest/api/3/search) -> startAt */
async function fetchAllIssuesLegacy({ domain, jql, fields, axiosCfg, safetyCap = 4000 }) {
  let startAt = 0;
  const maxResults = 100;
  let all = [];
  let total = 0;

  while (true) {
    const r = await axios.post(
      `https://${domain}/rest/api/3/search`,
      { jql, startAt, maxResults, fields },
      axiosCfg
    );

    const issues = r.data?.issues || [];
    total = r.data?.total || 0;

    all = all.concat(issues);
    startAt += issues.length;

    if (issues.length === 0) break;
    if (startAt >= total) break;
    if (all.length >= safetyCap) break;
  }

  return all.slice(0, safetyCap);
}

/* ===================== AGILE: SPRINT ISSUES PAGINATION (kept, but not used for PV now) ===================== */
async function fetchAllSprintIssues({ domain, sprintId, fields, axiosCfg, safetyCap = 6000 }) {
  let startAt = 0;
  const maxResults = 100;
  let all = [];
  let loops = 0;
  const LOOP_CAP = 400;

  while (true) {
    const r = await axios.get(`https://${domain}/rest/agile/1.0/sprint/${sprintId}/issue`, {
      ...axiosCfg,
      params: {
        startAt,
        maxResults,
        fields: fields.join(","),
      },
    });

    const issues = r.data?.issues || [];
    all.push(...issues);
    startAt += issues.length;

    if (!issues.length) break;
    if (startAt >= (r.data?.total || 0)) break;
    if (all.length >= safetyCap) break;

    loops++;
    if (loops >= LOOP_CAP) break;
  }

  return all.slice(0, safetyCap);
}

/* ===================== PING ===================== */
router.get("/ping", (req, res) => {
  res.json({ ok: true, route: "jiraRoutes" });
});

/* ===================== PROJECT LIST ===================== */
router.post("/projects", (req, res) => {
  const missing = requireFields(req.body, ["clevel_id", "domain"]);
  if (missing) {
    return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
  }

  const { clevel_id, domain } = req.body;

  db.query("SELECT email, apiToken FROM clevel WHERE id = ?", [clevel_id], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (!results || results.length === 0)
      return res.status(404).json({ success: false, message: "C-Level not found" });

    const { email, apiToken } = results[0];
    const axiosCfg = buildAxiosCfg(email, apiToken);

    try {
      const projRes = await axios.get(
        `https://${domain}/rest/api/3/project/search?maxResults=100`,
        axiosCfg
      );

      const values = projRes.data?.values || [];
      const projects = values.map((p) => ({ key: p.key, name: p.name }));

      return res.json({ success: true, projects });
    } catch (error) {
      const status = error?.response?.status || 500;
      const data = error?.response?.data;
      return res.status(status).json({
        success: false,
        message: data?.errorMessages?.[0] || data?.message || "Jira API error",
      });
    }
  });
});

/* ===================== PROJECT DETAILS ===================== */
router.post("/project-details", (req, res) => {
  const missing = requireFields(req.body, ["domain", "projectKey", "clevel_id"]);
  if (missing) {
    return res.status(400).json({ message: `${missing.join(", ")} required` });
  }

  const { domain, projectKey, clevel_id } = req.body;

  db.query("SELECT email, apiToken FROM clevel WHERE id = ?", [clevel_id], async (err, rows) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!rows || rows.length === 0) return res.status(404).json({ message: "C-Level not found" });

    const { email, apiToken } = rows[0];
    const axiosCfg = buildAxiosCfg(email, apiToken);

    try {
      const projectRes = await axios.get(
        `https://${domain}/rest/api/3/project/${projectKey}`,
        axiosCfg
      );

      const ticketsRes = await axios.post(
        `https://${domain}/rest/api/3/search/jql`,
        {
          jql: `project = ${projectKey} AND issuetype != Epic AND issuetype != "Sub-task" ORDER BY created DESC`,
          maxResults: 50,
          fields: ["key", "summary", "status", "issuetype", "assignee", "reporter", "created"],
        },
        axiosCfg
      );

      const epicsRes = await axios.post(
        `https://${domain}/rest/api/3/search/jql`,
        {
          jql: `project = ${projectKey} AND issuetype = Epic ORDER BY created DESC`,
          maxResults: 50,
          fields: ["key", "summary", "status"],
        },
        axiosCfg
      );

      let sprints = [];
      try {
        const boardRes = await axios.get(
          `https://${domain}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`,
          axiosCfg
        );
        const boardId = boardRes.data?.values?.[0]?.id;
        if (boardId) {
          const sprintRes = await axios.get(
            `https://${domain}/rest/agile/1.0/board/${boardId}/sprint?maxResults=50&state=active,future,closed`,
            axiosCfg
          );
          sprints = sprintRes.data?.values || [];
        }
      } catch (_) {
        sprints = [];
      }

      return res.json({
        project: projectRes.data,
        tickets: ticketsRes.data?.issues || [],
        epics: epicsRes.data?.issues || [],
        sprints,
      });
    } catch (e) {
      const status = e?.response?.status || 500;
      const data = e?.response?.data;
      return res.status(status).json({
        message: data?.errorMessages?.[0] || data?.message || "Jira API error",
      });
    }
  });
});

/* ===================== ✅ PROJECT KPIs (DUE-DATE PV, NO SPRINTS NEEDED) ===================== */
router.post("/project-kpis", (req, res) => {
  const missing = requireFields(req.body, ["domain", "projectKey", "clevel_id"]);
  if (missing) {
    return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
  }

  const { domain, projectKey, clevel_id } = req.body;

  db.query("SELECT email, apiToken FROM clevel WHERE id = ?", [clevel_id], async (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (!rows || rows.length === 0)
      return res.status(404).json({ success: false, message: "C-Level not found" });

    const { email, apiToken } = rows[0];
    const axiosCfg = buildAxiosCfg(email, apiToken);

    // ---- time helpers (seconds -> hours) ----
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const secToHrs = (sec) => num(sec) / 3600;

    // Jira built-ins for time tracking
    const plannedSec = (issue) => num(issue?.fields?.timeoriginalestimate); // planned
    const spentSec = (issue) => num(issue?.fields?.timespent); // actual

    try {
      const now = Date.now();

      // 1) Project info
      const projectRes = await axios.get(
        `https://${domain}/rest/api/3/project/${projectKey}`,
        axiosCfg
      );

      // 2) (Optional) Board + sprints for start/end display only (PV does NOT use sprints)
      let boardId = null;
      let sprints = [];
      try {
        const boardRes = await axios.get(
          `https://${domain}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`,
          axiosCfg
        );
        boardId = boardRes.data?.values?.[0]?.id || null;

        if (boardId) {
          const sprintRes = await axios.get(
            `https://${domain}/rest/agile/1.0/board/${boardId}/sprint?maxResults=50&state=active,future,closed`,
            axiosCfg
          );
          sprints = sprintRes.data?.values || [];
        }
      } catch (_) {
        boardId = null;
        sprints = [];
      }

      const sprintsDated = (sprints || [])
        .map((s) => ({
          id: s.id,
          name: s.name,
          startMs: toMs(s.startDate),
          endMs: toMs(s.endDate) ?? toMs(s.completeDate),
        }))
        .filter((s) => s.startMs !== null && s.endMs !== null && s.endMs > s.startMs)
        .sort((a, b) => a.startMs - b.startMs);

      // 3) Fetch all NON-EPIC, NON-SUBTASK issues for counts + EV/BAC/AC + PV_dueDate
      const fields = [
        "status",
        "created",
        "duedate",
        "issuetype",
        STORY_POINTS_FIELD,
        START_DATE_FIELD,
        SPRINT_FIELD,
        "timeoriginalestimate",
        "timespent",
      ];

      const jql = `project = ${projectKey} AND issuetype != Epic AND issuetype != "Sub-task" ORDER BY created ASC`;

      let allIssues = [];
      try {
        allIssues = await fetchAllIssuesEnhanced({ domain, jql, fields, axiosCfg, safetyCap: 4000 });
      } catch (e) {
        const msg = jiraErrMsg(e);
        if (e?.response?.status === 400 && /Invalid request payload/i.test(msg)) {
          allIssues = await fetchAllIssuesLegacy({ domain, jql, fields, axiosCfg, safetyCap: 4000 });
        } else {
          throw e;
        }
      }

      allIssues = (allIssues || []).filter((it) => !isEpicOrSubtask(it));

      // 4) Counts + EV/BAC/AC
      let todo = 0,
        inprogress = 0,
        done = 0;
      let minCreated = null;
      let maxDue = null;

      // Story points basis
      let EV_sp = 0;
      let BAC_sp = 0;

      // ✅ In-progress SP for CPI proxy
      let INPROG_sp = 0;

      // Time basis (hours) for CPI (if available)
      let EV_hr = 0;
      let BAC_hr = 0;
      let AC_hr = 0;

      // Due-date PV counters
      let PV_sp_due = 0;
      let dueCount = 0;
      let dueCountByNow = 0;

      for (const issue of allIssues) {
        const sk = statusKey(issue);

        if (sk === "done") done++;
        else if (sk === "indeterminate") inprogress++;
        else todo++;

        const createdMs = toMs(issue?.fields?.created);
        if (createdMs !== null) {
          minCreated = minCreated === null ? createdMs : Math.min(minCreated, createdMs);
        }

        const dueMs = toMs(issue?.fields?.duedate);
        if (dueMs !== null) {
          maxDue = maxDue === null ? dueMs : Math.max(maxDue, dueMs);

          // ✅ Due-date PV: planned by today
          dueCount++;
          if (dueMs <= now) {
            dueCountByNow++;
            PV_sp_due += sp(issue);
          }
        }

        const pts = sp(issue);
        BAC_sp += pts;

        if (sk === "done") EV_sp += pts;
        else if (sk === "indeterminate") INPROG_sp += pts;

        const pSec = plannedSec(issue);
        const sSec = spentSec(issue);

        BAC_hr += secToHrs(pSec);
        AC_hr += secToHrs(sSec);

        if (sk === "done") {
          EV_hr += secToHrs(pSec);
        }
      }

      const totalIssues = todo + inprogress + done;
      const overallProgress = totalIssues === 0 ? 0 : Math.round((done / totalIssues) * 100);

      // 5) Start/End dates for display
      const startDateMs = (sprintsDated.length ? sprintsDated[0].startMs : null) ?? minCreated ?? now;
      const endDateMs =
        (sprintsDated.length ? Math.max(...sprintsDated.map((s) => s.endMs)) : null) ??
        maxDue ??
        startDateMs + 30 * 24 * 60 * 60 * 1000;

      // 6) PV_sp: DUE-DATE based PV (no sprints needed), fallback if due dates missing
      let PV_sp = PV_sp_due;
      let usedDueDatePV = true;

      const coverage = totalIssues > 0 ? dueCount / totalIssues : 0;

      // Fallback thresholds (tune if you want)
      const MIN_DUE_DATE_COVERAGE = 0.2; // 20% issues have due date
      const PV_MIN = 0;

      if (PV_sp <= PV_MIN || coverage < MIN_DUE_DATE_COVERAGE) {
        usedDueDatePV = false;

        let plannedPct = 1;
        if (endDateMs > startDateMs) {
          plannedPct = (now - startDateMs) / (endDateMs - startDateMs);
          plannedPct = Math.max(0, Math.min(1, plannedPct));
        }

        PV_sp = BAC_sp * plannedPct;
      }

      // 7) SPI/CPI
      // ✅ SPI uses EV/PV, but if ALL issues are done => SPI must be 1
      let spi = PV_sp > 0 ? EV_sp / PV_sp : 0;
      if (totalIssues > 0 && done === totalIssues) {
        spi = 1;
      }

      // CPI: real only if time tracking exists
      const hasTimeEVM = (BAC_hr > 0 || EV_hr > 0) && AC_hr > 0;

      // ✅ CPI: real time-based if possible else SP proxy = EV/(EV+INPROG)
      let cpi = hasTimeEVM && AC_hr > 0 ? EV_hr / AC_hr : 0;

      const denom_sp = EV_sp + INPROG_sp;
      const cpiSpProxy = denom_sp > 0 ? EV_sp / denom_sp : 0;

      if (!hasTimeEVM) {
        cpi = cpiSpProxy;
      }

      // Keep your count-based proxy too (optional for UI)
      const started = done + inprogress;
      const cpiProxy = started > 0 ? done / started : 0;

      // ✅ SPI DEBUG (paste here)
      console.log("SPI DEBUG", {
        totalIssues,
        todo,
        inprogress,
        done,
        EV_sp,
        BAC_sp,
        PV_sp,
        PV_sp_due,
        usedDueDatePV,
        dueCount,
        dueCountByNow,
        startDate: new Date(startDateMs).toISOString(),
        endDate: new Date(endDateMs).toISOString(),
      });

      return res.json({
        success: true,
        project: projectRes.data,

        counts: { todo, inprogress, done, total: totalIssues },
        overallProgress,

        startDate: new Date(startDateMs).toISOString(),
        endDate: new Date(endDateMs).toISOString(),

        spi: Number.isFinite(spi) ? Number(spi.toFixed(2)) : 0,
        cpi: Number.isFinite(cpi) ? Number(cpi.toFixed(2)) : 0,

        // SPI is story-points based now
        kpiBasis: "story-points",
        cpiIsReal: hasTimeEVM,
        cpiProxy: Number(cpiProxy.toFixed(2)),

        // Extra debug for CPI proxy
        inprog_sp: Number(INPROG_sp.toFixed(2)),
        cpiSpProxy: Number(cpiSpProxy.toFixed(2)),

        // PV method flags
        usedSprintPV: false,
        usedDueDatePV,
        dueDateCoverage: Number(coverage.toFixed(2)),
        dueCount,
        dueCountByNow,

        // Debug numbers
        ev_sp: Number(EV_sp.toFixed(2)),
        pv_sp: Number(PV_sp.toFixed(2)),
        bac_sp: Number(BAC_sp.toFixed(2)),

        ev_hr: Number(EV_hr.toFixed(2)),
        bac_hr: Number(BAC_hr.toFixed(2)),
        ac_hr: Number(AC_hr.toFixed(2)),

        sprintField: SPRINT_FIELD,
        storyPointsField: STORY_POINTS_FIELD,
        startDateField: START_DATE_FIELD,
      });
    } catch (e) {
      const status = e?.response?.status || 500;
      return res.status(status).json({
        success: false,
        message: jiraErrMsg(e),
      });
    }
  });
});
/* ===================== ✅ ACTIVE SPRINT SUMMARY (FOR RIGHT TOP CARD) ===================== */
router.post("/active-sprint-summary", (req, res) => {
  const missing = requireFields(req.body, ["domain", "projectKey", "clevel_id"]);
  if (missing) {
    return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
  }

  const { domain, projectKey, clevel_id } = req.body;

  db.query("SELECT email, apiToken FROM clevel WHERE id = ?", [clevel_id], async (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "C-Level not found" });
    }

    const { email, apiToken } = rows[0];
    const axiosCfg = buildAxiosCfg(email, apiToken);

    try {
      // 1) Find board for project
      const boardRes = await axios.get(
        `https://${domain}/rest/agile/1.0/board`,
        {
          ...axiosCfg,
          params: { projectKeyOrId: projectKey, maxResults: 50 },
        }
      );

      const boardId = boardRes.data?.values?.[0]?.id;
      if (!boardId) {
        return res.json({
          success: true,
          hasActiveSprint: false,
          message: "No Jira board found for this project.",
        });
      }

      // 2) Active sprint on that board
      const sprintRes = await axios.get(
        `https://${domain}/rest/agile/1.0/board/${boardId}/sprint`,
        {
          ...axiosCfg,
          params: { state: "active", maxResults: 50 },
        }
      );

      const active = sprintRes.data?.values?.[0];
      if (!active) {
        return res.json({
          success: true,
          hasActiveSprint: false,
          message: "No active sprint found.",
        });
      }

      const sprintId = active.id;
      const sprintName = active.name || `Sprint ${sprintId}`;

      // 3) Pull sprint issues and aggregate (issues + story points)
      const fields = ["status", STORY_POINTS_FIELD];

      const issues = await fetchAllSprintIssues({
        domain,
        sprintId,
        fields,
        axiosCfg,
        safetyCap: 6000,
      });

      let totalIssues = 0,
        doneIssues = 0;
      let totalSP = 0,
        doneSP = 0;

      for (const it of issues) {
        totalIssues++;

        const cat = it?.fields?.status?.statusCategory?.key; // new | indeterminate | done
        const spVal = num(it?.fields?.[STORY_POINTS_FIELD]);

        totalSP += spVal;

        if (cat === "done") {
          doneIssues++;
          doneSP += spVal;
        }
      }

      const donePct =
        totalSP > 0
          ? doneSP / totalSP
          : totalIssues > 0
          ? doneIssues / totalIssues
          : 0;

      const { startISO, endISO } = pickSprintDates(active);

      const daysLeft =
        endISO && Number.isFinite(new Date(endISO).getTime())
          ? Math.max(0, Math.ceil((new Date(endISO).getTime() - Date.now()) / 86400000))
          : null;

      const badge = computeSprintBadge({ startISO, endISO, donePct });

      return res.json({
        success: true,
        hasActiveSprint: true,

        sprint: {
          id: sprintId,
          name: sprintName,
          startDate: startISO,
          endDate: endISO,
          daysLeft,

          totalIssues,
          doneIssues,

          totalSP: Number(totalSP.toFixed(2)),
          doneSP: Number(doneSP.toFixed(2)),

          progressPct: Math.round(donePct * 100),

          badge, // {label, tone}
        },

        // helpful for debugging
        boardId,
        storyPointsField: STORY_POINTS_FIELD,
      });
    } catch (e) {
      const status = e?.response?.status || 500;
      return res.status(status).json({
        success: false,
        message: jiraErrMsg(e),
      });
    }
  });
});

export default router;
