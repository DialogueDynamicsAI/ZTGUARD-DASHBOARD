/* ─── ZTGuard — Identity Providers ──────────────────────────────────────── */

const IDP_VARIANT_META = {
  google: {
    label: 'Google',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.805 10.023H12v4.5h5.618C16.8 16.98 14.6 18 12 18c-3.314 0-6-2.686-6-6s2.686-6 6-6c1.49 0 2.847.543 3.888 1.432l3.182-3.182C17.243 2.583 14.742 1.5 12 1.5 6.201 1.5 1.5 6.201 1.5 12S6.201 22.5 12 22.5c5.523 0 10.5-4.5 10.5-10.5 0-.654-.064-1.293-.195-1.977z"/></svg>`,
    fields: ['clientId', 'clientSecret'],
  },
  azure: {
    label: 'Azure Entra ID',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    fields: ['clientId', 'clientSecret', 'tenantId'],
  },
  oidc: {
    label: 'Generic OIDC',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
    fields: ['clientId', 'clientSecret', 'authUrl', 'tokenUrl', 'scopes'],
  },
};

const FIELD_LABELS = {
  clientId:     { label: 'Client ID',     placeholder: 'OAuth2 Client ID', type: 'text' },
  clientSecret: { label: 'Client Secret', placeholder: 'OAuth2 Client Secret', type: 'password' },
  tenantId:     { label: 'Tenant ID',     placeholder: 'Azure AD Tenant ID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', type: 'text' },
  authUrl:      { label: 'Auth URL',      placeholder: 'https://...oauth2/authorize', type: 'url' },
  tokenUrl:     { label: 'Token URL',     placeholder: 'https://...oauth2/token', type: 'url' },
  scopes:       { label: 'Scopes',        placeholder: 'openid email profile', type: 'text' },
};

async function initIdp() {
  const page = document.getElementById('page-idp');
  if (!page) return;

  page.innerHTML = `
    <div style="max-width:820px;margin:0 auto">

      <!-- Enable card -->
      <div class="card" style="margin-bottom:20px" id="idp-enable-card">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h3 style="margin:0">Identity Provider Support</h3>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b">Grant SSO capability to the Pangolin server. This is a one-time setup step.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span id="idp-status-pill" class="pill pill-gray">Checking...</span>
            <button class="btn btn-primary" id="idp-enable-btn" onclick="idpEnable()" style="display:none">Enable IdP Support</button>
          </div>
        </div>
      </div>

      <!-- Active providers list -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0">Active Identity Providers</h3>
          <button class="btn btn-primary" id="idp-add-btn" onclick="idpShowForm()" style="display:none">+ Add Provider</button>
        </div>
        <div class="card-body" style="padding:0" id="idp-list-wrap">
          <div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px">Loading...</div>
        </div>
      </div>

      <!-- Add form (hidden by default) -->
      <div class="card" id="idp-form-card" style="display:none;margin-bottom:20px">
        <div class="card-header">
          <h3 style="margin:0">Add Identity Provider</h3>
        </div>
        <div class="card-body">

          <!-- Provider type selector -->
          <div style="margin-bottom:20px">
            <label class="form-label">Provider Type</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px">
              ${Object.entries(IDP_VARIANT_META).map(([k, v]) => `
                <button type="button" onclick="idpSelectVariant('${k}')" id="idp-type-${k}"
                  style="padding:14px 10px;border:2px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit;transition:all .15s">
                  <span style="color:#64748b">${v.icon}</span>
                  <span style="font-size:13px;font-weight:600;color:#374151">${v.label}</span>
                </button>`).join('')}
            </div>
          </div>

          <!-- Display name -->
          <div style="margin-bottom:16px">
            <label class="form-label">Display Name</label>
            <input id="idp-name" class="form-input" type="text" placeholder="e.g. Company Google SSO" style="width:100%">
          </div>

          <!-- Dynamic credential fields -->
          <div id="idp-dynamic-fields"></div>

          <!-- Auto Provision toggle -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid #f1f5f9;margin-top:8px">
            <div>
              <div style="font-size:13px;font-weight:600;color:#374151">Auto Provision Users</div>
              <div style="font-size:11px;color:#94a3b8">Automatically create Pangolin accounts on first SSO login</div>
            </div>
            <div id="idp-autoprovision-toggle" data-checked="true" onclick="idpToggleAutoProvision()"
              style="width:40px;height:22px;border-radius:11px;background:#2563eb;cursor:pointer;position:relative;transition:background .2s">
              <div style="position:absolute;top:3px;left:21px;width:16px;height:16px;background:#fff;border-radius:50%;transition:left .2s"></div>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn btn-primary" onclick="idpSave()">Save Identity Provider</button>
            <button class="btn btn-secondary" onclick="idpHideForm()">Cancel</button>
          </div>
          <div id="idp-form-error" style="margin-top:10px;color:#ef4444;font-size:12px;display:none"></div>
        </div>
      </div>

    </div>`;

  await idpLoad();
}

