/* ─── Authentication Activity Page ─────────────────────────────────────── */

let activityView = 'overview'; // 'overview' | 'users' | 'log' | 'network' | 'sessions'
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
      ${[['overview','📊 Overview'],['users','Users'],['log','Access Log'],['network','Network Logs'],['sessions','Sessions']].map(([v,l]) =>
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

async function renderOverviewCharts(container) {
  const [chart7, chart30] = await Promise.all([
    api('/api/activity/chart?days=7'),
    api('/api/activity/chart?days=30'),
  ]);

  const data = chart7;
  const days = data.accessByDay || [];
  const labels = days.map(d => new Date(d.day + 'T00:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric'}));
  const allowed = days.map(d => d.allowed || 0);
  const denied  = days.map(d => d.denied  || 0);

  const topUsers = data.topUsers || [];
  const totals = data.totals || { allowed: 0, denied: 0 };
  const totalRequests = (totals.allowed || 0) + (totals.denied || 0);
  const successRate = totalRequests > 0 ? Math.round((totals.allowed / totalRequests) * 100) : 0;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

      <!-- Access Activity Chart -->
      <div class="card" style="grid-column:1/-1">
        <div class="card-header">
          <h3>Access Activity — Last 7 Days</h3>
          <div style="display:flex;gap:12px;font-size:12px">
            <span style="color:#10b981">● Allowed: ${totals.allowed||0}</span>
            <span style="color:#ef4444">● Denied: ${totals.denied||0}</span>
            <span style="color:#64748b">Success rate: ${successRate}%</span>
          </div>
        </div>
        <div class="card-body">
          <canvas id="accessChart" height="120"></canvas>
          ${days.length === 0 ? '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">No data yet — log retention was just enabled. Check back after some activity.</div>' : ''}
        </div>
      </div>

      <!-- Top Users -->
      <div class="card">
        <div class="card-header"><h3>Top Users (7 days)</h3></div>
        <div class="card-body" style="padding:12px">
          ${topUsers.length === 0
            ? '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px">No user data yet</div>'
            : topUsers.map((u,i) => `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <span style="width:20px;height:20px;background:#f1f5f9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#64748b;flex-shrink:0">${i+1}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.email)}</div>
                  <div style="height:4px;background:#f1f5f9;border-radius:2px;margin-top:3px">
                    <div style="height:4px;background:#2563eb;border-radius:2px;width:${Math.round((u.requests/topUsers[0].requests)*100)}%"></div>
                  </div>
                </div>
                <span style="font-size:12px;font-weight:700;color:#2563eb;flex-shrink:0">${u.requests}</span>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Allow vs Deny Donut -->
      <div class="card">
        <div class="card-header"><h3>Allow vs Deny (7 days)</h3></div>
        <div class="card-body" style="display:flex;align-items:center;justify-content:center;padding:20px">
          <div style="position:relative;width:160px;height:160px">
            <canvas id="donutChart"></canvas>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
              <div style="font-size:22px;font-weight:800;color:#0f172a">${successRate}%</div>
              <div style="font-size:11px;color:#64748b">success</div>
            </div>
          </div>
          <div style="margin-left:20px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:12px;height:12px;background:#10b981;border-radius:3px"></span><span style="font-size:12px">Allowed: <strong>${totals.allowed||0}</strong></span></div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:#ef4444;border-radius:3px"></span><span style="font-size:12px">Denied: <strong>${totals.denied||0}</strong></span></div>
          </div>
        </div>
      </div>

    </div>
  `;

  // Render charts after DOM is ready
  requestAnimationFrame(() => {
    if (window.Chart && days.length > 0) {
      // Destroy old instances
      Object.values(chartInstances).forEach(c => c.destroy && c.destroy());
      chartInstances = {};

      const ctx1 = document.getElementById('accessChart');
      if (ctx1) {
        chartInstances.access = new Chart(ctx1, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Allowed', data: allowed, backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 4 },
              { label: 'Denied',  data: denied,  backgroundColor: 'rgba(239,68,68,0.8)',  borderRadius: 4 },
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { position: 'top' } },
            scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });
      }

      const ctx2 = document.getElementById('donutChart');
      if (ctx2) {
        chartInstances.donut = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            datasets: [{ data: [totals.allowed||0, totals.denied||0], backgroundColor: ['#10b981','#ef4444'], borderWidth: 0 }]
          },
          options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
      }
    }
  });
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
