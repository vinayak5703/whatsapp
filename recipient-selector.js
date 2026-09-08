// 1. VARIABLES — selected recipients are read from checkbox elements

// 2. FUNCTIONS — recipient selector, preview and dashboard counters
function showRecipientToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateDynamicDashboard() {
  const storageKey = window.getUserDataStorageKey?.() || 'wa-bot-data:guest';
  const store = JSON.parse(localStorage.getItem(storageKey) || '{}');
  const logs = store.logs || [];
  const successful = logs.filter(log => log.status === 'success').length;
  const failed = logs.filter(log => log.status === 'failed').length;
  const total = successful + failed;
  const set = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
  set('#messagesTotal', total); set('#messagesSuccess', successful); set('#messagesFailed', failed);
  set('#successRate', total ? `${Math.round(successful / total * 100)}% delivered` : 'No deliveries yet');
  set('#failedRate', total ? `${Math.round(failed / total * 100)}% failed` : 'No failures yet');
}

async function loadRecipientSelector() {
  const form = document.querySelector('#bulk');
  if (!form) return;
  try {
    const [groupsResponse, contactsResponse] = await Promise.all([
      window.apiFetch('/api/whatsapp/groups'), window.apiFetch('/api/whatsapp/contacts')
    ]);
    if (!groupsResponse.ok || !contactsResponse.ok) throw new Error('Connect WhatsApp from Settings first.');
    const groups = (await groupsResponse.json()).groups;
    const contacts = (await contactsResponse.json()).contacts;
    form.innerHTML = `<h2>Compose message</h2>
      <label>Message</label><textarea name="message" required placeholder="Type your message..."></textarea>
      <label>Select recipients</label>
      <input id="recipientSearch" placeholder="Search groups or contacts" style="margin-bottom:10px" />
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px"><button class="outline selection-action" type="button" data-select="groups">Select all groups</button><button class="outline selection-action" type="button" data-select="contacts">Select all contacts</button><button class="outline selection-action" type="button" data-select="visible">Select visible</button><button class="outline selection-action" type="button" data-select="none">Clear selection</button><span id="selectionCount" style="padding:9px 2px;color:#71808e">0 selected</span></div>
      <div id="recipientChoices" style="max-height:330px;overflow:auto;border:1px solid #dce2e6;border-radius:5px;padding:8px"></div>
      <label>Attachments</label>
      <div class="media-upload-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        <label style="margin:0">🖼️ Images<input data-send-attachment type="file" multiple accept="image/*" /></label>
        <label style="margin:0">🎥 Videos<input data-send-attachment type="file" multiple accept="video/*" /></label>
        <label style="margin:0">📄 PDF<input data-send-attachment type="file" multiple accept="application/pdf" /></label>
        <label style="margin:0">📎 Documents<input data-send-attachment type="file" multiple accept=".doc,.docx,.xls,.xlsx,.txt" /></label>
      </div>
      <div id="attachmentsPreview" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"></div>
      <p style="color:#71808e;font-size:12px;margin-top:8px">Select multiple files in each section. Max 25MB per file; message becomes the first attachment caption.</p>
      <button class="primary" style="margin-top:14px">Send to selected</button>`;
    // Never create thousands of checkbox elements at once. The full list stays
    // in JavaScript and this viewport renders only a small page of matching
    // recipients, keeping 1,000 groups / 2,000 contacts responsive.
    const allRecipients = [...groups.map(item => ({ ...item, type: 'group' })), ...contacts.map(item => ({ ...item, type: 'contact' }))];
    const selectedRecipients = new Map();
    const pageSize = 100;
    let visibleCount = pageSize;
    let searchTerm = '';
    const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const updateSelectionCount = () => { document.querySelector('#selectionCount').textContent = `${selectedRecipients.size} selected`; };
    const matches = () => allRecipients.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(searchTerm));
    const renderRecipients = () => {
      const matching = matches();
      const shown = matching.slice(0, visibleCount);
      const choices = document.querySelector('#recipientChoices');
      choices.innerHTML = `<p style="margin:4px 5px 9px;color:#71808e">${matching.length.toLocaleString()} matching — showing ${shown.length.toLocaleString()}</p>${shown.map(item => `<label class="recipient-option" style="display:flex;gap:9px;align-items:center;padding:7px 5px;margin:0"><input class="recipient-check" type="checkbox" data-id="${escapeHtml(item.id)}" ${selectedRecipients.has(item.id) ? 'checked' : ''}> <span>${escapeHtml(item.name)} <small style="color:#71808e">${item.type === 'group' ? 'Group' : 'Contact'}</small></span></label>`).join('')}${matching.length > shown.length ? '<button type="button" class="outline" id="showMoreRecipients" style="margin:9px 5px">Show 100 more</button>' : ''}`;
      choices.querySelectorAll('.recipient-check').forEach(input => input.onchange = () => {
        const item = allRecipients.find(recipient => recipient.id === input.dataset.id);
        if (input.checked && item) selectedRecipients.set(item.id, item);
        else selectedRecipients.delete(input.dataset.id);
        updateSelectionCount();
      });
      choices.querySelector('#showMoreRecipients')?.addEventListener('click', () => { visibleCount += pageSize; renderRecipients(); });
    };
    document.querySelector('#recipientSearch').oninput = event => { searchTerm = event.target.value.trim().toLowerCase(); visibleCount = pageSize; renderRecipients(); };
    document.querySelectorAll('.selection-action').forEach(button => button.onclick = () => {
      const mode = button.dataset.select;
      if (mode === 'none') selectedRecipients.clear();
      else {
        const source = mode === 'visible' ? matches() : allRecipients.filter(item => item.type === (mode === 'groups' ? 'group' : 'contact'));
        source.forEach(item => selectedRecipients.set(item.id, item));
      }
      updateSelectionCount(); renderRecipients();
    });
    renderRecipients();
    const renderPreview = () => {
      const preview = document.querySelector('#attachmentsPreview');
      if (!preview) return;
      preview.innerHTML = '';
      Array.from(document.querySelectorAll('[data-send-attachment]')).flatMap(input => Array.from(input.files || [])).forEach(file => {
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
        preview.appendChild(wrap);
      });
    };
    document.querySelectorAll('[data-send-attachment]').forEach(input => { input.onchange = renderPreview; });
    form.onsubmit = async event => {
      event.preventDefault();
      const message = new FormData(form).get('message');
      const recipients = Array.from(selectedRecipients.values());
      if (!recipients.length) return showRecipientToast('Select at least one group or contact.');
      showRecipientToast('Sending message...');
      try {
        const attachments = Array.from(document.querySelectorAll('[data-send-attachment]')).flatMap(input => Array.from(input.files || []));
        let response;
        if (attachments.length > 0) {
          const fd = new FormData();
          if (message) fd.append('message', message);
          fd.append('recipients', JSON.stringify(recipients));
          attachments.forEach(file => fd.append('attachments', file, file.name));
          response = await window.apiFetch('/api/whatsapp/send', { method: 'POST', body: fd });
        } else {
          response = await window.apiFetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, recipients }) });
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Message delivery failed.');
        const sent = result.results.filter(x => x.status === 'success').length;
        const storageKey = window.getUserDataStorageKey?.() || 'wa-bot-data:guest';
        const store = JSON.parse(localStorage.getItem(storageKey) || '{}');
        store.logs = store.logs || [];
        result.results.forEach(item => store.logs.unshift({ status: item.status, title: `${item.status === 'success' ? 'Message sent' : 'Failed'}: ${item.name}`, message: item.error || message.slice(0, 100), time: new Date().toLocaleString() }));
        localStorage.setItem(storageKey, JSON.stringify(store));
        window.dispatchEvent(new Event('delivery:updated'));
        if (typeof db !== 'undefined') db.logs = store.logs;
        if (typeof renderDashboard === 'function') renderDashboard();
        updateDynamicDashboard();
        showRecipientToast(`Sent to ${sent} of ${result.results.length} selected recipients.`);
        document.querySelectorAll('[data-send-attachment]').forEach(input => { input.value = ''; });
        renderPreview();
      } catch (error) { showRecipientToast(error.message || 'Could not send message.'); }
    };
  } catch (error) {
    form.innerHTML = `<h2>Compose message</h2><p style="color:#c33">${error.message}</p>`;
  }
}

// 3. EVENT LISTENERS — load selector on route change/page load
window.addEventListener('app:route', event => {
  if (event.detail?.page === 'Send Message') setTimeout(loadRecipientSelector, 0);
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#send') setTimeout(loadRecipientSelector, 0);
});

updateDynamicDashboard();
