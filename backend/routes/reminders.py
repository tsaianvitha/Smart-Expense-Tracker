from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql
from datetime import date, timedelta

reminders_bp = Blueprint("reminders", __name__)

VALID_RECURRENCE = {"none", "weekly", "monthly", "yearly"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    if row.get("due_date"):
        row["due_date"] = str(row["due_date"])
    if row.get("snoozed_until"):
        row["snoozed_until"] = str(row["snoozed_until"])
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    row["is_paid"] = bool(row.get("is_paid"))

    # Use snoozed_until as effective due date for countdown if snoozed
    effective_due_str = row.get("snoozed_until") or row.get("due_date")
    try:
        due  = date.fromisoformat(effective_due_str)
        diff = (due - date.today()).days
        row["days_until_due"] = diff
        row["is_overdue"]     = diff < 0 and not row["is_paid"]
        row["due_soon"]       = 0 <= diff <= row.get("notify_days_before", 3)
        row["is_snoozed"]     = bool(row.get("snoozed_until"))
    except Exception:
        row["days_until_due"] = None
        row["is_overdue"]     = False
        row["due_soon"]       = False
        row["is_snoozed"]     = False

    return row


# ── GET ALL  GET /reminders ───────────────────────────────────────────────────

@reminders_bp.route("/reminders", methods=["GET"])
@jwt_required()
def get_reminders():
    user_id = get_jwt_identity()
    status  = request.args.get("status")

    query  = "SELECT * FROM reminders WHERE user_id = %s"
    params = [user_id]

    if status == "paid":
        query += " AND is_paid = TRUE"
    elif status == "unpaid":
        query += " AND is_paid = FALSE"
    elif status == "overdue":
        query += " AND is_paid = FALSE AND due_date < CURDATE() AND (snoozed_until IS NULL OR snoozed_until < CURDATE())"
    elif status == "snoozed":
        query += " AND snoozed_until >= CURDATE() AND is_paid = FALSE"

    query += " ORDER BY COALESCE(snoozed_until, due_date) ASC"

    cur = mysql.connection.cursor()
    cur.execute(query, params)
    rows = [_serialize(r) for r in cur.fetchall()]
    cur.close()

    total    = len(rows)
    overdue  = sum(1 for r in rows if r["is_overdue"])
    due_soon = sum(1 for r in rows if r["due_soon"] and not r["is_overdue"])
    snoozed  = sum(1 for r in rows if r["is_snoozed"] and not r["is_paid"])

    return jsonify(reminders=rows, total=total, overdue=overdue, due_soon=due_soon, snoozed=snoozed)


# ── CREATE  POST /reminders ───────────────────────────────────────────────────

@reminders_bp.route("/reminders", methods=["POST"])
@jwt_required()
def add_reminder():
    user_id            = get_jwt_identity()
    data               = request.get_json(silent=True) or {}
    title              = (data.get("title") or "").strip()
    amount             = data.get("amount")
    due_date           = (data.get("due_date") or "").strip()
    recurrence         = (data.get("recurrence") or "none").lower()
    notify_days_before = int(data.get("notify_days_before", 3))
    note               = (data.get("note") or "").strip()

    if not title or not due_date:
        return jsonify(msg="Title and due_date are required"), 400
    if recurrence not in VALID_RECURRENCE:
        return jsonify(msg="recurrence must be: none, weekly, monthly, yearly"), 400
    if amount is not None:
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify(msg="Amount must be a number"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        """INSERT INTO reminders (user_id, title, amount, due_date, recurrence, notify_days_before, note)
           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
        (user_id, title, amount, due_date, recurrence, notify_days_before, note),
    )
    mysql.connection.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM reminders WHERE id=%s", (new_id,))
    row = _serialize(cur.fetchone())
    cur.close()
    return jsonify(msg="Reminder created", reminder=row), 201


# ── UPDATE  PUT /reminders/<id> ──────────────────────────────────────────────

@reminders_bp.route("/reminders/<int:reminder_id>", methods=["PUT"])
@jwt_required()
def update_reminder(reminder_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT * FROM reminders WHERE id=%s AND user_id=%s", (reminder_id, user_id))
    existing = cur.fetchone()
    if not existing:
        cur.close()
        return jsonify(msg="Reminder not found"), 404

    data               = request.get_json(silent=True) or {}
    title              = (data.get("title") or existing["title"]).strip()
    amount             = data.get("amount", existing["amount"])
    due_date           = (data.get("due_date") or str(existing["due_date"])).strip()
    recurrence         = (data.get("recurrence") or existing["recurrence"]).lower()
    notify_days_before = int(data.get("notify_days_before", existing["notify_days_before"]))
    note               = (data.get("note") if "note" in data else existing["note"]) or ""

    if recurrence not in VALID_RECURRENCE:
        cur.close()
        return jsonify(msg="Invalid recurrence"), 400

    cur.execute(
        """UPDATE reminders SET title=%s, amount=%s, due_date=%s, recurrence=%s,
           notify_days_before=%s, note=%s WHERE id=%s AND user_id=%s""",
        (title, amount, due_date, recurrence, notify_days_before, note, reminder_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM reminders WHERE id=%s", (reminder_id,))
    row = _serialize(cur.fetchone())
    cur.close()
    return jsonify(msg="Reminder updated", reminder=row)


# ── MARK PAID  PATCH /reminders/<id>/pay ─────────────────────────────────────

@reminders_bp.route("/reminders/<int:reminder_id>/pay", methods=["PATCH"])
@jwt_required()
def toggle_paid(reminder_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT * FROM reminders WHERE id=%s AND user_id=%s", (reminder_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        return jsonify(msg="Reminder not found"), 404

    new_paid = not bool(row["is_paid"])
    # Clear snooze when marking paid
    cur.execute(
        "UPDATE reminders SET is_paid=%s, snoozed_until=NULL WHERE id=%s AND user_id=%s",
        (new_paid, reminder_id, user_id),
    )

    next_reminder = None
    if new_paid and row["recurrence"] != "none":
        from dateutil.relativedelta import relativedelta
        due = row["due_date"]
        if row["recurrence"] == "weekly":
            next_due = due + timedelta(weeks=1)
        elif row["recurrence"] == "monthly":
            next_due = due + relativedelta(months=1)
        else:
            next_due = due + relativedelta(years=1)

        cur.execute(
            """INSERT INTO reminders (user_id, title, amount, due_date, recurrence, notify_days_before, note)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (user_id, row["title"], row["amount"], next_due,
             row["recurrence"], row["notify_days_before"], row["note"]),
        )
        next_id = cur.lastrowid
        cur.execute("SELECT * FROM reminders WHERE id=%s", (next_id,))
        next_reminder = _serialize(cur.fetchone())

    mysql.connection.commit()
    cur.execute("SELECT * FROM reminders WHERE id=%s", (reminder_id,))
    updated = _serialize(cur.fetchone())
    cur.close()

    resp = {"msg": "Reminder updated", "reminder": updated}
    if next_reminder:
        resp["next_reminder"] = next_reminder
        resp["msg"] += " — next occurrence created"
    return jsonify(**resp)


# ── SNOOZE  PATCH /reminders/<id>/snooze ─────────────────────────────────────

@reminders_bp.route("/reminders/<int:reminder_id>/snooze", methods=["PATCH"])
@jwt_required()
def snooze_reminder(reminder_id):
    """
    Body options:
      { "days": 3 }                    — snooze N days from today
      { "until": "2025-04-10" }        — snooze until specific date
      { "clear": true }                — un-snooze
    """
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    cur     = mysql.connection.cursor()

    cur.execute(
        "SELECT id FROM reminders WHERE id=%s AND user_id=%s AND is_paid=FALSE",
        (reminder_id, user_id),
    )
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Reminder not found or already paid"), 404

    if data.get("clear"):
        snoozed_until = None
        msg = "Snooze cleared"
    elif "until" in data:
        snoozed_until = data["until"]
        msg = f"Snoozed until {snoozed_until}"
    elif "days" in data:
        try:
            days = int(data["days"])
            if days < 1:
                raise ValueError
        except (ValueError, TypeError):
            cur.close()
            return jsonify(msg="days must be a positive integer"), 400
        snoozed_until = str(date.today() + timedelta(days=days))
        msg = f"Snoozed for {days} day{'s' if days != 1 else ''}"
    else:
        cur.close()
        return jsonify(msg="Provide 'days', 'until', or 'clear'"), 400

    cur.execute(
        "UPDATE reminders SET snoozed_until=%s WHERE id=%s AND user_id=%s",
        (snoozed_until, reminder_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM reminders WHERE id=%s", (reminder_id,))
    updated = _serialize(cur.fetchone())
    cur.close()

    return jsonify(msg=msg, reminder=updated)


# ── LINK EXPENSE  PATCH /reminders/<id>/link ─────────────────────────────────

@reminders_bp.route("/reminders/<int:reminder_id>/link", methods=["PATCH"])
@jwt_required()
def link_expense(reminder_id):
    """
    Body: { "expense_id": 42 }   — link an expense (proof of payment)
          { "expense_id": null }  — unlink
    """
    user_id    = get_jwt_identity()
    data       = request.get_json(silent=True) or {}
    expense_id = data.get("expense_id")

    cur = mysql.connection.cursor()

    # Verify reminder belongs to user
    cur.execute("SELECT id FROM reminders WHERE id=%s AND user_id=%s", (reminder_id, user_id))
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Reminder not found"), 404

    # If linking, verify expense belongs to user
    if expense_id is not None:
        cur.execute("SELECT id FROM expenses WHERE id=%s AND user_id=%s", (expense_id, user_id))
        if not cur.fetchone():
            cur.close()
            return jsonify(msg="Expense not found"), 404

    cur.execute(
        "UPDATE reminders SET linked_expense_id=%s WHERE id=%s AND user_id=%s",
        (expense_id, reminder_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM reminders WHERE id=%s", (reminder_id,))
    updated = _serialize(cur.fetchone())
    cur.close()

    msg = "Expense linked" if expense_id else "Expense unlinked"
    return jsonify(msg=msg, reminder=updated)


# ── UPCOMING  GET /reminders/upcoming ────────────────────────────────────────

@reminders_bp.route("/reminders/upcoming", methods=["GET"])
@jwt_required()
def get_upcoming():
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute(
        """SELECT * FROM reminders
           WHERE user_id=%s AND is_paid=FALSE
             AND COALESCE(snoozed_until, due_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
           ORDER BY COALESCE(snoozed_until, due_date) ASC""",
        (user_id,),
    )
    rows = [_serialize(r) for r in cur.fetchall()]
    cur.close()
    return jsonify(upcoming=rows, count=len(rows))


# ── DELETE  DELETE /reminders/<id> ───────────────────────────────────────────

@reminders_bp.route("/reminders/<int:reminder_id>", methods=["DELETE"])
@jwt_required()
def delete_reminder(reminder_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT id FROM reminders WHERE id=%s AND user_id=%s", (reminder_id, user_id))
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Reminder not found"), 404
    cur.execute("DELETE FROM reminders WHERE id=%s AND user_id=%s", (reminder_id, user_id))
    mysql.connection.commit()
    cur.close()
    return jsonify(msg="Reminder deleted")