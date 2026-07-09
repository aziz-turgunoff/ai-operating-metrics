import React, { useState, useMemo, useEffect, useCallback } from "react";
import { fetchMetrics, fetchHistory, fetchMonths, fetchMonthReport } from "./api.js";

/*
  Home Alliance — AI Operating Metrics

  ARCHITECTURE:
  - The backend (server/) is the single source of truth for source status and
    metric mapping. This component only renders whatever GET /api/metrics
    returns — it does not hardcode any status or sample number itself.
  - "live"    = connector fetched real data this request.
  - "pending" = access / bug / decision still in flight.
  - "error"   = connector is configured but the fetch failed.
  - History (sparklines) comes from GET /api/history, backed by the monthly
    snapshots persisted in the DB.
  - The month picker: the current calendar month is ALWAYS live (GET
    /api/metrics, fresh on every load). Past months are served from the most
    recent snapshot taken that month (GET /api/months/:month/report) — a
    cache, not a live re-fetch, since upstream sources don't keep their own
    history. GET /api/months lists which past months have a snapshot at all.
*/

const TOKENS = {
  dark: {
    bg: "#0B0E14",
    panel: "#131824",
    panelEdge: "#1E2634",
    ink: "#E6EAF2",
    inkDim: "#8A93A6",
    inkFaint: "#525B6E",
    live: "#3DD68C",
    liveBg: "rgba(61,214,140,0.08)",
    pending: "#E0A63D",
    pendingBg: "rgba(224,166,61,0.07)",
    error: "#E05B5B",
    errorBg: "rgba(224,91,91,0.08)",
    fallback: "#B18AF0",
    fallbackBg: "rgba(177,138,240,0.10)",
    accent: "#5B8DEF",
  },
  // "Soft Slate" — winner of a 3-way judge-panel design review (2026-07-10),
  // refined further to fix the two issues both judges flagged: panel was
  // still near-white (L=0.94, barely below pure white) despite being the
  // dominant surface users actually stare at, and inkFaint failed AA (2.45:1).
  // Every value below is WCAG-verified: ink 11.8:1/13.1:1, inkDim 5.6:1/6.2:1,
  // inkFaint 4.5:1/5.0:1, all status colors >=5.2:1 against both bg and panel
  // (bg is the tighter constraint since panel is lighter — targeting bg first
  // guarantees panel margin for free). Warm off-white hue family (not cool
  // blue-white) genuinely cuts blue-light glare, not just a brightness drop.
  light: {
    bg: "#E9E2D4",
    panel: "#F3EEE4",
    panelEdge: "#D2C7B2",
    ink: "#2A2521",
    inkDim: "#5F5648",
    inkFaint: "#6D645A",
    live: "#1B6841",
    liveBg: "rgba(27,104,65,0.10)",
    pending: "#805209",
    pendingBg: "rgba(128,82,9,0.10)",
    error: "#A3362F",
    errorBg: "rgba(163,54,47,0.08)",
    fallback: "#6748AE",
    fallbackBg: "rgba(103,72,174,0.09)",
    accent: "#2D54BC",
  },
};
const FONTS = {
  mono: "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace",
  sans: "'Inter',system-ui,-apple-system,sans-serif",
};

function statusMeta(T, status) {
  if (status === "live") return { dot: T.live, bg: T.liveBg, text: "LIVE" };
  if (status === "pending") return { dot: T.pending, bg: T.pendingBg, text: "PENDING" };
  if (status === "error") return { dot: T.error, bg: T.errorBg, text: "ERROR" };
  if (status === "fallback") return { dot: T.fallback, bg: T.fallbackBg, text: "AI FALLBACK" };
  if (status === "degraded") return { dot: T.error, bg: T.errorBg, text: "DEGRADED" };
  return { dot: T.inkFaint, bg: "transparent", text: "MOCK" };
}

function fmt(value, unit) {
  if (value === null || value === undefined) return "—";
  if (unit === "$" && typeof value === "number") return "$" + value.toLocaleString();
  if (unit && unit !== "$") return `${value}${unit === "%" ? "%" : " " + unit}`;
  return String(value);
}

