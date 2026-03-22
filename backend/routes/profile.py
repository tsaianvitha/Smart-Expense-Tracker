from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import mysql

profile_bp = Blueprint("profile", __name__)

SUPPORTED_CURRENCIES = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "AED": "د.إ",
    "SGD": "S$",
    "AUD": "A$",
}


def _get_user(user_id):
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT id, name, email, currency, currency_sym, display_name, created_at FROM users WHERE id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    cur.close()
    return row


# ── GET profile  GET /profile ─────────────────────────────────
@profile_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user = _get_user(get_jwt_identity())
    if not user:
        return jsonify(msg="User not found"), 404

    return jsonify(user={
        "id":           user["id"],
        "name":         user["name"],
        "email":        user["email"],
        "display_name": user["display_name"] or user["name"],
        "currency":     user["currency"] or "INR",
        "currency_sym": user["currency_sym"] or "₹",
        "created_at":   str(user["created_at"]),
        "currencies":   SUPPORTED_CURRENCIES,
    })


# ── UPDATE name / display_name  PATCH /profile/name ──────────
@profile_bp.route("/profile/name", methods=["PATCH"])
@jwt_required()
def update_name():
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    name    = (data.get("name") or "").strip()

    if not name:
        return jsonify(msg="Name is required"), 400
    if len(name) > 100:
        return jsonify(msg="Name must be under 100 characters"), 400

    cur = mysql.connection.cursor()
    cur.execute(
        "UPDATE users SET name = %s, display_name = %s WHERE id = %s",
        (name, name, user_id),
    )
    mysql.connection.commit()
    cur.close()

    return jsonify(msg="Name updated", name=name)


# ── UPDATE password  PATCH /profile/password ─────────────────
@profile_bp.route("/profile/password", methods=["PATCH"])
@jwt_required()
def update_password():
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    current  = (data.get("current_password") or "").strip()
    new_pass = (data.get("new_password") or "").strip()

    if not current or not new_pass:
        return jsonify(msg="current_password and new_password are required"), 400
    if len(new_pass) < 6:
        return jsonify(msg="New password must be at least 6 characters"), 400

    cur = mysql.connection.cursor()
    cur.execute("SELECT password FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()

    if not row or not check_password_hash(row["password"], current):
        cur.close()
        return jsonify(msg="Current password is incorrect"), 401

    cur.execute(
        "UPDATE users SET password = %s WHERE id = %s",
        (generate_password_hash(new_pass), user_id),
    )
    mysql.connection.commit()
    cur.close()

    return jsonify(msg="Password updated successfully")


# ── UPDATE currency  PATCH /profile/currency ──────────────────
@profile_bp.route("/profile/currency", methods=["PATCH"])
@jwt_required()
def update_currency():
    user_id  = get_jwt_identity()
    data     = request.get_json(silent=True) or {}
    currency = (data.get("currency") or "").strip().upper()

    if currency not in SUPPORTED_CURRENCIES:
        return jsonify(msg=f"Unsupported currency. Choose from: {', '.join(SUPPORTED_CURRENCIES)}"), 400

    sym = SUPPORTED_CURRENCIES[currency]

    cur = mysql.connection.cursor()
    cur.execute(
        "UPDATE users SET currency = %s, currency_sym = %s WHERE id = %s",
        (currency, sym, user_id),
    )
    mysql.connection.commit()
    cur.close()

    return jsonify(msg="Currency updated", currency=currency, currency_sym=sym)