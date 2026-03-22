export default function MonthlySummary({ summary, expenses }) {
  // If API summary is available use it; otherwise compute from local list
  const monthName = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  let total = 0;
  let topCategory = "—";

  if (summary) {
    total = summary.monthly_total || 0;
    if (summary.by_category?.length > 0) {
      const top = [...summary.by_category].sort((a, b) => b.total - a.total)[0];
      topCategory = top.category;
    }
  } else if (expenses) {
    // Fallback: compute from expenses array (fixed: was using e.date instead of e.expense_date)
    const now = new Date();
    total = expenses
      .filter((e) => {
        const d = new Date(e.expense_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }

  return (
    <div className="summary-cards">
      <div className="summary-card green">
        <div className="summary-label">Total This Month</div>
        <div className="summary-value">₹ {Number(total).toLocaleString("en-IN")}</div>
        <div className="summary-sub">{monthName}</div>
      </div>

      {summary && (
        <>
          <div className="summary-card blue">
            <div className="summary-label">Transactions</div>
            <div className="summary-value">
              {summary.by_category?.reduce((s, c) => s + c.count, 0) || 0}
            </div>
            <div className="summary-sub">This month</div>
          </div>

          <div className="summary-card purple">
            <div className="summary-label">Top Category</div>
            <div className="summary-value" style={{ fontSize: "1.4rem" }}>{topCategory}</div>
            <div className="summary-sub">Highest spend</div>
          </div>
        </>
      )}
    </div>
  );
}