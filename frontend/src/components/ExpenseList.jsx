import { CATEGORY_COLORS } from "../constants/categories";

export default function ExpenseList({ expenses, onEdit, onDelete, loading }) {
  if (loading) {
    return <div className="loading-state">Loading expenses…</div>;
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {expenses.length === 0 ? (
            <tr>
              <td colSpan="5" className="empty-state">
                No expenses yet — click <strong>+ Add Expense</strong> to get started
              </td>
            </tr>
          ) : (
            expenses.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <div className="expense-title">{expense.title}</div>
                  {expense.note && (
                    <div className="expense-note">{expense.note}</div>
                  )}
                </td>
                <td>
                  <span
                    className="category-badge"
                    style={{ background: CATEGORY_COLORS[expense.category] + "22",
                             color: CATEGORY_COLORS[expense.category] }}
                  >
                    {expense.category}
                  </span>
                </td>
                <td className="date-cell">
                  {expense.expense_date
                    ? new Date(expense.expense_date).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="amount-cell">₹ {Number(expense.amount).toLocaleString("en-IN")}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn-icon edit"   onClick={() => onEdit(expense)}   title="Edit">✏️</button>
                    <button className="btn-icon delete" onClick={() => onDelete(expense.id)} title="Delete">🗑️</button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}