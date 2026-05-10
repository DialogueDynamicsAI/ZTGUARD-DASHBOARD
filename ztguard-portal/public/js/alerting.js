/* ─── Alerting & Health Checks Page ─────────────────────────────────────── */

let alertingTab = 'rules'; // 'rules' | 'health-checks' | 'history'
let alertEntities = { sites: [], resources: [], health_checks: [] };

async function initAlerting() {
  document.getElementById('topbarActions').innerHTML = '';
  renderAlertingPage();
}

function renderAlertingPage() {
  const page = document.getElementById('page-alerting');
  page.innerHTML = `
    <div class="br-tabs" style="margin-bottom:20px">
      <button class="br-tab ${alertingTab==='rules'?'active':''}" onclick="switchAlertTab('rules')">Alert Rules</button>
      <button class="br-tab ${alertingTab==='health-checks'?'active':''}" onclick="switchAlertTab('health-checks')">Health Checks</button>
      <button class="br-tab ${alertingTab==='history'?'active':''}" onclick="switchAlertTab('history')">Alert History</button>
    </div>
    <div id="alertingContent"></div>
  `;
  loadAlertingTab();
}

function switchAlertTab(tab) {
  alertingTab = tab;
  document.querySelectorAll('.br-tab').forEach((t, i) => {
    const tabs = ['rules','health-checks','history'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  loadAlertingTab();
}

async function loadAlertingTab() {
  const content = document.getElementById('alertingContent');
  if (!content) return;
  content.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
  try {
    if (alertingTab === 'rules') await renderRulesTab(content);
    else if (alertingTab === 'health-checks') await renderHealthChecksTab(content);
    else if (alertingTab === 'history') await renderHistoryTab(content);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">Failed: ${err.message}</div>`;
  }
}

/* ─── Status Banner ──────────────────────────────────────────────────────── */
async function getStatusBanner() {
  try {
    const data = await api('/api/alerting/status');
    const entities = data.entities || [];
    const online = entities.filter(e => ['online','healthy'].includes(e.status)).length;
    const offline = entities.filter(e => ['offline','unhealthy'].includes(e.status)).length;
    const unknown = entities.filter(e => e.status === 'unknown').length;
    if (entities.length === 0) return '';
    return `
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        ${entities.map(e => {
          const sc = e.status === 'online' || e.status === 'healthy' ? '#10b981'
                   : e.status === 'offline' || e.status === 'unhealthy' ? '#ef4444' : '#94a3b8';
          const icon = e.type === 'site' ? '🌐' : e.type === 'resource' ? '🔗' : '❤️';
          return `<div style="display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px">
            <span>${icon}</span>
            <span style="font-size:12px;font-weight:600">${escHtml(e.name)}</span>
            <span style="width:8px;height:8px;border-radius:50%;background:${sc};flex-shrink:0"></span>
            <span style="font-size:11px;color:#64748b">${e.status}</span>
          </div>`;
        }).join('')}
      </div>
    `;
  } catch (_) { return ''; }
}

/* ─── Alert Rules Tab ────────────────────────────────────────────────────── */
async function renderRulesTab(container) {
  const [rules, statusBanner] = await Promise.all([
    api('/api/alerting/rules'),
    getStatusBanner(),
  ]);

  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="openRuleModal()">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Create Rule
    </button>
  `;

  if (rules.length === 0) {
    container.innerHTML = statusBanner + `
      <div class="empty-state">
        <div class="empty-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:#94a3b8"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg></div>
        <div class="empty-title">No Alert Rules</div>
        <div class="empty-sub">Create a rule to be notified when a site goes offline, a resource becomes unhealthy, or a health check fails.</div>
        <button class="btn btn-primary" onclick="openRuleModal()">Create First Rule</button>
      </div>`;
    return;
  }

  const TRIGGER_LABELS = { online:'Goes Online', offline:'Goes Offline', healthy:'Becomes Healthy', unhealthy:'Becomes Unhealthy', any:'Any Status Change' };
  const SOURCE_LABELS = { site:'Site', resource:'Resource', health_check:'Health Check' };

  const rows = rules.map(r => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:13px">${escHtml(r.name)}</div>
        ${r.last_fired ? `<div style="font-size:11px;color:#94a3b8">Last fired: ${new Date(r.last_fired).toLocaleString()}</div>` : ''}
      </td>
      <td><span class="pill pill-blue" style="font-size:11px">${SOURCE_LABELS[r.source_type]||r.source_type}</span></td>
      <td style="font-size:12px">${TRIGGER_LABELS[r.trigger]||r.trigger}</td>
      <td style="font-size:12px;color:#64748b">${r.actions?.map(a=>`<span class="pill pill-gray">${a.action_type}</span>`).join(' ')||'—'}</td>
      <td>
        <label class="toggle" onclick="toggleRule(${r.id}, ${r.enabled?0:1})">
          <input type="checkbox" ${r.enabled?'checked':''} readonly>
          <div class="toggle-track"></div>
        </label>
      </td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="editRule(${r.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRule(${r.id},'${escHtml(r.name)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  container.innerHTML = statusBanner + `
    <div class="card">
      <div class="card-header">
        <h3>Alert Rules <span class="pill pill-blue" style="margin-left:8px">${rules.length}</span></h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Source</th><th>Trigger</th><th>Actions</th><th>Enabled</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
  ensureRuleModal();
}

/* ─── Health Checks Tab ──────────────────────────────────────────────────── */
async function renderHealthChecksTab(container) {
  const checks = await api('/api/alerting/health-checks');

  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="openHCModal()">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Add Health Check
    </button>
  `;

  if (checks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:#94a3b8"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg></div>
        <div class="empty-title">No Health Checks</div>
        <div class="empty-sub">Monitor HTTP endpoints or TCP ports and get alerted when they go down.</div>
        <button class="btn btn-primary" onclick="openHCModal()">Add First Health Check</button>
      </div>`;
    return;
  }

  const rows = checks.map(c => {
    const sc = c.last_status === 'healthy' ? 'pill-green' : c.last_status === 'unhealthy' ? 'pill-red' : 'pill-gray';
    return `
      <tr>
        <td>
          <div style="font-weight:600;font-size:13px">${escHtml(c.name)}</div>
          <div style="font-size:11px;color:#94a3b8;font-family:monospace">${escHtml(c.target)}</div>
        </td>
        <td><span class="pill pill-blue" style="font-size:10px">${c.type.toUpperCase()}</span></td>
        <td><span class="pill ${sc}">${c.last_status||'unknown'}</span></td>
        <td style="font-size:12px;color:#64748b">${c.last_checked ? new Date(c.last_checked).toLocaleString() : '—'}</td>
        <td style="font-size:12px;color:#64748b">${c.interval_sec}s</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="testHealthCheck(${c.id},'${escHtml(c.name)}')" title="Run now">Test</button>
            <button class="btn btn-ghost btn-sm" onclick="editHC(${c.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteHC(${c.id},'${escHtml(c.name)}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Health Checks <span class="pill pill-blue" style="margin-left:8px">${checks.length}</span></h3>
        <span style="font-size:12px;color:#64748b">Checks run automatically on each interval</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name / Target</th><th>Type</th><th>Status</th><th>Last Checked</th><th>Interval</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
  ensureHCModal();
}

/* ─── Alert History Tab ──────────────────────────────────────────────────── */
async function renderHistoryTab(container) {
  const data = await api('/api/alerting/history?limit=100');
  document.getElementById('topbarActions').innerHTML = data.total > 0
    ? `<button class="btn btn-secondary btn-sm" onclick="clearAlertHistory()">Clear History</button>` : '';

  if (data.items.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">No Alert History</div><div class="empty-sub">Alert firings will appear here.</div></div>`;
    return;
  }
  const rows = data.items.map(h => `
    <tr>
      <td style="font-size:12px;color:#64748b;white-space:nowrap">${new Date(h.fired_at).toLocaleString()}</td>
      <td style="font-size:13px;font-weight:600">${escHtml(h.rule_name||'—')}</td>
      <td style="font-size:12px">${escHtml(h.source_name||'—')}</td>
      <td><span class="pill ${h.state==='online'||h.state==='healthy'?'pill-green':'pill-red'}">${h.state||'—'}</span></td>
      <td><span class="pill pill-gray">${h.action_type||'—'}</span></td>
      <td style="font-size:11px;color:${JSON.parse(h.action_result||'{}').ok?'#10b981':'#ef4444'}">${
        (() => { try { const r=JSON.parse(h.action_result||'{}'); return r.ok ? 'OK' : r.error||'Failed'; } catch(_){return '—';} })()
      }</td>
    </tr>`).join('');
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Alert History</h3><span style="font-size:12px;color:#64748b">${data.total} total</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Rule</th><th>Source</th><th>State</th><th>Action</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function clearAlertHistory() {
  if (!confirm('Clear all alert history?')) return;
  await api('/api/alerting/history', { method: 'DELETE' });
  showToast('History cleared', 'success');
  await renderHistoryTab(document.getElementById('alertingContent'));
}

/* ─── Rule Modal ─────────────────────────────────────────────────────────── */
let editingRuleId = null;

function ensureRuleModal() {
  if (document.getElementById('ruleModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="ruleModal" onclick="onModalOverlayClick(event,'ruleModal')">
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <div class="modal-title" id="ruleModalTitle">Create Alert Rule</div>
          <button class="modal-close" onclick="closeModal('ruleModal')">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Rule Name <span class="req">*</span></label>
            <input class="form-input" id="ruleName" placeholder="e.g. Site Down Alert">
          </div>
          <div class="form-group">
            <label class="form-label">Cooldown (seconds)</label>
            <input class="form-input" id="ruleCooldown" type="number" value="300" min="0" style="max-width:140px">
            <div class="form-hint">Minimum time between repeated alerts. 0 = always fire.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Source Type <span class="req">*</span></label>
            <select class="form-select" id="ruleSourceType" onchange="updateRuleSourceOptions()">
              <option value="site">Site</option>
              <option value="resource">Resource</option>
              <option value="health_check">Health Check</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Watch</label>
            <select class="form-select" id="ruleSourceId">
              <option value="all">All (any changes)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Trigger When <span class="req">*</span></label>
            <select class="form-select" id="ruleTrigger">
              <option value="any">Any status change</option>
              <option value="offline">Goes Offline</option>
              <option value="online">Comes Online</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Actions</label>
            <div id="ruleActions"></div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addRuleAction()" style="margin-top:8px">+ Add Action</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('ruleModal')">Cancel</button>
          <button class="btn btn-primary" onclick="saveRule()">Save Rule</button>
        </div>
      </div>
    </div>
  `);
}

const TRIGGER_OPTIONS = {
  site: [['any','Any status change'],['offline','Goes Offline'],['online','Comes Online']],
  resource: [['any','Any status change'],['unhealthy','Becomes Unhealthy'],['healthy','Becomes Healthy']],
  health_check: [['any','Any status change'],['unhealthy','Becomes Unhealthy'],['healthy','Becomes Healthy']],
};

async function updateRuleSourceOptions() {
  const type = document.getElementById('ruleSourceType')?.value;
  const sourceSelect = document.getElementById('ruleSourceId');
  const triggerSelect = document.getElementById('ruleTrigger');
  if (!sourceSelect || !triggerSelect) return;

  // Update source options
  sourceSelect.innerHTML = `<option value="all">All ${type}s</option>`;
  try {
    const data = await api('/api/alerting/entities');
    const list = data[type + 's'] || [];
    list.forEach(e => { sourceSelect.innerHTML += `<option value="${e.id}">${escHtml(e.name)}</option>`; });
  } catch (_) {}

  // Update trigger options
  triggerSelect.innerHTML = (TRIGGER_OPTIONS[type] || TRIGGER_OPTIONS.site)
    .map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
}

let ruleActionCount = 0;
function addRuleAction(type = 'webhook', config = {}) {
  ruleActionCount++;
  const id = 'action_' + ruleActionCount;
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px';
  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <select class="form-select" style="flex:1" onchange="updateActionFields('${id}',this.value)">
        <option value="webhook" ${type==='webhook'?'selected':''}>Webhook</option>
        <option value="email" ${type==='email'?'selected':''}>Email</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${id}').remove()">Remove</button>
    </div>
    <div id="${id}_fields"></div>
  `;
  document.getElementById('ruleActions').appendChild(div);
  updateActionFields(id, type, config);
}

function updateActionFields(containerId, type, config = {}) {
  const el = document.getElementById(containerId + '_fields');
  if (!el) return;
  if (type === 'webhook') {
    el.innerHTML = `
      <input class="form-input" data-field="url" placeholder="https://hooks.example.com/..." value="${escHtml(config.url||'')}" style="margin-bottom:6px">
      <input class="form-input" data-field="bearer" placeholder="Bearer token (optional)" value="${escHtml(config.bearer||'')}" style="font-size:12px">
    `;
  } else {
    el.innerHTML = `
      <input class="form-input" data-field="to" type="email" placeholder="recipient@example.com" value="${escHtml(config.to||'')}" style="margin-bottom:6px">
      <input class="form-input" data-field="subject" placeholder="Subject (optional)" value="${escHtml(config.subject||'')}">
    `;
  }
}

async function openRuleModal(ruleId = null) {
  editingRuleId = ruleId;
  ensureRuleModal();
  document.getElementById('ruleModalTitle').textContent = ruleId ? 'Edit Alert Rule' : 'Create Alert Rule';
  document.getElementById('ruleActions').innerHTML = '';
  ruleActionCount = 0;

  await updateRuleSourceOptions();

  if (ruleId) {
    const rules = await api('/api/alerting/rules');
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      document.getElementById('ruleName').value = rule.name;
      document.getElementById('ruleCooldown').value = rule.cooldown_sec;
      document.getElementById('ruleSourceType').value = rule.source_type;
      await updateRuleSourceOptions();
      document.getElementById('ruleSourceId').value = rule.source_id;
      document.getElementById('ruleTrigger').value = rule.trigger;
      (rule.actions || []).forEach(a => addRuleAction(a.action_type, a.config));
    }
  }

  openModal('ruleModal');
  setTimeout(() => document.getElementById('ruleName')?.focus(), 100);
}

function editRule(id) { openRuleModal(id); }

async function saveRule() {
  const name = document.getElementById('ruleName')?.value?.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const actions = [];
  document.querySelectorAll('#ruleActions > div').forEach(div => {
    const type = div.querySelector('select')?.value;
    const config = {};
    div.querySelectorAll('[data-field]').forEach(el => { config[el.dataset.field] = el.value; });
    if (type) actions.push({ action_type: type, config });
  });

  const payload = {
    name,
    source_type: document.getElementById('ruleSourceType').value,
    source_id: document.getElementById('ruleSourceId').value,
    trigger: document.getElementById('ruleTrigger').value,
    cooldown_sec: parseInt(document.getElementById('ruleCooldown').value || '0'),
    actions,
  };

  try {
    if (editingRuleId) {
      await api(`/api/alerting/rules/${editingRuleId}`, { method: 'PATCH', body: payload });
      showToast('Rule updated', 'success');
    } else {
      await api('/api/alerting/rules', { method: 'POST', body: payload });
      showToast('Rule created', 'success');
    }
    closeModal('ruleModal');
    await loadAlertingTab();
  } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
}

async function toggleRule(id, enabled) {
  await api(`/api/alerting/rules/${id}`, { method: 'PATCH', body: { enabled } });
  await loadAlertingTab();
}

async function deleteRule(id, name) {
  if (!confirm(`Delete rule "${name}"?`)) return;
  await api(`/api/alerting/rules/${id}`, { method: 'DELETE' });
  showToast('Rule deleted', 'success');
  await loadAlertingTab();
}

/* ─── Health Check Modal ─────────────────────────────────────────────────── */
let editingHCId = null;

function ensureHCModal() {
  if (document.getElementById('hcModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="hcModal" onclick="onModalOverlayClick(event,'hcModal')">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title" id="hcModalTitle">Add Health Check</div>
          <button class="modal-close" onclick="closeModal('hcModal')">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name <span class="req">*</span></label>
            <input class="form-input" id="hcName" placeholder="e.g. Portal Website">
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="hcType" onchange="updateHCTypeFields()">
              <option value="http">HTTP/HTTPS</option>
              <option value="tcp">TCP Port</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" id="hcTargetLabel">URL <span class="req">*</span></label>
            <input class="form-input" id="hcTarget" placeholder="https://portal.srmanpower.net">
          </div>
          <div id="hcHttpFields">
            <div class="form-group">
              <label class="form-label">Expected Status Code</label>
              <input class="form-input" id="hcStatus" type="number" value="200" style="max-width:120px">
            </div>
            <div class="form-group">
              <label class="form-label">Keyword (optional)</label>
              <input class="form-input" id="hcKeyword" placeholder="Text that must appear in response">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group">
              <label class="form-label">Check Interval</label>
              <select class="form-select" id="hcInterval">
                <option value="30">30 seconds</option>
                <option value="60" selected>1 minute</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
                <option value="1800">30 minutes</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Timeout</label>
              <select class="form-select" id="hcTimeout">
                <option value="5">5 seconds</option>
                <option value="10" selected>10 seconds</option>
                <option value="30">30 seconds</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('hcModal')">Cancel</button>
          <button class="btn btn-primary" onclick="saveHC()">Save</button>
        </div>
      </div>
    </div>
  `);
}

function updateHCTypeFields() {
  const type = document.getElementById('hcType')?.value;
  const label = document.getElementById('hcTargetLabel');
  const httpFields = document.getElementById('hcHttpFields');
  const target = document.getElementById('hcTarget');
  if (type === 'tcp') {
    if (label) label.innerHTML = 'Host:Port <span class="req">*</span>';
    if (target) target.placeholder = 'example.com:443';
    if (httpFields) httpFields.style.display = 'none';
  } else {
    if (label) label.innerHTML = 'URL <span class="req">*</span>';
    if (target) target.placeholder = 'https://example.com';
    if (httpFields) httpFields.style.display = 'block';
  }
}

function openHCModal(checkId = null) {
  editingHCId = checkId;
  ensureHCModal();
  document.getElementById('hcModalTitle').textContent = checkId ? 'Edit Health Check' : 'Add Health Check';
  if (!checkId) {
    document.getElementById('hcName').value = '';
    document.getElementById('hcType').value = 'http';
    document.getElementById('hcTarget').value = '';
    document.getElementById('hcStatus').value = '200';
    document.getElementById('hcKeyword').value = '';
    document.getElementById('hcInterval').value = '60';
    document.getElementById('hcTimeout').value = '10';
    updateHCTypeFields();
  }
  openModal('hcModal');
  setTimeout(() => document.getElementById('hcName')?.focus(), 100);
}

async function editHC(id) {
  const checks = await api('/api/alerting/health-checks');
  const c = checks.find(x => x.id === id);
  if (!c) return;
  openHCModal(id);
  document.getElementById('hcName').value = c.name;
  document.getElementById('hcType').value = c.type;
  document.getElementById('hcTarget').value = c.target;
  document.getElementById('hcStatus').value = c.expected_status || 200;
  document.getElementById('hcKeyword').value = c.keyword || '';
  document.getElementById('hcInterval').value = String(c.interval_sec);
  document.getElementById('hcTimeout').value = String(c.timeout_sec);
  updateHCTypeFields();
}

async function saveHC() {
  const name = document.getElementById('hcName')?.value?.trim();
  const target = document.getElementById('hcTarget')?.value?.trim();
  if (!name || !target) { showToast('Name and target are required', 'error'); return; }
  const payload = {
    name, type: document.getElementById('hcType').value, target,
    expected_status: parseInt(document.getElementById('hcStatus').value || '200'),
    keyword: document.getElementById('hcKeyword').value.trim() || null,
    interval_sec: parseInt(document.getElementById('hcInterval').value),
    timeout_sec: parseInt(document.getElementById('hcTimeout').value),
  };
  try {
    if (editingHCId) {
      await api(`/api/alerting/health-checks/${editingHCId}`, { method: 'PATCH', body: payload });
      showToast('Health check updated', 'success');
    } else {
      await api('/api/alerting/health-checks', { method: 'POST', body: payload });
      showToast('Health check added', 'success');
    }
    closeModal('hcModal');
    await loadAlertingTab();
  } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
}

async function testHealthCheck(id, name) {
  showToast(`Testing "${name}"…`, 'info');
  try {
    const r = await api(`/api/alerting/health-checks/${id}/test`, { method: 'POST' });
    const msg = r.status === 'healthy'
      ? `"${name}" is healthy (${r.response_ms}ms)`
      : `"${name}" is unhealthy: ${r.error || 'unknown error'}`;
    showToast(msg, r.status === 'healthy' ? 'success' : 'error', 5000);
    await loadAlertingTab();
  } catch (err) { showToast('Test failed: ' + err.message, 'error'); }
}

async function deleteHC(id, name) {
  if (!confirm(`Delete health check "${name}"?`)) return;
  await api(`/api/alerting/health-checks/${id}`, { method: 'DELETE' });
  showToast('Health check deleted', 'success');
  await loadAlertingTab();
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
