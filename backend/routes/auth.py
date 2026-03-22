from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import mysql

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    try:
        data     = request.get_json(silent=True) or {}
        name     = (data.get("name") or "").strip()
        email    = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not name or not email or not password:
            return jsonify(msg="Name, email and password are required"), 400
        if len(password) < 6:
            return jsonify(msg="Password must be at least 6 characters"), 400

        cur = mysql.connection.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            return jsonify(msg="Email already registered"), 409

        hashed = generate_password_hash(password)
        cur.execute(
            "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
            (name, email, hashed),
        )
        mysql.connection.commit()
        user_id = cur.lastrowid
        cur.close()

        token = create_access_token(identity=str(user_id))
        return jsonify(
            msg="Registered successfully",
            access_token=token,
            user={"id": user_id, "name": name, "email": email},
        ), 201

    except Exception as e:
        return jsonify(msg=f"Server error: {str(e)}"), 500


@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data     = request.get_json(silent=True) or {}
        email    = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not email or not password:
            return jsonify(msg="Email and password are required"), 400

        cur = mysql.connection.cursor()
        cur.execute(
            "SELECT id, name, email, password FROM users WHERE email = %s", (email,)
        )
        row = cur.fetchone()
        cur.close()

        if not row:
            return jsonify(msg="Invalid email or password"), 401

        if isinstance(row, dict):
            uid      = row["id"]
            uname    = row["name"]
            pwd_hash = row["password"]
        else:
            uid      = row[0]
            uname    = row[1]
            pwd_hash = row[3]

        if not check_password_hash(pwd_hash, password):
            return jsonify(msg="Invalid email or password"), 401

        token = create_access_token(identity=str(uid))
        return jsonify(
            access_token=token,
            user={"id": uid, "name": uname, "email": email},
        )

    except Exception as e:
        return jsonify(msg=f"Server error: {str(e)}"), 500


@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def profile():
    try:
        user_id = get_jwt_identity()
        cur = mysql.connection.cursor()
        cur.execute(
            "SELECT id, name, email FROM users WHERE id = %s", (user_id,)
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            return jsonify(msg="User not found"), 404
        if isinstance(row, dict):
            return jsonify(user=row)
        return jsonify(user={"id": row[0], "name": row[1], "email": row[2]})
    except Exception as e:
        return jsonify(msg=f"Server error: {str(e)}"), 500