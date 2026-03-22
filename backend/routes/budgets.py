from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql

budgets_bp = Blueprint("budgets", __name__)

VALID_CATEGORIES = {
    "Food", "Shopping", "Travel", "Medical",
    "Rent", "Utilities", "Entertainment",
    "Education", "Groceries", "Others",
}


# ── GET all budgets with current month spend  GET /budgets ────────────────────
@budgets_bp.route("/budgets", methods=["GET"])
@jwt_required()
def get_budgets():
    user_id = get_jwt_identity()
    cur = mysql.connection.cursor()

    # Fetch all budget limits for user
    cur.execute(
        "SELECT * FROM budgets WHERE user_id = %s ORDER BY category",
        (user_id,),
    )
    budgets = cur.fetchall()

    # Fetch current month spending per category in one query
    cur.execute(
        """
        SELECT category, COALESCE(SUM(amount), 0) AS spent
        FROM   expenses
        WHERE  user_id = %s
          AND  MONTH(expense_date) = MONTH(CURDATE())
          AND  YEAR(expense_date)  = YEAR(CURDATE())
        GROUP BY category
        """,
        (user_id,),
    )
    spend_rows = cur.fetchall()
    cur.close()

    spend_map = {r["category"]: float(r["spent"]) for r in spend_rows}

    # Merge spend into budgets and compute status
    result = []
    for b in budgets:
        spent = spend_map.get(b["category"], 0.0)
        limit = float(b["monthly_limit"])
        pct   = round((spent / limit) * 100, 1) if limit > 0 else 0

        result.append({
            "id":            b["id"],
            "category":      b["category"],
            "monthly_limit": limit,
            "spent":         spent,
            "remaining":     round(limit - spent, 2),
            "percent_used":  pct,
            # status: ok < 80% | warning 80-99% | exceeded >= 100%
            "status": "exceeded" if pct >= 100 else ("warning" if pct >= 80 else "ok"),
            "updated_at":    str(b["updated_at"]),
        })

    # Also return unbudgeted categories that have spending this month
    budgeted_cats = {b["category"] for b in budgets}
    unbudgeted = [
        {"category": cat, "spent": amt, "monthly_limit": None, "status": "unbudgeted"}
        for cat, amt in spend_map.items()
        if cat not in budgeted_cats
    ]

    return jsonify(budgets=result, unbudgeted=unbudgeted)


# ── SET / UPDATE a budget  POST /budgets ──────────────────────────────────────
# Uses INSERT … ON DUPLICATE KEY UPDATE so one endpoint handles both create & update
@budgets_bp.route("/budgets", methods=["POST"])
@jwt_required()
def set_budget():
    user_id = get_jwt_identity()
    data     = request.get_json(silent=True) or {}
    category = (data.get("category") or "").strip()
    limit    = data.get("monthly_limit")

    if not category or limit is None:
        return jsonify(msg="category and monthly_limit are required"), 400

    if category not in VALID_CATEGORIES:
        return jsonify(msg=f"Invalid category"), 400

    try:
        limit = float(limit)
        if limit <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify(msg="monthly_limit must be a positive number"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        """
        INSERT INTO budgets (user_id, category, monthly_limit)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
        """,
        (user_id, category, limit),
    )
    mysql.connection.commit()

    cur.execute(
        "SELECT * FROM budgets WHERE user_id = %s AND category = %s",
        (user_id, category),
    )
    row = cur.fetchone()
    cur.close()

    return jsonify(
        msg="Budget saved",
        budget={"id": row["id"], "category": row["category"], "monthly_limit": float(row["monthly_limit"])},
    ), 201


# ── DELETE a budget  DELETE /budgets/<category> ───────────────────────────────
@budgets_bp.route("/budgets/<string:category>", methods=["DELETE"])
@jwt_required()
def delete_budget(category):
    user_id = get_jwt_identity()

    cur = mysql.connection.cursor()
    cur.execute(
        "DELETE FROM budgets WHERE user_id = %s AND category = %s",
        (user_id, category),
    )
    mysql.connection.commit()
    affected = cur.rowcount
    cur.close()

    if not affected:
        return jsonify(msg="Budget not found"), 404

    return jsonify(msg="Budget removed")


# ── SUMMARY for dashboard badge  GET /budgets/alerts ─────────────────────────
@budgets_bp.route("/budgets/alerts", methods=["GET"])
@jwt_required()
def get_alerts():
    """Returns only exceeded / warning budgets — lightweight poll for the dashboard."""
    user_id = get_jwt_identity()
    cur = mysql.connection.cursor()

    cur.execute(
        """
        SELECT b.category,
               b.monthly_limit,
               COALESCE(SUM(e.amount), 0) AS spent
        FROM   budgets b
        LEFT JOIN expenses e
               ON e.user_id = b.user_id
              AND e.category = b.category
              AND MONTH(e.expense_date) = MONTH(CURDATE())
              AND YEAR(e.expense_date)  = YEAR(CURDATE())
        WHERE  b.user_id = %s
        GROUP BY b.category, b.monthly_limit
        HAVING spent >= (b.monthly_limit * 0.80)
        ORDER BY (spent / b.monthly_limit) DESC
        """,
        (user_id,),
    )
    rows = cur.fetchall()
    cur.close()

    alerts = []
    for r in rows:
        spent = float(r["spent"])
        limit = float(r["monthly_limit"])
        pct   = round((spent / limit) * 100, 1)
        alerts.append({
            "category":      r["category"],
            "monthly_limit": limit,
            "spent":         spent,
            "percent_used":  pct,
            "status":        "exceeded" if pct >= 100 else "warning",
        })

    return jsonify(alerts=alerts, count=len(alerts))