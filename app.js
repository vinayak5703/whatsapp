const D={groups:[{name:'Sales Team',id:'1203630•••1101',active:true},{name:'Marketing Team',id:'1203630•••2234',active:true},{name:'HR Team',id:'1203630•••8892',active:true}],people:[],templates:[{name:'Good Morning',text:'Good morning everyone! Have a productive day.'}],users:[{name:'Admin User',email:'admin@example.com',role:'Administrator'}],logs:[],schedules:[{id:1,message:'Good Morning Everyone!',groups:'15 Groups',time:'27 May 2026 09:00 AM'}]};
function getUserDataStorageKey(){try{const user=JSON.parse(localStorage.getItem('wa-auth-user')||'null');return user?.email?`wa-bot-data:${user.email.toLowerCase()}`:'wa-bot-data:guest'}catch{return 'wa-bot-data:guest'}}
window.getUserDataStorageKey=getUserDataStorageKey;
let savedData={};
const initialStorageKey = getUserDataStorageKey();
try { savedData = initialStorageKey.endsWith(':guest') ? {} : JSON.parse(localStorage.getItem(initialStorageKey) || '{}') || {}; } catch { localStorage.removeItem(initialStorageKey); }
let db={...D,...savedData};
for(const key of ['groups','people','templates','users','logs','schedules']) if(!Array.isArray(db[key])) db[key]=D[key];
const $=s=>document.querySelector(s), other=$('#otherPage'), dash=$('#dashboard');
const save=()=>localStorage.setItem(getUserDataStorageKey(),JSON.stringify(db));const e=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function toast(t){const n=$('#toast');n.textContent=t;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2500)}
function now(){return new Date().toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}
function formatTs(iso){ try { return iso ? new Date(iso).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}) : now(); } catch { return now(); } }

// Reusable attachment setup for any file input + preview area
function setupAttachmentHandlers(inputSelector, previewSelector) {
  const inp = () => document.querySelector(inputSelector);
  const preview = () => document.querySelector(previewSelector);
  const render = () => {
    const i = inp(); const p = preview(); if (!i || !p) return; p.innerHTML = '';
    Array.from(i.files || []).forEach(file => {
      const wrap = document.createElement('div');
      wrap.style.maxWidth = '140px'; wrap.style.border = '1px solid #e6e9ee'; wrap.style.padding = '6px'; wrap.style.borderRadius = '6px'; wrap.style.fontSize = '12px'; wrap.style.background = '#fff';
      if (file.type && file.type.startsWith('image/')) {
        const img = document.createElement('img'); img.style.width = '120px'; img.style.height = '80px'; img.style.objectFit = 'cover'; img.style.display = 'block'; img.style.borderRadius = '4px';
        const reader = new FileReader(); reader.onload = e => img.src = e.target.result; reader.readAsDataURL(file); wrap.appendChild(img);
        const caption = document.createElement('div'); caption.textContent = file.name; caption.style.marginTop = '6px'; caption.style.overflow = 'hidden'; caption.style.textOverflow = 'ellipsis'; caption.style.whiteSpace = 'nowrap'; wrap.appendChild(caption);
      } else {
        const name = document.createElement('div'); name.textContent = file.name; name.style.fontWeight = '600';
        const size = document.createElement('div'); size.textContent = Math.round(file.size/1024) + ' KB'; size.style.color = '#666'; wrap.appendChild(name); wrap.appendChild(size);
      }
      p.appendChild(wrap);
    });
  };
  document.addEventListener('change', (e) => { if (e.target && e.target.matches(inputSelector)) render(); });
  const iEl = inp(); if (iEl) iEl.onchange = render;
}

