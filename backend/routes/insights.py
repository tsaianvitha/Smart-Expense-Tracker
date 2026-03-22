import os
import json
import requests
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mysql

insights_bp = Blueprint("insights", __name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

def _fetch_expense_data(user_id: str, cur) -> dict:
    cur.execute("""
        SELECT category, COUNT(*) AS count, SUM(amount) AS total,
               AVG(amount) AS avg_amount, MAX(amount) AS max_amount
        FROM expenses
        WHERE user_id = %s
          AND MONTH(expense_date) = MONTH(CURDATE())
          AND YEAR(expense_date)  = YEAR(CURDATE())
        GROUP BY category ORDER BY total DESC
    """, (user_id,))
    current_month_by_cat = cur.fetchall()

    cur.execute("""
        SELECT DATE_FORMAT(expense_date, '%%Y-%%m') AS month,
               SUM(amount) AS total, COUNT(*) AS count
        FROM expenses
        WHERE user_id = %s
          AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
        GROUP BY month ORDER BY month
    """, (user_id,))
    monthly_totals = cur.fetchall()

    cur.execute("""
        SELECT title, amount, category, expense_date
        FROM expenses
        WHERE user_id = %s
          AND MONTH(expense_date) = MONTH(CURDATE())
          AND YEAR(expense_date)  = YEAR(CURDATE())
        ORDER BY amount DESC LIMIT 5
    """, (user_id,))
    top_expenses = cur.fetchall()

    cur.execute("""
        SELECT b.category, b.monthly_limit,
               COALESCE(SUM(e.amount), 0) AS spent
        FROM budgets b
        LEFT JOIN expenses e
               ON e.user_id = b.user_id
              AND e.category = b.category
              AND MONTH(e.expense_date) = MONTH(CURDATE())
              AND YEAR(e.expense_date)  = YEAR(CURDATE())
        WHERE b.user_id = %s
        GROUP BY b.category, b.monthly_limit
    """, (user_id,))
    budgets = cur.fetchall()

    cur.execute(
        "SELECT currency, currency_sym, name FROM users WHERE id = %s", (user_id,)
    )
    user_row = cur.fetchone()

    return {
        "current_month_by_category": [
            {"category": r["category"], "count": int(r["count"]),
             "total": float(r["total"]), "avg": round(float(r["avg_amount"]), 2),
             "max": float(r["max_amount"])}
            for r in current_month_by_cat
        ],
        "monthly_totals": [
            {"month": r["month"], "total": float(r["total"]), "count": int(r["count"])}
            for r in monthly_totals
        ],
        "top_expenses": [
            {"title": r["title"], "amount": float(r["amount"]),
             "category": r["category"], "date": str(r["expense_date"])}
            for r in top_expenses
        ],
        "budgets": [
            {"category": r["category"], "limit": float(r["monthly_limit"]),
             "spent": float(r["spent"]),
             "pct": round((float(r["spent"]) / float(r["monthly_limit"])) * 100, 1)
                    if r["monthly_limit"] else 0}
            for r in budgets
        ],
        "currency":     user_row["currency"]     if user_row else "INR",
        "currency_sym": user_row["currency_sym"] if user_row else "₹",
        "user_name":    user_row["name"]          if user_row else "there",
    }


def _build_prompt(data: dict) -> str:
    sym       = data["currency_sym"]
    cur       = data["current_month_by_category"]
    cur_total = sum(c["total"] for c in cur)
    monthly   = data["monthly_totals"]
    prev      = monthly[-2] if len(monthly) >= 2 else None

    lines = [
        f"Finance advisor analyzing data for {data['user_name']}.",
        f"\nCURRENT MONTH TOTAL: {sym}{cur_total:,.2f}",
        "\nBY CATEGORY:",
    ]
    for c in cur:
        lines.append(f"  - {c['category']}: {sym}{c['total']:,.2f} ({c['count']} transactions, avg {sym}{c['avg']:,.2f})")

    if monthly:
        lines.append("\nLAST 3 MONTHS:")
        for m in monthly:
            lines.append(f"  - {m['month']}: {sym}{m['total']:,.2f} ({m['count']} transactions)")

    if prev:
        pct = ((cur_total - prev["total"]) / prev["total"]) * 100
        lines.append(f"\nMONTH-OVER-MONTH: {pct:+.1f}% vs {prev['month']}")

    if data["top_expenses"]:
        lines.append("\nTOP EXPENSES:")
        for e in data["top_expenses"]:
            lines.append(f"  - {e['title']} ({e['category']}): {sym}{e['amount']:,.2f}")

    if data["budgets"]:
        lines.append("\nBUDGET STATUS:")
        for b in data["budgets"]:
            st = "EXCEEDED" if b["pct"] >= 100 else ("WARNING" if b["pct"] >= 80 else "OK")
            lines.append(f"  - {b['category']}: {sym}{b['spent']:,.2f}/{sym}{b['limit']:,.2f} ({b['pct']}%) [{st}]")

    lines.append("""
Return ONLY a JSON object, no markdown fences, no extra text:
{
  "summary": "2-3 sentences with specific numbers",
  "score": <1-100>,
  "score_label": "<Excellent|Good|Fair|Needs Attention>",
  "highlights": [
    {"type": "positive", "title": "short title", "detail": "one sentence with numbers"},
    {"type": "positive", "title": "short title", "detail": "one sentence with numbers"},
    {"type": "warning",  "title": "short title", "detail": "one sentence with numbers"}
  ],
  "tips": [
    {"category": "name or General", "tip": "actionable advice"},
    {"category": "name or General", "tip": "actionable advice"},
    {"category": "name or General", "tip": "actionable advice"},
    {"category": "name or General", "tip": "actionable advice"}
  ],
  "anomalies": [],
  "forecast": "1-2 sentences about next month"
}""")

    return "\n".join(lines)


def _call_groq(prompt: str, api_key: str) -> dict:
    """Call Groq REST API directly using requests — no SDK needed."""
    resp = requests.post(
        GROQ_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "messages": [
                {
                    "role":    "system",
                    "content": "You are a personal finance advisor. Respond with valid JSON only. No markdown. No code blocks.",
                },
                {
                    "role":    "user",
                    "content": prompt,
                },
            ],
            "temperature": 0.4,
            "max_tokens":  1024,
        },
        timeout=30,
    )

    if resp.status_code != 200:
        raise Exception(f"Groq API error {resp.status_code}: {resp.text}")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown fences if model added them
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(raw)


# ── GET /insights ─────────────────────────────────────────────
@insights_bp.route("/insights", methods=["GET"])
@jwt_required()
def get_insights():
    user_id = get_jwt_identity()

    cur  = mysql.connection.cursor()
    data = _fetch_expense_data(user_id, cur)
    cur.close()

    if not data["current_month_by_category"] and not data["monthly_totals"]:
        return jsonify(msg="no_data", insights=None)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return jsonify(msg="GROQ_API_KEY not set in .env"), 500

    try:
        prompt   = _build_prompt(data)
        insights = _call_groq(prompt, api_key)

        return jsonify(
            insights=insights,
            meta={
                "currency":      data["currency"],
                "currency_sym":  data["currency_sym"],
                "current_total": sum(c["total"] for c in data["current_month_by_category"]),
                "monthly_totals": data["monthly_totals"],
                "by_category":   data["current_month_by_category"],
                "budgets":        data["budgets"],
            }
        )

    except json.JSONDecodeError as e:
        return jsonify(msg=f"Failed to parse AI response: {str(e)}"), 500
    except Exception as e:
        return jsonify(msg=f"AI error: {str(e)}"), 500