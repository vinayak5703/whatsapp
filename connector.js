async function fetchJsonSafe(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    let errorMessage = '';
    if (typeof body === 'object' && body !== null) {
      errorMessage = body.error || JSON.stringify(body);
    } else {
      const trimmedBody = String(body).trim();
      errorMessage = trimmedBody.startsWith('<') ? `Unexpected response from server (${response.status})` : trimmedBody;
    }
    throw new Error(errorMessage || `Request failed with status ${response.status}`);
  }

  return body;
}

document.addEventListener('click', async event => {
  const target = event.target;
  if (target.id !== 'checkConnection' && target.id !== 'disconnectWhatsApp') return;
  const box = document.querySelector('#connectionStatus');

  if (target.id === 'checkConnection') {
    box.textContent = 'Checking WhatsApp connection...';
    try {
      const status = await fetchJsonSafe('/api/whatsapp/status');
      if (status.state === 'connected') {
        box.innerHTML = `<b style="color:#078c56">Connected</b> as ${status.account || 'your number'}`;
      } else if (status.qr) {
        box.innerHTML = `<b>Scan this QR using WhatsApp → Linked devices</b><br><img src="${status.qr}" alt="WhatsApp QR code" style="width:230px;margin-top:12px">`;
      } else {
        box.textContent = `Status: ${status.state}. Wait a few seconds, then try again.`;
      }
    } catch {
      box.textContent = 'Server not running. Run npm install, then npm start.';
    }
    return;
  }

  if (target.id === 'disconnectWhatsApp') {
    box.textContent = 'Disconnecting WhatsApp...';
    try {
      const result = await fetchJsonSafe('/api/whatsapp/disconnect', { method: 'POST' });
      box.innerHTML = `<b style="color:#d33">WhatsApp disconnected.</b><br>${result.message || 'Connect again from Settings to restore your session.'}`;
      setTimeout(() => {
        box.textContent = 'Ready to reconnect. Click Connect to scan a new QR code.';
      }, 4000);
    } catch (error) {
      box.textContent = `Unable to disconnect WhatsApp: ${error.message || 'Please try again.'}`;
    }
    return;
  }
});

let refreshingGroups = false;
async function syncWhatsAppGroups() {
  try {
    const response = await fetch('/api/whatsapp/groups');
    if (!response.ok) return false;
    const data = await response.json();
    const current = JSON.parse(localStorage.getItem('wa-bot-data') || '{}');
    current.groups = data.groups;
    localStorage.setItem('wa-bot-data', JSON.stringify(current));
    if (typeof db !== 'undefined') db.groups = data.groups;
    const total = document.querySelector('#groupTotal');
    if (total) total.textContent = data.count;
    return true;
  } catch {
    return false;
  }
}

// Show the connected account's actual group count immediately after page load.
syncWhatsAppGroups();
