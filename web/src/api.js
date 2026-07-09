export async function fetchMetrics() {
  const r = await fetch("/api/metrics");
  if (!r.ok) throw new Error(`GET /api/metrics -> HTTP ${r.status}`);
  return r.json();
}

export async function fetchHistory(metricKey) {
  const r = await fetch(`/api/history?metricKey=${encodeURIComponent(metricKey)}`);
  if (!r.ok) throw new Error(`GET /api/history -> HTTP ${r.status}`);
  return r.json();
}

export async function fetchMonths() {
  const r = await fetch("/api/months");
  if (!r.ok) throw new Error(`GET /api/months -> HTTP ${r.status}`);
  return r.json();
}

export async function fetchMonthReport(month) {
  const r = await fetch(`/api/months/${encodeURIComponent(month)}/report`);
  if (!r.ok) throw new Error(`GET /api/months/${month}/report -> HTTP ${r.status}`);
  return r.json();
}
