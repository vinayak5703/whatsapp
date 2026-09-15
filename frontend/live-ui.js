// 1. VARIABLES — dashboard state is stored in the shared `db` object

// 2. FUNCTIONS — refresh cards and render scheduled-message screen
async function refreshLiveDashboard() {
  // Reading a large WhatsApp directory is expensive. Do not compete with the
  // recipient selector while the user is composing a message or viewing any
  // other page.
  if (window.currentAppPage && window.currentAppPage !== 'Dashboard') return;
  try {
    const [groupsResponse, contactsResponse, logsResponse] = await Promise.all([
      window.apiFetch('/api/whatsapp/groups'),
      window.apiFetch('/api/whatsapp/contacts'),
      window.apiFetch('/api/whatsapp/logs')
    ]);
    const groups = groupsResponse.ok ? await groupsResponse.json() : null;
    const contacts = contactsResponse.ok ? await contactsResponse.json() : null;
    const serverLogs = logsResponse.ok ? (await logsResponse.json()).logs || [] : [];
    const storageKey = window.getUserDataStorageKey?.() || 'wa-bot-data:guest';
    const store = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (groups && contacts) {
      const total = document.querySelector('#groupTotal');
      if (total) total.textContent = groups.count;
      const groupSmall = total?.closest('.stat-card')?.querySelector('small');
      if (groupSmall) groupSmall.textContent = `${groups.count} Groups • ${contacts.count} Contacts`;
      if (typeof db !== 'undefined') { db.groups = groups.groups; db.contacts = contacts.contacts; }
      store.groups = groups.groups;
      store.contacts = contacts.contacts;
    }
    const storedLogs = Array.isArray(store.logs) ? store.logs : [];
    const memoryLogs = typeof db !== 'undefined' && Array.isArray(db.logs) ? db.logs : [];
    const logKey = log => log.id || `${log.status}|${log.title}|${log.message}|${log.time}`;
    const localKeys = new Set();
    const localLogs = [...storedLogs, ...memoryLogs].filter(log => {
      const key = logKey(log);
      if (localKeys.has(key)) return false;
      localKeys.add(key);
      return true;
    });
    const normalizedServerLogs = serverLogs.map(log => ({
      id: `server:${log.id}`,
      status: log.status,
      title: log.title || `${log.source || 'API'} message`,
      message: log.error || log.message || '',
      time: log.createdAt || log.sentAt || log.attemptedAt || new Date().toISOString()
    }));
    const mergedKeys = new Set();
    const mergedLogs = [...normalizedServerLogs, ...localLogs].filter(log => {
      const key = logKey(log);
      if (mergedKeys.has(key)) return false;
      mergedKeys.add(key);
      return true;
    });
    const logsToKeep = logsResponse.ok && normalizedServerLogs.length > 0
      ? mergedLogs
      : (localLogs.length > 0 ? localLogs : storedLogs);
    store.logs = logsToKeep;
    localStorage.setItem(storageKey, JSON.stringify(store));
    if (typeof db !== 'undefined') db.logs = logsToKeep;
    if (window.currentAppPage === 'Dashboard' && typeof renderDashboard === 'function') renderDashboard();
  } catch { /* WhatsApp may be reconnecting; keep the last visible data */ }
}

function showScheduledModule() {
  const dashboard = document.querySelector('#dashboard');
  const page = document.querySelector('#otherPage');
  dashboard.style.display = 'none'; page.style.display = 'block';
  const schedules = (typeof db !== 'undefined' ? db.schedules : []) || [];
  page.innerHTML = `<div style="padding:24px;max-width:1180px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2 style="font-size:23px">Scheduled Messages</h2><p style="margin:5px 0 0;color:#71808e">Messages waiting to be sent at their selected time.</p></div><button class="primary" id="openSchedule">＋ New Schedule</button></div><div class="card" style="overflow:auto"><table><thead><tr><th>ID</th><th>Message</th><th>Groups</th><th>Schedule Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${schedules.map(schedule => `<tr><td>${schedule.id}</td><td>${schedule.message}</td><td>${schedule.groups}</td><td>${schedule.time}</td><td><span class="tag">Scheduled</span></td><td><button class="danger-btn" data-remove-schedule="${schedule.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No scheduled messages.</td></tr>'}</tbody></table></div></div>`;
  document.querySelector('#openSchedule').onclick = () => document.querySelector('#scheduleBtn').click();
  page.querySelectorAll('[data-remove-schedule]').forEach(button => button.onclick = async () => {
    try {
      const response = await window.apiFetch(`/api/whatsapp/schedules/${encodeURIComponent(button.dataset.removeSchedule)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not cancel schedule.');
      await syncScheduledMessages();
      showScheduledModule();
    } catch (error) { toast(error.message || 'Could not cancel schedule.'); }
  });
}

// 3. EVENT LISTENERS — route, card click, focus and timed refresh events
window.addEventListener('app:route', event => {
  if (event.detail?.page === 'Scheduled Messages') showScheduledModule();
});

document.querySelectorAll('.stat-card').forEach((card, index) => {
  card.style.cursor = 'pointer';
  card.onclick = () => {
    const routes = ['Groups', 'Reports & Analytics', 'Delivery Logs', 'Delivery Logs'];
    document.querySelector(`[data-page="${routes[index]}"]`)?.click();
  };
});

refreshLiveDashboard();
setInterval(refreshLiveDashboard, 30000);
window.addEventListener('focus', refreshLiveDashboard);
window.addEventListener('auth:success', refreshLiveDashboard);
