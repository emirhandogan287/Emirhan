import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createAppointment, getSlots, normalizePhone, planReminders, cancelAppointment } from '../src/appointments.js';
import { processDueReminders } from '../src/reminders.js';
import { localToUtc, localTimeStr, localDateStr } from '../src/time.js';

// Sabit "şimdi": 20 Kasım 2026 Cuma 10:00 (İstanbul)
const NOW = localToUtc(2026, 11, 20, 10, 0);
const base = { serviceId: 'cilt-bakimi', name: 'Ayşe Yılmaz', phone: '0532 123 45 67', kvkkConsent: true, whatsappOptIn: true };

test('telefon numarası normalize edilir', () => {
  assert.equal(normalizePhone('0532 123 45 67'), '905321234567');
  assert.equal(normalizePhone('5321234567'), '905321234567');
  assert.equal(normalizePhone('+90 532 123 45 67'), '905321234567');
  assert.equal(normalizePhone('+49 151 23456789'), '4915123456789');
  assert.equal(normalizePhone('0212 123 45 67'), null); // sabit hat WhatsApp için kabul edilmez
  assert.equal(normalizePhone('123'), null);
});

test('pazar kapalı, geçmiş saatler ve yakın saatler seçilemez', () => {
  const db = openDb(':memory:');
  assert.equal(getSlots(db, 'cilt-bakimi', '2026-11-22', NOW).closed, true); // Pazar
  const today = getSlots(db, 'cilt-bakimi', '2026-11-20', NOW).slots;
  assert.equal(today.find((s) => s.time === '10:30').available, false); // 60 dk ön süre
  assert.equal(today.find((s) => s.time === '11:00').available, true);
  assert.equal(today.at(-1).time, '19:00'); // 60 dk hizmet 20:00'de biter
});

test('kapasite dolunca saat kapanır ve çift kayıt engellenir', () => {
  const db = openDb(':memory:');
  const appt = { ...base, serviceId: 'lazer-epilasyon', date: '2026-11-23', time: '14:00' }; // kapasite 1
  createAppointment(db, appt, NOW);
  assert.equal(getSlots(db, 'lazer-epilasyon', '2026-11-23', NOW).slots.find((s) => s.time === '14:00').available, false);
  assert.throws(() => createAppointment(db, { ...appt, phone: '05551112233' }, NOW), /doldu/);
});

test('toplam kapasite (3) farklı hizmetlerde de uygulanır', () => {
  const db = openDb(':memory:');
  const t = { date: '2026-11-23', time: '15:00' };
  createAppointment(db, { ...base, ...t, serviceId: 'cilt-bakimi' }, NOW);
  createAppointment(db, { ...base, ...t, serviceId: 'sac-boyama' }, NOW);
  createAppointment(db, { ...base, ...t, serviceId: 'kas-kirpik' }, NOW);
  assert.throws(() => createAppointment(db, { ...base, ...t, serviceId: 'sac-bakim-kesim' }, NOW), /doldu/);
});

test('hatırlatmalar 1 gün ve 5 saat önce planlanır', () => {
  const start = localToUtc(2026, 11, 23, 16, 0);
  const plan = Object.fromEntries(planReminders(start, NOW, { optIn: true }).map((r) => [r.kind, r]));
  assert.equal(plan.confirm.status, 'pending');
  assert.equal(`${localDateStr(plan.r24.due)} ${localTimeStr(plan.r24.due)}`, '2026-11-22 16:00');
  assert.equal(`${localDateStr(plan.r5.due)} ${localTimeStr(plan.r5.due)}`, '2026-11-23 11:00');
});

test('gece saatine düşen 5 saat hatırlatması sabah 08:00e kaydırılır', () => {
  const start = localToUtc(2026, 11, 23, 9, 30); // 5 saat önce = 04:30
  const r5 = planReminders(start, NOW, { optIn: true }).find((r) => r.kind === 'r5');
  assert.equal(localTimeStr(r5.due), '08:00');
  assert.equal(r5.status, 'pending');
});

test('randevu 24 saatten kısa süre kala alınırsa 1 gün hatırlatması atlanır', () => {
  const start = localToUtc(2026, 11, 20, 18, 0); // aynı gün
  const plan = Object.fromEntries(planReminders(start, NOW, { optIn: true }).map((r) => [r.kind, r]));
  assert.equal(plan.r24.status, 'skipped');
  assert.equal(plan.r5.status, 'pending'); // 8 saat kala alındı -> 5 saat hatırlatması 13:00'te yine gider
  assert.equal(localTimeStr(plan.r5.due), '13:00');
});

test('WhatsApp izni yoksa mesaj planlanmaz', () => {
  assert.equal(planReminders(localToUtc(2026, 11, 23, 16, 0), NOW, { optIn: false }).length, 0);
});

test('zamanı gelen mesajlar bir kez gönderilir, iptal edilenler gönderilmez', async () => {
  const db = openDb(':memory:');
  const a = createAppointment(db, { ...base, date: '2026-11-23', time: '16:00' }, NOW);
  const b = createAppointment(db, { ...base, name: 'Can Demir', date: '2026-11-23', time: '17:00' }, NOW);
  cancelAppointment(db, b.id);
  const sent = [];
  const fake = async (m) => { sent.push(m); return { ok: true, mode: 'test', body: m.template }; };

  await processDueReminders(db, NOW, fake);
  assert.deepEqual(sent.map((m) => m.template), ['randevu_onay']);
  assert.deepEqual(sent[0].params, ['Ayşe', '23 Kasım Pazartesi', '16:00', 'Cilt Bakımı']);

  await processDueReminders(db, NOW, fake); // tekrar çalışınca yeniden göndermemeli
  assert.equal(sent.length, 1);

  await processDueReminders(db, localToUtc(2026, 11, 22, 16, 0), fake);
  assert.equal(sent.at(-1).template, 'randevu_hatirlatma_1gun');
  await processDueReminders(db, localToUtc(2026, 11, 23, 11, 0), fake);
  assert.equal(sent.at(-1).template, 'randevu_hatirlatma_5saat');
  assert.equal(sent.length, 3);
  assert.ok(sent.every((m) => m.to === a.phone));
});

test('başarısız gönderim tekrar denenir, 3 denemeden sonra durur', async () => {
  const db = openDb(':memory:');
  createAppointment(db, { ...base, date: '2026-11-23', time: '16:00' }, NOW);
  let calls = 0;
  const failing = async () => { calls++; return { ok: false, mode: 'test', body: '', error: 'ağ hatası' }; };
  for (let i = 0; i < 5; i++) await processDueReminders(db, NOW, failing);
  assert.equal(calls, 3);
  assert.equal(db.prepare(`SELECT status FROM reminders WHERE kind = 'confirm'`).get().status, 'failed');
});
