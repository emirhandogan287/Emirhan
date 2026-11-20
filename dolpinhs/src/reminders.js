// Zamanı gelen WhatsApp mesajlarını (onay, 1 gün önce, 5 saat önce) gönderir.
import { reminders as cfg } from './config.js';
import { findService } from './appointments.js';
import { humanDate, localTimeStr } from './time.js';
import { sendTemplate } from './whatsapp.js';

const TEMPLATE_BY_KIND = {
  confirm: cfg.confirmationTemplate,
  ...Object.fromEntries(cfg.schedule.map((r) => [r.key, r.template])),
};

function paramsFor(kind, appt) {
  const start = new Date(appt.start_utc);
  const firstName = appt.name.split(' ')[0];
  const service = findService(appt.service_id)?.name || appt.service_id;
  if (kind === 'confirm') return [firstName, humanDate(start), localTimeStr(start), service];
  return [firstName, localTimeStr(start), service];
}

export async function processDueReminders(db, now = new Date(), send = sendTemplate) {
  const due = db.prepare(`
    SELECT r.appointment_id, r.kind, r.attempts, a.*
    FROM reminders r JOIN appointments a ON a.id = r.appointment_id
    WHERE r.status = 'pending' AND r.due_utc <= ?
    ORDER BY r.due_utc`).all(now.toISOString());

  const results = [];
  for (const row of due) {
    const key = [row.appointment_id, row.kind];
    // Randevu iptal edildiyse ya da saati geçtiyse gönderme
    if (row.status !== 'confirmed' || new Date(row.start_utc) <= now) {
      db.prepare(`UPDATE reminders SET status = 'skipped' WHERE appointment_id = ? AND kind = ?`).run(...key);
      continue;
    }
    // Aynı mesajın iki kez gitmemesi için önce "gönderiliyor" olarak işaretle
    const claim = db.prepare(`UPDATE reminders SET status = 'sending', attempts = attempts + 1
                              WHERE appointment_id = ? AND kind = ? AND status = 'pending'`).run(...key);
    if (claim.changes === 0) continue;

    const template = TEMPLATE_BY_KIND[row.kind];
    const result = await send({ to: row.phone, template, params: paramsFor(row.kind, row) });
    db.prepare(`INSERT INTO message_log (appointment_id, kind, phone, body, mode, ok, error, created_utc)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.appointment_id, row.kind, row.phone, result.body, result.mode, result.ok ? 1 : 0, result.error || null, now.toISOString());

    if (result.ok) {
      db.prepare(`UPDATE reminders SET status = 'sent', sent_utc = ?, last_error = NULL WHERE appointment_id = ? AND kind = ?`)
        .run(now.toISOString(), ...key);
    } else {
      const failed = row.attempts + 1 >= cfg.maxAttempts;
      db.prepare(`UPDATE reminders SET status = ?, last_error = ? WHERE appointment_id = ? AND kind = ?`)
        .run(failed ? 'failed' : 'pending', result.error, ...key);
    }
    results.push({ appointmentId: row.appointment_id, kind: row.kind, ok: result.ok });
  }
  return results;
}

export function startReminderLoop(db) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processDueReminders(db);
    } catch (err) {
      console.error('Hatırlatma hatası:', err);
    } finally {
      running = false;
    }
  };
  // Sunucu kapanıp açıldığında 'sending' durumunda kalanları tekrar sıraya al
  db.prepare(`UPDATE reminders SET status = 'pending' WHERE status = 'sending'`).run();
  tick();
  return setInterval(tick, cfg.checkIntervalSeconds * 1000);
}
