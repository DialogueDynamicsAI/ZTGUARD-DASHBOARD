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

/* ─── Settings ──────────────────────────────────────────────────────────── */
async function initSettings() {
  try {
    const status = await api('/api/status');
    document.getElementById('cfg-api-url').textContent =
      (window.__ENV && window.__ENV.PANGOLIN_API_URL) || 'Set in .env file';
    document.getElementById('cfg-org-id').textContent =
      (window.__ENV && window.__ENV.PANGOLIN_ORG_ID) || 'Set in .env file';
    document.getElementById('cfg-api-key').textContent = '••••••••••••••••';
    document.getElementById('cfg-poll').textContent =
      (status.pollInterval || 30) + ' seconds';
  } catch (_) {}
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

/* ─── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(BASE, '').replace(/^\//, '') || 'dashboard';
  const page = PAGE_META[path] ? path : 'dashboard';
  initOrgs();
  navigate(page);
});
