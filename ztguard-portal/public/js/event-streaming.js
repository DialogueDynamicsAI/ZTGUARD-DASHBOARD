/* ─── Event Streaming Page ───────────────────────────────────────────────── */

let destinations = [];
let editingId = null;

const LOG_TYPE_LABELS = {
  request:    'HTTP Request',
  action:     'Admin Action',
  access:     'Auth/Access',
  connection: 'Network',
};

async function initEventStreaming() {
  // Add "Add Destination" button to topbar
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="openDestModal()">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
      </svg>
      Add Destination
    </button>
  `;

  await loadDestinations();
  ensureDestModal();
}

async function loadDestinations() {
  const page = document.getElementById('page-event-streaming');
  page.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;

  try {
    destinations = await api('/api/destinations');
    renderDestinations();
  } catch (err) {
    page.innerHTML = `<div class="alert alert-error"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>Failed to load destinations: ${err.message}</div>`;
  }
}

function renderDestinations() {
  const page = document.getElementById('page-event-streaming');

  if (destinations.length === 0) {
    page.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </div>
        <div class="empty-title">No Destinations Configured</div>
        <div class="empty-sub">Add a destination to start streaming Pangolin log events to external services.</div>
        <button class="btn btn-primary" onclick="openDestModal()">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Add Your First Destination
        </button>
      </div>
    `;
    return;
  }

  const cards = destinations.map(d => {
    const logPills = (d.log_types || []).map(t =>
      `<span class="pill pill-blue">${LOG_TYPE_LABELS[t] || t}</span>`
    ).join('');
    const statusPill = d.active
      ? `<span class="pill pill-green">Active</span>`
      : `<span class="pill pill-gray">Paused</span>`;
    const authLabel = d.auth_type === 'none' ? 'No Auth' :
      d.auth_type === 'bearer' ? 'Bearer Token' :
      d.auth_type === 'basic' ? 'Basic Auth' : 'Custom Header';

    return `
      <div class="dest-card">
        <div class="dest-card-top">
          <div>
            <div class="dest-name">${escHtml(d.name)}</div>
            <div class="dest-url" title="${escHtml(d.url)}">${escHtml(d.url.length > 55 ? d.url.slice(0,52)+'…' : d.url)}</div>
          </div>
          <div class="dest-actions">
            <button class="btn btn-ghost btn-sm" onclick="testDest(${d.id})" title="Send test payload">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l3 3m0 0l-3 3m3-3H9"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="editDest(${d.id})" title="Edit">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteDest(${d.id}, '${escHtml(d.name)}')" title="Delete">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="dest-log-types">${logPills}</div>
        <div class="dest-footer">
          <div style="display:flex;align-items:center;gap:8px">
            ${statusPill}
            <span style="font-size:12px;color:#94a3b8">${authLabel}</span>
          </div>
          <label class="toggle" onclick="toggleDest(${d.id}, ${d.active ? 0 : 1})">
            <input type="checkbox" ${d.active ? 'checked' : ''} readonly>
            <div class="toggle-track"></div>
          </label>
        </div>
      </div>
    `;
  }).join('');

  page.innerHTML = `<div class="dest-grid">${cards}</div>`;
}

