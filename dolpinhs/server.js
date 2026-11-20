import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { business, booking, openingHours, reminders, services } from './src/config.js';
import { openDb } from './src/db.js';
import { BookingError, cancelAppointment, createAppointment, findService, getSlots } from './src/appointments.js';
import { startReminderLoop } from './src/reminders.js';
import { isLive } from './src/whatsapp.js';
import { humanDate, localDateStr, localTimeStr, localToUtc, parseDateStr } from './src/time.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'dolpinhs.db'));

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = randomBytes(6).toString('hex');
  console.log(`ADMIN_PASSWORD tanımlı değil. Bu çalıştırma için geçici yönetici şifresi: ${ADMIN_PASSWORD}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new BookingError('İstek çok büyük.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new BookingError('Geçersiz istek.');
  }
}

// Basit hız sınırı: aynı IP'den saatte en fazla 10 online randevu
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 10;
}

function isAdmin(req) {
  const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function publicConfig() {
  return {
    business,
    services: services.map(({ id, name, description, durationMinutes, badge, icon }) => ({ id, name, description, durationMinutes, badge, icon })),
    openingHours,
    maxDaysAhead: booking.maxDaysAhead,
    reminderHours: reminders.schedule.map((r) => r.minutesBefore / 60),
    today: localDateStr(new Date()),
  };
}

function summary(appt) {
  return {
    id: appt.id,
    service: appt.service.name,
    date: humanDate(appt.start),
    time: localTimeStr(appt.start),
    name: appt.name,
    whatsappOptIn: appt.whatsappOptIn,
    reminders: appt.reminders,
  };
}

function listAppointments(fromStr, days) {
  const d = parseDateStr(fromStr) || parseDateStr(localDateStr(new Date()));
  const from = localToUtc(d.year, d.month, d.day);
  const to = new Date(from.getTime() + days * 86_400_000);
  const rows = db.prepare(`SELECT * FROM appointments WHERE start_utc >= ? AND start_utc < ? ORDER BY start_utc`)
    .all(from.toISOString(), to.toISOString());
  const rem = db.prepare('SELECT kind, status, due_utc, sent_utc, last_error FROM reminders WHERE appointment_id = ?');
  return rows.map((a) => ({
    id: a.id,
    date: localDateStr(new Date(a.start_utc)),
    dateHuman: humanDate(new Date(a.start_utc)),
    time: localTimeStr(new Date(a.start_utc)),
    endTime: localTimeStr(new Date(a.end_utc)),
    service: findService(a.service_id)?.name || a.service_id,
    name: a.name,
    phone: a.phone,
    note: a.note,
    status: a.status,
    source: a.source,
    whatsappOptIn: Boolean(a.whatsapp_opt_in),
    reminders: rem.all(a.id).map((r) => ({
      kind: r.kind, status: r.status,
      due: `${humanDate(new Date(r.due_utc))} ${localTimeStr(new Date(r.due_utc))}`,
      error: r.last_error,
    })),
  }));
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(file);
    send(res, 200, data, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
  } catch {
    send(res, 404, 'Bulunamadı', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (path === '/api/config' && req.method === 'GET') return json(res, 200, publicConfig());

    if (path === '/api/slots' && req.method === 'GET') {
      return json(res, 200, getSlots(db, url.searchParams.get('service'), url.searchParams.get('date')));
    }

    if (path === '/api/appointments' && req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (rateLimited(ip)) throw new BookingError('Çok fazla deneme yapıldı. Lütfen bizi telefonla arayın.', 429);
      const body = await readJson(req);
      if (body.website) throw new BookingError('Geçersiz istek.'); // bot tuzağı
      return json(res, 201, summary(createAppointment(db, body)));
    }

    if (path.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Yetkisiz. Şifreyi kontrol edin.' });
      if (path === '/api/admin/status') return json(res, 200, { whatsappMode: isLive() ? 'live' : 'dry-run', today: localDateStr(new Date()) });
      if (path === '/api/admin/appointments' && req.method === 'GET') {
        const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 1, 1), 31);
        return json(res, 200, listAppointments(url.searchParams.get('from'), days));
      }
      if (path === '/api/admin/appointments' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 201, summary(createAppointment(db, body, new Date(), { source: 'telefon', enforceLead: false })));
      }
      const m = /^\/api\/admin\/appointments\/(\d+)\/cancel$/.exec(path);
      if (m && req.method === 'POST') return json(res, cancelAppointment(db, Number(m[1])) ? 200 : 404, { ok: true });
      if (path === '/api/admin/messages') {
        const rows = db.prepare(`SELECT m.*, a.name FROM message_log m LEFT JOIN appointments a ON a.id = m.appointment_id
                                 ORDER BY m.id DESC LIMIT 50`).all();
        return json(res, 200, rows.map((r) => ({ ...r, when: `${humanDate(new Date(r.created_utc))} ${localTimeStr(new Date(r.created_utc))}` })));
      }
      return json(res, 404, { error: 'Bulunamadı' });
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'Bulunamadı' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    return serveStatic(req, res, path);
  } catch (err) {
    if (err instanceof BookingError) return json(res, err.status, { error: err.message });
    console.error(err);
    return json(res, 500, { error: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
  }
});

startReminderLoop(db);
server.listen(PORT, () => {
  console.log(`DOLPİNHS çalışıyor: http://localhost:${PORT}  (yönetim: /admin)`);
  console.log(`WhatsApp modu: ${isLive() ? 'CANLI' : 'DENEME (mesajlar gönderilmez, konsola yazılır)'}`);
});
