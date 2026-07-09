// Small helpers connectors use to defensively pull fields out of a real API
// response without guessing wrong and crashing, and without ever inventing a
// number that didn't come from the source.

export function num(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function pick(obj, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function sum(list, paths) {
  return list.reduce((acc, row) => acc + (num(pick(row, paths)) ?? 0), 0);
}