let _idpVariant = 'google';

function idpSelectVariant(variant) {
  _idpVariant = variant;
  Object.keys(IDP_VARIANT_META).forEach(k => {
    const btn = document.getElementById(`idp-type-${k}`);
    if (!btn) return;
    if (k === variant) {
      btn.style.borderColor = '#2563eb';
      btn.style.background = '#eff6ff';
      btn.querySelector('span:first-child').style.color = '#2563eb';
    } else {
      btn.style.borderColor = '#e2e8f0';
      btn.style.background = '#fff';
      btn.querySelector('span:first-child').style.color = '#64748b';
    }
  });
  idpRenderFields(variant);
}

function idpRenderFields(variant) {
  const meta = IDP_VARIANT_META[variant];
  const wrap = document.getElementById('idp-dynamic-fields');
  if (!wrap) return;
  wrap.innerHTML = meta.fields.map(f => {
    const fl = FIELD_LABELS[f];
    return `
      <div style="margin-bottom:14px">
        <label class="form-label">${fl.label}</label>
        <input id="idp-field-${f}" class="form-input" type="${fl.type}" placeholder="${fl.placeholder}" style="width:100%"
          ${f === 'scopes' ? 'value="openid email profile"' : ''}>
      </div>`;
  }).join('');
}

function idpToggleAutoProvision() {
  const el = document.getElementById('idp-autoprovision-toggle');
  const checked = el.dataset.checked === 'true';
  el.dataset.checked = String(!checked);
  el.style.background = !checked ? '#2563eb' : '#cbd5e1';
  el.querySelector('div').style.left = !checked ? '21px' : '3px';
}

function idpShowForm() {
  document.getElementById('idp-form-card').style.display = '';
  document.getElementById('idp-form-card').scrollIntoView({ behavior: 'smooth' });
  idpSelectVariant('google');
}

function idpHideForm() {
  document.getElementById('idp-form-card').style.display = 'none';
  document.getElementById('idp-form-error').style.display = 'none';
}

async function idpEnable() {
  const btn = document.getElementById('idp-enable-btn');
  btn.disabled = true;
  btn.textContent = 'Enabling...';
  try {
    const r = await api('/api/idp/enable', { method: 'POST' });
    if (r.ok) {
      showToast('Identity Provider support enabled!', 'success');
      await idpLoad();
    } else {
      showToast(r.error || 'Failed to enable IdP support', 'error');
      btn.disabled = false;
      btn.textContent = 'Enable IdP Support';
    }
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Enable IdP Support';
  }
}

