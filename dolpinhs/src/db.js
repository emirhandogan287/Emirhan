import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      note TEXT,
      whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'online',
      created_utc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_appt_start ON appointments(start_utc);
    CREATE TABLE IF NOT EXISTS reminders (
      appointment_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      due_utc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_utc TEXT,
      last_error TEXT,
      PRIMARY KEY (appointment_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_rem_due ON reminders(status, due_utc);
    CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      kind TEXT,
      phone TEXT,
      body TEXT,
      mode TEXT,
      ok INTEGER,
      error TEXT,
      created_utc TEXT NOT NULL
    );
  `);
  return db;
}
