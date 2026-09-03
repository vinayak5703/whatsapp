// 1. VARIABLES — dashboard state is stored in the shared `db` object

// 2. FUNCTIONS — refresh cards and render scheduled-message screen
async function refreshLiveDashboard() {
  try {
    const [groupsResponse, contactsResponse] = await Promise.all([window.apiFetch('/api/whatsapp/groups'), window.apiFetch('/api/whatsapp/contacts')]);
    if (!groupsResponse.ok || !contactsResponse.ok) return;
    const groups = await groupsResponse.json();
    const contacts = await contactsResponse.json();
    const total = document.querySelector('#groupTotal');
    if (total) total.textContent = groups.count;
    const groupSmall = total?.closest('.stat-card')?.querySelector('small');
    if (groupSmall) groupSmall.textContent = `${groups.count} Groups • ${contacts.count} Contacts`;
    if (typeof db !== 'undefined') { db.groups = groups.groups; db.contacts = contacts.contacts; }
    const store = JSON.parse(localStorage.getItem('wa-bot-data') || '{}');
    store.groups = groups.groups; store.contacts = contacts.contacts;
    localStorage.setItem('wa-bot-data', JSON.stringify(store));
  } catch { /* WhatsApp may be reconnecting; keep the last visible data */ }
}

function showScheduledModule() {
  const dashboard = document.querySelector('#dashboard');
  const page = document.querySelector('#otherPage');
  dashboard.style.display = 'none'; page.style.display = 'block';
  const schedules = (typeof db !== 'undefined' ? db.schedules : []) || [];
  page.innerHTML = `<div style="padding:24px;max-width:1180px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2 style="font-size:23px">Scheduled Messages</h2><p style="margin:5px 0 0;color:#71808e">Messages waiting to be sent at their selected time.</p></div><button class="primary" id="openSchedule">＋ New Schedule</button></div><div class="card" style="overflow:auto"><table><thead><tr><th>ID</th><th>Message</th><th>Groups</th><th>Schedule Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${schedules.map(schedule => `<tr><td>${schedule.id}</td><td>${schedule.message}</td><td>${schedule.groups}</td><td>${schedule.time}</td><td><span class="tag">Scheduled</span></td><td><button class="danger-btn" data-remove-schedule="${schedule.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No scheduled messages.</td></tr>'}</tbody></table></div></div>`;
  document.querySelector('#openSchedule').onclick = () => document.querySelector('#scheduleBtn').click();
  page.querySelectorAll('[data-remove-schedule]').forEach(button => button.onclick = () => {
    db.schedules = db.schedules.filter(schedule => String(schedule.id) !== button.dataset.removeSchedule);
    localStorage.setItem('wa-bot-data', JSON.stringify(db)); showScheduledModule();
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
