/* ─── Authentication Activity Page ─────────────────────────────────────── */

let activityView = 'overview'; // 'overview' | 'users' | 'log' | 'network' | 'sessions' | 'retention'
let selectedUser = null;

async function initAuthActivity() {
  const page = document.getElementById('page-auth-activity');

  // Topbar actions
  document.getElementById('topbarActions').innerHTML = `
    <div style="display:flex;gap:6px">
      <button class="btn btn-secondary btn-sm ${activityView==='users'?'':'btn-ghost'}" onclick="switchActivityView('users')">Users</button>
      <button class="btn btn-secondary btn-sm ${activityView==='log'?'':'btn-ghost'}" onclick="switchActivityView('log')">Access Log</button>
      <button class="btn btn-secondary btn-sm ${activityView==='sessions'?'':'btn-ghost'}" onclick="switchActivityView('sessions')">Sessions</button>
    </div>
  `;

  page.innerHTML = `<div style="text-align:center;padding:60px"><div class="spinner"></div></div>`;

  try {
    const stats = await api('/api/activity/stats');
    renderActivityPage(stats);
  } catch (err) {
    page.innerHTML = `
      <div class="alert alert-error">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        ${err.message === 'Pangolin database not found at /app/pangolin-db/db.sqlite'
          ? 'Pangolin database not mounted. Redeploy the portal with the updated docker-compose.yml.'
          : 'Failed to load activity data: ' + err.message}
      </div>`;
  }
}

function switchActivityView(view) {
  activityView = view;
  selectedUser = null;
  initAuthActivity();
}

function renderActivityPage(stats) {
  const page = document.getElementById('page-auth-activity');

  const statCards = `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card" style="border-top:3px solid #2563eb">
        <div class="stat-label">Authenticated Users</div>
        <div class="stat-value" style="color:#2563eb">${stats.totalAuthenticatedUsers}</div>
        <div class="stat-hint">Unique users — invoice basis</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #10b981">
        <div class="stat-label">Access Events Today</div>
        <div class="stat-value">${stats.todayAccessEvents}</div>
        <div class="stat-hint">Last 24 hours</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #ef4444">
        <div class="stat-label">Denied Today</div>
        <div class="stat-value" style="color:${stats.todayDenied>0?'#ef4444':'#64748b'}">${stats.todayDenied}</div>
        <div class="stat-hint">Blocked requests today</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #f59e0b">
        <div class="stat-label">Active Sessions</div>
        <div class="stat-value">${stats.activeSessions}</div>
        <div class="stat-hint">Currently valid sessions</div>
      </div>
    </div>
  `;

  // View toggle tabs
  const tabs = `
    <div style="display:flex;gap:2px;background:#f1f5f9;padding:4px;border-radius:10px;margin-bottom:20px;width:fit-content;flex-wrap:wrap">
      ${[['overview','Overview'],['users','Users'],['log','Access Log'],['network','Network Logs'],['sessions','Sessions'],['retention','Log Retention']].map(([v,l]) =>
        `<button onclick="switchActivityView('${v}')" style="padding:7px 18px;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;background:${activityView===v?'#fff':'transparent'};color:${activityView===v?'#0f172a':'#64748b'};box-shadow:${activityView===v?'0 1px 3px rgba(0,0,0,0.1)':'none'}">${l}</button>`
      ).join('')}
    </div>
  `;

  page.innerHTML = statCards + tabs + `<div id="activityContent"></div>`;
  loadActivityView();
}

async function loadActivityView() {
  const content = document.getElementById('activityContent');
  if (!content) return;
  content.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;

  try {
    if (activityView === 'overview') await renderOverviewCharts(content);
    else if (activityView === 'users') await renderUsersView(content);
    else if (activityView === 'log') await renderLogView(content);
    else if (activityView === 'network') await renderNetworkView(content);
    else if (activityView === 'sessions') await renderSessionsView(content);
    else if (activityView === 'retention') await renderRetentionView(content);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">Failed: ${err.message}</div>`;
  }
}

