from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from extensions import mysql, jwt
from models import init_db

from routes.auth          import auth_bp
from routes.expenses      import expenses_bp
from routes.todos         import todos_bp
from routes.reminders     import reminders_bp
from routes.budgets       import budgets_bp
from routes.export        import export_bp
from routes.profile       import profile_bp
from routes.insights      import insights_bp
from routes.receipts      import receipts_bp
from routes.recurring     import recurring_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(
        app,
        origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=True,
    )

    mysql.init_app(app)
    jwt.init_app(app)
    init_db(app)

    # ── Auto-process recurring expenses on startup ─────────────
    _auto_process_recurring(app)

    # ── Send due reminder notifications on startup ─────────────

    prefix = "/api/v1"
    app.register_blueprint(auth_bp,          url_prefix=prefix)
    app.register_blueprint(expenses_bp,      url_prefix=prefix)
    app.register_blueprint(todos_bp,         url_prefix=prefix)
    app.register_blueprint(reminders_bp,     url_prefix=prefix)
    app.register_blueprint(budgets_bp,       url_prefix=prefix)
    app.register_blueprint(export_bp,        url_prefix=prefix)
    app.register_blueprint(profile_bp,       url_prefix=prefix)
    app.register_blueprint(insights_bp,      url_prefix=prefix)
    app.register_blueprint(receipts_bp,      url_prefix=prefix)
    app.register_blueprint(recurring_bp,     url_prefix=prefix)

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(msg="Route not found"), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify(msg="Internal server error"), 500

    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify(msg="Missing or invalid token"), 401

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify(msg="Token has expired, please log in again"), 401

    return app


def _auto_process_recurring(app):
    try:
        from routes.recurring import process_due_recurring_for_user
        with app.app_context():
            cur = mysql.connection.cursor()
            cur.execute(
                "SELECT DISTINCT user_id FROM recurring_expenses WHERE is_active=TRUE AND next_due_date<=CURDATE()"
            )
            rows  = cur.fetchall()
            total = 0
            for row in rows:
                uid     = row["user_id"] if isinstance(row, dict) else row[0]
                created = process_due_recurring_for_user(str(uid), cur)
                total  += len(created)
            cur.close()
            if total:
                print(f"⚡ Auto-processed {total} recurring expense(s).")
    except Exception as e:
        print(f"⚠️  Recurring auto-process skipped: {e}")


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)