// Why a source isn't live: prefer the connector's own note/error over a generic label.
function whyTitle(src) {
  const parts = [src?.label ?? "unknown source"];
  if (src?.status === "error" && src?.error) parts.push(`error: ${src.error}`);
  else if (src?.note) parts.push(src.note);
  return parts.join(" — ");
}

function Sparkline({ T, points }) {
  const nums = points.map((p) => (typeof p.value === "number" ? p.value : null)).filter((v) => v !== null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = 100, h = 24;
  const step = w / (nums.length - 1);
  const d = nums.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <path d={d} fill="none" stroke={T.accent} strokeWidth="1.5" />
    </svg>
  );
}

function NorthStarCard({ T, m, src }) {
  const meta = statusMeta(T, src?.status ?? "mock");
  const empty = m.value === null || m.value === undefined;
  const [history, setHistory] = useState(null);
  const [open, setOpen] = useState(false);

  const toggle = useCallback(async () => {
    if (!open && history === null) {
      try {
        const data = await fetchHistory(m.key);
        setHistory(data.points ?? []);
      } catch {
        setHistory([]);
      }
    }
    setOpen((o) => !o);
  }, [open, history, m.key]);

  return (
    <div
      onClick={toggle}
      style={{
        background: T.panel, border: `1px solid ${T.panelEdge}`, borderRadius: 12,
        padding: "16px 16px 14px", position: "relative", overflow: "hidden", cursor: "pointer",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, height: 2, width: "100%", background: meta.dot, opacity: 0.6 }} />
      <div style={{ fontFamily: FONTS.mono, fontSize: 26, fontWeight: 600, color: empty ? T.inkFaint : T.ink, letterSpacing: -0.5 }}>
        {fmt(m.value, m.unit)}
      </div>
      <div style={{ fontSize: 12.5, color: T.inkDim, marginTop: 6, lineHeight: 1.3 }}>{m.label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }} title={whyTitle(src)}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: meta.dot }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: T.inkFaint }}>{src?.label ?? m.source}</span>
      </div>
      {m.note && <div style={{ fontSize: 10.5, color: T.pending, marginTop: 6 }}>{m.note}</div>}
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelEdge}` }}>
          {history === null && <span style={{ fontSize: 10.5, color: T.inkFaint }}>Loading history…</span>}
          {Array.isArray(history) && history.length < 2 && (
            <span style={{ fontSize: 10.5, color: T.inkFaint }}>Not enough snapshots yet for a trend</span>
          )}
          {Array.isArray(history) && history.length >= 2 && <Sparkline T={T} points={history} />}
        </div>
      )}
    </div>
  );
}

function MetricRow({ T, m, src }) {
  const meta = statusMeta(T, src?.status ?? "mock");
  const empty = m.value === null || m.value === undefined;
  const isFallback = src?.status === "fallback";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderTop: `1px solid ${T.panelEdge}`,
      opacity: empty && src?.status === "pending" ? 0.72 : 1,
      background: isFallback ? T.fallbackBg : "transparent",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: T.ink, fontSize: 13.5 }}>{m.label}</span>
        {m.note && <span style={{ color: isFallback ? T.fallback : T.inkFaint, fontSize: 11 }}>{m.note}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isFallback && (
          <span style={{
            fontFamily: FONTS.mono, fontSize: 9, color: T.fallback, border: `1px solid ${T.fallback}`,
            borderRadius: 4, padding: "1px 4px", letterSpacing: 0.5,
          }}>
            AI EST.
          </span>
        )}
        <span style={{
          fontFamily: FONTS.mono, fontSize: 15, minWidth: 64, textAlign: "right",
          color: empty ? T.inkFaint : (isFallback ? T.fallback : T.ink),
          fontStyle: isFallback ? "italic" : "normal",
        }}>
          {fmt(m.value, m.unit)}
        </span>
        <span title={whyTitle(src)} style={{ width: 7, height: 7, borderRadius: 99, background: meta.dot, flexShrink: 0, cursor: "help" }} />
      </div>
    </div>
  );
}

// Current calendar month is always "live" (month-to-date) — a snapshot for
// this exact month, if one exists, is never offered as a cached alternative.
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function MonthPicker({ T, value, onChange, historicalMonths }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Live shows month-to-date data; past months are served from a cached snapshot"
      style={{
        background: T.panel, border: `1px solid ${T.panelEdge}`, color: T.ink,
        borderRadius: 8, padding: "7px 11px", fontSize: 12, fontFamily: FONTS.mono, cursor: "pointer",
      }}
    >
      <option value="live">{currentMonth()} · Live</option>
      {historicalMonths.map((m) => (
        <option key={m} value={m}>{m} · snapshot</option>
      ))}
    </select>
  );
}

function ThemeToggle({ theme, onToggle, T }) {
  return (
    <button onClick={onToggle} title="Toggle light / dark mode" style={{
      background: T.panel, border: `1px solid ${T.panelEdge}`, color: T.ink,
      borderRadius: 8, padding: "7px 11px", fontSize: 13, cursor: "pointer", lineHeight: 1,
    }}>
      {theme === "dark" ? "☀︎" : "☾"}
    </button>
  );
}

function getInitialTheme() {
  const saved = typeof localStorage !== "undefined" && localStorage.getItem("aom-theme");
  if (saved === "dark" || saved === "light") return saved;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export default function AIOperatingMetrics() {
  const [theme, setTheme] = useState(getInitialTheme);
  const T = TOKENS[theme];
  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("aom-theme", next);
    return next;
  });

  useEffect(() => {
    document.body.style.background = T.bg;
  }, [T.bg]);

  const [filter, setFilter] = useState("all"); // all | live | pending | error
  const [payload, setPayload] = useState(null);
  const [err, setErr] = useState(null);
  const [snapshotMsg, setSnapshotMsg] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("live"); // "live" | "YYYY-MM"
  const [historicalMonths, setHistoricalMonths] = useState([]);

  const isLive = selectedMonth === "live";

  const load = useCallback(() => {
    const fetcher = isLive ? fetchMetrics() : fetchMonthReport(selectedMonth);
    fetcher
      .then((data) => { setPayload(data); setErr(null); })
      .catch((e) => setErr(String(e)));
  }, [isLive, selectedMonth]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchMonths()
      .then((data) => setHistoricalMonths((data.months ?? []).filter((m) => m !== currentMonth())))
      .catch(() => setHistoricalMonths([]));
  }, []);

  const sourcesMeta = payload?.sourcesMeta ?? {};
  const sources = payload?.sources ?? {};
  const report = payload?.report ?? { northStar: [], categories: [] };

  const sourceOf = (key) => ({ ...sourcesMeta[key], ...sources[key] });

  const counts = useMemo(() => {
    let live = 0, pending = 0, error = 0, fallback = 0, degraded = 0;
    Object.keys(sourcesMeta).forEach((k) => {
      const s = sources[k]?.status;
      if (s === "live") live++;
      else if (s === "error") error++;
      else if (s === "fallback") fallback++;
      else if (s === "degraded") degraded++;
      else pending++;
    });
    return { live, pending, error, fallback, degraded, total: Object.keys(sourcesMeta).length };
  }, [sourcesMeta, sources]);

  const showCat = (metrics) => filter === "all" || metrics.some((m) => sourceOf(m.source).status === filter);
  const showMetric = (m) => filter === "all" || sourceOf(m.source).status === filter;

  async function takeSnapshot() {
    setSnapshotMsg("Saving snapshot…");
    try {
      const r = await fetch("/api/snapshot", { method: "POST" });
      const j = await r.json();
      setSnapshotMsg(j.ok ? `Saved snapshot #${j.snapshotId} for ${j.month}` : `Failed: ${j.error}`);
      load();
    } catch (e) {
      setSnapshotMsg(`Failed: ${e}`);
    }
  }

  if (err) {
    const endpoint = isLive ? "/api/metrics" : `/api/months/${selectedMonth}/report`;
    return (
      <div style={{ background: T.bg, minHeight: "100vh", color: T.error, fontFamily: FONTS.mono, padding: 32 }}>
        Failed to load {endpoint} — is the server running on :8787? ({err})
      </div>
    );
  }
  if (!payload) {
    return <div style={{ background: T.bg, minHeight: "100vh", color: T.inkDim, fontFamily: FONTS.mono, padding: 32 }}>Loading…</div>;
  }

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: FONTS.sans, color: T.ink, padding: "0 0 64px" }}>
      <header style={{ padding: "36px 32px 24px", borderBottom: `1px solid ${T.panelEdge}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 650, letterSpacing: -0.4 }}>AI Operating Metrics</h1>
            <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: T.inkDim }}>
              Home Alliance · {isLive ? "month-to-date" : "cached snapshot"} · {payload.month}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <MonthPicker T={T} value={selectedMonth} onChange={setSelectedMonth} historicalMonths={historicalMonths} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} T={T} />
            {isLive && (
              <button onClick={takeSnapshot} style={{
                background: T.panel, border: `1px solid ${T.panelEdge}`, color: T.ink,
                borderRadius: 8, padding: "7px 13px", fontSize: 12, fontFamily: FONTS.mono, cursor: "pointer",
              }}>
                Save snapshot now
              </button>
            )}
          </div>
        </div>
        <p style={{ margin: "10px 0 6px", color: T.inkDim, fontSize: 13.5, maxWidth: 620 }}>
          {isLive ? (
            <>One roll-up across every AI system. Each metric shows its source status — green is live data,
            amber is a source still being wired in, red is a configured source whose fetch failed, purple
            ("AI EST.") is a temporary AI-guessed number standing in until a direct connector lands.
            Hover any dot to see why.</>
          ) : (
            <>Viewing a cached snapshot for {payload.month} — status dots reflect each source's state at
            capture time, not right now. Switch back to "{currentMonth()} · Live" for month-to-date data.</>
          )}
        </p>
        {isLive && snapshotMsg && <p style={{ margin: "0 0 14px", color: T.accent, fontSize: 11.5, fontFamily: FONTS.mono }}>{snapshotMsg}</p>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { k: "all", label: `All sources · ${counts.total}` },
            { k: "live", label: `Live · ${counts.live}`, dot: T.live },
            { k: "pending", label: `Pending · ${counts.pending}`, dot: T.pending },
            { k: "fallback", label: `Fallback · ${counts.fallback}`, dot: T.fallback },
            { k: "error", label: `Error · ${counts.error}`, dot: T.error },
            { k: "degraded", label: `Degraded · ${counts.degraded}`, dot: T.error },
          ].map((b) => (
            <button key={b.k} onClick={() => setFilter(b.k)} style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              background: filter === b.k ? T.panel : "transparent",
              border: `1px solid ${filter === b.k ? T.accent : T.panelEdge}`,
              color: filter === b.k ? T.ink : T.inkDim,
              borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontFamily: FONTS.mono,
            }}>
              {b.dot && <span style={{ width: 7, height: 7, borderRadius: 99, background: b.dot }} />}
              {b.label}
            </button>
          ))}
        </div>
      </header>

      <section style={{ padding: "26px 32px 8px" }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: T.accent, letterSpacing: 1, marginBottom: 14 }}>
          NORTH STAR · click a card for its trend
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {report.northStar.map((m) => <NorthStarCard key={m.key} T={T} m={m} src={sourceOf(m.source)} />)}
        </div>
      </section>

      <section style={{ padding: "22px 32px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        {report.categories.filter((c) => showCat(c.metrics)).map((cat) => {
          const visible = cat.metrics.filter(showMetric);
          const liveN = cat.metrics.filter((m) => sourceOf(m.source).status === "live").length;
          return (
            <div key={cat.name} style={{ background: T.panel, border: `1px solid ${T.panelEdge}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 14px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{cat.name}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10.5, color: T.inkFaint }}>
                  {liveN}/{cat.metrics.length} live
                </span>
              </div>
              {visible.map((m, i) => <MetricRow key={i} T={T} m={m} src={sourceOf(m.source)} />)}
            </div>
          );
        })}
      </section>

      <footer style={{ padding: "32px 32px 0", color: T.inkFaint, fontSize: 11.5, fontFamily: FONTS.mono }}>
        Live from server/ · monthly snapshots persist to the DB · cron runs 09:00 on the 1st.
      </footer>
    </div>
  );
}
