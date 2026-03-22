import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar         from "../components/Sidebar";
import AddExpenseModal from "../components/AddExpenseModal";
import ExpenseList     from "../components/ExpenseList";
import MonthlySummary  from "../components/MonthlySummary";
import Analytics       from "../components/Analytics";
import BudgetManager   from "../components/BudgetManager";
import api             from "../services/api";
import { exportExpensesCSV, exportExpensesPDF } from "../services/export";

const VIEWS = ["expenses", "charts", "budgets"];

export default function Dashboard() {
  const [searchParams]  = useSearchParams();
  const initialTab      = searchParams.get("tab") || "expenses";

  const [view,           setView]           = useState(VIEWS.includes(initialTab) ? initialTab : "expenses");
  const [expenses,       setExpenses]       = useState([]);
  const [summary,        setSummary]        = useState(null);
  const [showModal,      setShowModal]      = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth,    setFilterMonth]    = useState("");
  const [sort,           setSort]           = useState("newest");
  const [exporting,      setExporting]      = useState(false);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCategory) params.category = filterCategory;
      if (filterMonth)    params.month     = filterMonth;
      if (sort)           params.sort      = sort;

      const [expRes, sumRes] = await Promise.all([
        api.get("/expenses", { params }),
        api.get("/expenses/summary"),
      ]);
      setExpenses(expRes.data.expenses);
      setSummary(sumRes.data);
    } catch { }
    finally { setLoading(false); }
  }, [filterCategory, filterMonth, sort]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleSaved = (expense) => {
    setExpenses((prev) => {
      const exists = prev.find((e) => e.id === expense.id);
      return exists
        ? prev.map((e) => (e.id === expense.id ? expense : e))
        : [expense, ...prev];
    });
    api.get("/expenses/summary").then((r) => setSummary(r.data)).catch(() => {});
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    await api.delete(`/expenses/${id}`);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    api.get("/expenses/summary").then((r) => setSummary(r.data)).catch(() => {});
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setShowModal(true);
  };

  // ── Export handlers ────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await exportExpensesCSV({ month: filterMonth, category: filterCategory });
    } catch { alert("CSV export failed"); }
    finally { setExporting(false); }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportExpensesPDF(expenses, { month: filterMonth });
    } catch { alert("PDF export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="app-layout">
      <Sidebar onAddExpense={() => { setEditingExpense(null); setShowModal(true); }} />

      <main className="main-content">
        <div className="page-header">
          <h1>Dashboard</h1>
          <div className="view-tabs">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`tab ${view === v ? "active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "expenses" ? "📋 Expenses" : v === "charts" ? "📊 Analytics" : "🎯 Budgets"}
              </button>
            ))}
          </div>
        </div>

        <MonthlySummary summary={summary} expenses={expenses} />

        {/* ── EXPENSES TAB ── */}
        {view === "expenses" && (
          <>
            <div className="filters-bar">
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">All Categories</option>
                {["Food","Shopping","Travel","Medical","Rent","Utilities",
                  "Entertainment","Education","Groceries","Others"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              />

              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount_desc">Amount ↓</option>
                <option value="amount_asc">Amount ↑</option>
              </select>

              {(filterCategory || filterMonth) && (
                <button className="btn-ghost" onClick={() => { setFilterCategory(""); setFilterMonth(""); }}>
                  Clear
                </button>
              )}

              {/* Export buttons */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  className="btn-export"
                  onClick={handleExportCSV}
                  disabled={exporting || expenses.length === 0}
                  title="Download as CSV"
                >
                  {exporting ? "…" : "⬇ CSV"}
                </button>
                <button
                  className="btn-export btn-export-pdf"
                  onClick={handleExportPDF}
                  disabled={exporting || expenses.length === 0}
                  title="Download as PDF"
                >
                  {exporting ? "…" : "⬇ PDF"}
                </button>
              </div>
            </div>

            <ExpenseList
              expenses={expenses}
              onEdit={handleEdit}
              onDelete={handleDelete}
              loading={loading}
            />
          </>
        )}

        {/* ── ANALYTICS TAB ── */}
        {view === "charts" && (
          <Analytics expenses={expenses} summary={summary} />
        )}

        {/* ── BUDGETS TAB ── */}
        {view === "budgets" && (
          <BudgetManager />
        )}
      </main>

      {showModal && (
        <AddExpenseModal
          onClose={() => { setShowModal(false); setEditingExpense(null); }}
          onSaved={handleSaved}
          editingExpense={editingExpense}
        />
      )}
    </div>
  );
}