/** CSV cell with quoting, plus a guard against spreadsheet formula injection (=, +, -, @). */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: { createdAt: string; data: Record<string, string> }[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.data)) if (!cols.includes(k)) cols.push(k);
  const header = ["received_at", ...cols].map(csvCell).join(",");
  const lines = rows.map((r) =>
    [r.createdAt, ...cols.map((c) => r.data[c] ?? "")].map(csvCell).join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
