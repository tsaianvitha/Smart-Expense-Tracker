import csv
import io
from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql

export_bp = Blueprint("export", __name__)


# ── CSV export  GET /export/expenses.csv ─────────────────────────────────────
@export_bp.route("/export/expenses.csv", methods=["GET"])
@jwt_required()
def export_expenses_csv():
    user_id  = get_jwt_identity()
    month    = request.args.get("month")    # optional YYYY-MM filter
    category = request.args.get("category")

    query  = "SELECT title, category, amount, expense_date, note FROM expenses WHERE user_id = %s"
    params = [user_id]

    if month:
        query += " AND DATE_FORMAT(expense_date, '%%Y-%%m') = %s"
        params.append(month)
    if category:
        query += " AND category = %s"
        params.append(category)

    query += " ORDER BY expense_date DESC"

    cur = mysql.connection.cursor()
    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        # Header
        writer.writerow(["Title", "Category", "Amount (₹)", "Date", "Note"])
        yield buf.getvalue()

        for row in rows:
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow([
                row["title"],
                row["category"],
                row["amount"],
                str(row["expense_date"]),
                row["note"] or "",
            ])
            yield buf.getvalue()

    filename = f"expenses_{month or 'all'}.csv"
    return Response(
        stream_with_context(generate()),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Summary export  GET /export/summary.csv ──────────────────────────────────
@export_bp.route("/export/summary.csv", methods=["GET"])
@jwt_required()
def export_summary_csv():
    """Monthly category totals as CSV — used for PDF generation on the frontend."""
    user_id = get_jwt_identity()
    month   = request.args.get("month")   # YYYY-MM, defaults to current month

    if month:
        month_filter = "DATE_FORMAT(expense_date, '%%Y-%%m') = %s"
        params       = [user_id, month]
    else:
        month_filter = "MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE())"
        params       = [user_id]

    cur = mysql.connection.cursor()
    cur.execute(
        f"""
        SELECT category,
               COUNT(*)       AS transactions,
               SUM(amount)    AS total,
               MIN(amount)    AS min_amount,
               MAX(amount)    AS max_amount,
               AVG(amount)    AS avg_amount
        FROM   expenses
        WHERE  user_id = %s AND {month_filter}
        GROUP BY category
        ORDER BY total DESC
        """,
        params,
    )
    rows = cur.fetchall()

    cur.execute(
        f"SELECT COALESCE(SUM(amount),0) AS grand FROM expenses WHERE user_id = %s AND {month_filter}",
        params,
    )
    grand = float(cur.fetchone()["grand"])
    cur.close()

    def generate():
        buf = io.StringIO()
        w   = csv.writer(buf)
        w.writerow(["Category", "Transactions", "Total (₹)", "Min (₹)", "Max (₹)", "Avg (₹)", "% of Total"])
        yield buf.getvalue()

        for r in rows:
            buf = io.StringIO()
            w   = csv.writer(buf)
            total = float(r["total"])
            w.writerow([
                r["category"],
                r["transactions"],
                round(total, 2),
                round(float(r["min_amount"]), 2),
                round(float(r["max_amount"]), 2),
                round(float(r["avg_amount"]), 2),
                f"{round((total/grand)*100, 1) if grand else 0}%",
            ])
            yield buf.getvalue()

        # Grand total row
        buf = io.StringIO()
        w   = csv.writer(buf)
        w.writerow(["TOTAL", "", round(grand, 2), "", "", "", "100%"])
        yield buf.getvalue()

    label    = month or "current-month"
    filename = f"summary_{label}.csv"
    return Response(
        stream_with_context(generate()),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )