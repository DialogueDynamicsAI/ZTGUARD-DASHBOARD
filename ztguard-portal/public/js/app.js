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
  'account':          { title: 'Account & Security',  sub: 'Password, two-factor authentication' },
  'security':         { title: 'Security',            sub: 'Pangolin access control — registration and signup settings' },
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
  if (page === 'account')          initAccount();
  if (page === 'security')         initSecurity();

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
              ZTGuard Sent
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

// ── Mail Log state ────────────────────────────────────────────────────────────
const _mailLog = { page: 1, perPage: 25, sort: 'id', dir: 'desc', search: '', status: '', tab: 'ztguard' };

async function loadMailLog() {
  const el = document.getElementById('mailLogZtguard');
  if (!el) return;
  const q = new URLSearchParams({
    page: _mailLog.page, per_page: _mailLog.perPage,
    sort: _mailLog.sort, dir: _mailLog.dir,
    search: _mailLog.search, status: _mailLog.status,
  });
  try {
    const r = await api(`/api/mail/log?${q}`);
    renderMailLog(r.logs || [], r.pagination || {});
  } catch (_) {}
}

function renderMailLog(logs, pg) {
  const el = document.getElementById('mailLogZtguard');
  if (!el) return;
  const total = pg.total || 0;
  const pages = pg.pages || 1;

  // Column sort helper
  const th = (col, label) => {
    const active = _mailLog.sort === col;
    const nextDir = active && _mailLog.dir === 'desc' ? 'asc' : 'desc';
    const arrow = active ? (_mailLog.dir === 'desc' ? ' ↓' : ' ↑') : '';
    return `<th onclick="mailLogSort('${col}','${nextDir}')" style="padding:10px 14px;text-align:left;color:${active?'#2563eb':'#374151'};font-weight:600;border-bottom:1px solid #e5e7eb;cursor:pointer;white-space:nowrap;user-select:none">${label}${arrow}</th>`;
  };

  const rows = logs.length ? logs.map(l => `
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:9px 14px;color:#6b7280;white-space:nowrap;font-size:12px">${l.sent_at}</td>
      <td style="padding:9px 14px;color:#111827;font-size:13px">${escHtml(l.recipient)}</td>
      <td style="padding:9px 14px;color:#374151;font-size:13px">${escHtml(l.subject||'')}</td>
      <td style="padding:9px 14px;color:#6b7280;font-size:12px">${escHtml(l.source||'')}</td>
      <td style="padding:9px 14px">
        <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          ${l.status==='sent'?'background:#dcfce7;color:#16a34a':'background:#fee2e2;color:#dc2626'}">
          ${l.status==='sent'?'✓ Sent':'✗ Failed'}
        </span>
        ${l.error?`<div style="font-size:11px;color:#dc2626;margin-top:2px">${escHtml(l.error)}</div>`:''}
      </td>
    </tr>`).join('') :
    `<tr><td colspan="5" style="padding:24px;text-align:center;color:#6b7280;font-size:13px">No emails found</td></tr>`;

  // Pagination controls
  const pageNums = [];
  for (let i = Math.max(1, _mailLog.page-2); i <= Math.min(pages, _mailLog.page+2); i++) pageNums.push(i);
  const pagBtns = pageNums.map(n =>
    `<button onclick="mailLogGoPage(${n})" style="min-width:32px;padding:4px 8px;border-radius:6px;border:1px solid ${n===_mailLog.page?'#2563eb':'#e5e7eb'};background:${n===_mailLog.page?'#2563eb':'white'};color:${n===_mailLog.page?'white':'#374151'};font-size:13px;cursor:pointer">${n}</button>`
  ).join('');

  el.innerHTML = `
    <!-- Filters bar -->
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
      <input class="form-input" type="search" id="mlSearch" value="${escHtml(_mailLog.search)}"
        placeholder="Search recipient, subject…" style="max-width:220px;height:32px;padding:4px 10px;font-size:13px"
        oninput="mailLogSearchDebounce(this.value)">
      <select id="mlStatusFilter" onchange="mailLogFilter()" style="height:32px;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#374151">
        <option value="" ${_mailLog.status===''?'selected':''}>All status</option>
        <option value="sent" ${_mailLog.status==='sent'?'selected':''}>Sent only</option>
        <option value="failed" ${_mailLog.status==='failed'?'selected':''}>Failed only</option>
      </select>
      <select id="mlPerPage" onchange="mailLogPerPage()" style="height:32px;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#374151">
        ${[10,25,50,100].map(n=>`<option value="${n}" ${_mailLog.perPage===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:12px;color:#6b7280">${total} total</span>
    </div>
    <!-- Table -->
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc">
          ${th('sent_at','Time')}${th('recipient','Recipient')}${th('subject','Subject')}${th('source','Source')}${th('status','Status')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <!-- Pagination -->
    ${pages > 1 ? `
    <div style="display:flex;align-items:center;gap:6px;padding:10px 14px;border-top:1px solid #e5e7eb;flex-wrap:wrap">
      <button onclick="mailLogGoPage(1)" ${_mailLog.page===1?'disabled':''} style="padding:4px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;font-size:13px;cursor:pointer;color:#374151">«</button>
      <button onclick="mailLogGoPage(${_mailLog.page-1})" ${_mailLog.page<=1?'disabled':''} style="padding:4px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;font-size:13px;cursor:pointer;color:#374151">‹</button>
      ${pagBtns}
      <button onclick="mailLogGoPage(${_mailLog.page+1})" ${_mailLog.page>=pages?'disabled':''} style="padding:4px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;font-size:13px;cursor:pointer;color:#374151">›</button>
      <button onclick="mailLogGoPage(${pages})" ${_mailLog.page===pages?'disabled':''} style="padding:4px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;font-size:13px;cursor:pointer;color:#374151">»</button>
      <span style="font-size:12px;color:#6b7280;margin-left:4px">Page ${_mailLog.page} of ${pages}</span>
    </div>` : ''}`;
}

let _mlSearchTimer;
function mailLogSearchDebounce(v) {
  clearTimeout(_mlSearchTimer);
  _mlSearchTimer = setTimeout(() => { _mailLog.search = v; _mailLog.page = 1; loadMailLog(); }, 300);
}
function mailLogFilter() {
  _mailLog.status = document.getElementById('mlStatusFilter')?.value || '';
  _mailLog.page = 1; loadMailLog();
}
function mailLogPerPage() {
  _mailLog.perPage = parseInt(document.getElementById('mlPerPage')?.value || '25');
  _mailLog.page = 1; loadMailLog();
}
function mailLogSort(col, dir) {
  _mailLog.sort = col; _mailLog.dir = dir; _mailLog.page = 1; loadMailLog();
}
function mailLogGoPage(n) { _mailLog.page = n; loadMailLog(); }

async function showMailTab(tab) {
  _mailLog.tab = tab;
  document.getElementById('mailLogZtguard').style.display = tab === 'ztguard' ? 'block' : 'none';
  document.getElementById('mailLogPangolin').style.display = tab === 'pangolin' ? 'block' : 'none';
  const tabStyle = (active) => active
    ? 'padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid #2563eb;color:#2563eb;cursor:pointer'
    : 'padding:10px 16px;font-size:13px;color:#6b7280;border:none;background:none;cursor:pointer';
  document.getElementById('mlTabZtguard').style.cssText  = tabStyle(tab === 'ztguard');
  document.getElementById('mlTabPangolin').style.cssText = tabStyle(tab === 'pangolin');
  if (tab === 'pangolin') {
    const el = document.getElementById('mailLogPangolin');
    el.innerHTML = `<div style="color:#6b7280;font-size:13px;padding:12px">Loading…</div>`;
    try {
      const r = await api('/api/mail/pangolin-log');
      el.innerHTML = r.lines?.length
        ? `<div style="font-family:monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;color:#111827;padding:12px">${r.lines.map(l => escHtml(l)).join('\n')}</div>`
        : `<div style="color:#6b7280;font-size:13px;padding:12px">No email-related entries in Pangolin logs yet.</div>`;
    } catch (e) { el.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:12px">${e.message}</div>`; }
  }
}

