document.addEventListener('click', async event => {
  const action = event.target.closest('#checkConnection, #disconnectWhatsApp');
  if (!action) return;
  const box = document.querySelector('#connectionStatus');
  box.textContent = action.id === 'disconnectWhatsApp' ? 'Disconnecting WhatsApp...' : 'Checking WhatsApp connection...';
  try {
    const response = action.id === 'disconnectWhatsApp'
      ? await window.apiFetch('/api/whatsapp/disconnect', { method: 'POST' })
      : await window.apiFetch('/api/whatsapp/status');
    const status = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(status.error || `Request failed (${response.status}).`);
    if (action.id === 'disconnectWhatsApp') {
      box.textContent = status.message || 'WhatsApp disconnected. A new QR code will appear shortly.';
      return;
    }
    if (status.state === 'connected') {
      box.innerHTML = `<b style="color:#078c56">Connected</b> as ${status.account || 'your number'}`;
    } else if (status.qr) {
      box.innerHTML = `<b>Scan this QR using WhatsApp → Linked devices</b><br><img src="${status.qr}" alt="WhatsApp QR code" style="width:230px;margin-top:12px">`;
    } else {
      box.textContent = `Status: ${status.state || 'starting'}. ${status.error || 'Wait a few seconds, then try again.'}`;
    }
  } catch (error) {
    box.textContent = error.message || 'Server not running. Run npm install, then npm start.';
  }
});



