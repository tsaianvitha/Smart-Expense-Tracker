import api from "../services/api";

// ── CSV export ────────────────────────────────────────────────────────────────
// Hits the backend streaming endpoint and triggers browser download
export async function exportExpensesCSV({ month, category } = {}) {
  const params = new URLSearchParams();
  if (month)    params.append("month", month);
  if (category) params.append("category", category);

  // We need the raw fetch with auth header (axios doesn't easily handle blob streams)
  const token = localStorage.getItem("token");
  const url   = `http://127.0.0.1:5000/api/v1/export/expenses.csv?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Export failed");

  const blob     = await res.blob();
  const filename = `expenses_${month || "all"}.csv`;
  _triggerDownload(blob, filename, "text/csv");
}

export async function exportSummaryCSV({ month } = {}) {
  const params = month ? `?month=${month}` : "";
  const token  = localStorage.getItem("token");
  const url    = `http://127.0.0.1:5000/api/v1/export/summary.csv${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Export failed");

  const blob     = await res.blob();
  const filename = `summary_${month || "current-month"}.csv`;
  _triggerDownload(blob, filename, "text/csv");
}

// ── PDF export ────────────────────────────────────────────────────────────────
// Generates a formatted PDF entirely in the browser using jsPDF (no backend needed)
export async function exportExpensesPDF(expenses, { month } = {}) {
  // Dynamically import jsPDF so it doesn't bloat the initial bundle
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const { default: autoTable } = await import("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");

  const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const label = month
    ? new Date(month + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" })
    : "All Time";

  // Header
  doc.setFontSize(18);
  doc.setTextColor(99, 102, 241);
  doc.text("SpendSmart — Expense Report", 14, 20);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${label}`, 14, 28);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 34);

  // Grand total
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  doc.setFontSize(13);
  doc.setTextColor(22, 163, 74);
  doc.text(`Total: ₹ ${total.toLocaleString("en-IN")}`, 14, 44);

  // Table
  autoTable(doc, {
    startY: 50,
    head: [["Date", "Title", "Category", "Amount (₹)", "Note"]],
    body: expenses.map((e) => [
      e.expense_date
        ? new Date(e.expense_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "—",
      e.title,
      e.category,
      Number(e.amount).toLocaleString("en-IN"),
      e.note || "",
    ]),
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold", fontSize: 10 },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 3: { halign: "right" } },
  });

  // Category summary on second page
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text("Category Summary", 14, 20);

  const catMap = {};
  expenses.forEach((e) => {
    catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
  });

  autoTable(doc, {
    startY: 26,
    head: [["Category", "Total (₹)", "% of Spend"]],
    body: Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => [
        cat,
        amt.toLocaleString("en-IN"),
        `${((amt / total) * 100).toFixed(1)}%`,
      ]),
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold", fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  doc.save(`expenses_${month || "all"}.pdf`);
}

// ── helper ─────────────────────────────────────────────────────────────────────
function _triggerDownload(blob, filename, type) {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a   = document.createElement("a");
  a.href    = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}