async function refreshMailLog() {
  await loadMailLog();
  if (_mailLog.tab === 'pangolin') showMailTab('pangolin');
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

/* ─── Account & Security ─────────────────────────────────────────────────── */
async function initAccount() {
  const page = document.getElementById('page-account');
  document.getElementById('topbarActions').innerHTML = '';
  page.innerHTML = `<div style="text-align:center;padding:60px"><div class="spinner"></div></div>`;

  let cfg = {};
  try { cfg = await api('/api/auth/admin-settings'); } catch (_) {}

  const methodOpts = [
    { val: 'totp',  label: 'Authenticator App (TOTP)' },
    { val: 'email', label: 'Email OTP' },
    { val: 'both',  label: 'Both — choose at login' },
  ].map(o => `<option value="${o.val}" ${cfg.twofa_method === o.val ? 'selected' : ''}>${o.label}</option>`).join('');

  page.innerHTML = `
    <div style="max-width:600px">

      <!-- Change Password -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Change Password</h3></div>
        <div class="card-body">
          <div id="pwStatus" style="margin-bottom:12px"></div>
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input class="form-input" type="password" id="pwCurrent" placeholder="Current password">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">New Password</label>
              <input class="form-input" type="password" id="pwNew" placeholder="Min. 8 characters">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Confirm New Password</label>
              <input class="form-input" type="password" id="pwConfirm" placeholder="Repeat new password">
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:14px" onclick="changePassword()">
            Update Password
          </button>
        </div>
      </div>

      <!-- Admin Email (for OTP + forgot password) -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Admin Email</h3></div>
        <div class="card-body">
          <div id="emailStatus" style="margin-bottom:12px"></div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input class="form-input" type="email" id="adminEmail" value="${escHtml(cfg.admin_email||'')}" placeholder="your@email.com">
            <div class="form-hint">Used for 2FA email OTP codes and password reset emails.</div>
          </div>
          <button class="btn btn-primary" onclick="saveAdminEmail()">Save Email</button>
        </div>
      </div>

      <!-- Two-Factor Authentication -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Two-Factor Authentication</h3>
          <span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;
            ${cfg.twofa_enabled ? 'background:#dcfce7;color:#16a34a' : 'background:#f1f5f9;color:#64748b'}">
            ${cfg.twofa_enabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>
        <div class="card-body">
          <div id="twofaStatus" style="margin-bottom:14px"></div>

          <div class="form-group">
            <label class="form-label">2FA Method</label>
            <select class="form-select" id="twofaMethod" onchange="saveAdminSettings()">${methodOpts}</select>
          </div>

          <!-- TOTP Setup -->
          <div id="totpSetupSection" style="${cfg.twofa_method === 'email' ? 'display:none' : ''}">
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:14px">
              <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px">
                Authenticator App Setup
                ${cfg.totp_confirmed ? '<span style="color:#16a34a;margin-left:8px">✓ Configured</span>' : ''}
              </div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:10px">
                Scan the QR code with Google Authenticator, Authy, or any TOTP app.
              </div>
              <button class="btn btn-secondary btn-sm" onclick="setupTotp()" id="setupTotpBtn">
                ${cfg.totp_confirmed ? 'Re-configure Authenticator' : 'Set Up Authenticator App'}
              </button>
              <div id="totpQrSection" style="display:none;margin-top:14px">
                <img id="totpQr" style="border:4px solid white;border-radius:8px;display:block;margin-bottom:12px">
                <div style="font-size:12px;color:#6b7280;margin-bottom:8px">
                  Manual key: <code id="totpSecret" style="font-size:11px"></code>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <input class="form-input" type="text" id="totpVerifyCode" placeholder="Enter 6-digit code to confirm"
                    style="max-width:200px;letter-spacing:3px;text-align:center">
                  <button class="btn btn-primary btn-sm" onclick="confirmTotp()">Confirm &amp; Enable</button>
                </div>
                <div id="totpVerifyStatus" style="margin-top:8px"></div>
              </div>
            </div>
          </div>

          <!-- Enable/Disable -->
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${cfg.twofa_enabled
              ? `<button class="btn btn-secondary" onclick="disable2fa()" style="border-color:#fca5a5;color:#dc2626">Disable 2FA</button>`
              : `<button class="btn btn-primary" onclick="enable2fa()">Enable 2FA</button>`
            }
            <button class="btn btn-secondary btn-sm" onclick="sendTestOtp()">Send Test Email OTP</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function changePassword() {
  const cur = document.getElementById('pwCurrent').value;
  const nw  = document.getElementById('pwNew').value;
  const cnf = document.getElementById('pwConfirm').value;
  const st  = document.getElementById('pwStatus');
  st.innerHTML = '';
  if (nw !== cnf) { st.innerHTML = `<div class="alert alert-error">Passwords do not match</div>`; return; }
  if (nw.length < 8) { st.innerHTML = `<div class="alert alert-error">Min. 8 characters</div>`; return; }
  try {
    await api('/api/auth/change-password', { method: 'POST', body: { current_password: cur, new_password: nw } });
    st.innerHTML = `<div class="alert alert-success">Password updated successfully</div>`;
    document.getElementById('pwCurrent').value = '';
    document.getElementById('pwNew').value = '';
    document.getElementById('pwConfirm').value = '';
    showToast('Password changed', 'success');
  } catch (e) { st.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function saveAdminEmail() {
  const email = document.getElementById('adminEmail').value.trim();
  const st = document.getElementById('emailStatus');
  try {
    await api('/api/auth/admin-settings', { method: 'POST', body: { admin_email: email } });
    st.innerHTML = `<div class="alert alert-success">Email saved</div>`;
    showToast('Email saved', 'success');
  } catch (e) { st.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function saveAdminSettings() {
  const method = document.getElementById('twofaMethod')?.value;
  const totpSection = document.getElementById('totpSetupSection');
  if (totpSection) totpSection.style.display = method === 'email' ? 'none' : 'block';
  try { await api('/api/auth/admin-settings', { method: 'POST', body: { twofa_method: method } }); } catch (_) {}
}

async function setupTotp() {
  const st = document.getElementById('twofaStatus');
  st.innerHTML = `<div class="alert alert-info">Generating QR code…</div>`;
  try {
    const r = await api('/api/auth/2fa/setup-totp', { method: 'POST' });
    st.innerHTML = '';
    document.getElementById('totpQr').src = r.qr;
    document.getElementById('totpSecret').textContent = r.secret;
    document.getElementById('totpQrSection').style.display = 'block';
    document.getElementById('totpVerifyCode').focus();
  } catch (e) { st.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function confirmTotp() {
  const code = document.getElementById('totpVerifyCode').value.trim();
  const st = document.getElementById('totpVerifyStatus');
  if (!code) { st.innerHTML = `<div class="alert alert-error">Enter the code from your app</div>`; return; }
  try {
    const r = await api('/api/auth/2fa/confirm-totp', { method: 'POST', body: { code } });
    st.innerHTML = `<div class="alert alert-success">${r.message}</div>`;
    showToast('TOTP 2FA enabled!', 'success');
    setTimeout(() => initAccount(), 1500);
  } catch (e) { st.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function enable2fa() {
  const method = document.getElementById('twofaMethod')?.value || 'totp';
  if (method === 'totp' || method === 'both') {
    const st = document.getElementById('twofaStatus');
    st.innerHTML = `<div class="alert alert-info">Scan the QR code to enable TOTP 2FA</div>`;
    await setupTotp();
  } else {
    try {
      await api('/api/auth/admin-settings', { method: 'POST', body: { twofa_method: 'email' } });
      // Enable by setting flag — email OTP doesn't need setup
      document.getElementById('twofaStatus').innerHTML =
        `<div class="alert alert-success">Email OTP 2FA enabled. Send a test email to verify.</div>`;
      setTimeout(() => initAccount(), 1500);
    } catch (e) {
      document.getElementById('twofaStatus').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    }
  }
}

async function disable2fa() {
  if (!confirm('Are you sure you want to disable 2FA?')) return;
  try {
    const r = await api('/api/auth/2fa/disable', { method: 'POST' });
    showToast(r.message, 'success');
    setTimeout(() => initAccount(), 800);
  } catch (e) { document.getElementById('twofaStatus').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function sendTestOtp() {
  const st = document.getElementById('twofaStatus');
  st.innerHTML = `<div class="alert alert-info">Sending OTP…</div>`;
  try {
    const r = await api('/api/auth/2fa/send-test-otp', { method: 'POST' });
    st.innerHTML = `
      <div class="alert alert-success" style="margin-bottom:10px">${r.message}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="form-input" type="text" id="testOtpInput"
          placeholder="Enter the 6-digit code from email"
          style="max-width:220px;letter-spacing:3px;text-align:center;font-size:18px"
          maxlength="6" autofocus>
        <button class="btn btn-primary btn-sm" onclick="verifyTestOtp()">Verify</button>
      </div>
      <div id="testOtpResult" style="margin-top:8px"></div>`;
    document.getElementById('testOtpInput')?.focus();
    showToast('OTP sent — check your email', 'success');
  } catch (e) { st.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function verifyTestOtp() {
  const code = document.getElementById('testOtpInput')?.value?.trim();
  const result = document.getElementById('testOtpResult');
  if (!code) { result.innerHTML = `<div class="alert alert-error">Enter the code</div>`; return; }
  try {
    const r = await api('/api/auth/2fa/verify-test-otp', { method: 'POST', body: { code } });
    result.innerHTML = `<div class="alert alert-success">${r.message}</div>`;
    showToast('Email OTP verified!', 'success');
  } catch (e) { result.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

/* ─── Security (Pangolin Access Control) ────────────────────────────────── */
async function initSecurity() {
  const page = document.getElementById('page-security');
  document.getElementById('topbarActions').innerHTML = '';
  page.innerHTML = `<div style="text-align:center;padding:60px"><div class="spinner"></div></div>`;

  let cfg = {};
  try { cfg = await api('/api/security'); } catch (_) {}

  const configMissing = cfg.configMissing;
  const signupDisabled = cfg.disable_signup_without_invite === true;

  page.innerHTML = `
    <div style="max-width:620px">

      <div class="card">
        <div class="card-header">
          <h3>Access Control</h3>
          <span style="font-size:11px;color:#64748b;font-weight:500">Server-wide &mdash; applies to all organizations</span>
        </div>
        <div class="card-body">

          ${configMissing ? `
            <div class="alert alert-error" style="margin-bottom:16px">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <div>
                <strong>Pangolin config.yml not found.</strong><br>
                The volume <code>/opt/pangolin/config:/app/pangolin-config</code> is not mounted.
                Re-run the ZTGuard installer or add the volume to <code>docker-compose.yml</code> manually and restart the portal.
              </div>
            </div>` : ''}

          <div id="securityStatus" style="margin-bottom:16px"></div>

          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:20px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
              <div style="flex:1">
                <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px">Disable public signup</div>
                <div style="font-size:12px;color:#6b7280;line-height:1.6">
                  When enabled, the <em>Create Account</em> page on the Pangolin dashboard is blocked.
                  New users can only be added by an admin or via an invite link.
                  Saves to <code>config.yml</code> and restarts Pangolin (~10s downtime).
                </div>
              </div>
              <div id="signupToggle" data-checked="${signupDisabled ? '1' : '0'}"
                onclick="${configMissing ? '' : 'toggleSignup()'}"
                style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-top:2px;cursor:${configMissing ? 'not-allowed' : 'pointer'}">
                <div style="position:absolute;inset:0;border-radius:24px;background:${signupDisabled ? '#2563eb' : '#d1d5db'};transition:background .2s" id="signupTrack"></div>
                <div style="position:absolute;left:${signupDisabled ? '22px' : '2px'};top:2px;width:20px;height:20px;background:white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:left .2s" id="signupThumb"></div>
              </div>
            </div>
            <div id="signupToggleState" style="margin-top:12px;font-size:12px;font-weight:600;${signupDisabled ? 'color:#16a34a' : 'color:#6b7280'}">
              ${signupDisabled ? '● Signup is DISABLED — users must be invited' : '○ Signup is ENABLED — anyone can self-register'}
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="saveSecuritySettings()" ${configMissing ? 'disabled' : ''}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
              Save &amp; Restart Pangolin
            </button>
            <span style="font-size:11px;color:#9ca3af">Pangolin will restart (~10s) to apply the change</span>
          </div>

        </div>
      </div>

    </div>`;
}

function toggleSignup() {
  const toggle = document.getElementById('signupToggle');
  const track  = document.getElementById('signupTrack');
  const thumb  = document.getElementById('signupThumb');
  const state  = document.getElementById('signupToggleState');
  if (!toggle) return;
  const nowChecked = toggle.dataset.checked !== '1';
  toggle.dataset.checked = nowChecked ? '1' : '0';
  if (track) track.style.background = nowChecked ? '#2563eb' : '#d1d5db';
  if (thumb) thumb.style.left = nowChecked ? '22px' : '2px';
  if (state) {
    state.textContent = nowChecked
      ? '● Signup is DISABLED — users must be invited'
      : '○ Signup is ENABLED — anyone can self-register';
    state.style.color = nowChecked ? '#16a34a' : '#6b7280';
  }
}

async function saveSecuritySettings() {
  const toggle   = document.getElementById('signupToggle');
  const statusEl = document.getElementById('securityStatus');
  if (!toggle) return;

  const disable = toggle.dataset.checked === '1';
  statusEl.innerHTML = `<div class="alert alert-info">Saving and restarting Pangolin…</div>`;

  try {
    const r = await api('/api/security', {
      method: 'POST',
      body: { disable_signup_without_invite: disable },
    });

    if (r.warning) {
      statusEl.innerHTML = `<div class="alert alert-info">${escHtml(r.warning)}</div>`;
      showToast('Settings saved (restart manually)', 'info');
    } else {
      statusEl.innerHTML = `<div class="alert alert-success">${escHtml(r.message)}</div>`;
      showToast(disable ? 'Public signup disabled' : 'Public signup enabled', 'success');
    }
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    showToast('Save failed: ' + err.message, 'error');
  }
}

/* ─── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(BASE, '').replace(/^\//, '') || 'dashboard';
  const page = PAGE_META[path] ? path : 'dashboard';
  initOrgs();
  navigate(page);
});
