/* ─── ZTGuard Portal — Core App ─────────────────────────────────────────── */
const BASE = '/ztguard';

const PAGE_META = {
  'dashboard':        { title: 'Overview',            sub: 'ZTGuard Extended Settings Portal' },
  'auth-activity':    { title: 'Authentication Activity', sub: 'Who accessed what, when — user billing count' },
  'alerting':         { title: 'Alerting',                sub: 'Alert rules, health checks, and notifications' },
  'event-streaming':  { title: 'Event Streaming',     sub: 'Forward log events to external destinations' },
  'delivery-history': { title: 'Delivery History',    sub: 'Event forwarding activity log' },
  'branding':         { title: 'Branding',            sub: 'Customize your Pangolin organization appearance' },
  'settings':         { title: 'Connection Settings', sub: 'Pangolin API configuration' },
  'mail-relay':       { title: 'Mail Relay',          sub: 'SMTP configuration for Pangolin email notifications' },
};

let currentPage = 'dashboard';

function navigate(page) {
  if (!PAGE_META[page]) return;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  const meta = PAGE_META[page];
  document.getElementById('topbarTitle').textContent = meta.title;
  document.getElementById('topbarSub').textContent = meta.sub;

  currentPage = page;

  // Clear topbar actions
  document.getElementById('topbarActions').innerHTML = '';

  // Fire page init
  if (page === 'dashboard')        initDashboard();
  if (page === 'auth-activity')    initAuthActivity();
  if (page === 'alerting')         initAlerting();
  if (page === 'event-streaming')  initEventStreaming();
  if (page === 'delivery-history') initDeliveryHistory();
  if (page === 'branding')         initBranding();
  if (page === 'settings')         initSettings();
  if (page === 'mail-relay')       initMailRelay();

  history.pushState({}, '', `${BASE}/${page === 'dashboard' ? '' : page}`);
}

