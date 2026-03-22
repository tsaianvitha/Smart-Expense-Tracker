import { useInstallPrompt } from "../hooks/useInstallPrompt";

export default function InstallBanner() {
  const { canInstall, installed, install, dismiss } = useInstallPrompt();

  // Don't show if already installed or no prompt available
  if (installed || !canInstall) return null;

  return (
    <div className="install-banner">
      <div className="install-banner-left">
        <div className="install-icon">💰</div>
        <div>
          <div className="install-title">Install SpendSmart</div>
          <div className="install-sub">Add to home screen for quick access, works offline</div>
        </div>
      </div>
      <div className="install-actions">
        <button className="btn-install" onClick={install}>
          Install App
        </button>
        <button className="btn-dismiss" onClick={dismiss} title="Dismiss">✕</button>
      </div>
    </div>
  );
}