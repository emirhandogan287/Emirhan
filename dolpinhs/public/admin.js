const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KIND = { confirm: 'Onay', r24: '1 gün önce', r5: '5 saat önce' };
const STATUS = { sent: 'gönderildi', pending: 'bekliyor', skipped: 'atlandı', failed: 'hata', cancelled: 'iptal', sending: 'gönderiliyor' };

let key = sessionStorage.getItem('adminKey') || '';

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-key': key } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { sessionStorage.removeItem('adminKey'); showLogin(); }
  if (!res.ok) throw new Error(data.error || 'Hata');
  return data;
}

function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }

async function loadAppointments() {
  const rows = await api(`/api/admin/appointments?from=${$('#from').value}&days=${$('#days').value}`);
  $('#rows').innerHTML = rows.length ? rows.map((a) => `
    <tr class="${a.status === 'cancelled' ? 'cancelled' : ''}">
      <td>${esc(a.dateHuman)}</td>
      <td><b>${a.time}</b>–${a.endTime}</td>
      <td>${esc(a.name)}<br><small><a href="https://wa.me/${a.phone}" target="_blank" rel="noopener">+${a.phone}</a></small>${a.note ? `<br><small>📝 ${esc(a.note)}</small>` : ''}</td>
      <td>${esc(a.service)}<br><small>${a.source === 'online' ? '🌐 online' : '📞 telefon'}</small></td>
      <td>${a.whatsappOptIn ? a.reminders.map((r) => `<span class="rem ${r.status}" title="${esc(r.due)}${r.error ? ' · ' + esc(r.error) : ''}">${KIND[r.kind] || r.kind}: ${STATUS[r.status] || r.status}</span>`).join('') : '<small>izin yok</small>'}</td>
      <td>${a.status === 'confirmed' ? `<button class="link-btn" data-cancel="${a.id}">İptal</button>` : 'İptal edildi'}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Bu aralıkta randevu yok.</td></tr>';
}

async function loadMessages() {
  const msgs = await api('/api/admin/messages');
  $('#messages').innerHTML = msgs.length ? msgs.map((m) => `
    <div class="msg"><small>${esc(m.when)} · ${esc(m.name)} · ${KIND[m.kind] || m.kind} · ${m.mode === 'live' ? 'gönderildi' : 'deneme modu'}${m.ok ? '' : ' · ❌ ' + esc(m.error)}</small>${esc(m.body)}</div>`).join('')
    : '<p class="empty">Henüz mesaj yok.</p>';
}

async function start() {
  try {
    const status = await api('/api/admin/status');
    $('#login').hidden = true; $('#app').hidden = false;
    const live = status.whatsappMode === 'live';
    $('#mode').className = `pill ${live ? 'live' : 'dry'}`;
    $('#mode').textContent = live ? 'WhatsApp: canlı' : 'WhatsApp: deneme modu';
    if (!$('#from').value) $('#from').value = status.today;
    if (!$('#aDate').value) $('#aDate').value = status.today;
    if (!$('#aService').options.length) {
      const cfg = await (await fetch('/api/config')).json();
      $('#aService').innerHTML = cfg.services.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    }
    await Promise.all([loadAppointments(), loadMessages()]);
  } catch (e) {
    $('#loginErr').textContent = key ? e.message : '';
  }
}

$('#login').addEventListener('submit', (e) => {
  e.preventDefault();
  key = $('#pw').value;
  sessionStorage.setItem('adminKey', key);
  start();
});
$('#refresh').addEventListener('click', start);
$('#from').addEventListener('change', loadAppointments);
$('#days').addEventListener('change', loadAppointments);
$('#rows').addEventListener('click', async (e) => {
  const id = e.target.dataset.cancel;
  if (!id || !confirm('Bu randevu iptal edilsin mi? Bekleyen hatırlatmalar da gönderilmeyecek.')) return;
  await api(`/api/admin/appointments/${id}/cancel`, { method: 'POST' });
  loadAppointments();
});
$('#add').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#addErr').textContent = '';
  try {
    await api('/api/admin/appointments', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: $('#aService').value, date: $('#aDate').value, time: $('#aTime').value,
        name: $('#aName').value, phone: $('#aPhone').value, whatsappOptIn: $('#aWa').checked,
      }),
    });
    $('#aName').value = ''; $('#aPhone').value = '';
    start();
  } catch (err) {
    $('#addErr').textContent = err.message;
  }
});

if (key) start(); else showLogin();
setInterval(() => { if (!$('#app').hidden) loadMessages(); }, 30_000);
