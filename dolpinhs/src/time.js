import { UTC_OFFSET_MINUTES } from './config.js';

const OFFSET_MS = UTC_OFFSET_MINUTES * 60_000;
const pad = (n) => String(n).padStart(2, '0');

// UTC Date -> yerel (İstanbul) saat bileşenleri
export function localParts(date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

// Yerel tarih/saat -> UTC Date
export function localToUtc(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);
}

export function parseDateStr(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day, weekday: check.getUTCDay() };
}

export function parseHHMM(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

export function localDateStr(date) {
  const p = localParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTimeStr(date) {
  const p = localParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// ör. "21 Kasım Cuma"
export function humanDate(date) {
  const p = localParts(date);
  return `${p.day} ${MONTHS[p.month - 1]} ${DAYS[p.weekday]}`;
}
