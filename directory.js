// 1. VARIABLES — page elements are read inside the function when needed

// 2. FUNCTIONS — creates the live Groups and Contacts directory
async function renderWhatsAppDirectory() {
  const page = document.querySelector('#otherPage');
  if (!page || page.style.display === 'none') return;
  const routeAtStart = window.currentAppPage;
  page.innerHTML = `<div style="padding:24px;max-width:1280px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2 style="font-size:23px">Total Groups & Contacts</h2><p style="margin:5px 0 0;color:#71808e">Live list from the WhatsApp number currently connected.</p></div><button class="primary" id="refreshDirectory">↻ Refresh list</button></div><div class="card compose"><p id="directoryStatus" style="margin:0">Loading WhatsApp groups and contacts...</p></div></div>`;
  try {
    const statusResponse = await window.apiFetch('/api/whatsapp/status');
    const status = statusResponse.ok ? await statusResponse.json() : null;
    if (!statusResponse.ok || status?.state !== 'connected') {
      const reason = status?.state === 'auth_failed'
        ? 'WhatsApp authentication failed. Open Settings, disconnect, and then connect again with a fresh QR code.'
        : status?.qr
          ? 'WhatsApp is not connected yet. Open Settings and scan the QR code.'
          : status?.state
            ? `WhatsApp status: ${status.state}${status.error ? `: ${status.error}` : ''}. Open Settings and connect it first.`
            : 'Unable to determine WhatsApp status. Open Settings and connect it first.';
      throw new Error(reason);
    }

    const [groupsResponse, contactsResponse] = await Promise.all([
      window.apiFetch('/api/whatsapp/groups'),
      window.apiFetch('/api/whatsapp/contacts'),
    ]);
    if (!groupsResponse.ok || !contactsResponse.ok) {
      let errorMessage = 'Could not load WhatsApp groups and contacts.';
      try {
        const body = await (groupsResponse.ok ? contactsResponse.json() : groupsResponse.json());
        errorMessage = body?.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    const groupData = await groupsResponse.json();
    const contactData = await contactsResponse.json();
    if (window.currentAppPage !== routeAtStart) return;
    const search = `<input id="directorySearch" placeholder="Search group or contact..." style="width:100%;border:1px solid #dce2e6;border-radius:5px;padding:11px;margin:0 0 16px;font:14px 'DM Sans',sans-serif">`;
    const groupRows = groupData.groups.map(item => `<tr class="directory-row"><td><b>${item.name}</b></td><td>${item.id}</td><td><span class="tag">Group</span></td></tr>`).join('');
    const contactRows = contactData.contacts.map(item => `<tr class="directory-row"><td><b>${item.name}</b></td><td>${item.id.replace('@c.us','')}</td><td><span class="tag">Contact</span></td></tr>`).join('');
    page.innerHTML = `<div style="padding:24px;max-width:1280px;margin:auto"><div class="card-heading card" style="margin-bottom:20px"><div><h2 style="font-size:23px">Total Groups & Contacts</h2><p style="margin:5px 0 0;color:#71808e">${groupData.count} groups and ${contactData.count} contacts synced from your linked WhatsApp number.</p></div><button class="primary" id="refreshDirectory">↻ Refresh list</button></div>${search}<div class="dashboard-grid" style="grid-template-columns:1fr 1fr"><div class="card" style="overflow:auto"><div class="card-heading"><h2>Groups (${groupData.count})</h2></div><table class="directory-table"><thead><tr><th>Name</th><th>WhatsApp ID</th><th>Type</th></tr></thead><tbody>${groupRows || '<tr><td colspan="3">No groups found.</td></tr>'}</tbody></table></div><div class="card" style="overflow:auto"><div class="card-heading"><h2>Contacts (${contactData.count})</h2></div><table class="directory-table"><thead><tr><th>Name</th><th>Number</th><th>Type</th></tr></thead><tbody>${contactRows || '<tr><td colspan="3">No contacts found.</td></tr>'}</tbody></table></div></div></div>`;
    if (page.style.display === 'none') return;
    document.querySelector('#directorySearch').oninput = event => {
      const term = event.target.value.toLowerCase();
      document.querySelectorAll('.directory-row').forEach(row => row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none');
    };
    document.querySelector('#refreshDirectory').onclick = renderWhatsAppDirectory;
  } catch (error) {
    if (page.style.display === 'none' || window.currentAppPage !== routeAtStart) return;
    const statusElement = page.querySelector('#directoryStatus');
    if (statusElement) statusElement.textContent = error.message;
    const refreshButton = page.querySelector('#refreshDirectory');
    if (refreshButton) refreshButton.onclick = renderWhatsAppDirectory;
  }
}

// The live WhatsApp directory is kept as an explicit helper for future use.
// Groups & Recipients is intentionally a separate local references tab.
