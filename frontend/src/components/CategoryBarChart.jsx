import { Bar } from "react-chartjs-2";
import categories from "../constants/categories";

function CategoryBarChart({ expenses }) {
  const totals = categories.map((cat) =>
    expenses
      .filter((e) => e.category === cat)
      .reduce((sum, e) => sum + Number(e.amount), 0)
  );

  return (
    <Bar
      data={{
        labels: categories,
        datasets: [
          {
            label: "Spend",
            data: totals,
            backgroundColor: [
              "#16a34a", "#dc2626", "#2563eb", "#f59e0b",
              "#8b5cf6", "#14b8a6", "#0ea5e9", "#22c55e",
              "#ef4444", "#a855f7", "#e11d48", "#6b7280",
            ],
          },
        ],
      }}
    />
  );
}

export default CategoryBarChart;
