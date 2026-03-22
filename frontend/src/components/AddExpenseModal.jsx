import { useState, useEffect, useRef } from "react";
import { CATEGORIES } from "../constants/categories";
import api from "../services/api";

const SCAN_STEPS = [
  "Uploading…",
  "Reading receipt…",
  "Extracting amounts…",
  "Categorising…",
];

export default function AddExpenseModal({ onClose, onSaved, editingExpense }) {
  const [tab,      setTab]      = useState("manual");  // "manual" | "scan"
  const [title,    setTitle]    = useState("");
  const [amount,   setAmount]   = useState("");
  const [category, setCategory] = useState("");
  const [date,     setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [note,     setNote]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // Scan tab state
  const fileRef    = useRef();
  const [preview,  setPreview]  = useState(null);
  const [imgFile,  setImgFile]  = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanned,  setScanned]  = useState(false);

  useEffect(() => {
    if (editingExpense) {
      setTitle(editingExpense.title      || "");
      setAmount(editingExpense.amount    || "");
      setCategory(editingExpense.category || "");
      setDate(editingExpense.expense_date || new Date().toISOString().split("T")[0]);
      setNote(editingExpense.note        || "");
    }
  }, [editingExpense]);

  // ── Manual submit ──────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!title || !amount || !category || !date) {
      setError("All fields except note are required.");
      return;
    }
    setLoading(true);
    const payload = { title, amount: Number(amount), category, expense_date: date, note };
    try {
      if (editingExpense) {
        const res = await api.put(`/expenses/${editingExpense.id}`, payload);
        onSaved(res.data.expense);
      } else {
        const res = await api.post("/expenses", payload);
        onSaved(res.data.expense);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to save expense.");
    } finally {
      setLoading(false);
    }
  };

  // ── Receipt scan ───────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImgFile(file);
    setPreview(URL.createObjectURL(file));
    setScanned(false);
    setError("");
  };

  const handleScan = async () => {
    if (!imgFile) return;
    setScanning(true);
    setScanStep(0);
    setError("");

    const ticker = setInterval(() => {
      setScanStep((s) => (s < SCAN_STEPS.length - 1 ? s + 1 : s));
    }, 700);

    try {
      const formData = new FormData();
      formData.append("image", imgFile);
      const res = await api.post("/receipts/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      clearInterval(ticker);
      const r = res.data.receipt;
      setTitle(r.suggested_title    || r.merchant || "");
      setAmount(r.total != null     ? String(r.total) : "");
      setCategory(r.suggested_category || "Others");
      setDate(r.date                || new Date().toISOString().split("T")[0]);
      setNote(r.merchant            ? `Receipt from ${r.merchant}` : "");
      setScanned(true);
      setTab("manual");   // switch to manual tab so user can review
    } catch (err) {
      clearInterval(ticker);
      setError(err.response?.data?.msg || "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{editingExpense ? "Edit Expense" : "Add Expense"}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab switcher — only on new expense */}
        {!editingExpense && (
          <div className="modal-tabs">
            <button
              className={`modal-tab ${tab === "manual" ? "active" : ""}`}
              onClick={() => setTab("manual")}
            >
              ✏️ Manual
            </button>
            <button
              className={`modal-tab ${tab === "scan" ? "active" : ""}`}
              onClick={() => setTab("scan")}
            >
              📷 Scan Receipt
            </button>
            {scanned && (
              <span className="scan-filled-badge">✅ Fields filled from receipt</span>
            )}
          </div>
        )}

        {/* ── Scan tab ── */}
        {tab === "scan" && (
          <div className="modal-scan-tab">
            {!preview ? (
              <div
                className="modal-drop-zone"
                onClick={() => fileRef.current.click()}
              >
                <div style={{ fontSize: "2rem" }}>📄</div>
                <p>Click to upload receipt photo</p>
                <span>JPEG, PNG or WebP · Max 5MB</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="modal-scan-preview">
                <img src={preview} alt="Receipt" className="modal-receipt-img" />
                {scanning && <div className="modal-scan-line" />}
              </div>
            )}

            {scanning && (
              <div className="modal-scan-steps">
                {SCAN_STEPS.map((s, i) => (
                  <div key={i} className={`scan-step ${i < scanStep ? "done" : i === scanStep ? "active" : "pending"}`}>
                    <span className="scan-step-dot" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}

            {preview && !scanning && (
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button className="btn-secondary" onClick={() => { setPreview(null); setImgFile(null); }}>
                  Remove
                </button>
                <button className="btn-primary" onClick={handleScan}>
                  🔍 Scan Now
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Manual tab ── */}
        {tab === "manual" && (
          <form className="modal-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            {scanned && (
              <div className="alert alert-success" style={{ marginBottom: 4 }}>
                ✅ Fields auto-filled from receipt — review and save
              </div>
            )}

            <div className="form-group">
              <label>Title</label>
              <input type="text" placeholder="e.g. Lunch, Uber ride" value={title}
                onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Amount</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={date}
                  onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="">Select Category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Note (optional)</label>
              <textarea placeholder="Any extra details…" value={note} rows={2}
                onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Saving…" : editingExpense ? "Update" : "Add Expense"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}