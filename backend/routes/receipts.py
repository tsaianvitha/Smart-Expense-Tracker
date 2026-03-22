import os
import json
import base64
import requests
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

receipts_bp = Blueprint("receipts", __name__)

GROQ_API_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

VALID_CATEGORIES = [
    "Food", "Shopping", "Travel", "Medical",
    "Rent", "Utilities", "Entertainment",
    "Education", "Groceries", "Others",
]

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_SIZE_MB   = 5


# ── POST /receipts/scan ───────────────────────────────────────
@receipts_bp.route("/receipts/scan", methods=["POST"])
@jwt_required()
def scan_receipt():
    if "image" not in request.files:
        return jsonify(msg="No image file provided. Use field name 'image'"), 400

    file      = request.files["image"]
    mime_type = file.content_type or "image/jpeg"

    if mime_type not in ALLOWED_TYPES:
        return jsonify(msg=f"Unsupported file type: {mime_type}. Use JPEG, PNG or WebP"), 400

    image_bytes = file.read()
    if len(image_bytes) > MAX_SIZE_MB * 1024 * 1024:
        return jsonify(msg=f"Image too large. Max {MAX_SIZE_MB}MB"), 400

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return jsonify(msg="GROQ_API_KEY not set in .env"), 500

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    system_prompt = (
        "You are a receipt OCR assistant. Extract data from receipt images and return ONLY valid JSON. "
        "No markdown, no code fences, no extra text."
    )

    user_prompt = f"""Analyze this receipt image and extract all information.

Return ONLY a JSON object in exactly this format:
{{
  "merchant": "store or restaurant name, or null if unclear",
  "date": "YYYY-MM-DD format, or null if not visible",
  "total": <final total amount as a number, or null>,
  "subtotal": <subtotal before tax as a number, or null>,
  "tax": <tax amount as a number, or null>,
  "currency": "INR or USD or detected currency code",
  "items": [
    {{"name": "item name", "qty": 1, "price": 0.00}},
    ...
  ],
  "suggested_category": "one of: {', '.join(VALID_CATEGORIES)}",
  "suggested_title": "short descriptive title for the expense (e.g. 'Lunch at Cafe XYZ')",
  "confidence": <0.0 to 1.0, how confident you are in the extraction>,
  "notes": "any additional relevant info or null"
}}

Rules:
- All monetary values must be plain numbers (no currency symbols)
- If total is not clear, sum the items
- suggested_category must be exactly one of the allowed values
- items can be empty array [] if items not visible
- Return null for fields you cannot determine
"""

    try:
        resp = requests.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json={
                "model": GROQ_VISION_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": data_url},
                            },
                            {"type": "text", "text": user_prompt},
                        ],
                    },
                ],
                "temperature": 0.1,
                "max_tokens":  1024,
            },
            timeout=45,
        )

        if resp.status_code != 200:
            return jsonify(msg=f"Vision API error {resp.status_code}: {resp.text}"), 500

        raw = resp.json()["choices"][0]["message"]["content"].strip()

        # Strip markdown fences if model added them
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)

        # Validate suggested_category
        if result.get("suggested_category") not in VALID_CATEGORIES:
            result["suggested_category"] = "Others"

        return jsonify(
            msg="Receipt scanned successfully",
            receipt=result,
        )

    except json.JSONDecodeError as e:
        return jsonify(msg=f"Failed to parse OCR response: {str(e)}"), 500
    except requests.Timeout:
        return jsonify(msg="Vision API timed out. Please try again."), 504
    except Exception as e:
        return jsonify(msg=f"Scan error: {str(e)}"), 500