(() => {
  let routeVersion = 0;

  function applyTheme(isDark) {
    document.body.classList.toggle('theme-dark', isDark);
    const toggle = document.querySelector('#themeToggle');
    if (!toggle) return;
    const label = toggle.querySelector('.theme-toggle-label');
    if (label) label.textContent = isDark ? 'Day mode' : 'Night mode';
    toggle.setAttribute('aria-label', isDark ? 'Switch to day mode' : 'Switch to night mode');
    toggle.setAttribute('title', isDark ? 'Switch to day mode' : 'Switch to night mode');
  }

  const savedTheme = localStorage.getItem('wa-theme') === 'dark';
  applyTheme(savedTheme);
  document.querySelector('#themeToggle')?.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('theme-dark');
    localStorage.setItem('wa-theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  });

  function refreshDeliveryMetrics() {
    const storageKey = window.getUserDataStorageKey?.() || 'wa-bot-data:guest';
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem(storageKey) || '{}').logs || []; } catch {}
    const successful = logs.filter(log => log.status === 'success').length;
    const failed = logs.filter(log => log.status === 'failed').length;
    const total = successful + failed;
    const set = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
    set('#messagesTotal', total);
    set('#messagesSuccess', successful);
    set('#messagesFailed', failed);
    set('#successRate', total ? `${Math.round(successful / total * 100)}% delivered` : 'No deliveries yet');
    set('#failedRate', total ? `${Math.round(failed / total * 100)}% failed` : 'No failures yet');
    const insight = document.querySelector('#deliveryInsights');
    if (!insight) return;
    const successRate = total ? Math.round(successful / total * 100) : 0;
    const failedRate = total ? Math.round(failed / total * 100) : 0;
    const records = logs.slice(0, 5).map(log => `<div class="delivery-record"><span class="status-dot ${log.status === 'failed' ? 'failed' : ''}">${log.status === 'failed' ? '×' : '✓'}</span><div><b>${e(log.title || 'Message delivery')}</b><p>${e(log.message || '')}</p></div><time>${e(log.time || '')}</time></div>`).join('');
    insight.innerHTML = `<div class="insight-title"><h2>Delivery performance</h2><p>${total ? `${total} delivery attempts recorded.` : 'Send a message to start tracking delivery performance.'}</p></div><div class="delivery-donut" style="--delivery-rate:${successRate}%"><b>${successRate}%</b><span>Delivered</span></div><div class="delivery-donut failed-donut" style="--delivery-rate:${failedRate}%"><b>${failedRate}%</b><span>Failed</span></div><div class="insight-metrics"><div class="insight-metric"><span><i class="insight-dot"></i>Delivered</span><b>${successful}</b></div><div class="insight-metric"><span><i class="insight-dot failed"></i>Failed</span><b>${failed}</b></div><div class="insight-total"><span>Total attempts</span><b>${total}</b></div></div><div class="delivery-chart"><h3>Delivery chart</h3><div class="chart-row"><span>Delivered</span><div class="chart-track"><i class="chart-success" style="width:${successRate}%"></i></div><b>${successful}</b></div><div class="chart-row"><span>Failed</span><div class="chart-track"><i class="chart-failed" style="width:${failedRate}%"></i></div><b>${failed}</b></div></div><div class="delivery-records"><h3>Latest records</h3>${records || '<p>No delivery records yet.</p>'}</div>`;
  }

  function renderQuickGroupPicker() {
    let picker = document.querySelector('#quickGroupPicker');
    const legacySelect = document.querySelector('.group-select select');
    const legacyButton = document.querySelector('.group-select button');
    if (!picker && legacySelect?.parentElement) {
      picker = document.createElement('div');
      picker.id = 'quickGroupPicker';
      legacySelect.parentElement.insertBefore(picker, legacySelect);
    }
    if (!picker || typeof db === 'undefined') return;
    if (legacySelect) legacySelect.classList.add('hidden');
    if (legacyButton) legacyButton.classList.add('hidden');
    picker.innerHTML = `<label class="quick-group-all"><input type="checkbox" id="quickSelectAll"> Select all groups</label><div class="quick-group-options">${db.groups.filter(group => group.active).map(group => `<label><input type="checkbox" class="quick-group-check" value="${e(group.name)}" data-group-id="${e(group.id)}"> ${e(group.name)}</label>`).join('')}</div>`;
    const all = picker.querySelector('#quickSelectAll');
    const checks = [...picker.querySelectorAll('.quick-group-check')];
    all.onchange = () => checks.forEach(check => { check.checked = all.checked; });
    checks.forEach(check => check.onchange = () => { all.checked = checks.length > 0 && checks.every(item => item.checked); });
  }

  window.addEventListener('delivery:updated', () => {
    refreshDeliveryMetrics();
    if (window.currentAppPage === 'Delivery Logs' && typeof window.show === 'function') window.show('Delivery Logs');
  });

  function isAdmin() {
    try { return JSON.parse(localStorage.getItem('wa-auth-user') || 'null')?.role === 'Administrator'; } catch { return false; }
  }

  async function renderAdminPanel(version) {
    const page = document.querySelector('#otherPage');
    page.innerHTML = '<div style="padding:24px;max-width:1180px;margin:auto"><div class="card"><h2>Admin Panel</h2><p>Loading registered users...</p></div></div>';
    try {
      const response = await window.apiFetch('/api/admin/users');
      const data = await response.json();
      if (version !== routeVersion || window.currentAppPage !== 'Admin Panel') return;
      if (!response.ok) throw new Error(data.error || 'Could not load users.');
      page.innerHTML = `<div style="padding:24px;max-width:1180px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2>Admin Panel</h2><p style="margin:5px 0 0;color:#71808e">Registered users overview.</p></div></div><div class="stat-grid"><article class="stat-card blue"><div><span>Total registered users</span><strong>${data.total}</strong><small>Supabase Auth accounts</small></div></article><article class="stat-card green"><div><span>Administrators</span><strong>${data.users.filter(user => user.role === 'Administrator').length}</strong><small>Admin accounts</small></div></article></div><div class="card" style="margin-top:20px;overflow:auto"><div class="card-heading"><h2>Registered Users</h2></div><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>${data.users.map(user => `<tr><td>${e(user.name)}</td><td>${e(user.email)}</td><td>${e(user.role)}</td></tr>`).join('') || '<tr><td colspan="3">No users found.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) {
      if (version !== routeVersion || window.currentAppPage !== 'Admin Panel') return;
      page.innerHTML = `<div style="padding:24px"><div class="card"><h2>Admin Panel</h2><p>${e(error.message)}</p></div></div>`;
    }
  }

  window.show = function safeShow(page) {
    const renderer = { Groups: window.groups, 'Send Message': window.send, 'Message Templates': window.templates, 'Delivery Logs': window.logs, 'Reports & Analytics': window.reports, 'User Management': window.users, Settings: window.settings, 'Admin Panel': window.adminPanel }[page];
    if (typeof renderer !== 'function') return;
    const target = document.querySelector('#otherPage');
    target.innerHTML = renderer();
    if (page === 'Admin Panel' && typeof window.loadAdminUsers === 'function') {
      window.loadAdminUsers();
      document.querySelector('#refreshAdminUsers').onclick = window.loadAdminUsers;
    }
  };

  function route(page, updateHash = true) {
    const link = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (!link) return;
    if (page === 'Admin Panel' && !isAdmin()) {
      const dashboardLink = document.querySelector('.nav-item[data-page="Dashboard"]');
      if (dashboardLink) history.replaceState(null, '', dashboardLink.getAttribute('href'));
      return route('Dashboard', false);
    }

    const version = ++routeVersion;
    window.currentAppPage = page;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === link));
    const displayPage = page === 'Groups' ? 'Groups & Recipients' : page === 'Live Directory' ? 'Total Groups & Contacts' : page;
    document.querySelector('#pageTitle').textContent = displayPage;
    document.querySelector('#crumb').textContent = displayPage;

    const dashboardPage = page === 'Dashboard' || page === 'Scheduled Messages';
    document.querySelector('#dashboard').style.display = dashboardPage ? 'block' : 'none';
    document.querySelector('#otherPage').style.display = dashboardPage ? 'none' : 'block';
    if (dashboardPage && typeof updateDynamicDashboard === 'function') updateDynamicDashboard();
    if (dashboardPage) refreshDeliveryMetrics();
    if (dashboardPage) renderQuickGroupPicker();

    if (updateHash && location.hash !== link.getAttribute('href')) location.hash = link.getAttribute('href');

    if (page === 'Live Directory') renderLiveDirectory(version);
    else if (page === 'Scheduled Messages' && typeof showScheduledModule === 'function') showScheduledModule();
    else if (page === 'Admin Panel') renderAdminPanel(version);
    else if (!dashboardPage && typeof show === 'function') show(page);
    if (page === 'Send Message' && typeof loadRecipientSelector === 'function') {
      setTimeout(() => loadRecipientSelector(), 0);
    }
    window.dispatchEvent(new CustomEvent('app:route', { detail: { page } }));
  }

  async function renderLiveDirectory(version) {
    const page = document.querySelector('#otherPage');
    page.innerHTML = '<div style="padding:24px"><div class="card"><p>Loading groups and contacts...</p></div></div>';
    try {
      const [groupsResponse, contactsResponse] = await Promise.all([
        window.apiFetch('/api/whatsapp/groups'),
        window.apiFetch('/api/whatsapp/contacts')
      ]);
      if (version !== routeVersion || window.currentAppPage !== 'Live Directory') return;
      if (!groupsResponse.ok || !contactsResponse.ok) throw new Error('Could not load groups and contacts. Connect WhatsApp from Settings first.');
      const groups = await groupsResponse.json();
      const contacts = await contactsResponse.json();
      if (version !== routeVersion || window.currentAppPage !== 'Live Directory') return;
      const rows = (items, type) => items.map(item => `<tr><td><b>${e(item.name)}</b></td><td>${e((item.id || '').replace('@c.us', ''))}</td><td><span class="tag">${type}</span></td></tr>`).join('');
      page.innerHTML = `<div style="padding:24px;max-width:1280px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2>Total Groups & Contacts</h2><p style="margin:5px 0 0;color:#71808e">${groups.count} groups and ${contacts.count} contacts synced from your linked WhatsApp number.</p></div><button class="primary" id="refreshDirectory">↻ Refresh list</button></div><div class="dashboard-grid" style="grid-template-columns:1fr 1fr"><div class="card" style="overflow:auto"><div class="card-heading"><h2>Groups (${groups.count})</h2></div><table><thead><tr><th>Name</th><th>WhatsApp ID</th><th>Type</th></tr></thead><tbody>${rows(groups.groups, 'Group') || '<tr><td colspan="3">No groups found.</td></tr>'}</tbody></table></div><div class="card" style="overflow:auto"><div class="card-heading"><h2>Contacts (${contacts.count})</h2></div><table><thead><tr><th>Name</th><th>Number</th><th>Type</th></tr></thead><tbody>${rows(contacts.contacts, 'Contact') || '<tr><td colspan="3">No contacts found.</td></tr>'}</tbody></table></div></div></div>`;
      document.querySelector('#refreshDirectory').onclick = () => renderLiveDirectory(++routeVersion);
    } catch (error) {
      if (version !== routeVersion || window.currentAppPage !== 'Live Directory') return;
      page.innerHTML = `<div style="padding:24px"><div class="card"><p>${e(error.message)}</p><button class="primary" id="refreshDirectory">↻ Refresh list</button></div></div>`;
      document.querySelector('#refreshDirectory').onclick = () => renderLiveDirectory(++routeVersion);
    }
  }

  function routeFromHash() {
    const link = [...document.querySelectorAll('.nav-item')].find(item => item.getAttribute('href') === location.hash);
    route(link?.dataset.page || 'Dashboard', false);
  }

  window.navigateToPage = route;
  document.querySelectorAll('.nav-item').forEach(link => {
    link.onclick = event => { event.preventDefault(); route(link.dataset.page); };
  });
  window.addEventListener('hashchange', event => {
    event.stopImmediatePropagation();
    routeFromHash();
  }, true);
  routeFromHash();
  setTimeout(routeFromHash, 0);
  setInterval(() => { if (window.currentAppPage === 'Dashboard') refreshDeliveryMetrics(); }, 1000);
  setInterval(() => { if (window.currentAppPage === 'Dashboard') renderQuickGroupPicker(); }, 1000);
})();
