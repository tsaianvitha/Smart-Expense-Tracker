from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql

todos_bp = Blueprint("todos", __name__)

VALID_PRIORITIES = {"low", "medium", "high"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    if row.get("due_date"):
        row["due_date"] = str(row["due_date"])
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    row["is_completed"] = bool(row.get("is_completed"))
    row["tags"] = [t.strip() for t in (row.get("tags_cache") or "").split(",") if t.strip()]
    return row


def _attach_subtasks(todos: list, user_id: str, cur) -> list:
    if not todos:
        return todos
    ids = [t["id"] for t in todos]
    fmt = ",".join(["%s"] * len(ids))
    cur.execute(
        f"""SELECT * FROM subtasks WHERE todo_id IN ({fmt}) AND user_id = %s
            ORDER BY sort_order, id""",
        (*ids, user_id),
    )
    subs = cur.fetchall()
    sub_map = {}
    for s in subs:
        s["is_completed"] = bool(s["is_completed"])
        s["created_at"]   = str(s["created_at"])
        sub_map.setdefault(s["todo_id"], []).append(s)

    for t in todos:
        t["subtasks"] = sub_map.get(t["id"], [])
        t["subtask_count"]     = len(t["subtasks"])
        t["subtask_completed"] = sum(1 for s in t["subtasks"] if s["is_completed"])
    return todos


# ── GET ALL  GET /todos ───────────────────────────────────────────────────────

@todos_bp.route("/todos", methods=["GET"])
@jwt_required()
def get_todos():
    user_id  = get_jwt_identity()
    status   = request.args.get("status")
    priority = request.args.get("priority")
    tag      = request.args.get("tag")
    sort     = request.args.get("sort", "sort_order")

    query  = "SELECT * FROM todos WHERE user_id = %s"
    params = [user_id]

    if status == "completed":
        query += " AND is_completed = TRUE"
    elif status == "pending":
        query += " AND is_completed = FALSE"

    if priority in VALID_PRIORITIES:
        query += " AND priority = %s"
        params.append(priority)

    if tag:
        query += " AND FIND_IN_SET(%s, tags_cache)"
        params.append(tag)

    order_map = {
        "sort_order":   "sort_order ASC, id ASC",
        "created_desc": "created_at DESC",
        "created_asc":  "created_at ASC",
        "due_asc":      "due_date ASC",
        "priority":     "FIELD(priority,'high','medium','low')",
    }
    query += f" ORDER BY {order_map.get(sort, 'sort_order ASC, id ASC')}"

    cur = mysql.connection.cursor()
    cur.execute(query, params)
    rows = [_serialize(r) for r in cur.fetchall()]
    rows = _attach_subtasks(rows, user_id, cur)
    cur.close()

    # Return all unique tags this user has ever used
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT DISTINCT tags_cache FROM todos WHERE user_id = %s AND tags_cache != ''",
        (user_id,),
    )
    tag_rows = cur.fetchall()
    cur.close()
    all_tags = sorted({
        t.strip()
        for row in tag_rows
        for t in (row["tags_cache"] or "").split(",")
        if t.strip()
    })

    return jsonify(todos=rows, all_tags=all_tags)


# ── CREATE  POST /todos ───────────────────────────────────────────────────────

