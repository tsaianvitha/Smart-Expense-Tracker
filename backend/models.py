from extensions import mysql


def _add_column_if_missing(cur, table, column, definition):
    cur.execute("""
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = %s
          AND COLUMN_NAME  = %s
    """, (table, column))
    row   = cur.fetchone()
    count = row["cnt"] if isinstance(row, dict) else row[0]
    if count == 0:
        cur.execute(f"ALTER TABLE `{table}` ADD COLUMN {column} {definition}")
        print(f"  ✚ Added column `{column}` to `{table}`")


def init_db(app):
    with app.app_context():
        cur = mysql.connection.cursor()

        # ── USERS ─────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                name                VARCHAR(100)        NOT NULL DEFAULT '',
                email               VARCHAR(150) UNIQUE NOT NULL,
                password            VARCHAR(255)        NOT NULL,
                display_name        VARCHAR(100)        DEFAULT NULL,
                currency            VARCHAR(10)         DEFAULT 'INR',
                currency_sym        VARCHAR(5)          DEFAULT '₹',
                created_at          DATETIME            DEFAULT CURRENT_TIMESTAMP
            )
        """)
        _add_column_if_missing(cur, "users", "name",                "VARCHAR(100) NOT NULL DEFAULT '' AFTER id")
        _add_column_if_missing(cur, "users", "display_name",        "VARCHAR(100) DEFAULT NULL")
        _add_column_if_missing(cur, "users", "currency",            "VARCHAR(10)  DEFAULT 'INR'")
        _add_column_if_missing(cur, "users", "currency_sym",        "VARCHAR(5)   DEFAULT '₹'")

        # ── EXPENSES ──────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS expenses (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                user_id      INT            NOT NULL,
                title        VARCHAR(150)   NOT NULL,
                amount       DECIMAL(10,2)  NOT NULL,
                category     VARCHAR(50)    NOT NULL,
                expense_date DATE           NOT NULL,
                note         TEXT,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── TODOS ─────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS todos (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                user_id      INT          NOT NULL,
                title        VARCHAR(200) NOT NULL,
                description  TEXT,
                priority     ENUM('low','medium','high') DEFAULT 'medium',
                due_date     DATE,
                is_completed BOOLEAN  DEFAULT FALSE,
                sort_order   INT      DEFAULT 0,
                tags_cache   VARCHAR(500) DEFAULT '',
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        _add_column_if_missing(cur, "todos", "sort_order", "INT DEFAULT 0")
        _add_column_if_missing(cur, "todos", "tags_cache", "VARCHAR(500) DEFAULT ''")

        # ── SUBTASKS ──────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subtasks (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                todo_id      INT          NOT NULL,
                user_id      INT          NOT NULL,
                title        VARCHAR(200) NOT NULL,
                is_completed BOOLEAN  DEFAULT FALSE,
                sort_order   INT      DEFAULT 0,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── TODO TAGS ─────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS todo_tags (
                id      INT AUTO_INCREMENT PRIMARY KEY,
                todo_id INT         NOT NULL,
                user_id INT         NOT NULL,
                tag     VARCHAR(50) NOT NULL,
                UNIQUE KEY unique_todo_tag (todo_id, tag),
                FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── REMINDERS ─────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id                 INT AUTO_INCREMENT PRIMARY KEY,
                user_id            INT          NOT NULL,
                title              VARCHAR(200) NOT NULL,
                amount             DECIMAL(10,2),
                due_date           DATE         NOT NULL,
                recurrence         ENUM('none','weekly','monthly','yearly') DEFAULT 'none',
                is_paid            BOOLEAN  DEFAULT FALSE,
                notify_days_before INT      DEFAULT 3,
                snoozed_until      DATE     DEFAULT NULL,
                linked_expense_id  INT      DEFAULT NULL,
                note               TEXT,
                created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (linked_expense_id) REFERENCES expenses(id) ON DELETE SET NULL
            )
        """)
        _add_column_if_missing(cur, "reminders", "snoozed_until",     "DATE DEFAULT NULL")
        _add_column_if_missing(cur, "reminders", "linked_expense_id", "INT  DEFAULT NULL")

        # ── BUDGETS ───────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS budgets (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                user_id       INT           NOT NULL,
                category      VARCHAR(50)   NOT NULL,
                monthly_limit DECIMAL(10,2) NOT NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_category (user_id, category),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── RECURRING EXPENSES ────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS recurring_expenses (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                user_id       INT            NOT NULL,
                title         VARCHAR(150)   NOT NULL,
                amount        DECIMAL(10,2)  NOT NULL,
                category      VARCHAR(50)    NOT NULL,
                frequency     ENUM('daily','weekly','monthly','yearly') NOT NULL DEFAULT 'monthly',
                start_date    DATE           NOT NULL,
                next_due_date DATE           NOT NULL,
                end_date      DATE           DEFAULT NULL,
                is_active     BOOLEAN        DEFAULT TRUE,
                last_run_date DATE           DEFAULT NULL,
                note          TEXT,
                created_at    DATETIME       DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        
        mysql.connection.commit()
        cur.close()
        print("✅ All database tables ready.")