"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Monitor, MonitorSettings } from "@/lib/monitor-types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error ?? "The request failed. Please try again.");
  return body as T;
}

function intervalLabel(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export default function Dashboard() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const editor = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    request<{ monitors: Monitor[] }>("/api/monitors", { signal: controller.signal })
      .then((data) => setMonitors(data.monitors))
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await request<{ monitors: Monitor[] }>("/api/monitors");
      setMonitors(data.monitors);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load monitors."); }
    finally { setLoading(false); }
  }

  function openEditor(monitor: Monitor | null) {
    setEditing(monitor);
    setFormError("");
    setFormVersion((value) => value + 1);
    editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => document.getElementById("monitor-name")?.focus({ preventScroll: true }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const settings: MonitorSettings = {
      name: String(data.get("name")), url: String(data.get("url")),
      method: data.get("method") as MonitorSettings["method"],
      expected_status: Number(data.get("expected_status")),
      interval_seconds: Number(data.get("interval_seconds")),
      timeout_ms: Number(data.get("timeout_ms")), enabled: data.get("enabled") === "on",
    };
    setBusy(true); setFormError(""); setNotice(""); setError("");
    try {
      const { monitor } = await request<{ monitor: Monitor }>(editing ? `/api/monitors/${editing.id}` : "/api/monitors", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
      });
      setMonitors((current) => editing ? current.map((item) => item.id === monitor.id ? monitor : item) : [monitor, ...current]);
      setNotice(`${monitor.name} ${editing ? "updated" : "added"}. Settings saved to the database.`);
      setEditing(null); setFormVersion((value) => value + 1);
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : "Unable to save monitor."); }
    finally { setBusy(false); }
  }

  async function toggle(monitor: Monitor) {
    setBusy(true); setError(""); setNotice("");
    try {
      const { monitor: updated } = await request<{ monitor: Monitor }>(`/api/monitors/${monitor.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !monitor.enabled }),
      });
      setMonitors((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (editing?.id === updated.id) { setEditing(updated); setFormVersion((value) => value + 1); }
      setNotice(`${updated.name} ${updated.enabled ? "enabled" : "paused"}.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to update monitor."); }
    finally { setBusy(false); }
  }

  async function remove(monitor: Monitor) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/monitors/${monitor.id}`, { method: "DELETE" });
      setMonitors((current) => current.filter((item) => item.id !== monitor.id));
      if (editing?.id === monitor.id) { setEditing(null); setFormVersion((value) => value + 1); }
      setDeleting(null); setNotice(`${monitor.name} deleted.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to delete monitor."); }
    finally { setBusy(false); }
  }

  const enabled = monitors.filter((item) => item.enabled).length;
  const visible = monitors.filter((item) =>
    (filter === "all" || (filter === "enabled" ? item.enabled : !item.enabled)) &&
    `${item.name} ${item.url}`.toLowerCase().includes(search.toLowerCase()),
  );

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Pulse home"><span className="brand-mark">∿</span> pulse<span className="brand-dot">.</span></Link>
      <div className="workspace"><span className="workspace-icon">P</span><div>Personal workspace<small>Local development</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <Link className="nav-item selected" href="/" aria-current="page"><span>◉</span> Monitors <span className="nav-count">{monitors.length}</span></Link>
      <div className="sidebar-foot"><span className="tiny-dot"/> PostgreSQL storage<p>Your endpoint settings,<br/>in one place.</p></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Workspace <span className="crumb">/</span> <strong>Monitors</strong></span><span className="local-tag">LOCAL WORKSPACE</span></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">YOUR API CONTROL ROOM</p><h1>Monitors</h1><p className="muted">One place for every endpoint you depend on.</p></div><button className="primary" onClick={() => openEditor(null)} disabled={busy || loading}>＋ Add monitor</button></div>
        <section className="setup-note"><span className="note-icon">i</span><div><strong>Settings ready. Checks come next.</strong><p>Manage your endpoints here. Automatic requests, uptime and response times will be added in the next part.</p></div><span className="step-tag">PART 02</span></section>
        <section className="stats" aria-label="Monitor summary">
          {[ ["Total monitors", monitors.length, "All your saved endpoints", "all"], ["Enabled", enabled, "Ready for scheduled checks", "enabled"], ["Paused", monitors.length - enabled, "Excluded from future checks", "paused"] ].map(([label, count, caption, value]) => <button key={String(label)} className={`stat ${filter === value ? "stat-selected" : ""}`} onClick={() => setFilter(String(value))} aria-pressed={filter === value}><span className="stat-label">{label}<span className={`stat-dot ${value}`}/></span><strong>{loading ? "—" : count}</strong><small>{caption}</small></button>)}
        </section>
        {error && <div className="message error" role="alert">{error} <button onClick={refresh} disabled={busy || loading}>Retry</button></div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        <div className="content-grid">
          <section className="panel monitors-panel" aria-labelledby="endpoints-title">
            <div className="panel-heading"><div><h2 id="endpoints-title">Your endpoints <span className="count">{monitors.length}</span></h2><p className="muted">Configure once. Keep everything in view.</p></div><button className="text-button" onClick={refresh} disabled={busy || loading}>{loading ? "Loading…" : "↻ Refresh"}</button></div>
            <div className="list-toolbar"><div className="filters" aria-label="Filter monitors">{["all", "enabled", "paused"].map((value) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All monitors" : value[0].toUpperCase() + value.slice(1)}</button>)}</div><input type="search" aria-label="Search monitors" placeholder="Search endpoints…" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
            <div aria-busy={loading}>
              {loading ? <div className="empty-state"><span className="empty-symbol">◌</span><h3>Loading your monitors</h3><p>Getting the latest settings from your database.</p></div> : !visible.length ? <div className="empty-state"><span className="empty-symbol">∿</span><h3>{monitors.length ? "No matching monitors" : error ? "Monitors unavailable" : "Your first monitor starts here"}</h3><p>{monitors.length ? "Try another search or choose a different filter." : error ? "Check the database connection and select Retry." : "Add an API endpoint using the form. Your settings will be saved for the first scheduled check."}</p>{!monitors.length && !error && <button className="secondary" onClick={() => openEditor(null)}>＋ Add your first monitor</button>}</div> : <ul className="monitor-list">{visible.map((monitor) => <li key={monitor.id} className="monitor-row">
                <div className="monitor-top"><span className={`endpoint-icon ${monitor.enabled ? "" : "paused"}`}>↗</span><div className="monitor-identity"><h3>{monitor.name}</h3><p className="endpoint-url" title={monitor.url}>{monitor.url}</p></div><span className={`badge ${monitor.enabled ? "enabled" : "paused"}`}><span/>{monitor.enabled ? "Enabled" : "Paused"}</span></div>
                <div className="monitor-details"><span className="method">{monitor.method}</span><span>Every <strong>{intervalLabel(monitor.interval_seconds)}</strong></span><span>Expects <strong>{monitor.expected_status}</strong></span><span>Timeout <strong>{monitor.timeout_ms / 1000}s</strong></span></div>
                <div className="monitor-bottom"><span className="awaiting">Scheduled checks not started</span><div className="row-actions"><button onClick={() => openEditor(monitor)} disabled={busy || loading} aria-label={`Edit ${monitor.name}`}>Edit</button><button onClick={() => toggle(monitor)} disabled={busy || loading} aria-label={`${monitor.enabled ? "Pause" : "Enable"} ${monitor.name}`}>{monitor.enabled ? "Pause" : "Enable"}</button><button className="danger-text" onClick={() => setDeleting(monitor.id)} disabled={busy || loading} aria-label={`Delete ${monitor.name}`}>Delete</button></div></div>
                {deleting === monitor.id && <div className="delete-confirm" role="alert"><p>Delete <strong>{monitor.name}</strong> and all its check history? This cannot be undone.</p><div><button className="secondary" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button><button className="danger" onClick={() => remove(monitor)} disabled={busy}>Confirm deletion</button></div></div>}
              </li>)}</ul>}
            </div>
            <div className="list-footer">{visible.length} of {monitors.length} monitors<span>Saved in PostgreSQL</span></div>
          </section>
          <section className="panel editor-panel" ref={editor} aria-labelledby="editor-title">
            <div className="panel-heading"><div><p className="eyebrow">{editing ? "MONITOR SETTINGS" : "GROW YOUR COVERAGE"}</p><h2 id="editor-title">{editing ? "Edit monitor" : "Add a monitor"}</h2></div><span className="editor-icon">{editing ? "↗" : "+"}</span></div>
            <form key={`${editing?.id ?? "new"}-${formVersion}`} onSubmit={save}>
              <fieldset disabled={busy || loading}><label htmlFor="monitor-name">Monitor name</label><input id="monitor-name" name="name" required maxLength={120} placeholder="e.g. Production API" defaultValue={editing?.name ?? ""}/>
                <label htmlFor="monitor-url">Endpoint URL</label><input id="monitor-url" type="url" name="url" required maxLength={2048} placeholder="https://api.example.com/health" defaultValue={editing?.url ?? ""}/><p className="field-hint">The HTTP or HTTPS endpoint you want to check.</p>
                <div className="form-pair"><div><label htmlFor="monitor-method">Method</label><select id="monitor-method" name="method" defaultValue={editing?.method ?? "GET"}><option>GET</option><option>HEAD</option></select></div><div><label htmlFor="monitor-status">Expected status</label><input id="monitor-status" name="expected_status" type="number" min={100} max={599} step={1} required defaultValue={editing?.expected_status ?? 200}/></div></div>
                <div className="form-pair"><div><label htmlFor="monitor-interval">Interval <span>(seconds)</span></label><input id="monitor-interval" name="interval_seconds" type="number" min={30} max={86400} step={1} required defaultValue={editing?.interval_seconds ?? 60}/></div><div><label htmlFor="monitor-timeout">Timeout <span>(ms)</span></label><input id="monitor-timeout" name="timeout_ms" type="number" min={100} max={60000} step={1} required defaultValue={editing?.timeout_ms ?? 10000}/></div></div><p className="field-hint">Interval: 30s–24h. Timeout: 100–60,000ms, up to the interval.</p>
                <label className="checkbox-label"><input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true}/><span>Enable this monitor<small>Include it when scheduled checks are available.</small></span></label>
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <button className="primary save-button" type="submit">{busy ? "Saving…" : editing ? "Save changes" : "＋ Create monitor"}</button>
                {editing && <button type="button" className="secondary cancel-edit" onClick={() => openEditor(null)}>Cancel editing</button>}
              </fieldset>
            </form><p className="editor-foot">Settings are stored persistently in your local database.</p>
          </section>
        </div>
        <footer className="page-footer"><span>pulse<span className="brand-dot">.</span></span><span>Know your endpoints. Build with confidence.</span></footer>
      </main>
    </div>
  </div>;
}
