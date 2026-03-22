import {
  BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell,
  LineChart, Line, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { CATEGORY_COLORS } from "../constants/categories";

export default function Analytics({ expenses, summary }) {
  // Category breakdown from summary API or computed locally
  let categoryData = [];
  if (summary?.by_category?.length) {
    categoryData = summary.by_category.map((c) => ({
      name: c.category,
      value: Number(c.total),
    }));
  } else {
    const map = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    categoryData = Object.entries(map).map(([name, value]) => ({ name, value }));
  }

  // 6-month trend from summary API
  const trendData = summary?.monthly_trend?.map((m) => ({
    month: m.month,
    total: Number(m.total),
  })) || [];

  if (categoryData.length === 0) {
    return (
      <div className="empty-analytics">
        <p>📊 No expense data yet. Add some expenses to see your analytics.</p>
      </div>
    );
  }

  return (
    <div className="analytics-grid">
      {/* Bar Chart */}
      <div className="chart-card">
        <h3>Spend by Category</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={categoryData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip formatter={(val) => [`₹${Number(val).toLocaleString("en-IN")}`, "Amount"]} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {categoryData.map((entry, i) => (
                <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#6b7280"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart */}
      <div className="chart-card">
        <h3>Expense Share</h3>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={categoryData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {categoryData.map((entry, i) => (
                <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#6b7280"} />
              ))}
            </Pie>
            <Tooltip formatter={(val) => `₹${Number(val).toLocaleString("en-IN")}`} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 6-Month Trend */}
      {trendData.length > 1 && (
        <div className="chart-card chart-card-wide">
          <h3>6-Month Spending Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(val) => [`₹${Number(val).toLocaleString("en-IN")}`, "Total"]} />
              <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}