async function idpLoad() {
  try {
    const data = await api('/api/idp');
    const idps = data?.data?.idps || [];

    const statusPill = document.getElementById('idp-status-pill');
    const enableBtn = document.getElementById('idp-enable-btn');
    const addBtn = document.getElementById('idp-add-btn');

    if (data?.needsEnable) {
      statusPill.textContent = 'Not Enabled';
      statusPill.className = 'pill pill-red';
      if (enableBtn) enableBtn.style.display = '';
      if (addBtn) addBtn.style.display = 'none';
      document.getElementById('idp-list-wrap').innerHTML =
        `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">
          Identity Provider support is not yet enabled.<br>Click <strong>Enable IdP Support</strong> above to activate.
        </div>`;
      return;
    }

    statusPill.textContent = 'Enabled';
    statusPill.className = 'pill pill-green';
    if (enableBtn) enableBtn.style.display = 'none';
    if (addBtn) addBtn.style.display = '';

    if (idps.length === 0) {
      document.getElementById('idp-list-wrap').innerHTML =
        `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px">
          No identity providers configured yet.<br>
          <button class="btn btn-primary" onclick="idpShowForm()" style="margin-top:12px">+ Add Your First Provider</button>
        </div>`;
      return;
    }

    document.getElementById('idp-list-wrap').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Name</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Type</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Auto Provision</th>
            <th style="padding:10px 14px;text-align:right;color:#374151;font-weight:600">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${idps.map(idp => `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:10px 14px;font-weight:600">${escHtml(idp.name || '')}</td>
              <td style="padding:10px 14px">
                <span class="pill ${idp.type === 'oidc' && idp.variant === 'google' ? 'pill-red' : idp.variant === 'azure' ? 'pill-blue' : 'pill-gray'}" style="font-size:11px">
                  ${idp.variant === 'google' ? 'Google' : idp.variant === 'azure' ? 'Azure Entra ID' : 'OIDC'}
                </span>
              </td>
              <td style="padding:10px 14px;color:${idp.autoProvision ? '#10b981' : '#94a3b8'}">
                ${idp.autoProvision ? 'Yes' : 'No'}
              </td>
              <td style="padding:10px 14px;text-align:right">
                <button class="btn btn-danger btn-sm" onclick="idpDelete(${idp.idpId}, '${escHtml(idp.name)}')">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    document.getElementById('idp-list-wrap').innerHTML =
      `<div style="padding:24px;text-align:center;color:#ef4444;font-size:13px">Error: ${escHtml(e.message)}</div>`;
  }
}

async function idpSave() {
  const errEl = document.getElementById('idp-form-error');
  errEl.style.display = 'none';

  const variant = _idpVariant;
  const name = document.getElementById('idp-name')?.value?.trim();
  const autoProvision = document.getElementById('idp-autoprovision-toggle')?.dataset.checked === 'true';

  if (!name) { errEl.textContent = 'Display name is required'; errEl.style.display = ''; return; }

  const payload = { variant, name, autoProvision };
  const meta = IDP_VARIANT_META[variant];

  for (const f of meta.fields) {
    const val = document.getElementById(`idp-field-${f}`)?.value?.trim();
    if (!val && f !== 'scopes') { errEl.textContent = `${FIELD_LABELS[f].label} is required`; errEl.style.display = ''; return; }
    payload[f] = val;
  }

  try {
    const r = await api('/api/idp', { method: 'POST', body: JSON.stringify(payload) });
    if (r.success || r.data) {
      showToast('Identity provider created!', 'success');
      idpHideForm();
      await idpLoad();
    } else {
      errEl.textContent = r.error || r.message || 'Failed to create identity provider';
      errEl.style.display = '';
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

async function idpDelete(idpId, name) {
  if (!confirm(`Delete identity provider "${name}"? Users will no longer be able to sign in with this provider.`)) return;
  try {
    const r = await api(`/api/idp/${idpId}`, { method: 'DELETE' });
    if (r.success || r.ok) {
      showToast('Identity provider deleted', 'success');
      await idpLoad();
    } else {
      showToast(r.error || 'Failed to delete', 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}
