import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const PASSWORD_KEY = "litmon:admin-password";

function getStoredPassword() {
  try { return localStorage.getItem(PASSWORD_KEY) || ""; } catch { return ""; }
}
function setStoredPassword(p) {
  try { localStorage.setItem(PASSWORD_KEY, p); } catch { /* ignore */ }
}
function clearStoredPassword() {
  try { localStorage.removeItem(PASSWORD_KEY); } catch { /* ignore */ }
}

export default function SettingsPage() {
  const [state, setState] = useState({ status: "loading", searches: null, error: null });
  const [password, setPassword] = useState(() => getStoredPassword());
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  // Load current searches.json
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/searches");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setState({ status: "ready", searches: data.searches, error: null });
        setDraft(data.searches);
      } catch (err) {
        setState({ status: "error", searches: null, error: err.message });
      }
    })();
  }, []);

  const onSavePassword = (e) => {
    e.preventDefault();
    setStoredPassword(password);
    setFlash({ kind: "info", text: "Password saved on this device." });
  };

  const onForget = () => {
    clearStoredPassword();
    setPassword("");
    setFlash({ kind: "info", text: "Password forgotten." });
  };

  const onTopicChange = (key, field, value) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));
  };

  const onDelete = (key) => {
    if (!confirm(`Delete topic "${key}"?`)) return;
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const onAdd = () => {
    let key = prompt("Topic key (lowercase, underscores, no spaces):");
    if (!key) return;
    key = key.trim().toLowerCase();
    if (!key.match(/^[a-z0-9_]+$/)) {
      alert("Key must be lowercase alphanumeric + underscore only.");
      return;
    }
    if (draft[key]) {
      alert("That key already exists.");
      return;
    }
    setDraft((d) => ({
      ...d,
      [key]: { label: "New topic", priority: "medium", query: "" },
    }));
  };

  const onSaveAll = async () => {
    if (!password) {
      setFlash({ kind: "error", text: "Set the admin password first." });
      return;
    }
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/searches", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Admin-Password": password },
        body: JSON.stringify({ searches: draft }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setFlash({ kind: "success", text: `Saved. Commit ${j.commit?.slice(0, 7) || "(unknown sha)"}.` });
      setState((s) => ({ ...s, searches: draft }));
    } catch (err) {
      setFlash({ kind: "error", text: `Save failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const onRetro = async () => {
    if (!password) {
      setFlash({ kind: "error", text: "Set the admin password first." });
      return;
    }
    if (!confirm("Run a 5-year retrospective sweep now? Takes ~2 min and overwrites today's digest with the full historical results.")) return;
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/retrospective", {
        method: "POST",
        headers: { "X-Admin-Password": password },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setFlash({ kind: "success", text: "Retrospective workflow dispatched. Check the Actions tab on GitHub; the dashboard updates when it finishes." });
    } catch (err) {
      setFlash({ kind: "error", text: `Retrospective failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "loading") {
    return <p className="font-mono text-sm text-muted">Loading settings…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="max-w-reading">
        <p className="font-display text-xl text-accent">Couldn't load settings.</p>
        <p className="text-sm text-muted mt-2 font-mono">{state.error}</p>
        <p className="text-sm text-muted mt-4">
          The serverless API at <code className="font-mono">/api/searches</code> didn't respond.
          Either the deploy hasn't finished or the env vars aren't set on Vercel.
        </p>
      </div>
    );
  }

  const dirty = JSON.stringify(state.searches) !== JSON.stringify(draft);

  return (
    <div className="max-w-3xl">
      <header className="border-b border-rule pb-6">
        <p className="smallcaps">Admin</p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mt-2">
          Topic editor
        </h1>
        <p className="text-muted mt-3 max-w-reading">
          Add, edit, or delete the PubMed search topics. Saves commit{" "}
          <code className="font-mono text-sm">litmonitor/searches.json</code> to the repo
          via the dashboard's serverless API. The next weekly run picks up changes
          automatically; click <strong>Run retrospective</strong> to backfill 5 years
          of history for newly-added topics.
        </p>
      </header>

      {flash && (
        <div className={`mt-6 px-4 py-3 text-sm font-mono border ${
          flash.kind === "success" ? "border-teal text-teal" :
          flash.kind === "error" ? "border-accent text-accent" :
          "border-rule text-ink-soft"
        }`}>
          {flash.text}
        </div>
      )}

      {/* Password */}
      <section className="mt-8">
        <p className="smallcaps mb-2">Admin password</p>
        <form onSubmit={onSavePassword} className="flex gap-2 items-center">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="flex-1 bg-paper-dim border border-rule px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink"
          />
          <button type="submit" className="px-4 py-2 text-xs font-mono uppercase tracking-smallcaps border border-ink hover:bg-ink hover:text-paper transition-colors">
            Save
          </button>
          {getStoredPassword() && (
            <button type="button" onClick={onForget} className="px-4 py-2 text-xs font-mono uppercase tracking-smallcaps text-muted hover:text-ink">
              Forget
            </button>
          )}
        </form>
        <p className="text-xs text-muted mt-2 font-mono">
          Stored in this browser's localStorage. Set per device.
        </p>
      </section>

      {/* Topics */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <p className="smallcaps">Topics ({Object.keys(draft).length})</p>
          <button
            onClick={onAdd}
            className="text-xs font-mono uppercase tracking-smallcaps text-teal hover:text-ink"
          >
            + add topic
          </button>
        </div>

        <ol className="mt-4 space-y-0">
          {Object.entries(draft).map(([key, val]) => (
            <li key={key} className="hairline first:border-t-0 py-5">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <code className="font-mono text-sm text-ink-soft">{key}</code>
                <button
                  onClick={() => onDelete(key)}
                  className="text-xs font-mono uppercase tracking-smallcaps text-muted hover:text-accent"
                >
                  delete
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                <input
                  type="text"
                  value={val.label}
                  onChange={(e) => onTopicChange(key, "label", e.target.value)}
                  placeholder="Display label"
                  className="bg-paper-dim border border-rule px-3 py-2 text-sm focus:outline-none focus:border-ink"
                />
                <select
                  value={val.priority}
                  onChange={(e) => onTopicChange(key, "priority", e.target.value)}
                  className="bg-paper-dim border border-rule px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <textarea
                value={val.query}
                onChange={(e) => onTopicChange(key, "query", e.target.value)}
                placeholder='PubMed query, e.g. ("term"[tiab] OR ...) AND (...)'
                rows={3}
                className="mt-2 w-full bg-paper-dim border border-rule px-3 py-2 text-xs font-mono focus:outline-none focus:border-ink"
              />
            </li>
          ))}
        </ol>

        <div className="mt-6 flex gap-3 flex-wrap">
          <button
            onClick={onSaveAll}
            disabled={busy || !dirty}
            className="px-5 py-2 text-xs font-mono uppercase tracking-smallcaps border border-ink bg-ink text-paper hover:bg-paper hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "saving…" : dirty ? "save changes" : "no changes"}
          </button>
          <button
            onClick={onRetro}
            disabled={busy}
            className="px-5 py-2 text-xs font-mono uppercase tracking-smallcaps border border-ink hover:bg-ink hover:text-paper disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            run retrospective
          </button>
        </div>
      </section>

      <p className="text-xs text-muted mt-10 font-mono">
        <Link to="/" className="link-underline">← back to digests</Link>
      </p>
    </div>
  );
}