/* ─── Users View ─────────────────────────────────────────────────────────── */
async function renderUsersView(container) {
  const data = await api('/api/activity/users?limit=100');

  if (data.users.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-title">No Authenticated Users Yet</div>
      <div class="empty-sub">Users will appear here once they access a protected resource.</div>
    </div>`;
    return;
  }

  const rows = data.users.map(u => `
    <tr onclick="filterByUser('${escHtml(u.email)}')" style="cursor:pointer">
      <td>
        <div style="font-weight:600;font-size:13px">${escHtml(u.email)}</div>
        <div style="font-size:11px;color:#94a3b8">${u.ips.join(', ')}</div>
      </td>
      <td style="font-size:13px">${new Date(u.lastSeen).toLocaleString()}</td>
      <td style="font-size:13px">${new Date(u.firstSeen).toLocaleDateString()}</td>
      <td><span class="pill pill-green">${u.allowed}</span></td>
      <td><span class="pill ${u.denied>0?'pill-red':'pill-gray'}">${u.denied}</span></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();confirmBlock('${escHtml(u.email)}')" title="Revoke access">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
          </svg>
          Block
        </button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Authenticated Users <span class="pill pill-blue" style="margin-left:8px">${data.total} total</span></h3>
        <span style="font-size:12px;color:#64748b">Click a row to filter access log by user</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Email</th><th>Last Seen</th><th>First Seen</th>
            <th>Allowed</th><th>Denied</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ─── Log View — with pagination, sorting, filtering, search ─────────────── */
let logAllItems = [];
let logPage = 1;
let logPageSize = 25;
let logSortCol = 'time';
let logSortDir = 'desc';
let logSearch = '';
let logResultFilter = 'all'; // 'all' | 'allowed' | 'denied'

async function renderLogView(container) {
  // Fetch up to 2000 events for client-side handling
  const url = selectedUser
    ? `/api/activity/log?limit=2000&user=${encodeURIComponent(selectedUser)}`
    : '/api/activity/log?limit=2000';
  const data = await api(url);
  logAllItems = data.items || [];
  logPage = 1;
  renderLogTable(container);
}

function renderLogTable(container) {
  // --- Filter ---
  let items = logAllItems.slice();
  if (logSearch.trim()) {
    const q = logSearch.trim().toLowerCase();
    items = items.filter(r =>
      (r.actor||'').toLowerCase().includes(q) ||
      (r.ip||'').toLowerCase().includes(q) ||
      (r.path||'').toLowerCase().includes(q) ||
      (r.actorType||'').toLowerCase().includes(q)
    );
  }
  if (logResultFilter === 'allowed') items = items.filter(r => r.allowed);
  if (logResultFilter === 'denied')  items = items.filter(r => !r.allowed);

  // --- Sort ---
  const dir = logSortDir === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    let av, bv;
    switch (logSortCol) {
      case 'time':   av = a.timestamp || 0; bv = b.timestamp || 0; break;
      case 'result': av = a.allowed ? 1 : 0; bv = b.allowed ? 1 : 0; break;
      case 'user':   av = (a.actor||'').toLowerCase(); bv = (b.actor||'').toLowerCase(); break;
      case 'ip':     av = a.ip||''; bv = b.ip||''; break;
      case 'path':   av = a.path||''; bv = b.path||''; break;
      default:       av = 0; bv = 0;
    }
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  // --- Paginate ---
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / logPageSize));
  if (logPage > totalPages) logPage = totalPages;
  const start = (logPage - 1) * logPageSize;
  const pageItems = items.slice(start, start + logPageSize);

  const sortIcon = (col) => {
    if (logSortCol !== col) return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;opacity:0.3;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>`;
    return logSortDir === 'asc'
      ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;color:#2563eb;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>`
      : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;color:#2563eb;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>`;
  };

  const thStyle = `cursor:pointer;user-select:none;white-space:nowrap`;

  const rows = pageItems.length === 0 ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:32px">No matching events</td></tr>` :
    pageItems.map(r => `
      <tr>
        <td style="font-size:12px;color:#64748b;white-space:nowrap">${new Date(r.time).toLocaleString()}</td>
        <td><span class="pill ${r.allowed?'pill-green':'pill-red'}">${r.allowed?'ALLOWED':'DENIED'}</span></td>
        <td style="font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.actor||'')}">
          ${r.actor ? `<span onclick="filterByUser('${escHtml(r.actor)}')" style="cursor:pointer;color:#2563eb;text-decoration:underline dotted">${escHtml(r.actor)}</span>` : `<span style="color:#94a3b8">${r.actorType||'anon'}</span>`}
        </td>
        <td style="font-size:12px;color:#64748b;white-space:nowrap">${r.ip||'—'}</td>
        <td style="font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.path||'')}">
          ${escHtml((r.path||'').length > 60 ? (r.path||'').slice(0,60)+'…' : (r.path||''))}
        </td>
      </tr>
    `).join('');

  // Pagination buttons
  const pageNums = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= logPage - 2 && p <= logPage + 2)) {
      pageNums.push(p);
    } else if (p === logPage - 3 || p === logPage + 3) {
      pageNums.push('…');
    }
  }
  const paginationHtml = totalPages <= 1 ? '' : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid #e2e8f0;background:#f8fafc">
      <div style="font-size:12px;color:#64748b">
        Showing ${start+1}–${Math.min(start+logPageSize, total)} of <strong>${total}</strong>
        ${logAllItems.length > total ? ` (filtered from ${logAllItems.length})` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <button onclick="logGoPage(${logPage-1})" ${logPage===1?'disabled':''} class="btn btn-secondary btn-sm" style="padding:4px 8px">&lsaquo;</button>
        ${[...new Set(pageNums)].map(p => p === '…'
          ? `<span style="padding:4px 6px;color:#94a3b8;font-size:12px">…</span>`
          : `<button onclick="logGoPage(${p})" class="btn btn-sm" style="padding:4px 10px;${p===logPage?'background:#2563eb;color:#fff;border-color:#2563eb':'background:#fff;border-color:#e2e8f0;color:#374151'}">${p}</button>`
        ).join('')}
        <button onclick="logGoPage(${logPage+1})" ${logPage===totalPages?'disabled':''} class="btn btn-secondary btn-sm" style="padding:4px 8px">&rsaquo;</button>
      </div>
    </div>
  `;

  const filterBanner = selectedUser ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
      <span style="font-size:13px;color:#1e40af">Filtered by user: <strong>${escHtml(selectedUser)}</strong></span>
      <button class="btn btn-ghost btn-sm" onclick="selectedUser=null;renderLogTable(document.getElementById('activityContent'))">Clear</button>
    </div>
  ` : '';

  container.innerHTML = filterBanner + `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:10px">
        <h3>Access Log <span class="pill pill-blue" style="margin-left:6px">${logAllItems.length} total</span></h3>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <!-- Search -->
          <div style="position:relative">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#94a3b8"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" id="logSearchInput" value="${escHtml(logSearch)}" placeholder="Search user, IP, path…"
              oninput="logSearch=this.value;logPage=1;renderLogTable(document.getElementById('activityContent'))"
              style="padding:6px 10px 6px 28px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;width:200px;font-family:inherit;outline:none">
          </div>
          <!-- Result filter -->
          <select onchange="logResultFilter=this.value;logPage=1;renderLogTable(document.getElementById('activityContent'))"
            style="padding:6px 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;font-family:inherit;outline:none;background:#fff">
            <option value="all" ${logResultFilter==='all'?'selected':''}>All results</option>
            <option value="allowed" ${logResultFilter==='allowed'?'selected':''}>Allowed only</option>
            <option value="denied" ${logResultFilter==='denied'?'selected':''}>Denied only</option>
          </select>
          <!-- Per page -->
          <select onchange="logPageSize=parseInt(this.value);logPage=1;renderLogTable(document.getElementById('activityContent'))"
            style="padding:6px 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;font-family:inherit;outline:none;background:#fff">
            <option value="10" ${logPageSize===10?'selected':''}>10 / page</option>
            <option value="25" ${logPageSize===25?'selected':''}>25 / page</option>
            <option value="50" ${logPageSize===50?'selected':''}>50 / page</option>
            <option value="100" ${logPageSize===100?'selected':''}>100 / page</option>
          </select>
          ${logSearch||logResultFilter!=='all' ? `<button class="btn btn-ghost btn-sm" onclick="logSearch='';logResultFilter='all';document.getElementById('logSearchInput').value='';logPage=1;renderLogTable(document.getElementById('activityContent'))">Clear filters</button>` : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="${thStyle}" onclick="logSortBy('time')">Time ${sortIcon('time')}</th>
            <th style="${thStyle}" onclick="logSortBy('result')">Result ${sortIcon('result')}</th>
            <th style="${thStyle}" onclick="logSortBy('user')">User / Type ${sortIcon('user')}</th>
            <th style="${thStyle}" onclick="logSortBy('ip')">IP ${sortIcon('ip')}</th>
            <th style="${thStyle}" onclick="logSortBy('path')">Path ${sortIcon('path')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${paginationHtml}
    </div>
  `;
}

