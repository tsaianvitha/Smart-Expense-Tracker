import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import api    from "../services/api";
import { CATEGORIES, CATEGORY_COLORS } from "../constants/categories";

const SCAN_STEPS = [
  "Uploading image…",
  "Reading receipt with AI…",
  "Extracting items and amounts…",
  "Identifying merchant and date…",
  "Suggesting expense category…",
];

export default function ReceiptScanner() {
  const navigate    = useNavigate();
  const fileInputRef = useRef();
  const dropRef      = useRef();

  const [image,      setImage]      = useState(null);   // { file, preview }
  const [scanning,   setScanning]   = useState(false);
  const [scanStep,   setScanStep]   = useState(0);
  const [result,     setResult]     = useState(null);   // parsed receipt
  const [error,      setError]      = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [dragging,   setDragging]   = useState(false);

  // Editable fields after scan
  const [title,    setTitle]    = useState("");
  const [amount,   setAmount]   = useState("");
  const [category, setCategory] = useState("");
  const [date,     setDate]     = useState("");
  const [note,     setNote]     = useState("");

  // ── File handling ──────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setImage({ file, preview });
    setResult(null);
    setError(null);
    setSaved(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  // ── Scan ───────────────────────────────────────────────────
  const handleScan = async () => {
    if (!image) return;
    setScanning(true);
    setError(null);
    setScanStep(0);

    // Step ticker for UX
    const ticker = setInterval(() => {
      setScanStep((s) => (s < SCAN_STEPS.length - 1 ? s + 1 : s));
    }, 900);

    try {
      const formData = new FormData();
      formData.append("image", image.file);

      const res = await api.post("/receipts/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      clearInterval(ticker);
      const r = res.data.receipt;
      setResult(r);

      // Pre-fill editable fields
      setTitle(r.suggested_title   || r.merchant || "");
      setAmount(r.total            != null ? String(r.total) : "");
      setCategory(r.suggested_category || "Others");
      setDate(r.date               || new Date().toISOString().split("T")[0]);
      setNote(r.merchant           ? `Receipt from ${r.merchant}` : "");
    } catch (err) {
      clearInterval(ticker);
      setError(err.response?.data?.msg || "Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  // ── Save expense ───────────────────────────────────────────
  const handleSave = async () => {
    if (!title || !amount || !category || !date) {
      setError("Title, amount, category and date are required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/expenses", {
        title,
        amount:       Number(amount),
        category,
        expense_date: date,
        note,
      });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setSaved(false);
    setTitle(""); setAmount(""); setCategory(""); setDate(""); setNote("");
    if (image?.preview) URL.revokeObjectURL(image.preview);
  };

  const sym = JSON.parse(localStorage.getItem("user") || "{}").currency_sym || "₹";

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1>📷 Receipt Scanner</h1>
            <p style={{ color: "var(--text-muted)", fontSize: ".88rem", marginTop: 2 }}>
              Upload a photo of any receipt — AI will extract the details automatically
            </p>
          </div>
          {(image || result) && (
            <button className="btn-secondary" onClick={reset}>
              ↺ Scan another
            </button>
          )}
        </div>

        <div className="scanner-layout">

          {/* ── Left: Upload + Preview ── */}
          <div className="scanner-left">

            {/* Drop zone */}
            {!image ? (
              <div
                ref={dropRef}
                className={`drop-zone ${dragging ? "dragging" : ""}`}
                onClick={() => fileInputRef.current.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className="drop-zone-icon">📄</div>
                <p className="drop-zone-title">Drop receipt here or click to upload</p>
                <p className="drop-zone-sub">JPEG, PNG or WebP · Max 5MB</p>
                <button className="btn-primary" style={{ marginTop: 16 }}
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}>
                  Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="receipt-preview-wrap">
                <img
                  src={image.preview}
                  alt="Receipt"
                  className="receipt-preview-img"
                />
                {/* Scan overlay animation */}
                {scanning && <div className="scan-line" />}
              </div>
            )}

            {/* Scan button */}
            {image && !result && !scanning && (
              <button className="btn-primary btn-full scan-btn" onClick={handleScan}>
                🔍 Scan Receipt
              </button>
            )}

            {/* Scanning progress */}
            {scanning && (
              <div className="scan-progress">
                <div className="scan-spinner" />
                <div className="scan-steps">
                  {SCAN_STEPS.map((step, i) => (
                    <div
                      key={i}
                      className={`scan-step ${i < scanStep ? "done" : i === scanStep ? "active" : "pending"}`}
                    >
                      <span className="scan-step-dot" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}
          </div>

          {/* ── Right: Results + Form ── */}
          {result && (
            <div className="scanner-right">

              {/* Confidence badge */}
              <div className="scan-confidence">
                <span>AI confidence:</span>
                <div className="confidence-bar-track">
                  <div
                    className="confidence-bar-fill"
                    style={{
                      width: `${Math.round((result.confidence || 0.7) * 100)}%`,
                      background: (result.confidence || 0.7) > 0.8 ? "#16a34a"
                        : (result.confidence || 0.7) > 0.5 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="confidence-pct">
                  {Math.round((result.confidence || 0.7) * 100)}%
                </span>
              </div>

              {/* Parsed items table */}
              {result.items?.length > 0 && (
                <div className="items-table-wrap">
                  <h3 className="scan-section-title">Detected Items</h3>
                  <table className="items-table">
                    <thead>
                      <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
                    </thead>
                    <tbody>
                      {result.items.map((item, i) => (
                        <tr key={i}>
                          <td>{item.name}</td>
                          <td>{item.qty || 1}</td>
                          <td>{sym}{Number(item.price || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                    {result.subtotal != null && (
                      <tfoot>
                        {result.subtotal != null && (
                          <tr className="subtotal-row">
                            <td colSpan="2">Subtotal</td>
                            <td>{sym}{Number(result.subtotal).toLocaleString("en-IN")}</td>
                          </tr>
                        )}
                        {result.tax != null && (
                          <tr className="tax-row">
                            <td colSpan="2">Tax</td>
                            <td>{sym}{Number(result.tax).toLocaleString("en-IN")}</td>
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Editable expense form */}
              <div className="scan-expense-form">
                <h3 className="scan-section-title">
                  Save as Expense
                  <span className="scan-edit-hint">— edit any field before saving</span>
                </h3>

                {saved ? (
                  <div className="scan-saved">
                    <span>✅</span>
                    <p>Expense saved successfully!</p>
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                      <button className="btn-primary" onClick={() => navigate("/dashboard")}>
                        View Dashboard
                      </button>
                      <button className="btn-secondary" onClick={reset}>
                        Scan Another
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="scan-form-fields">
                    <div className="form-group">
                      <label>Title</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Expense title"
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Amount ({sym})</label>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="form-group">
                        <label>Date</label>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Category</label>
                      <div className="category-pills">
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            className={`cat-pill ${category === cat ? "active" : ""}`}
                            style={category === cat ? {
                              background: CATEGORY_COLORS[cat] + "22",
                              color: CATEGORY_COLORS[cat],
                              borderColor: CATEGORY_COLORS[cat],
                            } : {}}
                            onClick={() => setCategory(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Note (optional)</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Any extra details…"
                      />
                    </div>

                    <button
                      className="btn-primary btn-full"
                      onClick={handleSave}
                      disabled={saving}
                      style={{ marginTop: 8 }}
                    >
                      {saving ? "Saving…" : "💾 Save Expense"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}