function table(headers,body)
{return `<div class="card" style="overflow:auto"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}" style="text-align:center;padding:36px">No records yet.</td></tr>`}</tbody></table></div>`}
function options(){return `<option value="all">All active groups (${db.groups.filter(g=>g.active).length})</option>${db.groups.filter(g=>g.active).map(g=>`<option value="${e(g.name)}">${e(g.name)}</option>`).join('')}${db.people.map(p=>`<option value="${e(p.number)}">${e(p.name)} — ${e(p.number)}</option>`).join('')}`}
function renderDashboard(){const s=$('.group-select select');s.innerHTML='<option value="">Select target</option>'+options();$('#activityList').innerHTML=(db.logs.slice(0,5).length?db.logs.slice(0,5):[{status:'success',title:'Bot ready',message:'Add your number or a group to begin.',time:'Now'}]).map(x=>`<div class="activity-item"><span class="status-dot ${x.status==='failed'?'failed':''}">${x.status==='failed'?'×':'✓'}</span><div><b>${e(x.title)}</b><p>${e(x.message)}</p></div><time>${e(x.time)}</time><span class="tag ${x.status==='failed'?'failed':''}">${x.status==='failed'?'Failed':'Success'}</span></div>`).join('');$('#scheduleRows').innerHTML=db.schedules.map(x=>`<tr><td>${x.id}</td><td>${e(x.message)}</td><td>${e(x.groups)}</td><td>${e(x.time)}</td><td><span class="tag">Scheduled</span></td><td><button class="danger-btn" data-dels="${x.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="6">No scheduled messages.</td></tr>';document.querySelectorAll('[data-dels]').forEach(b=>b.onclick=()=>{db.schedules=db.schedules.filter(x=>x.id!=b.dataset.dels);save();renderDashboard()})}
async function queue(message,target){if(!message.trim())return toast('Please enter a message.');const groups=target==='all'?db.groups.filter(g=>g.active):db.groups.filter(g=>g.name===target);if(!groups.length)return toast('Select a WhatsApp group.');toast('Sending message...');try{const r=await window.apiFetch('/api/whatsapp/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,groups})}),data=await r.json();if(!r.ok)throw new Error(data.error||'Could not send message.');data.results.forEach(x=>db.logs.unshift({status:x.status,title:`${x.status==='success'?'Message sent':'Failed'}: ${x.name}`,message:x.error||message.slice(0,100),time:formatTs(x.sentAt||x.attemptedAt)}));save();renderDashboard();if(typeof updateDynamicDashboard==='function')updateDynamicDashboard();window.dispatchEvent(new Event('delivery:updated'));toast(`Sent to ${data.results.filter(x=>x.status==='success').length} of ${data.results.length} groups.`)}catch(err){toast(err.message||'Start the Node server and connect WhatsApp first.')}}
function layout(title,sub,body){return `<div style="padding:24px;max-width:1180px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2 style="font-size:23px">${title}</h2><p style="margin:5px 0 0;color:#71808e">${sub}</p></div></div>${body}</div>`}
function form(title,fields,id,button='Save'){return `<form class="card compose" id="${id}" style="margin-bottom:20px"><h2>${title}</h2>${fields}<button class="primary" style="margin-top:12px">${button}</button></form>`}
function groups(){return layout('Groups & Recipients','Add WhatsApp group references and your own number for test delivery.',`<div class="dashboard-grid">${form('Add group','<label>Group name</label><input name="name" required placeholder="e.g. Product Team"/><label>WhatsApp group ID / reference</label><input name="id" required placeholder="e.g. 1203630...@g.us"/>','addGroup','Add Group')}${table(['Group','Reference','Status','Actions'],db.groups.map((x,i)=>`<tr><td><b>${e(x.name)}</b></td><td>${e(x.id)}</td><td>${x.active?'Active':'Inactive'}</td><td><button class="text-btn" data-toggle="${i}">${x.active?'Deactivate':'Activate'}</button> <button class="danger-btn" data-delg="${i}">Delete</button></td></tr>`).join(''))}</div><div class="dashboard-grid">${form('Add my WhatsApp number','<label>Your name</label><input name="name" required placeholder="Your name"/><label>WhatsApp number</label><input name="number" required placeholder="+91 98765 43210"/>','addPerson','Add Test Recipient')}${table(['Recipient','Number','Action'],db.people.map((x,i)=>`<tr><td><b>${e(x.name)}</b></td><td>${e(x.number)}</td><td><button class="danger-btn" data-delp="${i}">Remove</button></td></tr>`).join(''))}</div>`)}
function send(){return layout('Send Bulk Message','Queue a message for active groups or your saved test number.',form('Compose message',`<label>Message</label><textarea name="message" required placeholder="Type your broadcast message..."></textarea><label>Send to</label><select name="target">${options()}</select><div class="attach-block"><label>Attachments</label><input id="attachments" name="attachments" type="file" multiple accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/><div id="attachmentsPreview" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"></div><p style="color:#71808e;font-size:12px;margin-top:8px">You can attach images, PDFs or documents (max 25MB per file). Message text will be added as a caption to the first attachment.</p></div>`,'bulk','Queue Message'))}
function templates(){return layout('Message Templates','Create reusable messages for your team.',`<div class="dashboard-grid">${form('New template','<label>Name</label><input name="name" required/><label>Message</label><textarea name="text" required></textarea>','addTemplate','Save Template')}${table(['Template','Message','Action'],db.templates.map((x,i)=>`<tr><td><b>${e(x.name)}</b></td><td>${e(x.text)}</td><td><button class="text-btn" data-use="${i}">Use</button> <button class="danger-btn" data-delt="${i}">Delete</button></td></tr>`).join(''))}</div>`) }
function logs(){return layout('Delivery Logs','Queue and delivery activity recorded by the application.',table(['Status','Message','Time'],db.logs.map(x=>`<tr><td><span class="tag ${x.status==='failed'?'failed':''}">${x.status}</span></td><td><b>${e(x.title)}</b><br><small>${e(x.message)}</small></td><td>${e(x.time)}</td></tr>`).join(''))+'<button class="outline" id="clearLogs" style="margin-top:15px">Clear logs</button>')}
function reports(){let total=db.logs.length,ok=db.logs.filter(x=>x.status==='success').length;return layout('Reports & Analytics','Export your locally recorded delivery activity.',`<div class="stat-grid"><article class="stat-card green"><div><span>Total queue events</span><strong>${total}</strong><small>All time</small></div></article><article class="stat-card blue"><div><span>Successful queues</span><strong>${ok}</strong><small>Recorded delivery requests</small></div></article><article class="stat-card amber"><div><span>Success rate</span><strong>${total?Math.round(ok/total*100):100}%</strong><small>Local activity</small></div></article></div><button class="primary" id="export" style="margin-top:20px">Export CSV report</button>`) }
function users(){return layout('User Management','Manage users who can access the dashboard.',`<div class="dashboard-grid">${form('Add user','<label>Name</label><input name="name" required/><label>Email</label><input name="email" type="email" required/><label>Role</label><select name="role"><option>Operator</option><option>Viewer</option><option>Administrator</option></select>','addUser','Add User')}${table(['Name','Role','Action'],db.users.map((x,i)=>`<tr><td><b>${e(x.name)}</b><br><small>${e(x.email)}</small></td><td>${e(x.role)}</td><td><button class="danger-btn" data-delu="${i}">Remove</button></td></tr>`).join(''))}</div>`) }
function adminPanel(){return layout('Admin Panel','Overview of registered accounts in this project.',`<section class="stat-grid"><article class="stat-card blue"><div><span>Total registered users</span><strong id="adminUserTotal">Loading...</strong><small>Supabase Auth accounts</small></div><em>♙</em></article><article class="stat-card green"><div><span>Administrators</span><strong id="adminCount">-</strong><small>Accounts with admin access</small></div><em>✓</em></article></section><section class="card" style="margin-top:20px;overflow:auto"><div class="card-heading"><h2>Registered Users</h2><button class="outline" id="refreshAdminUsers">Refresh</button></div><div id="adminUsersTable">Loading users...</div></section>`)}
async function loadAdminUsers(){const total=$('#adminUserTotal'),admins=$('#adminCount'),tableEl=$('#adminUsersTable');if(!total||!admins||!tableEl)return;try{const response=await window.apiFetch('/api/admin/users');const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load users.');total.textContent=data.total;admins.textContent=data.users.filter(user=>user.role==='Administrator').length;tableEl.innerHTML=table(['Name','Email','Role','Registered'],data.users.map(user=>`<tr><td><b>${e(user.name)}</b></td><td>${e(user.email)}</td><td>${e(user.role)}</td><td>${e(formatTs(user.createdAt))}</td></tr>`).join(''))}catch(error){total.textContent='-';admins.textContent='-';tableEl.innerHTML=`<p style="padding:16px;color:#d53d45">${e(error.message)}</p>`}}
function settings(){return layout('Settings','Messaging configuration and safety controls.',`<div class="card compose"><h2>WhatsApp Web connection</h2><p style="color:#71808e;line-height:1.55">Connect the WhatsApp number that will send messages. After scanning the QR code, bulk sends use that number and the group IDs you added.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="primary" id="checkConnection">Connect / show QR code</button><button type="button" class="outline" id="disconnectWhatsApp">Disconnect WhatsApp</button></div><div id="connectionStatus" style="margin-top:16px"></div><label><input type="checkbox" checked/> Delivery notifications</label><label><input type="checkbox" checked/> Retry failed messages</label></div>`)}
function wire(page){if(page==='Groups'){$('#addGroup').onsubmit=x=>{x.preventDefault();let f=new FormData(x.target);db.groups.push({name:f.get('name'),id:f.get('id'),active:true});save();show('Groups');renderDashboard();toast('Group added.')};$('#addPerson').onsubmit=x=>{x.preventDefault();let f=new FormData(x.target);db.people.push({name:f.get('name'),number:f.get('number')});save();show('Groups');toast('Your number was added.')};other.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{db.groups[b.dataset.toggle].active=!db.groups[b.dataset.toggle].active;save();show('Groups');renderDashboard()});other.querySelectorAll('[data-delg]').forEach(b=>b.onclick=()=>{db.groups.splice(b.dataset.delg,1);save();show('Groups');renderDashboard()});other.querySelectorAll('[data-delp]').forEach(b=>b.onclick=()=>{db.people.splice(b.dataset.delp,1);save();show('Groups')})}if(page==='Send Message'){
  // Ensure attachments input exists in the rendered Send Message form (some clients cache HTML/JS)
  setTimeout(() => {
    const f = document.getElementById('bulk');
    if (f && !f.querySelector('#attachments')) {
      const sel = f.querySelector('select[name="target"]') || f.querySelector('select');
      if (sel) {
        const attachHtml = `<label>Attachments</label><input id="attachments" name="attachments" type="file" multiple accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/><div id="attachmentsPreview" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"></div>`;
        sel.insertAdjacentHTML('afterend', attachHtml);
      }
    }
    // Attach preview handlers
    setupAttachmentHandlers('#attachments','#attachmentsPreview');
  }, 50);

  const form = $('#bulk');
  const attachmentsInput = () => document.querySelector('#attachments');
  const previewContainer = () => document.querySelector('#attachmentsPreview');
  const renderPreview = () => {
    const inp = attachmentsInput(); const preview = previewContainer(); if(!inp || !preview) return; try { preview.innerHTML = ''; Array.from(inp.files || []).forEach(file => { const wrap = document.createElement('div'); wrap.style.maxWidth = '140px'; wrap.style.border = '1px solid #e6e9ee'; wrap.style.padding = '6px'; wrap.style.borderRadius = '6px'; wrap.style.fontSize = '12px'; wrap.style.background = '#fff'; if (file.type && file.type.startsWith('image/')) { const img = document.createElement('img'); img.style.width = '120px'; img.style.height = '80px'; img.style.objectFit = 'cover'; img.style.display = 'block'; img.style.borderRadius = '4px'; const reader = new FileReader(); reader.onload = e => img.src = e.target.result; reader.readAsDataURL(file); wrap.appendChild(img); const caption = document.createElement('div'); caption.textContent = file.name; caption.style.marginTop = '6px'; caption.style.overflow = 'hidden'; caption.style.textOverflow = 'ellipsis'; caption.style.whiteSpace = 'nowrap'; wrap.appendChild(caption); } else { const name = document.createElement('div'); name.textContent = file.name; name.style.fontWeight = '600'; const size = document.createElement('div'); size.textContent = Math.round(file.size/1024) + ' KB'; size.style.color = '#666'; wrap.appendChild(name); wrap.appendChild(size); } preview.appendChild(wrap); }); } catch (err) { console.error('renderPreview error:', err); } };

  // ensure preview updates even if the form variable is not found due to timing
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'attachments') renderPreview(); });
  if (form) {
    const inp = document.querySelector('#attachments'); if (inp) inp.onchange = renderPreview; form.onsubmit = async x => { x.preventDefault(); const f = new FormData(form); const message = (f.get('message')||'').toString().trim(); const target = (f.get('target')||'').toString(); const groupsArr = target === 'all' ? db.groups.filter(g=>g.active) : db.groups.filter(g=>g.name===target); if ((!message || message.length===0) && (document.querySelector('#attachments')?.files.length===0)) return toast('Message or at least one attachment is required.'); if (!groupsArr.length) return toast('Select a WhatsApp group.'); const fd = new FormData(); if (message) fd.append('message', message); fd.append('groups', JSON.stringify(groupsArr)); for (const file of Array.from((document.querySelector('#attachments')?.files)||[])) { fd.append('attachments', file, file.name); } try { toast('Sending message...'); const r = await window.apiFetch('/api/whatsapp/send', { method: 'POST', body: fd }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not send message.'); data.results.forEach(x=>db.logs.unshift({status:x.status,title:`${x.status==='success'?'Message sent':'Failed'}: ${x.name}`,message:x.error||message.slice(0,100),time:formatTs(x.sentAt||x.attemptedAt)})); save(); renderDashboard(); toast(`Sent to ${data.results.filter(x=>x.status==='success').length} of ${data.results.length} groups.`); form.reset(); renderPreview(); } catch(err){ toast(err.message||'Start the Node server and connect WhatsApp first.') } };
  }
}if(page==='Message Templates'){$('#addTemplate').onsubmit=x=>{x.preventDefault();let f=new FormData(x.target);db.templates.push({name:f.get('name'),text:f.get('text')});save();show(page)};other.querySelectorAll('[data-delt]').forEach(b=>b.onclick=()=>{db.templates.splice(b.dataset.delt,1);save();show(page)});other.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{dash.style.display='block';other.style.display='none';$('#message').value=db.templates[b.dataset.use].text;$('#count').textContent=$('#message').value.length;toast('Template loaded in Quick Send.')})}if(page==='Delivery Logs')$('#clearLogs').onclick=()=>{db.logs=[];save();show(page);renderDashboard()};if(page==='Reports & Analytics')$('#export').onclick=()=>{let csv='Status,Title,Message,Time\n'+db.logs.map(x=>[x.status,x.title,x.message,x.time].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='delivery-report.csv';a.click()};if(page==='User Management'){$('#addUser').onsubmit=x=>{x.preventDefault();db.users.push(Object.fromEntries(new FormData(x.target)));save();show(page)};other.querySelectorAll('[data-delu]').forEach(b=>b.onclick=()=>{db.users.splice(b.dataset.delu,1);save();show(page)})}}
function show(page){const renderer={Groups:groups,'Send Message':send,'Message Templates':templates,'Delivery Logs':logs,'Reports & Analytics':reports,'User Management':users,Settings:settings,'Admin Panel':adminPanel}[page];if(typeof renderer!=='function'){other.innerHTML='';return}other.innerHTML=renderer();wire(page);if(page==='Admin Panel'){loadAdminUsers();$('#refreshAdminUsers').onclick=loadAdminUsers}}
renderDashboard();$('#message').oninput=()=>$('#count').textContent=$('#message').value.length;$('#clearBtn').onclick=()=>{$('#message').value='';$('#count').textContent=0};

// Quick send: support attachments in the dashboard quick compose
const renderQuickPreview = () => {
  const inp = document.querySelector('#quickAttachments');
  const preview = document.querySelector('#quickAttachmentsPreview');
  if (!inp || !preview) return; preview.innerHTML = '';
  Array.from(inp.files || []).forEach(file => {
    const wrap = document.createElement('div');
    wrap.style.maxWidth = '140px';
    wrap.style.border = '1px solid #e6e9ee';
    wrap.style.padding = '6px';
    wrap.style.borderRadius = '6px';
    wrap.style.fontSize = '12px';
    wrap.style.background = '#fff';
    if (file.type && file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.style.width = '120px'; img.style.height = '80px'; img.style.objectFit = 'cover'; img.style.display = 'block'; img.style.borderRadius = '4px';
      const reader = new FileReader(); reader.onload = e => img.src = e.target.result; reader.readAsDataURL(file);
      wrap.appendChild(img);
      const caption = document.createElement('div'); caption.textContent = file.name; caption.style.marginTop = '6px'; caption.style.overflow='hidden'; caption.style.textOverflow='ellipsis'; caption.style.whiteSpace='nowrap'; wrap.appendChild(caption);
    } else {
      const name = document.createElement('div'); name.textContent = file.name; name.style.fontWeight='600';
      const size = document.createElement('div'); size.textContent = Math.round(file.size/1024) + ' KB'; size.style.color = '#666'; wrap.appendChild(name); wrap.appendChild(size);
    }
    preview.appendChild(wrap);
  });
};

document.addEventListener('change', (e) => { if (e.target && e.target.id === 'quickAttachments') renderQuickPreview(); });
const quickInp = document.querySelector('#quickAttachments'); if (quickInp) quickInp.onchange = renderQuickPreview;

// Ensure attachment handlers are active for both Send Message page and Quick Send
setupAttachmentHandlers('#attachments','#attachmentsPreview');
setupAttachmentHandlers('#quickAttachments','#quickAttachmentsPreview');

$('#sendBtn').onclick = async () => {
  const message = $('#message').value.trim();
  const selectedGroups = [...document.querySelectorAll('#quickGroupPicker .quick-group-check:checked')].map(check => ({ name: check.value, id: check.dataset.groupId }));
  const groupsArr = selectedGroups.length ? selectedGroups : db.groups.filter(g=>g.active);
  if ((!message || message.length===0) && (document.querySelector('#quickAttachments')?.files.length===0)) return toast('Message or at least one attachment is required.');
  if (!groupsArr.length) return toast('Select a WhatsApp group.');

  // If there are quick attachments, send multipart, otherwise fallback to queue()
  const files = Array.from((document.querySelector('#quickAttachments')?.files)||[]);
  if (files.length > 0) {
    const fd = new FormData(); if (message) fd.append('message', message); fd.append('groups', JSON.stringify(groupsArr));
    for (const file of files) fd.append('attachments', file, file.name);
    try { toast('Sending message...'); const r = await window.apiFetch('/api/whatsapp/send', { method: 'POST', body: fd }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not send message.'); data.results.forEach(x=>db.logs.unshift({status:x.status,title:`${x.status==='success'?'Message sent':'Failed'}: ${x.name}`,message:x.error||message.slice(0,100),time:formatTs(x.sentAt||x.attemptedAt)})); save(); renderDashboard(); if(typeof updateDynamicDashboard==='function') updateDynamicDashboard(); window.dispatchEvent(new Event('delivery:updated')); toast(`Sent to ${data.results.filter(x=>x.status==='success').length} of ${data.results.length} groups.`); // reset
      $('#message').value=''; $('#count').textContent=0; document.querySelector('#quickAttachments').value = ''; renderQuickPreview(); } catch (err) { toast(err.message||'Start the Node server and connect WhatsApp first.') }
  } else {
    // no attachments — use existing queue flow
    queue(message, target);
    $('#message').value=''; $('#count').textContent=0;
  }
};
const modal=$('#modal');$('#scheduleBtn').onclick=()=>modal.classList.add('open');$('#closeModal').onclick=()=>modal.classList.remove('open');$('#saveSchedule').onclick=()=>{let m=$('#scheduleMessage').value,t=$('#scheduleTime').value;if(!m||!t)return toast('Enter message and time.');db.schedules.push({id:Date.now(),message:m,groups:'Selected groups',time:new Date(t).toLocaleString()});save();modal.classList.remove('open');renderDashboard();toast('Schedule saved.')};
function navigateToPage(page, updateHash = true) {
  const link = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (!link) return;
  if (page === 'Admin Panel' && JSON.parse(localStorage.getItem('wa-auth-user') || 'null')?.role !== 'Administrator') {
    navigateToPage('Dashboard', updateHash);
    return;
  }

  window.currentAppPage = page;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === link));
  const displayPage = page === 'Groups' ? 'Groups & Recipients' : page === 'Live Directory' ? 'Total Groups & Contacts' : page;
  $('#pageTitle').textContent = displayPage;
  $('#crumb').textContent = displayPage;

  const dashboardPage = page === 'Dashboard' || page === 'Scheduled Messages';
  dash.style.display = dashboardPage ? 'block' : 'none';
  other.style.display = dashboardPage ? 'none' : 'block';

  if (page === 'Scheduled Messages' && typeof showScheduledModule === 'function') {
    showScheduledModule();
  } else if (page === 'Live Directory' && typeof renderWhatsAppDirectory === 'function') {
    renderWhatsAppDirectory();
  } else if (!dashboardPage) {
    show(page);
    if (page === 'Send Message' && typeof loadRecipientSelector === 'function') {
      setTimeout(loadRecipientSelector, 0);
    }
  }

  if (updateHash && window.location.hash !== link.getAttribute('href')) {
    window.location.hash = link.getAttribute('href');
  }
  if (innerWidth < 760) $('#sidebar').classList.remove('open');
  window.dispatchEvent(new CustomEvent('app:route', { detail: { page } }));
}

function routeFromHash() {
  const link = [...document.querySelectorAll('.nav-item')]
    .find(item => item.getAttribute('href') === window.location.hash)
    || document.querySelector('.nav-item[data-page="Dashboard"]');
  navigateToPage(link.dataset.page, false);
}

window.navigateToPage = navigateToPage;

document.querySelectorAll('.nav-item').forEach(link => {
  link.onclick = event => {
    event.preventDefault();
    navigateToPage(link.dataset.page);
  };
});
window.addEventListener('hashchange', routeFromHash);
if (window.location.hash) setTimeout(routeFromHash, 0);
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
