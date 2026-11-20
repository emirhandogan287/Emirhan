import { booking, openingHours, reminders, services } from './config.js';
import { localParts, localToUtc, parseDateStr, parseHHMM } from './time.js';

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const findService = (id) => services.find((s) => s.id === id);

// Türkiye cep numaraları ve uluslararası (+...) numaralar -> E.164 rakamları (ör. 905321234567)
export function normalizePhone(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const d = raw.startsWith('00') ? digits.slice(2) : digits;
    if (d.startsWith('90')) return /^905\d{9}$/.test(d) ? d : null;
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  if (/^05\d{9}$/.test(digits)) return '9' + digits;
  if (/^5\d{9}$/.test(digits)) return '90' + digits;
  if (/^905\d{9}$/.test(digits)) return digits;
  return null;
}

function overlapping(db, startIso, endIso) {
  return db
    .prepare(`SELECT service_id FROM appointments
              WHERE status = 'confirmed' AND start_utc < ? AND end_utc > ?`)
    .all(endIso, startIso);
}

function slotIsFree(db, service, start, end) {
  const rows = overlapping(db, start.toISOString(), end.toISOString());
  if (rows.length >= booking.totalCapacity) return false;
  const same = rows.filter((r) => r.service_id === service.id).length;
  return same < (service.capacity ?? booking.totalCapacity);
}

function dayWindow(dateStr) {
  const d = parseDateStr(dateStr);
  if (!d) throw new BookingError('Geçersiz tarih.');
  const hours = openingHours[d.weekday];
  return { d, hours };
}

export function getSlots(db, serviceId, dateStr, now = new Date()) {
  const service = findService(serviceId);
  if (!service) throw new BookingError('Hizmet bulunamadı.');
  const { d, hours } = dayWindow(dateStr);
  if (!hours) return { closed: true, slots: [] };

  const lastDay = new Date(now.getTime() + booking.maxDaysAhead * 86_400_000);
  const earliest = now.getTime() + booking.minLeadMinutes * 60_000;
  const openMin = parseHHMM(hours.open);
  const closeMin = parseHHMM(hours.close);
  const slots = [];
  for (let m = openMin; m + service.durationMinutes <= closeMin; m += booking.slotIntervalMinutes) {
    const start = localToUtc(d.year, d.month, d.day, Math.floor(m / 60), m % 60);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const inRange = start.getTime() >= earliest && start <= lastDay;
    const past = start.getTime() < earliest;
    slots.push({ time, past, available: inRange && slotIsFree(db, service, start, end) });
  }
  return { closed: false, slots };
}

// Hatırlatma zamanı gece sessiz saatlerine düşerse sabaha kaydır
export function shiftOutOfQuietHours(due) {
  const p = localParts(due);
  const minutes = p.hour * 60 + p.minute;
  const qs = parseHHMM(reminders.quietStart);
  const qe = parseHHMM(reminders.quietEnd);
  const inQuiet = qs > qe ? minutes >= qs || minutes < qe : minutes >= qs && minutes < qe;
  if (!inQuiet) return due;
  let target = localToUtc(p.year, p.month, p.day, Math.floor(qe / 60), qe % 60);
  if (target <= due) target = new Date(target.getTime() + 86_400_000);
  return target;
}

export function planReminders(start, created, { optIn }) {
  const plan = [];
  if (!optIn) return plan;
  if (reminders.sendConfirmation) plan.push({ kind: 'confirm', due: created, status: 'pending' });
  for (const r of reminders.schedule) {
    const ideal = new Date(start.getTime() - r.minutesBefore * 60_000);
    // Randevu bu hatırlatmanın zamanı geçtikten sonra alındıysa gönderme (onay mesajı zaten gider)
    if (ideal < created) {
      plan.push({ kind: r.key, due: ideal, status: 'skipped' });
      continue;
    }
    const due = shiftOutOfQuietHours(ideal);
    plan.push({ kind: r.key, due, status: due < start ? 'pending' : 'skipped' });
  }
  return plan;
}

export function createAppointment(db, input, now = new Date(), { source = 'online', enforceLead = true } = {}) {
  const service = findService(input.serviceId);
  if (!service) throw new BookingError('Lütfen bir hizmet seçin.');
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) throw new BookingError('Lütfen adınızı ve soyadınızı yazın.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw new BookingError('Lütfen geçerli bir telefon numarası girin (ör. 0532 123 45 67).');
  const note = String(input.note || '').trim().slice(0, 300);
  if (source === 'online' && !input.kvkkConsent) throw new BookingError('Devam etmek için KVKK aydınlatma metnini onaylamanız gerekiyor.');
  const optIn = Boolean(input.whatsappOptIn);

  const { d, hours } = dayWindow(input.date);
  if (!hours) throw new BookingError('Seçtiğiniz gün kapalıyız.');
  const tm = /^(\d{2}):(\d{2})$/.exec(input.time || '');
  if (!tm) throw new BookingError('Lütfen bir saat seçin.');
  const startMin = Number(tm[1]) * 60 + Number(tm[2]);
  if (startMin < parseHHMM(hours.open) || startMin + service.durationMinutes > parseHHMM(hours.close)
      || (startMin - parseHHMM(hours.open)) % booking.slotIntervalMinutes !== 0) {
    throw new BookingError('Seçilen saat çalışma saatlerimizin dışında.');
  }
  const start = localToUtc(d.year, d.month, d.day, Number(tm[1]), Number(tm[2]));
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);
  if (enforceLead && start.getTime() < now.getTime() + booking.minLeadMinutes * 60_000) {
    throw new BookingError('Bu saat için artık randevu alınamıyor, lütfen başka bir saat seçin.');
  }
  if (start.getTime() > now.getTime() + booking.maxDaysAhead * 86_400_000) {
    throw new BookingError(`En fazla ${booking.maxDaysAhead} gün sonrasına randevu alınabilir.`);
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (!slotIsFree(db, service, start, end)) {
      throw new BookingError('Üzgünüz, bu saat az önce doldu. Lütfen başka bir saat seçin.', 409);
    }
    const res = db.prepare(`INSERT INTO appointments
        (service_id, start_utc, end_utc, name, phone, note, whatsapp_opt_in, source, created_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(service.id, start.toISOString(), end.toISOString(), name, phone, note, optIn ? 1 : 0, source, now.toISOString());
    const id = Number(res.lastInsertRowid);
    const ins = db.prepare('INSERT INTO reminders (appointment_id, kind, due_utc, status) VALUES (?, ?, ?, ?)');
    const plan = planReminders(start, now, { optIn });
    for (const r of plan) ins.run(id, r.kind, r.due.toISOString(), r.status);
    db.exec('COMMIT');
    return { id, service, start, end, name, phone, whatsappOptIn: optIn, reminders: plan.filter((r) => r.status === 'pending' && r.kind !== 'confirm').map((r) => r.kind) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function cancelAppointment(db, id) {
  const res = db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status = 'confirmed'`).run(id);
  db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE appointment_id = ? AND status = 'pending'`).run(id);
  return res.changes > 0;
}