@todos_bp.route("/todos", methods=["POST"])
@jwt_required()
def add_todo():
    user_id     = get_jwt_identity()
    data        = request.get_json(silent=True) or {}
    title       = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    priority    = (data.get("priority") or "medium").lower()
    due_date    = data.get("due_date") or None
    tags        = [t.strip() for t in data.get("tags", []) if str(t).strip()]
    tags_cache  = ",".join(tags)

    if not title:
        return jsonify(msg="Title is required"), 400
    if priority not in VALID_PRIORITIES:
        return jsonify(msg="Priority must be low, medium, or high"), 400

    # Sort order = max + 1
    cur = mysql.connection.cursor()
    cur.execute("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM todos WHERE user_id=%s", (user_id,))
    sort_order = cur.fetchone()["next"]

    cur.execute(
        """INSERT INTO todos (user_id, title, description, priority, due_date, tags_cache, sort_order)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (user_id, title, description, priority, due_date, tags_cache, sort_order),
    )
    mysql.connection.commit()
    new_id = cur.lastrowid

    # Insert tags into todo_tags table
    for tag in tags:
        cur.execute(
            "INSERT IGNORE INTO todo_tags (todo_id, user_id, tag) VALUES (%s,%s,%s)",
            (new_id, user_id, tag),
        )
    mysql.connection.commit()

    cur.execute("SELECT * FROM todos WHERE id=%s", (new_id,))
    row = _serialize(cur.fetchone())
    rows = _attach_subtasks([row], user_id, cur)
    cur.close()

    return jsonify(msg="Todo created", todo=rows[0]), 201


# ── UPDATE  PUT /todos/<id> ───────────────────────────────────────────────────

@todos_bp.route("/todos/<int:todo_id>", methods=["PUT"])
@jwt_required()
def update_todo(todo_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT * FROM todos WHERE id=%s AND user_id=%s", (todo_id, user_id))
    existing = cur.fetchone()
    if not existing:
        cur.close()
        return jsonify(msg="Todo not found"), 404

    data        = request.get_json(silent=True) or {}
    title       = (data.get("title") or existing["title"]).strip()
    description = (data.get("description") if "description" in data else existing["description"]) or ""
    priority    = (data.get("priority") or existing["priority"]).lower()
    due_date    = data.get("due_date", existing["due_date"])
    is_completed = data.get("is_completed", existing["is_completed"])
    tags        = [t.strip() for t in data.get("tags", [])] if "tags" in data else \
                  [t.strip() for t in (existing["tags_cache"] or "").split(",") if t.strip()]
    tags_cache  = ",".join(tags)

    if priority not in VALID_PRIORITIES:
        cur.close()
        return jsonify(msg="Priority must be low, medium, or high"), 400

    cur.execute(
        """UPDATE todos SET title=%s, description=%s, priority=%s, due_date=%s,
           is_completed=%s, tags_cache=%s WHERE id=%s AND user_id=%s""",
        (title, description, priority, due_date, is_completed, tags_cache, todo_id, user_id),
    )

    # Sync tags table
    cur.execute("DELETE FROM todo_tags WHERE todo_id=%s AND user_id=%s", (todo_id, user_id))
    for tag in tags:
        cur.execute(
            "INSERT IGNORE INTO todo_tags (todo_id, user_id, tag) VALUES (%s,%s,%s)",
            (todo_id, user_id, tag),
        )
    mysql.connection.commit()

    cur.execute("SELECT * FROM todos WHERE id=%s", (todo_id,))
    row  = _serialize(cur.fetchone())
    rows = _attach_subtasks([row], user_id, cur)
    cur.close()

    return jsonify(msg="Todo updated", todo=rows[0])


# ── TOGGLE COMPLETE  PATCH /todos/<id>/toggle ─────────────────────────────────

@todos_bp.route("/todos/<int:todo_id>/toggle", methods=["PATCH"])
@jwt_required()
def toggle_todo(todo_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT is_completed FROM todos WHERE id=%s AND user_id=%s", (todo_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        return jsonify(msg="Todo not found"), 404

    new_status = not bool(row["is_completed"])
    cur.execute(
        "UPDATE todos SET is_completed=%s WHERE id=%s AND user_id=%s",
        (new_status, todo_id, user_id),
    )
    mysql.connection.commit()
    cur.execute("SELECT * FROM todos WHERE id=%s", (todo_id,))
    updated = _serialize(cur.fetchone())
    rows    = _attach_subtasks([updated], user_id, cur)
    cur.close()

    return jsonify(msg="Todo toggled", todo=rows[0])


# ── REORDER  PATCH /todos/reorder ────────────────────────────────────────────

@todos_bp.route("/todos/reorder", methods=["PATCH"])
@jwt_required()
def reorder_todos():
    """Body: { "order": [id1, id2, id3, ...] }  (full ordered list)"""
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    order   = data.get("order", [])

    if not isinstance(order, list):
        return jsonify(msg="order must be a list of todo IDs"), 400

    cur = mysql.connection.cursor()
    for idx, todo_id in enumerate(order):
        cur.execute(
            "UPDATE todos SET sort_order=%s WHERE id=%s AND user_id=%s",
            (idx, todo_id, user_id),
        )
    mysql.connection.commit()
    cur.close()

    return jsonify(msg="Order saved")


# ── DELETE  DELETE /todos/<id> ────────────────────────────────────────────────

@todos_bp.route("/todos/<int:todo_id>", methods=["DELETE"])
@jwt_required()
def delete_todo(todo_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute("SELECT id FROM todos WHERE id=%s AND user_id=%s", (todo_id, user_id))
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Todo not found"), 404

    cur.execute("DELETE FROM todos WHERE id=%s AND user_id=%s", (todo_id, user_id))
    mysql.connection.commit()
    cur.close()
    return jsonify(msg="Todo deleted")


# ── SUBTASK ROUTES ────────────────────────────────────────────────────────────

# GET subtasks  GET /todos/<id>/subtasks
@todos_bp.route("/todos/<int:todo_id>/subtasks", methods=["GET"])
@jwt_required()
def get_subtasks(todo_id):
    user_id = get_jwt_identity()
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT * FROM subtasks WHERE todo_id=%s AND user_id=%s ORDER BY sort_order, id",
        (todo_id, user_id),
    )
    rows = cur.fetchall()
    cur.close()
    for r in rows:
        r["is_completed"] = bool(r["is_completed"])
        r["created_at"]   = str(r["created_at"])
    return jsonify(subtasks=rows)


# ADD subtask  POST /todos/<id>/subtasks
@todos_bp.route("/todos/<int:todo_id>/subtasks", methods=["POST"])
@jwt_required()
def add_subtask(todo_id):
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    title   = (data.get("title") or "").strip()

    if not title:
        return jsonify(msg="Title is required"), 400

    cur = mysql.connection.cursor()
    # Verify parent todo belongs to user
    cur.execute("SELECT id FROM todos WHERE id=%s AND user_id=%s", (todo_id, user_id))
    if not cur.fetchone():
        cur.close()
        return jsonify(msg="Todo not found"), 404

    cur.execute("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM subtasks WHERE todo_id=%s", (todo_id,))
    sort_order = cur.fetchone()["next"]

    cur.execute(
        "INSERT INTO subtasks (todo_id, user_id, title, sort_order) VALUES (%s,%s,%s,%s)",
        (todo_id, user_id, title, sort_order),
    )
    mysql.connection.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM subtasks WHERE id=%s", (new_id,))
    row = cur.fetchone()
    cur.close()
    row["is_completed"] = bool(row["is_completed"])
    row["created_at"]   = str(row["created_at"])
    return jsonify(msg="Subtask added", subtask=row), 201


# TOGGLE subtask  PATCH /todos/<tid>/subtasks/<sid>/toggle
@todos_bp.route("/todos/<int:todo_id>/subtasks/<int:sub_id>/toggle", methods=["PATCH"])
@jwt_required()
def toggle_subtask(todo_id, sub_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute(
        "SELECT is_completed FROM subtasks WHERE id=%s AND todo_id=%s AND user_id=%s",
        (sub_id, todo_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        return jsonify(msg="Subtask not found"), 404

    new_status = not bool(row["is_completed"])
    cur.execute("UPDATE subtasks SET is_completed=%s WHERE id=%s", (new_status, sub_id))
    mysql.connection.commit()
    cur.execute("SELECT * FROM subtasks WHERE id=%s", (sub_id,))
    updated = cur.fetchone()
    cur.close()
    updated["is_completed"] = bool(updated["is_completed"])
    updated["created_at"]   = str(updated["created_at"])
    return jsonify(msg="Subtask toggled", subtask=updated)


# DELETE subtask  DELETE /todos/<tid>/subtasks/<sid>
@todos_bp.route("/todos/<int:todo_id>/subtasks/<int:sub_id>", methods=["DELETE"])
@jwt_required()
def delete_subtask(todo_id, sub_id):
    user_id = get_jwt_identity()
    cur     = mysql.connection.cursor()
    cur.execute(
        "DELETE FROM subtasks WHERE id=%s AND todo_id=%s AND user_id=%s",
        (sub_id, todo_id, user_id),
    )
    mysql.connection.commit()
    affected = cur.rowcount
    cur.close()
    if not affected:
        return jsonify(msg="Subtask not found"), 404
    return jsonify(msg="Subtask deleted")