async function toggleDest(id, newActive) {
  try {
    await api(`/api/destinations/${id}`, {
      method: 'PATCH',
      body: { active: newActive },
    });
    await loadDestinations();
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

async function deleteDest(id, name) {
  if (!confirm(`Delete destination "${name}"? This cannot be undone.`)) return;
  try {
    await api(`/api/destinations/${id}`, { method: 'DELETE' });
    showToast('Destination deleted', 'success');
    await loadDestinations();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

async function testDest(id) {
  const dest = destinations.find(d => d.id === id);
  if (!dest) return;
  showToast(`Sending test to "${dest.name}"…`, 'info');
  try {
    const result = await api(`/api/destinations/${id}/test`, { method: 'POST' });
    if (result.ok || (result.status >= 200 && result.status < 300)) {
      showToast(`Test delivered! HTTP ${result.status} in ${result.latency}ms`, 'success');
    } else {
      showToast(`Test failed: HTTP ${result.status} — ${result.error || ''}`, 'error');
    }
  } catch (err) {
    showToast('Test error: ' + err.message, 'error');
  }
}

function openDestModal(id = null) {
  editingId = id;
  const dest = id ? destinations.find(d => d.id === id) : null;

  document.getElementById('destModalTitle').textContent = dest ? 'Edit Destination' : 'Add Destination';
  document.getElementById('destName').value = dest?.name || '';
  document.getElementById('destUrl').value = dest?.url || '';
  document.getElementById('destAuthType').value = dest?.auth_type || 'none';
  document.getElementById('destAuthValue').value = dest?.auth_value || '';
  updateAuthValueField(dest?.auth_type || 'none');

  const activeTypes = dest?.log_types || ['request'];
  document.querySelectorAll('.log-type-cb').forEach(cb => {
    cb.checked = activeTypes.includes(cb.value);
    cb.closest('.checkbox-item').classList.toggle('checked', cb.checked);
  });

  document.getElementById('destActive').checked = dest ? !!dest.active : true;

  openModal('destModal');
  setTimeout(() => document.getElementById('destName').focus(), 100);
}

function editDest(id) { openDestModal(id); }

function updateAuthValueField(type) {
  const wrap = document.getElementById('destAuthValueWrap');
  const input = document.getElementById('destAuthValue');
  if (type === 'none') {
    wrap.style.display = 'none';
  } else {
    wrap.style.display = 'block';
    const labels = { bearer: 'Bearer Token', basic: 'user:password', custom: 'JSON object e.g. {"X-Api-Key":"abc"}' };
    document.getElementById('destAuthValueLabel').textContent = labels[type] || 'Value';
    input.placeholder = labels[type] || '';
  }
}

async function saveDestination() {
  const name = document.getElementById('destName').value.trim();
  const url = document.getElementById('destUrl').value.trim();
  const auth_type = document.getElementById('destAuthType').value;
  const auth_value = document.getElementById('destAuthValue').value.trim() || null;
  const active = document.getElementById('destActive').checked;
  const log_types = Array.from(document.querySelectorAll('.log-type-cb:checked')).map(cb => cb.value);

  if (!name || !url) { showToast('Name and URL are required', 'error'); return; }
  if (log_types.length === 0) { showToast('Select at least one log type', 'error'); return; }

  const body = { name, url, auth_type, auth_value, log_types, active };
  try {
    if (editingId) {
      await api(`/api/destinations/${editingId}`, { method: 'PATCH', body });
      showToast('Destination updated', 'success');
    } else {
      await api('/api/destinations', { method: 'POST', body });
      showToast('Destination added', 'success');
    }
    closeModal('destModal');
    await loadDestinations();
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

/* Delivery History */
async function initDeliveryHistory() {
  const page = document.getElementById('page-delivery-history');
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="clearHistory()">Clear History</button>
  `;

  page.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;

  try {
    const data = await api('/api/history?limit=100');
    if (data.items.length === 0) {
      page.innerHTML = `<div class="empty-state">
        <div class="empty-title">No Delivery Records</div>
        <div class="empty-sub">Delivery history will appear here once events are forwarded.</div>
      </div>`;
      return;
    }

    const rows = data.items.map(item => {
      const statusClass = item.status_code >= 200 && item.status_code < 300 ? 'pill-green' :
                          item.status_code === 0 ? 'pill-red' : 'pill-yellow';
      const statusLabel = item.status_code === 0 ? 'Error' : `HTTP ${item.status_code}`;
      return `<tr>
        <td style="font-size:12px;color:#64748b">${new Date(item.created_at).toLocaleString()}</td>
        <td><span class="pill pill-blue">${item.log_type || '—'}</span></td>
        <td style="font-size:13px">${escHtml(item.destination_name || '—')}</td>
        <td><span class="pill ${statusClass}">${statusLabel}</span></td>
        <td style="font-size:12px;color:#64748b">${item.latency_ms != null ? item.latency_ms + 'ms' : '—'}</td>
        <td style="font-size:12px;color:#ef4444">${item.error ? escHtml(item.error.slice(0,60)) : ''}</td>
      </tr>`;
    }).join('');

    page.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Recent Deliveries</h3>
          <span style="font-size:13px;color:#64748b">${data.total} total records</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Time</th><th>Log Type</th><th>Destination</th>
              <th>Status</th><th>Latency</th><th>Error</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    page.innerHTML = `<div class="alert alert-error">Failed to load history: ${err.message}</div>`;
  }
}

async function clearHistory() {
  if (!confirm('Clear all delivery history? This cannot be undone.')) return;
  try {
    await api('/api/history', { method: 'DELETE' });
    showToast('History cleared', 'success');
    await initDeliveryHistory();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

/* Modal HTML (injected once) */
function ensureDestModal() {
  if (document.getElementById('destModal')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="destModal" onclick="onModalOverlayClick(event,'destModal')">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="destModalTitle">Add Destination</div>
          <button class="modal-close" onclick="closeModal('destModal')">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name <span class="req">*</span></label>
            <input class="form-input" id="destName" placeholder="e.g. Slack Webhook, Datadog">
          </div>
          <div class="form-group">
            <label class="form-label">Endpoint URL <span class="req">*</span></label>
            <input class="form-input" id="destUrl" type="url" placeholder="https://hooks.example.com/...">
          </div>
          <div class="form-group">
            <label class="form-label">Authentication</label>
            <select class="form-select" id="destAuthType" onchange="updateAuthValueField(this.value)">
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth (user:password)</option>
              <option value="custom">Custom Header (JSON)</option>
            </select>
          </div>
          <div class="form-group" id="destAuthValueWrap" style="display:none">
            <label class="form-label" id="destAuthValueLabel">Value</label>
            <input class="form-input" id="destAuthValue" type="text">
          </div>
          <div class="form-group">
            <label class="form-label">Log Types to Forward <span class="req">*</span></label>
            <div class="checkbox-group">
              ${Object.entries(LOG_TYPE_LABELS).map(([val, label]) => `
                <label class="checkbox-item" onclick="this.classList.toggle('checked')">
                  <input type="checkbox" class="log-type-cb" value="${val}" onchange="this.closest('.checkbox-item').classList.toggle('checked',this.checked)">
                  ${label}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="toggle">
              <input type="checkbox" id="destActive" checked>
              <div class="toggle-track"></div>
              <span class="toggle-label">Active (start forwarding immediately)</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('destModal')">Cancel</button>
          <button class="btn btn-primary" onclick="saveDestination()">Save Destination</button>
        </div>
      </div>
    </div>
  `);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
