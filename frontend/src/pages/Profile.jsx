import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import api    from "../services/api";

const CURRENCY_FLAGS = {
  INR: "🇮🇳", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧",
  JPY: "🇯🇵", AED: "🇦🇪", SGD: "🇸🇬", AUD: "🇦🇺",
};

export default function Profile() {
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);

  // Name form
  const [name,       setName]       = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg,    setNameMsg]    = useState(null);

  // Password form
  const [pwForm,     setPwForm]     = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwSaving,   setPwSaving]   = useState(false);
  const [pwMsg,      setPwMsg]      = useState(null);

  // Currency form
  const [currency,   setCurrency]   = useState("INR");
  const [curSaving,  setCurSaving]  = useState(false);
  const [curMsg,     setCurMsg]     = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/profile");
        const u   = res.data.user;
        setUser(u);
        setName(u.display_name || u.name);
        setCurrency(u.currency || "INR");
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // ── Update name ────────────────────────────────────────────
  const handleNameSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      await api.patch("/profile/name", { name });
      // Update local storage so sidebar reflects change immediately
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, name }));
      setNameMsg({ type: "success", text: "Name updated!" });
    } catch (err) {
      setNameMsg({ type: "error", text: err.response?.data?.msg || "Failed to update name." });
    } finally { setNameSaving(false); }
  };

  // ── Update password ────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.new_password !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (pwForm.new_password.length < 6) {
      setPwMsg({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setPwSaving(true);
    try {
      await api.patch("/profile/password", {
        current_password: pwForm.current_password,
        new_password:     pwForm.new_password,
      });
      setPwForm({ current_password: "", new_password: "", confirm: "" });
      setPwMsg({ type: "success", text: "Password updated successfully!" });
    } catch (err) {
      setPwMsg({ type: "error", text: err.response?.data?.msg || "Failed to update password." });
    } finally { setPwSaving(false); }
  };

  // ── Update currency ────────────────────────────────────────
  const handleCurrencySave = async (e) => {
    e.preventDefault();
    setCurSaving(true);
    setCurMsg(null);
    try {
      const res = await api.patch("/profile/currency", { currency });
      // Persist sym to localStorage so other pages can use it
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({
        ...stored,
        currency:     res.data.currency,
        currency_sym: res.data.currency_sym,
      }));
      setCurMsg({ type: "success", text: `Currency changed to ${res.data.currency} (${res.data.currency_sym})` });
    } catch (err) {
      setCurMsg({ type: "error", text: err.response?.data?.msg || "Failed to update currency." });
    } finally { setCurSaving(false); }
  };

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content"><div className="loading-state">Loading profile…</div></main>
    </div>
  );

  const initials = (user?.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        <div className="page-header">
          <h1>⚙️ Profile & Settings</h1>
        </div>

        {/* Profile header card */}
        <div className="profile-header-card">
          <div className="profile-avatar-lg">{initials}</div>
          <div>
            <div className="profile-display-name">{user?.display_name || user?.name}</div>
            <div className="profile-email">{user?.email}</div>
            <div className="profile-since">
              Member since {new Date(user?.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        <div className="settings-grid">

          {/* ── Name ── */}
          <div className="settings-card">
            <h2 className="settings-card-title">Display Name</h2>
            <form onSubmit={handleNameSave} className="settings-form">
              {nameMsg && (
                <div className={`alert ${nameMsg.type === "success" ? "alert-success" : "alert-error"}`}>
                  {nameMsg.text}
                </div>
              )}
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="settings-form-footer">
                <button type="submit" className="btn-primary" disabled={nameSaving}>
                  {nameSaving ? "Saving…" : "Update Name"}
                </button>
              </div>
            </form>
          </div>

          {/* ── Password ── */}
          <div className="settings-card">
            <h2 className="settings-card-title">Change Password</h2>
            <form onSubmit={handlePasswordSave} className="settings-form">
              {pwMsg && (
                <div className={`alert ${pwMsg.type === "success" ? "alert-success" : "alert-error"}`}>
                  {pwMsg.text}
                </div>
              )}
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={pwForm.current_password} placeholder="••••••••"
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={pwForm.new_password} placeholder="Min. 6 characters"
                  onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={pwForm.confirm} placeholder="Repeat new password"
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} required />
              </div>
              <div className="settings-form-footer">
                <button type="submit" className="btn-primary" disabled={pwSaving}>
                  {pwSaving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>

          {/* ── Currency ── */}
          <div className="settings-card">
            <h2 className="settings-card-title">Currency Preference</h2>
            <form onSubmit={handleCurrencySave} className="settings-form">
              {curMsg && (
                <div className={`alert ${curMsg.type === "success" ? "alert-success" : "alert-error"}`}>
                  {curMsg.text}
                </div>
              )}
              <div className="currency-grid">
                {Object.entries(user?.currencies || {}).map(([code, sym]) => (
                  <label
                    key={code}
                    className={`currency-option ${currency === code ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="currency"
                      value={code}
                      checked={currency === code}
                      onChange={() => setCurrency(code)}
                      style={{ display: "none" }}
                    />
                    <span className="currency-flag">{CURRENCY_FLAGS[code] || "🏳"}</span>
                    <span className="currency-sym">{sym}</span>
                    <span className="currency-code">{code}</span>
                  </label>
                ))}
              </div>
              <div className="settings-form-footer">
                <button type="submit" className="btn-primary" disabled={curSaving}>
                  {curSaving ? "Saving…" : "Save Currency"}
                </button>
              </div>
            </form>
          </div>

          {/* ── Account info (read-only) ── */}
          <div className="settings-card">
            <h2 className="settings-card-title">Account Info</h2>
            <div className="info-rows">
              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-value">{user?.email}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Currency</span>
                <span className="info-value">{CURRENCY_FLAGS[user?.currency]} {user?.currency} ({user?.currency_sym})</span>
              </div>
              <div className="info-row">
                <span className="info-label">Member since</span>
                <span className="info-value">
                  {new Date(user?.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
              </div>
            </div>

            <div className="danger-zone">
              <p className="danger-zone-title">Danger Zone</p>
              <button
                className="btn-danger"
                onClick={() => {
                  if (window.confirm("Are you sure you want to log out from all devices?")) {
                    localStorage.clear();
                    window.location.href = "/";
                  }
                }}
              >
                Log out
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}