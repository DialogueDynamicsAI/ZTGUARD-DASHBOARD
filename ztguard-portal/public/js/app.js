/* ─── ZTGuard Portal — Core App ─────────────────────────────────────────── */
const BASE = '/ztguard';

const PAGE_META = {
  'dashboard':        { title: 'Overview',            sub: 'ZTGuard Extended Settings Portal' },
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

/* ─── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(BASE, '').replace(/^\//, '') || 'dashboard';
  const page = PAGE_META[path] ? path : 'dashboard';
  navigate(page);
});