function logSortBy(col) {
  if (logSortCol === col) logSortDir = logSortDir === 'asc' ? 'desc' : 'asc';
  else { logSortCol = col; logSortDir = col === 'time' ? 'desc' : 'asc'; }
  logPage = 1;
  renderLogTable(document.getElementById('activityContent'));
}

function logGoPage(p) {
  const total = Math.max(1, Math.ceil(
    (logAllItems.filter(r => {
      if (logSearch.trim()) {
        const q = logSearch.trim().toLowerCase();
        if (!(r.actor||'').toLowerCase().includes(q) && !(r.ip||'').toLowerCase().includes(q) && !(r.path||'').toLowerCase().includes(q)) return false;
      }
      if (logResultFilter === 'allowed' && !r.allowed) return false;
      if (logResultFilter === 'denied' && r.allowed) return false;
      return true;
    }).length) / logPageSize));
  logPage = Math.max(1, Math.min(p, total));
  renderLogTable(document.getElementById('activityContent'));
}

/* ─── Sessions View ──────────────────────────────────────────────────────── */
async function renderSessionsView(container) {
  const data = await api('/api/activity/sessions');
  const sessions = data.sessions || [];

  const statsHtml = `
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card" style="border-top:3px solid #10b981">
        <div class="stat-label">Active Sessions</div>
        <div class="stat-value" style="color:#10b981">${data.activeCount||sessions.length}</div>
        <div class="stat-hint">Currently valid</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Issued</div>
        <div class="stat-value">${data.totalCount||'—'}</div>
        <div class="stat-hint">All time</div>
      </div>
    </div>
  `;

  if (sessions.length === 0) {
    container.innerHTML = statsHtml + `<div class="empty-state">
      <div class="empty-title">No Active Sessions</div>
      <div class="empty-sub">Sessions appear here when users are authenticated to a resource.</div>
    </div>`;
    return;
  }

  const rows = sessions.map(s => {
    const mins = s.expiresInMin;
    const pill = mins < 30 ? 'pill-red' : mins < 120 ? 'pill-yellow' : 'pill-green';
    const timeLeft = mins > 1440 ? Math.floor(mins/1440)+'d ' + Math.floor((mins%1440)/60)+'h'
                   : mins > 60   ? Math.floor(mins/60)+'h '+  (mins%60)+'m'
                   : mins + ' min';
    return `<tr>
      <td style="font-size:11px;font-family:monospace;color:#64748b" title="${s.id}">${(s.id||'').slice(0,20)}…</td>
      <td style="font-size:13px;font-weight:500">${escHtml(s.resourceName||'Resource '+s.resourceId)}</td>
      <td style="font-size:11px;color:#64748b">${s.resourceDomain ? escHtml(s.resourceDomain) : '—'}</td>
      <td style="font-size:12px;color:#64748b;white-space:nowrap">${s.issued ? new Date(s.issued).toLocaleString() : '—'}</td>
      <td style="font-size:12px;color:#64748b;white-space:nowrap">${new Date(s.expires).toLocaleString()}</td>
      <td><span class="pill ${pill}">${timeLeft}</span></td>
      <td><span class="pill pill-gray" style="font-size:10px">${s.isRequestToken ? 'token' : s.userSessionId ? 'user' : 'anon'}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = statsHtml + `
    <div class="card">
      <div class="card-header">
        <h3>Active Sessions <span class="pill pill-green" style="margin-left:8px">${sessions.length}</span></h3>
        <span style="font-size:12px;color:#64748b">Green = plenty of time · Yellow = expiring soon · Red = &lt;30 min</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Session ID</th><th>Resource</th><th>Domain</th>
            <th>Issued</th><th>Expires</th><th>Time Left</th><th>Type</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ─── Overview / Charts ──────────────────────────────────────────────────── */
let chartInstances = {};

let _overviewDays = 30;

async function renderOverviewCharts(container) {
  const data = await api(`/api/activity/chart?days=${_overviewDays}`);

  const days = data.accessByDay || [];
  const labels = days.map(d => new Date(d.day + 'T00:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric'}));
  const allowed = days.map(d => d.allowed || 0);
  const denied  = days.map(d => d.denied  || 0);
  const uniqueIps = days.map(d => d.uniqueIps || 0);

  const topUsers     = data.topUsers     || [];
  const topIps       = data.topIps       || [];
  const topResources = data.topResources || [];
  const authBreakdown = data.authBreakdown || [];
  const sessions     = data.sessionsByDay || [];
  const totals = data.totals || { allowed: 0, denied: 0, total: 0, uniqueUsers: 0, uniqueIps: 0 };
  const totalReq = (totals.allowed || 0) + (totals.denied || 0);
  const successRate = totalReq > 0 ? Math.round((totals.allowed / totalReq) * 100) : 0;

  const noData = days.length === 0;
  const noDataMsg = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">
    No data for this period.<br>
    <span style="font-size:11px">Check <button class="btn btn-ghost btn-sm" style="display:inline;padding:0 4px" onclick="switchActivityView('retention')">Log Retention settings</button> — access logs may be set to 0 days.</span>
  </div>`;

  const periodBtn = (d, label) => `<button onclick="_overviewDays=${d};renderOverviewCharts(document.getElementById('activityContent'))"
    style="padding:4px 10px;border-radius:5px;border:1px solid #e5e7eb;font-size:11px;cursor:pointer;font-family:inherit;
    background:${_overviewDays===d?'#2563eb':'white'};color:${_overviewDays===d?'white':'#374151'}">${label}</button>`;

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:16px;align-items:center">
      <span style="font-size:12px;color:#6b7280;margin-right:4px">Period:</span>
      ${periodBtn(7,'7d')} ${periodBtn(14,'14d')} ${periodBtn(30,'30d')} ${periodBtn(90,'90d')}
    </div>

    <!-- Row 1: Main access trend + allow/deny donut -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-header">
          <h3>Access Activity — ${_overviewDays} Days</h3>
          <div style="display:flex;gap:12px;font-size:12px">
            <span style="color:#10b981">● ${totals.allowed||0} allowed</span>
            <span style="color:#ef4444">● ${totals.denied||0} denied</span>
            <span style="color:#6b7280">${successRate}% success</span>
          </div>
        </div>
        <div class="card-body" style="padding:12px">
          ${noData ? noDataMsg : '<canvas id="accessChart" height="100"></canvas>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Allow vs Deny</h3></div>
        <div class="card-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px">
          <div style="position:relative;width:130px;height:130px">
            <canvas id="donutChart"></canvas>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
              <div style="font-size:20px;font-weight:800">${successRate}%</div>
              <div style="font-size:10px;color:#64748b">success</div>
            </div>
          </div>
          <div style="width:100%">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span><span style="color:#10b981">●</span> Allowed</span><strong>${totals.allowed||0}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span><span style="color:#ef4444">●</span> Denied</span><strong>${totals.denied||0}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span><span style="color:#2563eb">●</span> Unique IPs</span><strong>${totals.uniqueIps||0}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:12px"><span><span style="color:#8b5cf6">●</span> SSO Users</span><strong>${totals.uniqueUsers||0}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: Unique IPs trend + Auth method breakdown -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-header"><h3>Unique Source IPs per Day</h3></div>
        <div class="card-body" style="padding:12px">
          ${noData ? noDataMsg : '<canvas id="ipsChart" height="100"></canvas>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Auth Method Breakdown</h3></div>
        <div class="card-body" style="padding:12px">
          ${authBreakdown.length === 0 ? noDataMsg :
            authBreakdown.map(a => `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div style="flex:1;min-width:0">
                  <span style="font-size:12px;font-weight:600">${escHtml(a.method||'Unknown')}</span>
                  <div style="font-size:10px;color:#94a3b8">${a.requestCount} HTTP requests · ${a.uniqueIps} unique IPs</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-left:12px">
                  <div style="width:80px;height:6px;background:#f1f5f9;border-radius:3px">
                    <div style="height:6px;background:#2563eb;border-radius:3px;width:${Math.round((a.requestCount/totalReq)*100)}%"></div>
                  </div>
                </div>
              </div>`).join('')}
        </div>
      </div>
    </div>

      <!-- Row 2b: Login Sessions (billing view) -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3>Login Sessions (Billing View)</h3>
        <span style="font-size:11px;color:#94a3b8">Each session = one user visit/login. Use this for invoicing — not the raw request count above.</span>
      </div>
      <div class="card-body" style="padding:0">
        ${(data.sessionsByType || []).length === 0
          ? `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No sessions in this period.</div>`
          : `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:8px 14px;text-align:left;color:#374151;font-weight:600">Auth Method</th>
              <th style="padding:8px 14px;text-align:right;color:#374151;font-weight:600">Total Sessions</th>
              <th style="padding:8px 14px;text-align:right;color:#374151;font-weight:600">Full Logins</th>
              <th style="padding:8px 14px;text-align:left;color:#374151;font-weight:600">Notes</th>
            </tr></thead>
            <tbody>${(data.sessionsByType || []).map(s => `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 14px;font-weight:600">${escHtml(s.sessionType)}</td>
                <td style="padding:8px 14px;text-align:right;font-size:16px;font-weight:700;color:#2563eb">${s.sessions}</td>
                <td style="padding:8px 14px;text-align:right;color:#64748b">${s.fullSessions}</td>
                <td style="padding:8px 14px;font-size:11px;color:#94a3b8">
                  ${s.sessionType.includes('OTP') || s.sessionType.includes('Whitelist')
                    ? 'Email domain validated — no individual email in log'
                    : s.sessionType.includes('SSO')
                    ? 'Individual email captured — use Users tab for billing'
                    : ''}
                </td>
              </tr>`).join('')}</tbody>
          </table>`}
      </div>
    </div>

    <!-- Row 3: Top IPs + Top Resources -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-header"><h3>Top Source IPs</h3></div>
        <div class="card-body" style="padding:0">
          ${topIps.length === 0 ? `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">${noDataMsg}</div>` :
          `<table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600">IP Address</th>
              <th style="padding:8px 12px;text-align:right;color:#374151;font-weight:600">Requests</th>
              <th style="padding:8px 12px;text-align:right;color:#374151;font-weight:600">Allowed</th>
              <th style="padding:8px 12px;text-align:right;color:#374151;font-weight:600">Denied</th>
            </tr></thead>
            <tbody>${topIps.map((ip, i) => `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:7px 12px;font-family:monospace">${escHtml(ip.ip)}</td>
                <td style="padding:7px 12px;text-align:right;font-weight:600">${ip.requests}</td>
                <td style="padding:7px 12px;text-align:right;color:#10b981">${ip.allowed}</td>
                <td style="padding:7px 12px;text-align:right;color:${ip.denied>0?'#ef4444':'#94a3b8'}">${ip.denied}</td>
              </tr>`).join('')}</tbody>
          </table>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Top Resources Accessed</h3></div>
        <div class="card-body" style="padding:0">
          ${topResources.length === 0 ? `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">${noDataMsg}</div>` :
          `<table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600">Resource</th>
              <th style="padding:8px 12px;text-align:right;color:#374151;font-weight:600">Requests</th>
              <th style="padding:8px 12px;text-align:right;color:#374151;font-weight:600">Denied</th>
            </tr></thead>
            <tbody>${topResources.map(r => `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:7px 12px">
                  <div style="font-weight:600">${escHtml(r.resourceName||'Unknown')}</div>
                  <div style="font-size:10px;color:#94a3b8">${escHtml(r.domain||'')}</div>
                </td>
                <td style="padding:7px 12px;text-align:right;font-weight:600">${r.requests}</td>
                <td style="padding:7px 12px;text-align:right;color:${r.denied>0?'#ef4444':'#94a3b8'}">${r.denied}</td>
              </tr>`).join('')}</tbody>
          </table>`}
        </div>
      </div>
    </div>

    <!-- Row 4: Top Users (SSO only) -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3>Authenticated Users (Platform SSO)</h3>
        <span style="font-size:11px;color:#94a3b8">Only visible when resources use Platform SSO authentication</span>
      </div>
      <div class="card-body" style="padding:12px">
        ${topUsers.length === 0
          ? `<div style="color:#94a3b8;font-size:13px;text-align:center;padding:16px">No SSO users logged in this period. Enable Platform SSO on resources in Pangolin to track individual users.</div>`
          : topUsers.map((u,i) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="width:22px;height:22px;background:#eff6ff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#2563eb;flex-shrink:0">${i+1}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.email)}</div>
                <div style="height:5px;background:#f1f5f9;border-radius:3px;margin-top:3px">
                  <div style="height:5px;background:#2563eb;border-radius:3px;width:${Math.round((u.requests/Math.max(topUsers[0].requests,1))*100)}%"></div>
                </div>
              </div>
              <span style="font-size:12px;font-weight:700;color:#2563eb;flex-shrink:0">${u.requests} reqs</span>
              <span style="font-size:10px;color:#94a3b8;flex-shrink:0">${u.lastSeen ? new Date(u.lastSeen*1000).toLocaleDateString() : ''}</span>
            </div>
          `).join('')}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    if (!window.Chart) return;
    Object.values(chartInstances).forEach(c => c?.destroy?.());
    chartInstances = {};

    if (days.length > 0) {
      const ctx1 = document.getElementById('accessChart');
      if (ctx1) chartInstances.access = new Chart(ctx1, {
        type: 'bar',
        data: { labels, datasets: [
          { label: 'Allowed', data: allowed, backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 3 },
          { label: 'Denied',  data: denied,  backgroundColor: 'rgba(239,68,68,0.75)',  borderRadius: 3 },
        ]},
        options: { responsive: true, maintainAspectRatio: true,
          plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
          scales: { x: { stacked: false, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } } }
        }
      });

      const ctx3 = document.getElementById('ipsChart');
      if (ctx3) chartInstances.ips = new Chart(ctx3, {
        type: 'line',
        data: { labels, datasets: [{
          label: 'Unique IPs', data: uniqueIps,
          borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)',
          borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3,
        }]},
        options: { responsive: true, maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } } }
        }
      });
    }

    const ctx2 = document.getElementById('donutChart');
    if (ctx2) chartInstances.donut = new Chart(ctx2, {
      type: 'doughnut',
      data: { datasets: [{ data: [totals.allowed||0, totals.denied||1], backgroundColor: ['#10b981','#ef4444'], borderWidth: 0 }] },
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  });
}

/* ─── Log Retention Settings View ───────────────────────────────────────── */
async function renderRetentionView(container) {
  container.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
  let cfg = { request: 7, access: 0, action: 0, connection: 0 };
  try { cfg = await api('/api/activity/retention'); } catch (_) {}

  const retentionField = (key, label, hint, current) => `
    <div class="form-group">
      <label class="form-label">${label}</label>
      <div style="display:flex;align-items:center;gap:12px">
        <input class="form-input" type="number" id="ret_${key}" value="${current}" min="0" max="365"
          style="max-width:100px;text-align:center;font-size:16px;font-weight:600">
        <span style="font-size:13px;color:#6b7280">days</span>
        <span style="font-size:11px;color:${current===0?'#ef4444':'#10b981'};font-weight:600">
          ${current===0 ? '⚠ Disabled (logs deleted immediately)' : `✓ Keeping ${current} days of logs`}
        </span>
      </div>
      <div class="form-hint">${hint}</div>
    </div>`;

  container.innerHTML = `
    <div style="max-width:600px">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3>Log Retention Settings</h3>
          <span style="font-size:11px;color:#94a3b8">Controls how long Pangolin keeps each type of log</span>
        </div>
        <div class="card-body">
          <div id="retentionStatus" style="margin-bottom:16px"></div>

          ${retentionField('request', 'Request Logs', 'HTTP request audit log — shows access attempts with IP, path, result. Set to 30-90 days for billing.', cfg.request)}
          ${retentionField('access', 'Access / OTP Logs', 'Email OTP authentication events — shows which emails authenticated. Set to 30+ days to track logins.', cfg.access)}
          ${retentionField('action', 'Action Logs', 'Admin action audit trail — org changes, user management, config changes.', cfg.action)}
          ${retentionField('connection', 'Connection Logs', 'WireGuard/Newt tunnel sessions — bandwidth, duration, client IDs.', cfg.connection)}

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;font-size:12px;color:#78350f">
            <strong>Recommended for billing:</strong> Request=90 days, Access=90 days, Action=30 days, Connection=30 days
            <button class="btn btn-secondary btn-sm" style="margin-left:12px" onclick="applyRecommendedRetention()">Apply Recommended</button>
          </div>

          <button class="btn btn-primary" onclick="saveRetention()">Save Settings</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Enable Per-User Tracking</h3></div>
        <div class="card-body" style="font-size:13px">
          <p style="margin-bottom:12px;color:#374151">Currently, email whitelist OTP does not record the specific user email in logs — only the domain (*@matrixit.net) is captured.</p>
          <p style="margin-bottom:12px;color:#374151">To see individual emails (e.g. <code>jamie.love@matrixit.net</code>) in every log entry:</p>
          <ol style="margin-left:20px;color:#374151;line-height:2">
            <li>Go to <strong>Pangolin Dashboard</strong></li>
            <li>Resources → your resource → <strong>Authentication tab</strong></li>
            <li>Turn on <strong>"Use Platform SSO"</strong></li>
            <li>Keep the Email Whitelist to restrict which domains can log in</li>
          </ol>
          <p style="margin-top:12px;color:#6b7280;font-size:12px">After enabling, every request will show the user's email in Auth Activity → Access Log.</p>
        </div>
      </div>
    </div>`;
}

async function saveRetention() {
  const st = document.getElementById('retentionStatus');
  const body = {
    request:    parseInt(document.getElementById('ret_request')?.value    || '7'),
    access:     parseInt(document.getElementById('ret_access')?.value     || '30'),
    action:     parseInt(document.getElementById('ret_action')?.value     || '30'),
    connection: parseInt(document.getElementById('ret_connection')?.value || '30'),
  };
  st.innerHTML = `<div class="alert alert-info">Saving…</div>`;
  try {
    const r = await api('/api/activity/retention', { method: 'POST', body });
    st.innerHTML = `<div class="alert alert-success">Log retention updated — changes take effect immediately in Pangolin.</div>`;
    showToast('Log retention saved', 'success');
  } catch (e) {
    st.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function applyRecommendedRetention() {
  document.getElementById('ret_request').value    = '90';
  document.getElementById('ret_access').value     = '90';
  document.getElementById('ret_action').value     = '30';
  document.getElementById('ret_connection').value = '30';
}

/* ─── Network Logs View ──────────────────────────────────────────────────── */
let netAllItems = [];
let netPage = 1;
let netPageSize = 25;
let netSortCol = 'time';
let netSortDir = 'desc';
let netSearch = '';

const formatBytes = b => {
  if (!b) return '0 B';
  if (b > 1073741824) return (b/1073741824).toFixed(2) + ' GB';
  if (b > 1048576) return (b/1048576).toFixed(1) + ' MB';
  if (b > 1024) return (b/1024).toFixed(1) + ' KB';
  return b + ' B';
};

const formatDur = s => {
  if (!s && s !== 0) return '—';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
};

async function renderNetworkView(container) {
  const data = await api('/api/activity/network?limit=500');
  netAllItems = data.items || [];
  netPage = 1;

  const stats = data.stats || {};
  const statsHtml = `
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total Sessions</div><div class="stat-value">${stats.totalSessions||0}</div><div class="stat-hint">${data.total||0} in log</div></div>
      <div class="stat-card"><div class="stat-label">Data Sent</div><div class="stat-value" style="font-size:20px">${formatBytes(stats.totalBytesTx)}</div></div>
      <div class="stat-card"><div class="stat-label">Data Received</div><div class="stat-value" style="font-size:20px">${formatBytes(stats.totalBytesRx)}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Users</div><div class="stat-value">${stats.uniqueUsers||0}</div></div>
    </div>
  `;

  if (netAllItems.length === 0) {
    container.innerHTML = statsHtml + `
      <div class="alert alert-info">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        No network sessions logged yet. Sessions appear here as users connect to private resources via the Pangolin client.
      </div>`;
    return;
  }

  container.innerHTML = statsHtml + `<div id="netTableWrap"></div>`;
  renderNetTable();
}

function renderNetTable() {
  const wrap = document.getElementById('netTableWrap');
  if (!wrap) return;

  let items = netAllItems.slice();
  if (netSearch.trim()) {
    const q = netSearch.trim().toLowerCase();
    items = items.filter(r =>
      (r.userId||'').toLowerCase().includes(q) ||
      (r.sourceAddr||'').toLowerCase().includes(q) ||
      (r.destAddr||'').toLowerCase().includes(q) ||
      (r.protocol||'').toLowerCase().includes(q)
    );
  }

  const dir = netSortDir === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    let av, bv;
    switch (netSortCol) {
      case 'time':     av = a.startedAt||0; bv = b.startedAt||0; break;
      case 'protocol': av = a.protocol||''; bv = b.protocol||''; break;
      case 'user':     av = (a.userId||'').toLowerCase(); bv = (b.userId||'').toLowerCase(); break;
      case 'source':   av = a.sourceAddr||''; bv = b.sourceAddr||''; break;
      case 'dest':     av = a.destAddr||''; bv = b.destAddr||''; break;
      case 'duration': av = a.duration||0; bv = b.duration||0; break;
      case 'bytes':    av = a.bytesTotal||0; bv = b.bytesTotal||0; break;
      default:         av = 0; bv = 0;
    }
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / netPageSize));
  if (netPage > totalPages) netPage = totalPages;
  const start = (netPage - 1) * netPageSize;
  const pageItems = items.slice(start, start + netPageSize);

  const si = (col) => netSortCol !== col
    ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;opacity:0.3;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>`
    : netSortDir === 'asc'
      ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:#2563eb;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>`
      : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:#2563eb;margin-left:3px"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>`;

  const rows = pageItems.length === 0
    ? `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:28px">No matching sessions</td></tr>`
    : pageItems.map(r => `
      <tr>
        <td style="font-size:12px;color:#64748b;white-space:nowrap">${r.time ? new Date(r.time).toLocaleString() : '—'}</td>
        <td><span class="pill pill-blue" style="font-size:10px">${r.protocol||'tcp'}</span></td>
        <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.userId||r.clientId||'—'}</td>
        <td style="font-size:11px;font-family:monospace;color:#475569">${r.sourceAddr||'—'}</td>
        <td style="font-size:11px;font-family:monospace;color:#475569">${r.destAddr||'—'}</td>
        <td style="font-size:12px;color:#64748b">${formatDur(r.duration)}</td>
        <td style="font-size:12px">${formatBytes(r.bytesTotal)}</td>
      </tr>
    `).join('');

  const pagination = totalPages <= 1 ? '' : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f8fafc">
      <div style="font-size:12px;color:#64748b">Showing ${start+1}–${Math.min(start+netPageSize,total)} of ${total}</div>
      <div style="display:flex;gap:4px">
        <button onclick="netGoPage(${netPage-1})" ${netPage===1?'disabled':''} class="btn btn-secondary btn-sm" style="padding:4px 8px">&lsaquo;</button>
        ${Array.from({length:totalPages},(_, i)=>i+1).filter(p=>p===1||p===totalPages||(p>=netPage-2&&p<=netPage+2)).map(p=>`
          <button onclick="netGoPage(${p})" class="btn btn-sm" style="padding:4px 10px;${p===netPage?'background:#2563eb;color:#fff;border-color:#2563eb':'background:#fff;border-color:#e2e8f0;color:#374151'}">${p}</button>`).join('')}
        <button onclick="netGoPage(${netPage+1})" ${netPage===totalPages?'disabled':''} class="btn btn-secondary btn-sm" style="padding:4px 8px">&rsaquo;</button>
      </div>
    </div>`;

  wrap.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <h3>Network Sessions <span class="pill pill-blue" style="margin-left:6px">${netAllItems.length} total</span></h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="position:relative">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#94a3b8"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" value="${escHtml(netSearch)}" placeholder="Search user, IP…"
              oninput="netSearch=this.value;netPage=1;renderNetTable()"
              style="padding:5px 8px 5px 26px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;width:170px;font-family:inherit;outline:none">
          </div>
          <select onchange="netPageSize=parseInt(this.value);netPage=1;renderNetTable()"
            style="padding:5px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;font-family:inherit;background:#fff;outline:none">
            <option value="10" ${netPageSize===10?'selected':''}>10/page</option>
            <option value="25" ${netPageSize===25?'selected':''}>25/page</option>
            <option value="50" ${netPageSize===50?'selected':''}>50/page</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="cursor:pointer" onclick="netSortBy('time')">Time${si('time')}</th>
            <th style="cursor:pointer" onclick="netSortBy('protocol')">Protocol${si('protocol')}</th>
            <th style="cursor:pointer" onclick="netSortBy('user')">User/Client${si('user')}</th>
            <th style="cursor:pointer" onclick="netSortBy('source')">Source${si('source')}</th>
            <th style="cursor:pointer" onclick="netSortBy('dest')">Destination${si('dest')}</th>
            <th style="cursor:pointer" onclick="netSortBy('duration')">Duration${si('duration')}</th>
            <th style="cursor:pointer" onclick="netSortBy('bytes')">Data${si('bytes')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${pagination}
    </div>`;
}

function netSortBy(col) {
  if (netSortCol === col) netSortDir = netSortDir === 'asc' ? 'desc' : 'asc';
  else { netSortCol = col; netSortDir = col === 'time' ? 'desc' : 'asc'; }
  netPage = 1;
  renderNetTable();
}
function netGoPage(p) {
  const tot = Math.max(1, Math.ceil(netAllItems.filter(r => !netSearch.trim() || (r.userId||'').toLowerCase().includes(netSearch.toLowerCase()) || (r.sourceAddr||'').includes(netSearch) || (r.destAddr||'').includes(netSearch)).length / netPageSize));
  netPage = Math.max(1, Math.min(p, tot));
  renderNetTable();
}

/* ─── Actions ────────────────────────────────────────────────────────────── */
function filterByUser(email) {
  selectedUser = email;
  activityView = 'log';
  initAuthActivity();
}

function confirmBlock(email) {
  if (!confirm(`Block "${email}"?\n\nThis will remove them from the organization and revoke all access immediately. They will need to be re-invited to regain access.`)) return;
  blockUser(email);
}

async function blockUser(email) {
  showToast(`Blocking ${email}…`, 'info');
  try {
    // First find the user's ID
    const usersData = await api('/api/activity/users?limit=500');
    const user = usersData.users.find(u => u.email === email);

    // We need the userId from Pangolin — look it up via API if key is configured
    const result = await api('/api/activity/block', {
      method: 'POST',
      body: { userId: email, reason: 'Blocked via ZTGuard portal' },
    });

    if (result.ok) {
      showToast(`${email} has been blocked`, 'success');
      await initAuthActivity();
    }
  } catch (err) {
    showToast('Block failed: ' + err.message + ' (Pangolin API key required)', 'error');
  }
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
