from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

recurring_bp = Blueprint("recurring", __name__)

VALID_CATEGORIES = {
    "Food", "Shopping", "Travel", "Medical", "Rent",
    "Utilities", "Entertainment", "Education", "Groceries", "Others",
}
VALID_FREQUENCIES = {"daily", "weekly", "monthly", "yearly"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _next_due(current_due: date, frequency: str) -> date:
    """Calculate next due date after current_due."""
    if frequency == "daily":
        return current_due + timedelta(days=1)
    elif frequency == "weekly":
        return current_due + timedelta(weeks=1)
    elif frequency == "monthly":
        return current_due + relativedelta(months=1)
    elif frequency == "yearly":
        return current_due + relativedelta(years=1)
    return current_due


def _serialize(row: dict) -> dict:
    for f in ("start_date", "next_due_date", "end_date", "last_run_date", "created_at"):
        if row.get(f):
            row[f] = str(row[f])
    row["is_active"] = bool(row.get("is_active"))

    # Days until next due (for frontend countdown)
    try:
        nd   = date.fromisoformat(row["next_due_date"])
        diff = (nd - date.today()).days
        row["days_until_due"] = diff
        row["is_overdue"]     = diff < 0 and row["is_active"]
        row["due_today"]      = diff == 0 and row["is_active"]
    except Exception:
        row["days_until_due"] = None
        row["is_overdue"]     = False
        row["due_today"]      = False

    return row


# ── PROCESS DUE RECURRING (core engine) ───────────────────────────────────────

def process_due_recurring_for_user(user_id: str, cur) -> list:
    """
    Find all active recurring expenses where next_due_date <= today,
    insert them as real expenses, advance next_due_date.
    Returns list of created expense titles.
    """
    today = date.today()
    cur.execute(
        """
        SELECT * FROM recurring_expenses
        WHERE user_id = %s
          AND is_active = TRUE
          AND next_due_date <= %s
          AND (end_date IS NULL OR end_date >= %s)
        """,
        (user_id, today, today),
    )
    due = cur.fetchall()
    created = []

    for rec in due:
        # Keep inserting until next_due_date > today (catches missed months)
        nd = rec["next_due_date"] if isinstance(rec["next_due_date"], date) \
             else date.fromisoformat(str(rec["next_due_date"]))

        while nd <= today:
            # Insert real expense
            cur.execute(
                """
                INSERT INTO expenses (user_id, title, amount, category, expense_date, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    rec["title"],
                    rec["amount"],
                    rec["category"],
                    nd,
                    f"[Auto] {rec['note'] or rec['title']}",
                ),
            )
            created.append({"title": rec["title"], "date": str(nd), "amount": float(rec["amount"])})
            nd = _next_due(nd, rec["frequency"])

            # Stop if past end_date
            if rec.get("end_date") and nd > rec["end_date"]:
                # Deactivate since series is complete
                cur.execute(
                    "UPDATE recurring_expenses SET is_active=FALSE WHERE id=%s",
                    (rec["id"],),
                )
                break

        # Update next_due_date and last_run_date
        cur.execute(
            """
            UPDATE recurring_expenses
            SET next_due_date = %s, last_run_date = %s
            WHERE id = %s
            """,
            (nd, today, rec["id"]),
        )

    mysql.connection.commit()
    return created


# ── GET ALL  GET /recurring ───────────────────────────────────────────────────

@recurring_bp.route("/recurring", methods=["GET"])
@jwt_required()
def get_recurring():
    user_id = get_jwt_identity()
    status  = request.args.get("status", "all")  # all | active | paused

    query  = "SELECT * FROM recurring_expenses WHERE user_id = %s"
    params = [user_id]

    if status == "active":
        query += " AND is_active = TRUE"
    elif status == "paused":
        query += " AND is_active = FALSE"

    query += " ORDER BY next_due_date ASC"

    cur = mysql.connection.cursor()
    cur.execute(query, params)
    rows = [_serialize(r) for r in cur.fetchall()]
    cur.close()

    total  = len(rows)
    active = sum(1 for r in rows if r["is_active"])
    overdue = sum(1 for r in rows if r["is_overdue"])

    return jsonify(recurring=rows, total=total, active=active, overdue=overdue)


# ── CREATE  POST /recurring ───────────────────────────────────────────────────

@recurring_bp.route("/recurring", methods=["POST"])
@jwt_required()
def add_recurring():
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}

    title      = (data.get("title") or "").strip()
    amount     = data.get("amount")
    category   = (data.get("category") or "").strip()
    frequency  = (data.get("frequency") or "monthly").strip().lower()
    start_date = (data.get("start_date") or str(date.today())).strip()
    end_date   = data.get("end_date") or None
    note       = (data.get("note") or "").strip()

    if not title or not amount or not category or not frequency:
        return jsonify(msg="title, amount, category and frequency are required"), 400

    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify(msg="Amount must be a positive number"), 400

    if category not in VALID_CATEGORIES:
        return jsonify(msg=f"Invalid category"), 400

    if frequency not in VALID_FREQUENCIES:
        return jsonify(msg="frequency must be: daily, weekly, monthly, yearly"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        """
        INSERT INTO recurring_expenses
            (user_id, title, amount, category, frequency,
             start_date, next_due_date, end_date, note)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (user_id, title, amount, category, frequency,
         start_date, start_date, end_date, note),
    )
    mysql.connection.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM recurring_expenses WHERE id=%s", (new_id,))
    row = _serialize(cur.fetchone())
    cur.close()
    return jsonify(msg="Recurring expense created", recurring=row), 201


# ── UPDATE  PUT /recurring/<id> ───────────────────────────────────────────────

@recurring_bp.route("/recurring/<int:rec_id>", methods=["PUT"])
@jwt_required()
def update_recurring(rec_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT * FROM recurring_expenses WHERE id=%s AND user_id=%s", (rec_id, user_id))
    existing = cur.fetchone()
    if not existing:
        cur.close()
        return jsonify(msg="Not found"), 404

    data       = request.get_json(silent=True) or {}
    title      = (data.get("title")     or existing["title"]).strip()
    amount     = data.get("amount",        existing["amount"])
    category   = (data.get("category") or existing["category"]).strip()
    frequency  = (data.get("frequency") or existing["frequency"]).lower()
    end_date   = data.get("end_date",      existing.get("end_date"))
    note       = (data.get("note") if "note" in data else existing.get("note")) or ""

    # Allow user to reset next_due_date
    next_due   = data.get("next_due_date") or str(existing["next_due_date"])

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        cur.close()
        return jsonify(msg="Amount must be a number"), 400

    cur.execute(
        """
        UPDATE recurring_expenses
        SET title=%s, amount=%s, category=%s, frequency=%s,
            next_due_date=%s, end_date=%s, note=%s
        WHERE id=%s AND user_id=%s
        """,
        (title, amount, category, frequency, next_due, end_date, note, rec_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM recurring_expenses WHERE id=%s", (rec_id,))
    row = _serialize(cur.fetchone())
    cur.close()
    return jsonify(msg="Updated", recurring=row)


# ── TOGGLE PAUSE  PATCH /recurring/<id>/toggle ────────────────────────────────

@recurring_bp.route("/recurring/<int:rec_id>/toggle", methods=["PATCH"])
@jwt_required()
def toggle_recurring(rec_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute(
        "SELECT is_active FROM recurring_expenses WHERE id=%s AND user_id=%s",
        (rec_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        return jsonify(msg="Not found"), 404

    new_state = not bool(row["is_active"])
    cur.execute(
        "UPDATE recurring_expenses SET is_active=%s WHERE id=%s AND user_id=%s",
        (new_state, rec_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM recurring_expenses WHERE id=%s", (rec_id,))
    updated = _serialize(cur.fetchone())
    cur.close()
    return jsonify(msg="Toggled", recurring=updated, is_active=new_state)


# ── PROCESS DUE  POST /recurring/process ─────────────────────────────────────

@recurring_bp.route("/recurring/process", methods=["POST"])
@jwt_required()
def process_due():
    """Manually trigger auto-processing for the logged-in user."""
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    created = process_due_recurring_for_user(user_id, cur)
    cur.close()

    if created:
        return jsonify(
            msg=f"{len(created)} expense(s) auto-added",
            created=created,
            count=len(created),
        )
    return jsonify(msg="Nothing due today", created=[], count=0)


# ── DELETE  DELETE /recurring/<id> ────────────────────────────────────────────

@recurring_bp.route("/recurring/<int:rec_id>", methods=["DELETE"])
@jwt_required()
def delete_recurring(rec_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute(
        "SELECT id FROM recurring_expenses WHERE id=%s AND user_id=%s",
        (rec_id, user_id),
    )
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Not found"), 404
    cur.execute(
        "DELETE FROM recurring_expenses WHERE id=%s AND user_id=%s",
        (rec_id, user_id),
    )
    mysql.connection.commit()
    cur.close()
    return jsonify(msg="Deleted")