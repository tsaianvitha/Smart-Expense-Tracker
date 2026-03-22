from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql

expenses_bp = Blueprint("expenses", __name__)

VALID_CATEGORIES = {
    "Food", "Shopping", "Travel", "Medical",
    "Rent", "Utilities", "Entertainment",
    "Education", "Groceries", "Others",
}


# ── helper ────────────────────────────────────────────────────────────────────

def _row_or_404(expense_id: int, user_id: str):
    """Return the expense row if it belongs to this user, else None."""
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT * FROM expenses WHERE id = %s AND user_id = %s",
        (expense_id, user_id),
    )
    row = cur.fetchone()
    cur.close()
    return row


# ── GET ALL  /expenses ────────────────────────────────────────────────────────

@expenses_bp.route("/expenses", methods=["GET"])
@jwt_required()
def get_expenses():
    user_id  = get_jwt_identity()
    category = request.args.get("category")        # optional filter
    month    = request.args.get("month")           # optional  YYYY-MM
    sort     = request.args.get("sort", "newest")  # newest | oldest | amount_desc

    query  = "SELECT * FROM expenses WHERE user_id = %s"
    params = [user_id]

    if category and category in VALID_CATEGORIES:
        query += " AND category = %s"
        params.append(category)

    if month:                                       # e.g. "2025-03"
        query += " AND DATE_FORMAT(expense_date, '%%Y-%%m') = %s"
        params.append(month)

    order_map = {
        "newest":      "expense_date DESC",
        "oldest":      "expense_date ASC",
        "amount_desc": "amount DESC",
        "amount_asc":  "amount ASC",
    }
    query += f" ORDER BY {order_map.get(sort, 'expense_date DESC')}"

    cur = mysql.connection.cursor()
    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()

    # Convert date objects to ISO strings for JSON
    for row in rows:
        if row.get("expense_date"):
            row["expense_date"] = str(row["expense_date"])
        if row.get("created_at"):
            row["created_at"] = str(row["created_at"])

    return jsonify(expenses=rows)


# ── GET MONTHLY SUMMARY  /expenses/summary ────────────────────────────────────

@expenses_bp.route("/expenses/summary", methods=["GET"])
@jwt_required()
def get_summary():
    user_id = get_jwt_identity()

    cur = mysql.connection.cursor()

    # Total per category this month
    cur.execute(
        """
        SELECT category,
               SUM(amount)  AS total,
               COUNT(*)     AS count
        FROM   expenses
        WHERE  user_id = %s
          AND  MONTH(expense_date) = MONTH(CURDATE())
          AND  YEAR(expense_date)  = YEAR(CURDATE())
        GROUP BY category
        """,
        (user_id,),
    )
    by_category = cur.fetchall()

    # Grand total this month
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM   expenses
        WHERE  user_id = %s
          AND  MONTH(expense_date) = MONTH(CURDATE())
          AND  YEAR(expense_date)  = YEAR(CURDATE())
        """,
        (user_id,),
    )
    monthly_total = cur.fetchone()["total"]

    # Monthly totals for last 6 months (for trend chart)
    cur.execute(
        """
        SELECT DATE_FORMAT(expense_date, '%%Y-%%m') AS month,
               SUM(amount)                          AS total
        FROM   expenses
        WHERE  user_id = %s
          AND  expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY month
        ORDER BY month
        """,
        (user_id,),
    )
    monthly_trend = cur.fetchall()

    cur.close()

    return jsonify(
        monthly_total=float(monthly_total),
        by_category=by_category,
        monthly_trend=monthly_trend,
    )


# ── CREATE  POST /expenses ────────────────────────────────────────────────────

@expenses_bp.route("/expenses", methods=["POST"])
@jwt_required()
def add_expense():
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}

    title        = (data.get("title") or "").strip()
    amount       = data.get("amount")
    category     = (data.get("category") or "").strip()
    expense_date = (data.get("expense_date") or "").strip()
    note         = (data.get("note") or "").strip()

    # Validation
    if not title or not amount or not category or not expense_date:
        return jsonify(msg="title, amount, category and expense_date are required"), 400

    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify(msg="Amount must be a positive number"), 400

    if category not in VALID_CATEGORIES:
        return jsonify(msg=f"Invalid category. Choose from: {', '.join(sorted(VALID_CATEGORIES))}"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        """
        INSERT INTO expenses (user_id, title, amount, category, expense_date, note)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, title, amount, category, expense_date, note),
    )
    mysql.connection.commit()
    new_id = cur.lastrowid

    cur.execute("SELECT * FROM expenses WHERE id = %s", (new_id,))
    row = cur.fetchone()
    cur.close()

    row["expense_date"] = str(row["expense_date"])
    row["created_at"]   = str(row["created_at"])

    return jsonify(msg="Expense added", expense=row), 201


# ── UPDATE  PUT /expenses/<id> ────────────────────────────────────────────────

@expenses_bp.route("/expenses/<int:expense_id>", methods=["PUT"])
@jwt_required()
def update_expense(expense_id):
    user_id = get_jwt_identity()

    if not _row_or_404(expense_id, user_id):
        return jsonify(msg="Expense not found"), 404

    data         = request.get_json(silent=True) or {}
    title        = (data.get("title") or "").strip()
    amount       = data.get("amount")
    category     = (data.get("category") or "").strip()
    expense_date = (data.get("expense_date") or "").strip()
    note         = (data.get("note") or "").strip()

    if not title or not amount or not category or not expense_date:
        return jsonify(msg="title, amount, category and expense_date are required"), 400

    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify(msg="Amount must be a positive number"), 400

    if category not in VALID_CATEGORIES:
        return jsonify(msg=f"Invalid category"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        """
        UPDATE expenses
        SET title=%s, amount=%s, category=%s, expense_date=%s, note=%s
        WHERE id=%s AND user_id=%s
        """,
        (title, amount, category, expense_date, note, expense_id, user_id),
    )
    mysql.connection.commit()

    cur.execute("SELECT * FROM expenses WHERE id = %s", (expense_id,))
    row = cur.fetchone()
    cur.close()

    row["expense_date"] = str(row["expense_date"])
    row["created_at"]   = str(row["created_at"])

    return jsonify(msg="Expense updated", expense=row)


# ── DELETE  DELETE /expenses/<id> ─────────────────────────────────────────────

@expenses_bp.route("/expenses/<int:expense_id>", methods=["DELETE"])
@jwt_required()
def delete_expense(expense_id):
    user_id = get_jwt_identity()

    if not _row_or_404(expense_id, user_id):
        return jsonify(msg="Expense not found"), 404

    cur = mysql.connection.cursor()
    cur.execute(
        "DELETE FROM expenses WHERE id = %s AND user_id = %s",
        (expense_id, user_id),
    )
    mysql.connection.commit()
    cur.close()

    return jsonify(msg="Expense deleted")