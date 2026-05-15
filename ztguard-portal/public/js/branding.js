/* ─── Branding Page ──────────────────────────────────────────────────────── */

let brandingConfig = {};
let newLogoData = null;
let activeTab = 'identity';

let _pangolinBaseUrl = '';

async function initBranding() {
  const page = document.getElementById('page-branding');
  document.getElementById('topbarActions').innerHTML = '';
  page.innerHTML = `<div style="text-align:center;padding:60px"><div class="spinner"></div></div>`;
  try {
    [brandingConfig] = await Promise.all([
      api('/api/branding'),
      api('/api/connection').then(c => { _pangolinBaseUrl = (c.pangolin_url || '').replace(/\/$/, ''); }).catch(() => {}),
    ]);
    renderBrandingPage();
  } catch (err) {
    page.innerHTML = `<div class="alert alert-error">Failed to load branding config: ${err.message}</div>`;
  }
}

function renderBrandingPage() {
  const page = document.getElementById('page-branding');
  const logoSrc = brandingConfig.has_logo ? window.location.origin + '/ztguard/api/branding/logo?t=' + Date.now() : null;
  const color = brandingConfig.primary_color || '#2563eb';
  const orgName = brandingConfig.org_name || 'ZTGuard';
  const authTitle = brandingConfig.auth_title || 'Authenticate to access {{resourceName}}';
  const authSubtitle = brandingConfig.auth_subtitle || 'Choose your preferred authentication method for {{resourceName}}';
  const customCss = brandingConfig.custom_css || '';
  const customHeaderHtml = brandingConfig.custom_header_html || '';
  const customFooterHtml = brandingConfig.custom_footer_html || '';
  const loginTheme = brandingConfig.login_theme || 'dark';
  const hideAttr = brandingConfig.hide_attribution !== '0';
  const hideSidebar = brandingConfig.hide_sidebar_branding !== '0';

  page.innerHTML = `
    <div class="branding-layout">

      <!-- Left panel -->
      <div class="branding-left">

        <!-- Tab bar -->
        <div class="br-tabs">
          <button class="br-tab ${activeTab==='identity'?'active':''}" onclick="switchBrTab('identity')">Identity</button>
          <button class="br-tab ${activeTab==='login'?'active':''}" onclick="switchBrTab('login')">Login Page</button>
          <button class="br-tab ${activeTab==='code'?'active':''}" onclick="switchBrTab('code')">Custom Code</button>
          <button class="br-tab ${activeTab==='email'?'active':''}" onclick="switchBrTab('email')">Email</button>
          <button class="br-tab ${activeTab==='pangolin'?'active':''}" onclick="switchBrTab('pangolin')">Pangolin Sync</button>
        </div>

        <!-- IDENTITY TAB -->
        <div class="br-tab-body ${activeTab==='identity'?'active':''}" id="brtab-identity">

          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3>Organization Identity</h3></div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Organization Name</label>
                <input class="form-input" id="brOrgName" value="${escHtml(orgName)}" placeholder="Your Organization Name"
                  oninput="livePreview()">
                <div class="form-hint">Shown in dashboard header, login pages, and notification emails.</div>
              </div>

              <div class="form-group">
                <label class="form-label">Primary Brand Color</label>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <input type="color" id="brColorPicker" value="${color}"
                    oninput="syncColorInput(this.value)"
                    style="width:44px;height:36px;border:none;background:none;cursor:pointer;border-radius:8px;overflow:hidden;padding:0">
                  <input class="form-input" id="brColorHex" value="${color}"
                    placeholder="#2563eb" maxlength="9" oninput="syncColorPicker(this.value)"
                    style="font-family:monospace;max-width:120px">
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${['#2563eb','#7c3aed','#db2777','#dc2626','#d97706','#16a34a','#0891b2','#0f172a'].map(c =>
                      `<div class="color-swatch" style="background:${c}" title="${c}" onclick="setColor('${c}')"></div>`
                    ).join('')}
                  </div>
                </div>
                <div class="form-hint">Used for buttons, links, and accent elements on login pages.</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Organization Logo</h3>
              ${logoSrc ? `<button class="btn btn-danger btn-sm" onclick="removeLogo()">Remove</button>` : ''}
            </div>
            <div class="card-body">
              ${logoSrc ? `
                <div class="current-logo-wrap">
                  <img src="${logoSrc}" alt="Current logo" class="current-logo-img" id="pvLogoImg">
                  <div style="font-size:12px;color:#94a3b8;margin-top:6px">Current logo</div>
                </div>
              ` : ''}
              <div class="logo-dropzone" id="logoDropzone"
                ondragover="event.preventDefault();this.classList.add('drag-over')"
                ondragleave="this.classList.remove('drag-over')"
                ondrop="handleLogoDrop(event)">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:#94a3b8;margin-bottom:6px">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                </svg>
                <div style="font-size:13px;font-weight:600;margin-bottom:3px">Drag &amp; drop image here</div>
                <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">PNG, JPG, SVG, WebP · Max 2MB</div>
                <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                  Browse…
                  <input type="file" accept="image/*" onchange="handleLogoFile(this)" style="display:none">
                </label>
              </div>
              <div id="logoPreviewNew" style="display:none;margin-top:12px">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px">New logo (unsaved)</div>
                <div style="display:flex;align-items:center;gap:12px">
                  <img id="logoPreviewImg" src="" alt="Preview" class="current-logo-img">
                  <button class="btn btn-danger btn-sm" onclick="clearNewLogo()">Remove</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- LOGIN PAGE TAB -->
        <div class="br-tab-body ${activeTab==='login'?'active':''}" id="brtab-login">
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3>Resource Authentication Page</h3></div>
            <div class="card-body">
              <div class="alert alert-info" style="margin-bottom:16px">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Use <code style="background:#e2e8f0;padding:1px 5px;border-radius:3px">{{resourceName}}</code> as a placeholder for the resource name.
              </div>
              <div class="form-group">
                <label class="form-label">Page Title</label>
                <input class="form-input" id="brAuthTitle" value="${escHtml(authTitle)}"
                  placeholder="Authenticate to access {{resourceName}}" oninput="livePreview()">
              </div>
              <div class="form-group">
                <label class="form-label">Page Subtitle</label>
                <input class="form-input" id="brAuthSubtitle" value="${escHtml(authSubtitle)}"
                  placeholder="Choose your preferred authentication method" oninput="livePreview()">
              </div>
              <div class="form-group">
                <label class="form-label">Pangolin Attribution</label>
                <label class="toggle" style="cursor:pointer">
                  <input type="checkbox" id="brHideAttribution" ${hideAttr ? 'checked' : ''}
                    onchange="document.getElementById('brHideAttrVal').value=this.checked?'1':'0'">
                  <div class="toggle-track"></div>
                  <span class="toggle-label" style="font-size:13px;font-weight:500">Hide "Powered by Pangolin" and supporter notices</span>
                </label>
                <input type="hidden" id="brHideAttrVal" value="${hideAttr ? '1' : '0'}">
                <div class="form-hint" style="margin-top:6px">Removes "Powered by Pangolin" and supporter notices from resource auth pages.</div>
              </div>

              <div class="form-group">
                <label class="form-label">Dashboard Sidebar Branding</label>
                <label class="toggle" style="cursor:pointer">
                  <input type="checkbox" id="brHideSidebar" ${hideSidebar ? 'checked' : ''}
                    onchange="document.getElementById('brHideSidebarVal').value=this.checked?'1':'0'">
                  <div class="toggle-track"></div>
                  <span class="toggle-label" style="font-size:13px;font-weight:500">Hide "Buy Supporter Key" and "Community Edition" from sidebar</span>
                </label>
                <input type="hidden" id="brHideSidebarVal" value="${hideSidebar ? '1' : '0'}">
                <div class="form-hint" style="margin-top:6px">Removes supporter key button and edition label from the Pangolin dashboard sidebar.</div>
              </div>

              <div class="form-group">
                <label class="form-label">Login Page Theme</label>
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button type="button" id="themeLight"
                    onclick="setLoginTheme('light')"
                    class="theme-btn ${loginTheme==='light'?'active':''}"
                    style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${loginTheme==='light'?'#2563eb':'#e2e8f0'};background:${loginTheme==='light'?'rgba(37,99,235,0.08)':'#fff'};color:${loginTheme==='light'?'#2563eb':'#64748b'};font-family:inherit;transition:all .15s">
                    ☀️ Light Mode
                  </button>
                  <button type="button" id="themeDark"
                    onclick="setLoginTheme('dark')"
                    class="theme-btn ${loginTheme==='dark'?'active':''}"
                    style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${loginTheme==='dark'?'#10b981':'#e2e8f0'};background:${loginTheme==='dark'?'rgba(10,15,30,0.08)':'#fff'};color:${loginTheme==='dark'?'#10b981':'#64748b'};font-family:inherit;transition:all .15s">
                    🌙 Dark Mode
                  </button>
                </div>
                <div class="form-hint">Applies to the Pangolin <code>/auth/login</code> page immediately on save.</div>
                <input type="hidden" id="brLoginTheme" value="${loginTheme}">
              </div>

              <div class="form-group">
                <label class="form-label">Custom Login Page URL Override</label>
                <input class="form-input" id="brLoginUrl" value="${escHtml(brandingConfig.login_url || '')}"
                  placeholder="https://auth.example.com/login (optional)">
                <div class="form-hint">Override the Pangolin login page URL for your organization.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- CUSTOM CODE TAB -->
        <div class="br-tab-body ${activeTab==='code'?'active':''}" id="brtab-code">
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3>Custom CSS</h3>
              <span class="pill pill-blue">Injected on login pages</span>
            </div>
            <div class="card-body" style="padding:0">
              <div class="code-editor-wrap">
                <div class="code-editor-bar">
                  <span style="font-size:11px;color:#64748b;font-weight:600">CSS</span>
                  <button class="btn btn-ghost btn-sm" onclick="insertCssSnippet()">Insert snippet…</button>
                </div>
                <textarea class="code-editor" id="brCustomCss" placeholder="/* Custom CSS for Pangolin login pages */
.login-container { border-radius: 16px; }
button.primary { border-radius: 8px; }"
                  oninput="livePreview()">${escHtml(customCss)}</textarea>
              </div>
            </div>
          </div>

          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3>Custom Header HTML</h3>
              <span class="pill pill-blue">Above login form</span>
            </div>
            <div class="card-body" style="padding:0">
              <div class="code-editor-wrap">
                <div class="code-editor-bar">
                  <span style="font-size:11px;color:#64748b;font-weight:600">HTML</span>
                </div>
                <textarea class="code-editor" id="brHeaderHtml"
                  placeholder="<!-- e.g. company banner, announcement -->">${escHtml(customHeaderHtml)}</textarea>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Custom Footer HTML</h3>
              <span class="pill pill-blue">Below login form</span>
            </div>
            <div class="card-body" style="padding:0">
              <div class="code-editor-wrap">
                <div class="code-editor-bar">
                  <span style="font-size:11px;color:#64748b;font-weight:600">HTML</span>
                </div>
                <textarea class="code-editor" id="brFooterHtml"
                  placeholder="<!-- e.g. support link, privacy policy -->">${escHtml(customFooterHtml)}</textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- EMAIL TAB -->
        <div class="br-tab-body ${activeTab==='email'?'active':''}" id="brtab-email">

          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3>Email Sender</h3></div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Sender Display Name</label>
                <input class="form-input" id="brEmailSenderName" value="${escHtml(brandingConfig.email_sender_name || 'ZTGuard')}"
                  placeholder="ZTGuard">
                <div class="form-hint">Shown as the sender name in Pangolin notification emails.</div>
              </div>

              <div class="form-group">
                <label class="form-label">Email Logo URL</label>
                <input class="form-input" id="brEmailLogoUrl"
                  value="${escHtml(brandingConfig.email_logo_url || 'https://ztguard.net/images/ztguard-logo-dark.png')}"
                  placeholder="https://yoursite.com/your-logo.png">
                <div class="form-hint">
                  Public URL to the logo image shown in Pangolin notification emails (OTP codes, invitations, password resets).<br>
                  Must be a publicly accessible HTTPS URL. Saves directly to Pangolin's email template — restart Pangolin to apply.
                </div>
                ${brandingConfig.email_logo_url
                  ? `<div style="margin-top:8px"><img src="${escHtml(brandingConfig.email_logo_url)}" alt="Email logo preview" style="max-height:48px;max-width:200px;border:1px solid #e5e7eb;border-radius:4px;padding:4px;background:white" onerror="this.style.display='none'"></div>`
                  : ''}
              </div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
                <input type="checkbox" id="brEmailUseLogo" ${brandingConfig.email_use_logo !== '0' ? 'checked' : ''}
                  style="width:15px;height:15px">
                <span class="form-label" style="margin:0">Apply branding patches to Pangolin email templates</span>
              </label>
              <div class="form-hint">When enabled, re-running the patch script will replace the Pangolin logo and name in outgoing emails.</div>
            </div>
          </div>

          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3>Email Types Sent by Pangolin</h3></div>
            <div class="card-body" style="padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead><tr style="background:#f8fafc">
                  <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Email Type</th>
                  <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Trigger</th>
                  <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb">Branding</th>
                </tr></thead>
                <tbody>
                  ${[
                    ['Resource OTP Code',    'User accesses a protected resource',       'Sender name applies'],
                    ['Invitation',           'Admin invites a user to the org',          'Sender name applies'],
                    ['Password Reset',       'User requests a password reset',           'Sender name applies'],
                    ['2FA Enabled/Disabled', 'User changes 2FA settings',                'Sender name applies'],
                  ].map(([type, trigger, status]) => `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:9px 14px;font-weight:500;color:#111827">${type}</td>
                      <td style="padding:9px 14px;color:#6b7280">${trigger}</td>
                      <td style="padding:9px 14px"><span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a">${status}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div><!-- /brtab-email -->

        <!-- PANGOLIN SYNC TAB -->
        <div class="br-tab-body ${activeTab==='pangolin'?'active':''}" id="brtab-pangolin">

          <!-- Live Auth Page Status -->
          <div class="card" style="margin-bottom:16px;border-left:4px solid #10b981">
            <div class="card-header">
              <h3 style="color:#059669">Resource Auth Page Status</h3>
              <span class="pill pill-green">Live</span>
            </div>
            <div class="card-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div id="attrStatusCard" style="background:${brandingConfig.js_attribution_hidden?'#f0fdf4':'#fef2f2'};border:1px solid ${brandingConfig.js_attribution_hidden?'#a7f3d0':'#fecaca'};border-radius:8px;padding:12px">
                  <div style="font-size:11px;font-weight:700;color:${brandingConfig.js_attribution_hidden?'#065f46':'#991b1b'};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Attribution</div>
                  <div style="font-size:13px;font-weight:600;color:${brandingConfig.js_attribution_hidden?'#059669':'#ef4444'}">${brandingConfig.js_attribution_hidden?'Hidden ✓':'Visible'}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px">${brandingConfig.js_attribution_hidden?'Powered by + Supporter key removed':'Toggle above to hide'}</div>
                </div>
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px">
                  <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Login Theme</div>
                  <div style="font-size:13px;font-weight:600;color:#2563eb">${loginTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px">Toggle in Identity tab</div>
                </div>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <a href="https://portal.srmanpower.net/" target="_blank" class="btn btn-primary btn-sm">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  Open Resource Auth Page
                </a>
                <a href="${_pangolinBaseUrl}/auth/login" target="_blank" class="btn btn-secondary btn-sm">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  Open Pangolin Login
                </a>
                <a href="${_pangolinBaseUrl}" target="_blank" class="btn btn-secondary btn-sm">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  Pangolin Dashboard
                </a>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Sync to Pangolin API</h3></div>
            <div class="card-body">
              <div class="alert alert-info" style="margin-bottom:20px">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                These fields push directly to the Pangolin Organization API endpoint when you save. Requires a valid API key in the connection settings.
              </div>
              <table style="width:100%">
                <tr><td class="sync-label">Organization Name</td><td><span class="pill pill-green">Synced on save</span></td></tr>
                <tr><td class="sync-label">Primary Color</td><td><span class="pill pill-gray">Stored locally</span></td></tr>
                <tr><td class="sync-label">Logo</td><td><span class="pill pill-gray">Stored locally</span></td></tr>
                <tr><td class="sync-label">Auth Page Title</td><td><span class="pill pill-gray">Stored locally</span></td></tr>
                <tr><td class="sync-label">Auth Page Subtitle</td><td><span class="pill pill-gray">Stored locally</span></td></tr>
                <tr><td class="sync-label">Custom CSS / HTML</td><td><span class="pill pill-gray">Stored locally</span></td></tr>
                <tr><td class="sync-label">Hide Attribution</td><td><span class="pill pill-green">Active (JS patch)</span></td></tr>
              </table>
              <div style="margin-top:20px">
                <button class="btn btn-secondary" onclick="testPangolinConnection()">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Test Pangolin Connection
                </button>
                <div id="pangolinTestResult" style="margin-top:10px"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save bar -->
        <div class="br-save-bar">
          <button class="btn btn-primary" onclick="saveBranding()">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Save All Changes
          </button>
          <button class="btn btn-secondary" onclick="initBranding()">Discard</button>
          <span id="brSaveStatus" style="font-size:12px;color:#64748b;margin-left:8px"></span>
        </div>
      </div>

      <!-- Right: Live Preview -->
      <div class="branding-right">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
          Live Preview
          <div style="display:flex;gap:6px">
            <button class="preview-device-btn active" id="pvDevDesktop" onclick="setPreviewDevice('desktop')" title="Desktop">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </button>
            <button class="preview-device-btn" id="pvDevMobile" onclick="setPreviewDevice('mobile')" title="Mobile">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="preview-frame-wrap" id="previewFrameWrap">
          <iframe id="brandPreviewFrame" class="preview-frame" frameborder="0"
            sandbox="allow-same-origin allow-scripts"></iframe>
        </div>
        <div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:8px">
          Preview updates as you type
        </div>
      </div>

    </div>
  `;

  // Inline styles for this page
  injectBrandingStyles();
  livePreview();
}

function injectBrandingStyles() {
  if (document.getElementById('brandingPageStyles')) return;
  const s = document.createElement('style');
  s.id = 'brandingPageStyles';
  s.textContent = `
    .branding-layout { display:grid; grid-template-columns:1fr 420px; gap:24px; align-items:start; }
    .branding-left { min-width:0; }
    .branding-right { position:sticky; top:80px; }
    .br-tabs { display:flex; gap:2px; background:#f1f5f9; padding:4px; border-radius:10px; margin-bottom:16px; }
    .br-tab { flex:1; padding:7px 12px; font-size:12px; font-weight:600; background:transparent; border:none; border-radius:7px; cursor:pointer; color:#64748b; font-family:inherit; transition:all .15s; }
    .br-tab.active { background:#fff; color:#0f172a; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .br-tab-body { display:none; }
    .br-tab-body.active { display:block; }
    .br-save-bar { display:flex; align-items:center; gap:10px; margin-top:20px; padding:16px 20px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; }
    .color-swatch { width:24px; height:24px; border-radius:6px; cursor:pointer; border:2px solid transparent; transition:transform .1s, border-color .1s; flex-shrink:0; }
    .color-swatch:hover { transform:scale(1.2); border-color:#94a3b8; }
    .current-logo-wrap { margin-bottom:16px; }
    .current-logo-img { max-height:64px; max-width:240px; border-radius:8px; border:1px solid #e2e8f0; padding:8px; background:#f8fafc; }
    .code-editor-wrap { border-top:1px solid #e2e8f0; }
    .code-editor-bar { display:flex; align-items:center; justify-content:space-between; padding:8px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .code-editor { width:100%; min-height:140px; padding:14px 16px; font-family:'JetBrains Mono','Fira Code',Consolas,monospace; font-size:12px; line-height:1.7; background:#1e293b; color:#e2e8f0; border:none; outline:none; resize:vertical; tab-size:2; }
    .code-editor::placeholder { color:#475569; }
    .sync-label { padding:10px 0; font-size:13px; font-weight:500; color:#374151; width:200px; border-bottom:1px solid #f1f5f9; }
    .sync-label:last-child { border:none; }
    .preview-frame-wrap { border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 4px 20px rgba(0,0,0,0.08); background:#fff; transition:max-width .2s; }
    .preview-frame { width:100%; height:520px; display:block; }
    .preview-device-btn { padding:5px; background:transparent; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; color:#64748b; display:flex; align-items:center; transition:all .15s; }
    .preview-device-btn.active { background:#0f172a; color:#fff; border-color:#0f172a; }
    @media (max-width:1100px) { .branding-layout { grid-template-columns:1fr; } .branding-right { position:static; } }
  `;
  document.head.appendChild(s);
}

function switchBrTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.br-tab').forEach((t,i) => {
    const tabs = ['identity','login','code','pangolin'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.br-tab-body').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('brtab-' + tab);
  if (el) el.classList.add('active');
}

let previewDevice = 'desktop';
function setPreviewDevice(device) {
  previewDevice = device;
  document.getElementById('pvDevDesktop').classList.toggle('active', device==='desktop');
  document.getElementById('pvDevMobile').classList.toggle('active', device==='mobile');
  const wrap = document.getElementById('previewFrameWrap');
  const frame = document.getElementById('brandPreviewFrame');
  if (device === 'mobile') {
    wrap.style.maxWidth = '375px';
    wrap.style.margin = '0 auto';
    frame.style.height = '680px';
  } else {
    wrap.style.maxWidth = '';
    wrap.style.margin = '';
    frame.style.height = '520px';
  }
  livePreview();
}

function livePreview() {
  const frame = document.getElementById('brandPreviewFrame');
  if (!frame) return;

  const theme    = document.getElementById('brLoginTheme')?.value || brandingConfig.login_theme || 'dark';
  const color    = theme === 'dark' ? '#10b981' : (document.getElementById('brColorHex')?.value || brandingConfig.primary_color || '#2563eb');
  const orgName  = document.getElementById('brOrgName')?.value || brandingConfig.org_name || 'ZTGuard';
  const title    = document.getElementById('brAuthTitle')?.value || 'Authenticate to access {{resourceName}}';
  const subtitle = document.getElementById('brAuthSubtitle')?.value || 'Choose your preferred authentication method';
  const customCss = document.getElementById('brCustomCss')?.value || '';
  const headerHtml = document.getElementById('brHeaderHtml')?.value || '';
  const footerHtml = document.getElementById('brFooterHtml')?.value || '';
  const logoSrc  = newLogoData || (brandingConfig.has_logo ? window.location.origin + '/ztguard/api/branding/logo?t=' + Date.now() : null);

  const previewTitle = title.replace(/\{\{resourceName\}\}/g, 'Internal Dashboard');
  const previewSubtitle = subtitle.replace(/\{\{resourceName\}\}/g, 'Internal Dashboard');

  const isDark = theme === 'dark';
  const pageBg = isDark ? '#0a0f1e' : '#f1f5f9';
  const cardBg = isDark ? '#0d1526' : '#ffffff';
  const cardBorder = isDark ? 'rgba(59,130,246,0.25)' : '#e2e8f0';
  const headerBg = isDark ? '#0a0f1e' : '#ffffff';
  const headerBorder = isDark ? 'rgba(59,130,246,0.2)' : '#e2e8f0';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#ffffff';
  const inputBorder = isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const inputColor = isDark ? '#ffffff' : '#0f172a';
  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.55)' : '#64748b';
  const footerColor = isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8';

  const colorDark = adjustColor(color, -30);
  const colorLight = hexToRgba(color, 0.12);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--brand:${color};--brand-dark:${colorDark};--brand-light:${colorLight}}
body{font-family:Inter,system-ui,sans-serif;background:${pageBg};min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.login-shell{width:100%;max-width:${previewDevice==='mobile'?'360px':'420px'}}
.org-header{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:28px}
.org-logo{max-height:40px;max-width:160px;object-fit:contain}
.org-icon{width:40px;height:40px;background:var(--brand);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0}
.org-name{font-size:18px;font-weight:700;color:#0f172a}
.custom-header{margin-bottom:16px;font-size:13px}
.login-card{background:${cardBg};border:1px solid ${cardBorder};border-radius:16px;padding:0;box-shadow:0 4px 20px rgba(0,0,0,0.12);overflow:hidden}
.card-header{background:${headerBg};border-bottom:1px solid ${headerBorder};padding:20px 24px}
.login-title{font-size:17px;font-weight:700;color:${inputColor};margin-bottom:4px}
.login-sub{font-size:13px;color:${subtitleColor};margin-bottom:0}
.card-body{padding:24px}
.login-sub2{font-size:13px;color:${subtitleColor};margin-bottom:20px}
.auth-methods{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
.auth-btn{display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff;font-family:inherit;font-size:13px;font-weight:500;color:#374151;transition:all .15s}
.auth-btn:hover{border-color:var(--brand);background:var(--brand-light);color:var(--brand)}
.auth-btn .icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.auth-btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.auth-btn.primary:hover{background:var(--brand-dark)}
.auth-btn.primary .icon{background:rgba(255,255,255,0.2)}
.divider{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:12px;margin:16px 0}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:#e2e8f0}
.form-input{width:100%;padding:10px 14px;border:1px solid ${inputBorder};border-radius:8px;font-size:13px;font-family:inherit;color:${inputColor};background:${inputBg};outline:none;margin-bottom:10px}
.form-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-light)}
.btn-primary{width:100%;padding:11px;background:var(--brand);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer}
.btn-primary:hover{background:var(--brand-dark)}
.custom-footer{margin-top:20px;font-size:12px;color:#94a3b8;text-align:center}
.powered-by{margin-top:28px;text-align:center;font-size:11px;color:${footerColor}}
${customCss}
</style>
</head>
<body>
<div class="login-shell">
  <div class="org-header">
    ${logoSrc ? `<img class="org-logo" src="${logoSrc}" alt="${escHtml(orgName)}">` : `<div class="org-icon">${escHtml(orgName.charAt(0).toUpperCase())}</div>`}
    <div class="org-name">${escHtml(orgName)}</div>
  </div>
  ${headerHtml ? `<div class="custom-header">${headerHtml}</div>` : ''}
  <div class="login-card">
    <div class="card-header">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        ${logoSrc ? `<img src="${logoSrc}" style="height:36px;object-fit:contain">` : `<div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#06b6d4);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff">${escHtml(orgName.charAt(0))}</div>`}
      </div>
      <div class="login-title">${escHtml(previewTitle)}</div>
      <div class="login-sub">${escHtml(previewSubtitle)}</div>
    </div>
    <div class="card-body">
    <div class="auth-methods">
      <button class="auth-btn primary">
        <div class="icon">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        </div>
        Sign in with Password
      </button>
      <button class="auth-btn">
        <div class="icon" style="background:#f1f5f9">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        </div>
        Continue with Google
      </button>
      <div class="divider">or</div>
      <input class="form-input" placeholder="Email address" readonly>
      <button class="btn-primary">Continue →</button>
    </div>
  </div>
  </div></div>
  ${footerHtml ? `<div class="custom-footer">${footerHtml}</div>` : ''}
  <div class="powered-by">Secured by <strong>${escHtml(orgName)}</strong> · Zero Trust Access</div>
</div>
</body>
</html>`;

  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const old = frame.src;
  frame.src = url;
  if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
}

/* Theme toggle */
function setLoginTheme(theme) {
  document.getElementById('brLoginTheme').value = theme;
  const light = document.getElementById('themeLight');
  const dark = document.getElementById('themeDark');
  if (light) {
    light.style.borderColor = theme==='light' ? '#2563eb' : '#e2e8f0';
    light.style.background = theme==='light' ? 'rgba(37,99,235,0.08)' : '#fff';
    light.style.color = theme==='light' ? '#2563eb' : '#64748b';
  }
  if (dark) {
    dark.style.borderColor = theme==='dark' ? '#10b981' : '#e2e8f0';
    dark.style.background = theme==='dark' ? 'rgba(10,15,30,0.08)' : '#fff';
    dark.style.color = theme==='dark' ? '#10b981' : '#64748b';
  }
  // Update live preview background
  livePreview();
}

/* Color utils */
function adjustColor(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  let r = Math.min(255, Math.max(0, (n>>16) + amount));
  let g = Math.min(255, Math.max(0, ((n>>8)&0xff) + amount));
  let b = Math.min(255, Math.max(0, (n&0xff) + amount));
  return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#',''),16);
  return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`;
}

function syncColorInput(hex) {
  document.getElementById('brColorHex').value = hex;
  livePreview();
}
function syncColorPicker(hex) {
  if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
    document.getElementById('brColorPicker').value = hex;
    livePreview();
  }
}
function setColor(hex) {
  document.getElementById('brColorHex').value = hex;
  document.getElementById('brColorPicker').value = hex;
  livePreview();
}

/* Logo handling */
function handleLogoFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('File must be under 2MB','error'); return; }
  const reader = new FileReader();
  reader.onload = e => { newLogoData = e.target.result; showNewLogoPreview(e.target.result); livePreview(); };
  reader.readAsDataURL(file);
}
function handleLogoDrop(e) {
  e.preventDefault();
  document.getElementById('logoDropzone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) { showToast('Please drop an image file','error'); return; }
  if (file.size > 2*1024*1024) { showToast('File must be under 2MB','error'); return; }
  const reader = new FileReader();
  reader.onload = ev => { newLogoData = ev.target.result; showNewLogoPreview(ev.target.result); livePreview(); };
  reader.readAsDataURL(file);
}
function showNewLogoPreview(dataUrl) {
  const wrap = document.getElementById('logoPreviewNew');
  const img = document.getElementById('logoPreviewImg');
  if (wrap && img) { img.src = dataUrl; wrap.style.display = 'block'; }
}
function clearNewLogo() {
  newLogoData = null;
  const wrap = document.getElementById('logoPreviewNew');
  if (wrap) wrap.style.display = 'none';
  livePreview();
}
async function removeLogo() {
  if (!confirm('Remove the current logo?')) return;
  try {
    await api('/api/branding/logo', { method: 'DELETE' });
    showToast('Logo removed','success');
    newLogoData = null;
    brandingConfig.has_logo = false;
    await initBranding();
  } catch (err) { showToast('Failed: '+err.message,'error'); }
}

/* CSS snippet inserter */
function insertCssSnippet() {
  const snippets = {
    'Rounded corners': '.login-card { border-radius: 20px; }',
    'Drop shadow': '.login-card { box-shadow: 0 20px 60px rgba(0,0,0,0.15); }',
    'Custom font': 'body { font-family: "Poppins", sans-serif; }',
    'Hide powered-by': '.powered-by { display: none; }',
    'Dark background': 'body { background: #0f172a; }',
    'Gradient background': 'body { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); }',
  };
  const choice = prompt('Choose a snippet:\n' + Object.keys(snippets).map((k,i) => `${i+1}. ${k}`).join('\n') + '\n\nEnter number:');
  const keys = Object.keys(snippets);
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < keys.length) {
    const el = document.getElementById('brCustomCss');
    el.value += (el.value ? '\n' : '') + snippets[keys[idx]];
    livePreview();
  }
}

/* Pangolin API test */
async function testPangolinConnection() {
  const el = document.getElementById('pangolinTestResult');
  el.innerHTML = '<div class="spinner" style="display:inline-block"></div> Testing…';
  try {
    const status = await api('/api/status');
    el.innerHTML = `<div class="alert alert-success">Connected — ${status.activeDestinations ?? 0} active destinations, poll interval ${status.pollInterval}s</div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Connection failed: ${err.message}</div>`;
  }
}

/* Save */
async function saveBranding() {
  const status = document.getElementById('brSaveStatus');
  status.textContent = 'Saving…';
  const body = {
    org_name:           document.getElementById('brOrgName')?.value?.trim() || undefined,
    primary_color:      document.getElementById('brColorHex')?.value?.trim() || undefined,
    login_url:          document.getElementById('brLoginUrl')?.value?.trim() || undefined,
    login_theme:        document.getElementById('brLoginTheme')?.value || undefined,
    hide_attribution:        document.getElementById('brHideAttrVal')?.value === '1',
    hide_sidebar_branding:   document.getElementById('brHideSidebarVal')?.value === '1',
    auth_title:         document.getElementById('brAuthTitle')?.value?.trim() || undefined,
    auth_subtitle:      document.getElementById('brAuthSubtitle')?.value?.trim() || undefined,
    custom_css:         document.getElementById('brCustomCss')?.value || undefined,
    custom_header_html: document.getElementById('brHeaderHtml')?.value || undefined,
    custom_footer_html: document.getElementById('brFooterHtml')?.value || undefined,
    email_sender_name:  document.getElementById('brEmailSenderName')?.value?.trim() || undefined,
    email_use_logo:     document.getElementById('brEmailUseLogo')?.checked,
    email_logo_url:     document.getElementById('brEmailLogoUrl')?.value?.trim() || undefined,
  };
  if (newLogoData) body.logo_data = newLogoData;
  try {
    await api('/api/branding', { method: 'POST', body });
    showToast('Branding saved successfully','success');
    status.textContent = 'Saved ✓';
    newLogoData = null;
    brandingConfig = await api('/api/branding');
    livePreview();
    setTimeout(() => status.textContent = '', 3000);
  } catch (err) {
    showToast('Save failed: '+err.message,'error');
    status.textContent = 'Save failed';
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
