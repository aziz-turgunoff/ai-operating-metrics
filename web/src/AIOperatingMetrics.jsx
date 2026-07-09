import React, { useState, useMemo, useEffect, useCallback } from "react";
import { fetchMetrics, fetchHistory } from "./api.js";

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
    accent: "#5B8DEF",
  },
  light: {
    bg: "#F4F5F8",
    panel: "#FFFFFF",
    panelEdge: "#E1E4EA",
    ink: "#161A22",
    inkDim: "#5B6472",
    inkFaint: "#9AA3B2",
    live: "#1E9A63",
    liveBg: "rgba(30,154,99,0.10)",
    pending: "#A9720F",
    pendingBg: "rgba(169,114,15,0.10)",
    error: "#C23B3B",
    errorBg: "rgba(194,59,59,0.08)",
    accent: "#3B63D6",
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
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderTop: `1px solid ${T.panelEdge}`,
      opacity: empty && src?.status === "pending" ? 0.72 : 1,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: T.ink, fontSize: 13.5 }}>{m.label}</span>
        {m.note && <span style={{ color: T.inkFaint, fontSize: 11 }}>{m.note}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 15, color: empty ? T.inkFaint : T.ink, minWidth: 64, textAlign: "right" }}>
          {fmt(m.value, m.unit)}
        </span>
        <span title={whyTitle(src)} style={{ width: 7, height: 7, borderRadius: 99, background: meta.dot, flexShrink: 0, cursor: "help" }} />
      </div>
    </div>
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

  const load = useCallback(() => {
    fetchMetrics().then(setPayload).catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const sourcesMeta = payload?.sourcesMeta ?? {};
  const sources = payload?.sources ?? {};
  const report = payload?.report ?? { northStar: [], categories: [] };

  const sourceOf = (key) => ({ ...sourcesMeta[key], ...sources[key] });

  const counts = useMemo(() => {
    let live = 0, pending = 0, error = 0;
    Object.keys(sourcesMeta).forEach((k) => {
      const s = sources[k]?.status;
      if (s === "live") live++; else if (s === "error") error++; else pending++;
    });
    return { live, pending, error, total: Object.keys(sourcesMeta).length };
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
    return (
      <div style={{ background: T.bg, minHeight: "100vh", color: T.error, fontFamily: FONTS.mono, padding: 32 }}>
        Failed to load /api/metrics — is the server running on :8787? ({err})
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
              Home Alliance · month-to-date · {payload.month}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} T={T} />
            <button onClick={takeSnapshot} style={{
              background: T.panel, border: `1px solid ${T.panelEdge}`, color: T.ink,
              borderRadius: 8, padding: "7px 13px", fontSize: 12, fontFamily: FONTS.mono, cursor: "pointer",
            }}>
              Save snapshot now
            </button>
          </div>
        </div>
        <p style={{ margin: "10px 0 6px", color: T.inkDim, fontSize: 13.5, maxWidth: 620 }}>
          One roll-up across every AI system. Each metric shows its source status — green is live data,
          amber is a source still being wired in, red is a configured source whose fetch failed.
          Hover any dot to see why.
        </p>
        {snapshotMsg && <p style={{ margin: "0 0 14px", color: T.accent, fontSize: 11.5, fontFamily: FONTS.mono }}>{snapshotMsg}</p>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { k: "all", label: `All sources · ${counts.total}` },
            { k: "live", label: `Live · ${counts.live}`, dot: T.live },
            { k: "pending", label: `Pending · ${counts.pending}`, dot: T.pending },
            { k: "error", label: `Error · ${counts.error}`, dot: T.error },
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