function comingSoon(name) {
  showToast(`${name} is coming soon!`, 'info');
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
async function initDashboard() {
  try {
    const [status, histStats] = await Promise.all([
      api('/api/status'),
      api('/api/history/stats'),
    ]);

    document.getElementById('stat-destinations').textContent = status.activeDestinations ?? '0';
    document.getElementById('stat-delivered').textContent = histStats.total ?? '0';
    document.getElementById('stat-success').textContent =
      histStats.total > 0
        ? Math.round((histStats.success / histStats.total) * 100) + '%'
        : '—';
    document.getElementById('stat-poll').textContent = (status.pollInterval || 30) + 's';

    const statusPill = document.getElementById('apiStatus');
    statusPill.textContent = 'Connected';
    statusPill.className = 'pill pill-green';

    // Cursor table
    if (status.cursors && status.cursors.length) {
      const rows = status.cursors.map(c => `
        <tr>
          <td><span class="pill pill-blue">${c.log_type}</span></td>
          <td style="font-family:monospace;font-size:12px">${c.last_ts ? new Date(c.last_ts * 1000).toLocaleString() : 'Never'}</td>
          <td style="font-size:12px;color:#64748b">${c.updated_at || '—'}</td>
        </tr>
      `).join('');
      document.getElementById('cursorTable').innerHTML = `
        <table style="width:100%;margin-top:16px">
          <thead><tr>
            <th>Log Type</th><th>Last Polled</th><th>Updated</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }
  } catch (err) {
    const statusPill = document.getElementById('apiStatus');
    statusPill.textContent = 'Error';
    statusPill.className = 'pill pill-red';
  }
}

/* ─── Connection Settings ───────────────────────────────────────────────── */
async function initSettings() {
  const page = document.getElementById('page-settings');
  document.getElementById('topbarActions').innerHTML = '';
  page.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;

  let cfg = {};
  try { cfg = await api('/api/connection'); } catch (_) {}

  page.innerHTML = `
    <div class="card" style="max-width:640px">
      <div class="card-header"><h3>Pangolin API Connection</h3></div>
      <div class="card-body">

        <div id="connStatus" style="margin-bottom:16px"></div>

        <div class="form-group">
          <label class="form-label">Pangolin Server URL <span class="req">*</span></label>
          <input class="form-input" id="cfgUrl" value="${escHtml(cfg.pangolin_url||'')}" placeholder="https://your-pangolin.example.com">
          <div class="form-hint">The base URL of your Pangolin instance (no trailing slash).</div>
        </div>

        <div class="card" style="margin-bottom:16px;border-color:#bfdbfe;background:#eff6ff">
          <div class="card-header" style="background:transparent;border-color:#bfdbfe">
            <h3 style="color:#1e40af;font-size:13px">Auto-Discover (Recommended)</h3>
            <span style="font-size:11px;color:#64748b">Logs in to Pangolin and creates an API key automatically</span>
          </div>
          <div class="card-body" style="padding:14px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div class="form-group" style="margin:0">
                <label class="form-label">Admin Email</label>
                <input class="form-input" id="cfgEmail" type="email" placeholder="admin@example.com">
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Admin Password</label>
                <input class="form-input" id="cfgPassword" type="password" placeholder="••••••••">
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="discoverConnection()" id="discoverBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              Auto-Discover Orgs & Create API Key
            </button>
            <div id="discoverResult" style="margin-top:10px"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Organization ID <span class="req">*</span></label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="cfgOrgId" value="${escHtml(cfg.pangolin_org_id||'')}" placeholder="your-org-id" style="flex:1">
            <select class="form-select" id="cfgOrgSelect" onchange="document.getElementById('cfgOrgId').value=this.value" style="max-width:200px;display:none">
              <option value="">Select org…</option>
            </select>
          </div>
          <div class="form-hint">The org ID from your Pangolin dashboard URL (/org/YOUR-ORG-ID/).</div>
        </div>

        <div class="form-group">
          <label class="form-label">API Key <span class="req">*</span></label>
          <div style="position:relative">
            <input class="form-input" id="cfgApiKey" type="password" placeholder="${cfg.api_key_set ? cfg.api_key_preview : 'Paste API key or use Auto-Discover above'}" style="padding-right:80px">
            <button type="button" onclick="toggleApiKeyVis()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:11px;color:#64748b;font-family:inherit">Show</button>
          </div>
          <div class="form-hint">${cfg.api_key_set ? `Current key: <code>${cfg.api_key_preview}</code> — leave blank to keep existing.` : 'Create in Pangolin → Organization → API Keys, or use Auto-Discover.'}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Poll Interval (seconds)</label>
          <input class="form-input" id="cfgPoll" type="number" value="${cfg.poll_interval||30}" min="10" max="3600" style="max-width:140px">
          <div class="form-hint">How often to poll Pangolin logs for event streaming. Default: 30s.</div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-primary" onclick="saveConnectionSettings()">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Save Settings
          </button>
          <button class="btn btn-secondary" onclick="testConnectionSettings()">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Test Connection
          </button>
        </div>

      </div>
    </div>
  `;
}

function toggleApiKeyVis() {
  const inp = document.getElementById('cfgApiKey');
  const btn = inp?.nextElementSibling;
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

async function discoverConnection() {
  const server_url = document.getElementById('cfgUrl')?.value?.trim();
  const email = document.getElementById('cfgEmail')?.value?.trim();
  const password = document.getElementById('cfgPassword')?.value;
  const resultEl = document.getElementById('discoverResult');
  const btn = document.getElementById('discoverBtn');

  if (!server_url) { showToast('Enter Server URL first', 'error'); return; }
  if (!email || !password) { showToast('Enter admin email and password', 'error'); return; }

  btn.disabled = true; btn.textContent = 'Discovering…';
  resultEl.innerHTML = '';

  try {
    const r = await api('/api/connection/discover', {
      method: 'POST',
      body: { server_url, email, password },
    });

    // Populate org dropdown
    const orgs = r.orgs || [];
    const select = document.getElementById('cfgOrgSelect');
    if (orgs.length > 0 && select) {
      select.innerHTML = '<option value="">Select org…</option>' +
        orgs.map(o => `<option value="${escHtml(o.orgId)}">${escHtml(o.name)} (${escHtml(o.orgId)})</option>`).join('');
      select.style.display = 'block';
      if (orgs.length === 1) {
        document.getElementById('cfgOrgId').value = orgs[0].orgId;
        select.value = orgs[0].orgId;
      }
    }

    // Auto-fill API key
    if (r.api_key) {
      const keyInput = document.getElementById('cfgApiKey');
      if (keyInput) { keyInput.value = r.api_key; keyInput.type = 'text'; }
    }

    resultEl.innerHTML = `<div class="alert alert-success"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${r.message}</div>`;
  } catch (err) {
    // If CSRF blocks auto-discover, show clear manual instructions
    const isManual = err.manual || (err.message && err.message.includes('CSRF'));
    if (isManual) {
      resultEl.innerHTML = `
        <div class="alert alert-info" style="text-align:left">
          <strong>Generate API Key manually:</strong><br>
          <ol style="margin:8px 0 0 16px;padding:0;font-size:12px;line-height:1.8">
            <li>Open Pangolin → <strong>Organization → API Keys</strong></li>
            <li>Click <strong>Generate API Key</strong></li>
            <li>Copy the key (format: <code>id.secret</code>)</li>
            <li>Paste it in the <strong>API Key</strong> field below</li>
          </ol>
        </div>`;
    } else {
      resultEl.innerHTML = `<div class="alert alert-error"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>${err.message}</div>`;
    }
  } finally {
    btn.disabled = false; btn.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Auto-Discover Orgs &amp; Create API Key';
  }
}

async function saveConnectionSettings() {
  const payload = {
    pangolin_url:    document.getElementById('cfgUrl')?.value?.trim(),
    pangolin_org_id: document.getElementById('cfgOrgId')?.value?.trim(),
    poll_interval:   document.getElementById('cfgPoll')?.value,
  };
  const apiKeyVal = document.getElementById('cfgApiKey')?.value?.trim();
  if (apiKeyVal) payload.pangolin_api_key = apiKeyVal;

  if (!payload.pangolin_url) { showToast('Server URL is required', 'error'); return; }
  if (!payload.pangolin_org_id) { showToast('Org ID is required', 'error'); return; }

  try {
    await api('/api/connection', { method: 'POST', body: payload });
    showToast('Connection settings saved', 'success');
    document.getElementById('cfgPassword').value = '';
    await initSettings();
  } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
}

async function testConnectionSettings() {
  const statusEl = document.getElementById('connStatus');
  if (statusEl) statusEl.innerHTML = '<div class="alert alert-info">Testing connection…</div>';
  try {
    // Save current form values first
    const payload = {
      pangolin_url:    document.getElementById('cfgUrl')?.value?.trim(),
      pangolin_org_id: document.getElementById('cfgOrgId')?.value?.trim(),
    };
    const apiKeyVal = document.getElementById('cfgApiKey')?.value?.trim();
    if (apiKeyVal) payload.pangolin_api_key = apiKeyVal;
    if (payload.pangolin_url) await api('/api/connection', { method: 'POST', body: payload });

    const r = await api('/api/connection/test', { method: 'POST' });
    if (r.ok) {
      if (statusEl) statusEl.innerHTML = `<div class="alert alert-success"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${r.message}</div>`;
    } else {
      if (statusEl) statusEl.innerHTML = `<div class="alert alert-error"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>${r.error}</div>`;
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<div class="alert alert-error">Test failed: ${err.message}</div>`;
  }
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Auth ──────────────────────────────────────────────────────────────── */
async function logout() {
  try {
    await fetch(`${BASE}/logout`, { method: 'POST' });
  } finally {
    window.location.href = `${BASE}/login`;
  }
}

/* ─── API helper ────────────────────────────────────────────────────────── */
async function api(path, options = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (resp.status === 401) {
    window.location.href = `${BASE}/login`;
    throw new Error('Unauthorized');
  }
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || data.errors?.join(', ') || 'Request failed');
  return data;
}

/* ─── Toast ─────────────────────────────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, duration);
  setTimeout(() => el.remove(), duration + 350);
}

/* ─── Modal helpers ─────────────────────────────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}
function onModalOverlayClick(e, id) {
  if (e.target.id === id) closeModal(id);
}

/* ─── Org Switcher ──────────────────────────────────────────────────────── */
let orgs = [];
let activeOrgId = null;

async function initOrgs() {
  try {
    const [orgList, active] = await Promise.all([
      fetch(`${BASE}/api/orgs`, { headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
      fetch(`${BASE}/api/orgs/active`, { headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
    ]);
    orgs = orgList;
    activeOrgId = active.orgId;

    const nameEl = document.getElementById('activeOrgName');
    if (nameEl) nameEl.textContent = active.name || active.orgId;

    const items = document.getElementById('orgMenuItems');
    if (items) {
      items.innerHTML = orgs.map(o => `
        <button onclick="switchOrg('${o.orgId}')"
          style="width:100%;background:${o.orgId === activeOrgId ? 'rgba(16,185,129,0.1)' : 'transparent'};border:none;padding:9px 14px;text-align:left;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;transition:background .1s">
          <div style="width:6px;height:6px;border-radius:50%;background:${o.orgId === activeOrgId ? '#10b981' : 'rgba(255,255,255,0.2)'};flex-shrink:0"></div>
          <span style="font-size:12px;font-weight:${o.orgId === activeOrgId ? '700' : '500'};color:${o.orgId === activeOrgId ? '#10b981' : 'rgba(255,255,255,0.7)'}">${o.name || o.orgId}</span>
          ${o.orgId === activeOrgId ? '<span style="margin-left:auto;font-size:10px;color:#10b981">active</span>' : ''}
        </button>
      `).join('');
    }
  } catch (err) {
    console.warn('[orgs] Failed to load orgs:', err.message);
  }
}

function toggleOrgMenu() {
  const menu = document.getElementById('orgMenu');
  const chevron = document.getElementById('orgChevron');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function switchOrg(orgId) {
  if (orgId === activeOrgId) { toggleOrgMenu(); return; }
  try {
    const r = await fetch(`${BASE}/api/orgs/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const data = await r.json();
    if (data.ok) {
      showToast(`Switched to org: ${orgId}`, 'success');
      toggleOrgMenu();
      activeOrgId = orgId;
      await initOrgs();
      // Reload current page data
      navigate(currentPage);
    }
  } catch (err) {
    showToast('Failed to switch org: ' + err.message, 'error');
  }
}

// Close org menu when clicking outside
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('orgSwitcherWrap');
  if (wrap && !wrap.contains(e.target)) {
    const menu = document.getElementById('orgMenu');
    const chevron = document.getElementById('orgChevron');
    if (menu) menu.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  }
});

/* ─── Mail Relay ─────────────────────────────────────────────────────────── */
async function initMailRelay() {
  const page = document.getElementById('page-mail-relay');
  document.getElementById('topbarActions').innerHTML = '';
  page.innerHTML = `<div style="text-align:center;padding:60px"><div class="spinner"></div></div>`;

  let cfg = {};
  try { cfg = await api('/api/mail'); } catch (_) {}

  const tlsOpts = [
    { val: 'starttls', label: 'STARTTLS (port 587 — recommended)' },
    { val: 'ssl',      label: 'SSL/TLS (port 465)' },
    { val: 'none',     label: 'None / plain (not recommended)' },
  ];
  const tlsSelect = tlsOpts.map(o =>
    `<option value="${o.val}" ${cfg.smtp_tls === o.val ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  page.innerHTML = `
    <div style="max-width:640px">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>SMTP Relay Configuration</h3></div>
        <div class="card-body">
          <div id="mailStatus" style="margin-bottom:16px"></div>

          <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;margin-bottom:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">SMTP Host <span class="req">*</span></label>
              <input class="form-input" id="mlHost" value="${escHtml(cfg.smtp_host||'')}" placeholder="relay.vpdc.ca">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Port</label>
              <input class="form-input" id="mlPort" type="number" value="${escHtml(cfg.smtp_port||'587')}" placeholder="587">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Security</label>
            <select class="form-select" id="mlTls">${tlsSelect}</select>
          </div>

          <div class="form-group">
            <label class="form-label">From Address <span class="req">*</span></label>
            <input class="form-input" id="mlFrom" value="${escHtml(cfg.smtp_from||'')}" placeholder="noreply@yourdomain.com">
            <div class="form-hint">Shown as the sender in Pangolin notification emails.</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">SMTP Username</label>
              <input class="form-input" id="mlUser" value="${escHtml(cfg.smtp_user||'')}" placeholder="user@example.com">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">SMTP Password</label>
              <input class="form-input" id="mlPass" type="password" placeholder="${cfg.smtp_pass_set ? '(saved — leave blank to keep)' : 'Enter password'}">
            </div>
          </div>

          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="mlEnabled" ${cfg.smtp_enabled ? 'checked' : ''} style="width:16px;height:16px">
              <span class="form-label" style="margin:0">Enable email (writes to Pangolin config.yml)</span>
            </label>
            <div class="form-hint">When enabled, SMTP settings are written to Pangolin's config file. Restart Pangolin to apply.</div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
            <button class="btn btn-primary" onclick="saveMailRelay()">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
              Save Settings
            </button>
            <button class="btn btn-secondary" onclick="sendTestEmail()">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              Send Test Email
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Apply to Pangolin</h3></div>
        <div class="card-body">
          <p style="font-size:13px;color:#6b7280;margin:0 0 12px">
            After saving SMTP settings, restart Pangolin to pick up the changes. Pangolin will be briefly unavailable (~10s).
          </p>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary" onclick="restartPangolin()" id="restartBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Apply &amp; Restart Pangolin
            </button>
            <div id="restartStatus"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Mail Activity Log</h3>
          <button class="btn btn-secondary btn-sm" onclick="refreshMailLog()">Refresh</button>
        </div>
        <div class="card-body" style="padding:0">
          <div id="mailLogTabs" style="display:flex;gap:0;border-bottom:1px solid #e5e7eb">
            <button id="mlTabZtguard" onclick="showMailTab('ztguard')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid #2563eb;color:#2563eb;cursor:pointer">
              ZTGuard Sent (${mailLogData ? mailLogData.length : 0})
            </button>
            <button id="mlTabPangolin" onclick="showMailTab('pangolin')" style="padding:10px 16px;font-size:13px;color:#6b7280;border:none;background:none;cursor:pointer">
              Pangolin Email Activity
            </button>
          </div>
          <div id="mailLogZtguard" style="overflow-x:auto"></div>
          <div id="mailLogPangolin" style="display:none;padding:12px"></div>
        </div>
      </div>
    </div>`;

  // Load log data
  loadMailLog();
}

let mailLogData = [];
let activMailTab = 'ztguard';

async function loadMailLog() {
  try {
    const r = await api('/api/mail/log');
    mailLogData = r.logs || [];
    renderMailLog(mailLogData);
    // Update tab count
    const tab = document.getElementById('mlTabZtguard');
    if (tab) tab.textContent = `ZTGuard Sent (${mailLogData.length})`;
  } catch (_) {}
}

function renderMailLog(logs) {
  const el = document.getElementById('mailLogZtguard');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px">No emails sent yet. Use "Send Test Email" to verify SMTP.</div>`;
    return;
  }
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Time</th>
          <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Recipient</th>
          <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Subject</th>
          <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Source</th>
          <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Status</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(l => `
          <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:9px 14px;color:#6b7280;white-space:nowrap">${l.sent_at}</td>
            <td style="padding:9px 14px;color:#111827">${escHtml(l.recipient)}</td>
            <td style="padding:9px 14px;color:#374151">${escHtml(l.subject || '')}</td>
            <td style="padding:9px 14px;color:#6b7280">${escHtml(l.source || '')}</td>
            <td style="padding:9px 14px">
              <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;${l.status === 'sent' ? 'background:#dcfce7;color:#16a34a' : 'background:#fee2e2;color:#dc2626'}">
                ${l.status === 'sent' ? '✓ Sent' : '✗ Failed'}
              </span>
              ${l.error ? `<div style="font-size:11px;color:#dc2626;margin-top:2px">${escHtml(l.error)}</div>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function showMailTab(tab) {
  activMailTab = tab;
  document.getElementById('mailLogZtguard').style.display = tab === 'ztguard' ? 'block' : 'none';
  document.getElementById('mailLogPangolin').style.display = tab === 'pangolin' ? 'block' : 'none';
  document.getElementById('mlTabZtguard').style.cssText = tab === 'ztguard'
    ? 'padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid #2563eb;color:#2563eb;cursor:pointer'
    : 'padding:10px 16px;font-size:13px;color:#6b7280;border:none;background:none;cursor:pointer';
  document.getElementById('mlTabPangolin').style.cssText = tab === 'pangolin'
    ? 'padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid #2563eb;color:#2563eb;cursor:pointer'
    : 'padding:10px 16px;font-size:13px;color:#6b7280;border:none;background:none;cursor:pointer';

  if (tab === 'pangolin') {
    const el = document.getElementById('mailLogPangolin');
    el.innerHTML = `<div style="color:#6b7280;font-size:13px">Loading Pangolin email activity…</div>`;
    try {
      const r = await api('/api/mail/pangolin-log');
      if (!r.lines || !r.lines.length) {
        el.innerHTML = `<div style="color:#6b7280;font-size:13px">No email-related entries found in Pangolin logs. Emails are logged when Pangolin sends password resets, invitations, or alerts.</div>`;
      } else {
        el.innerHTML = `<div style="font-family:monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;color:#111827">${r.lines.map(l => escHtml(l)).join('\n')}</div>`;
      }
    } catch (e) {
      el.innerHTML = `<div style="color:#dc2626;font-size:13px">${e.message}</div>`;
    }
  }
}

async function refreshMailLog() {
  await loadMailLog();
  if (activMailTab === 'pangolin') showMailTab('pangolin');
  showToast('Mail log refreshed', 'info');
}

async function saveMailRelay() {
  const payload = {
    smtp_host:    document.getElementById('mlHost')?.value?.trim(),
    smtp_port:    document.getElementById('mlPort')?.value?.trim(),
    smtp_from:    document.getElementById('mlFrom')?.value?.trim(),
    smtp_user:    document.getElementById('mlUser')?.value?.trim(),
    smtp_pass:    document.getElementById('mlPass')?.value,
    smtp_tls:     document.getElementById('mlTls')?.value,
    smtp_enabled: document.getElementById('mlEnabled')?.checked,
  };

  const statusEl = document.getElementById('mailStatus');
  try {
    const r = await api('/api/mail', { method: 'POST', body: payload });
    const msg = r.pangolin_config_written
      ? 'Settings saved and written to Pangolin config.yml. Restart Pangolin to apply.'
      : 'Settings saved. (Pangolin config.yml not mounted — will apply on next install.)';
    statusEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    showToast('Mail settings saved', 'success');
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function sendTestEmail() {
  const to = prompt('Send test email to:', 'jamielove069@gmail.com');
  if (!to) return;

  const statusEl = document.getElementById('mailStatus');
  statusEl.innerHTML = `<div class="alert alert-info">Sending test email to ${escHtml(to)}…</div>`;

  try {
    const r = await api('/api/mail/test', { method: 'POST', body: { to } });
    statusEl.innerHTML = `<div class="alert alert-success">${r.message}</div>`;
    showToast('Test email sent!', 'success');
    await loadMailLog();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">Failed: ${err.message}</div>`;
    await loadMailLog();
  }
}

async function restartPangolin() {
  const btn = document.getElementById('restartBtn');
  const statusEl = document.getElementById('restartStatus');
  btn.disabled = true;
  btn.textContent = 'Restarting…';
  statusEl.innerHTML = `<span style="color:#6b7280;font-size:13px">Sending restart command…</span>`;

  try {
    const r = await api('/api/mail/restart', { method: 'POST' });
    statusEl.innerHTML = `<span style="color:#16a34a;font-size:13px">✓ ${r.message}</span>`;
    showToast('Pangolin restarted', 'success');
  } catch (err) {
    statusEl.innerHTML = `<span style="color:#dc2626;font-size:13px">${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Apply &amp; Restart Pangolin`;
  }
}

/* ─── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(BASE, '').replace(/^\//, '') || 'dashboard';
  const page = PAGE_META[path] ? path : 'dashboard';
  initOrgs();
  navigate(page);
});
