// Database, helpers and seed data. Uses Node's built-in SQLite: no npm packages, no internet.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(import.meta.dirname, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
export const db = new DatabaseSync(path.join(DATA_DIR, 'medivend.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export const uid = () => crypto.randomBytes(5).toString('hex');
export const token = (n = 8) => crypto.randomBytes(n).toString('hex');
export const now = () => new Date().toISOString();
export const ago = (ms) => new Date(Date.now() - ms).toISOString();
export const ahead = (ms) => new Date(Date.now() + ms).toISOString();
export const js = (v) => JSON.stringify(v ?? null);
export const parse = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

export const CFG = {
  dispenseTimeoutMs: Number(process.env.DISPENSE_TIMEOUT_MS ?? 60_000),
  escalateMs: Number(process.env.ESCALATE_MS ?? 60_000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 300_000),
  machineOnlineMs: 120_000,
  otp: '123456',
};

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function audit(actor, action, entity, entityId, data = {}) {
  run('INSERT INTO audit_logs (actor_id, action, entity, entity_id, data, created_at) VALUES (?,?,?,?,?,?)',
    actor ?? null, action, entity, entityId ?? null, js(data), now());
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'patient',
  name TEXT, dob TEXT, weight_kg REAL, gender TEXT,
  allergies TEXT NOT NULL DEFAULT '[]', conditions TEXT NOT NULL DEFAULT '[]', current_meds TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS doctors (user_id TEXT PRIMARY KEY, registration_no TEXT, verified INTEGER NOT NULL DEFAULT 1,
  online INTEGER NOT NULL DEFAULT 1, is_backup INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY, brand TEXT NOT NULL, generic TEXT NOT NULL, tier INTEGER NOT NULL, price REAL NOT NULL,
  category TEXT, uses TEXT, warnings TEXT, dosage_text TEXT, min_age INTEGER NOT NULL DEFAULT 0,
  max_per_order INTEGER NOT NULL DEFAULT 2, allergy_tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, lat REAL, lng REAL, api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', last_seen TEXT, pharmacy_partner TEXT DEFAULT 'Demo Pharmacy Partner');
CREATE TABLE IF NOT EXISTS lanes (
  id TEXT PRIMARY KEY, machine_id TEXT NOT NULL REFERENCES machines(id), lane_no INTEGER NOT NULL,
  medicine_id TEXT REFERENCES medicines(id), qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  batch TEXT, expiry TEXT, UNIQUE (machine_id, lane_no));
CREATE TABLE IF NOT EXISTS qr_sessions (token TEXT PRIMARY KEY, machine_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, order_id TEXT);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doc_type TEXT, filename TEXT, path TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS emergency_requests (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, machine_id TEXT, status TEXT NOT NULL, situation TEXT,
  requested_items TEXT NOT NULL DEFAULT '[]', approved_items TEXT NOT NULL DEFAULT '[]', doctor_id TEXT, note TEXT,
  created_at TEXT, alerted_at TEXT, accepted_at TEXT, decided_at TEXT, dispensed_at TEXT);
CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT, condition TEXT NOT NULL, note TEXT,
  document_ids TEXT NOT NULL DEFAULT '[]', items TEXT NOT NULL DEFAULT '[]', red_flag_keys TEXT NOT NULL DEFAULT '[]',
  valid_from TEXT, valid_until TEXT, uses_allowed INTEGER NOT NULL DEFAULT 1, uses_left INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL, instructions TEXT, decision_note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS pass_usage (id TEXT PRIMARY KEY, pass_id TEXT, machine_id TEXT, order_id TEXT, used_at TEXT, red_flags TEXT);
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'rx',
  items TEXT NOT NULL, valid_until TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, machine_id TEXT NOT NULL, items TEXT NOT NULL, total REAL NOT NULL,
  status TEXT NOT NULL, ent_type TEXT NOT NULL, ent_id TEXT, red_flags TEXT, created_at TEXT, paid_at TEXT);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, provider TEXT, ref TEXT, amount REAL, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS dispense_events (id TEXT PRIMARY KEY, order_id TEXT, machine_id TEXT, lanes TEXT, result TEXT NOT NULL DEFAULT 'pending', reason TEXT, started_at TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, machine_id TEXT, order_id TEXT, items TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT);
CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, order_id TEXT, payment_id TEXT, amount REAL, reason TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id TEXT, order_id TEXT, subject TEXT, body TEXT, status TEXT DEFAULT 'open', created_at TEXT);
CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, title TEXT, due_at TEXT, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, data TEXT, created_at TEXT);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
`);

// ---------------- seed (first run only) ----------------
if (!get('SELECT 1 AS x FROM medicines LIMIT 1')) {
  const users = [
    ['9000000001', 'patient', 'Demo Patient'], ['9000000002', 'patient', 'Second Patient'],
    ['9000000011', 'doctor', 'Dr. Demo Doctor'], ['9000000012', 'doctor', 'Dr. Backup Panel'],
    ['9000000021', 'worker', 'Demo Worker'],
  ];
  for (const [phone, role, name] of users) {
    const id = 'u' + uid();
    run('INSERT INTO users (id, phone, role, name, created_at) VALUES (?,?,?,?,?)', id, phone, role, name, now());
    if (role === 'doctor') run('INSERT INTO doctors (user_id, registration_no, verified, online, is_backup) VALUES (?,?,?,?,?)',
      id, 'DEMO-' + phone.slice(-4), 1, 1, name.includes('Backup') ? 1 : 0);
  }
  // Placeholder catalogue for the prototype: a doctor and pharmacist must review doses, prices and Tier 3 before real use.
  const meds = [
    ['paracetamol', 'Paracetamol 500 mg strip', 'Paracetamol', 1, 25, 'Fever / pain', 'Fever, mild pain', 'Do not exceed the daily maximum on the leaflet. Liver disease: ask a doctor.', 'Follow the leaflet; adults only from this machine.', 18, 2, ['paracetamol', 'acetaminophen']],
    ['ors', 'ORS sachet', 'ORS', 1, 20, 'Hydration', 'Loose motions, dehydration', 'Mix only with clean water as printed. See a doctor for blood in stool or no urine for 8 hours.', 'As per sachet instructions.', 0, 4, []],
    ['antacid', 'Antacid gel sachet', 'Antacid', 1, 30, 'Digestive', 'Acidity, heartburn', 'See a doctor if symptoms last more than 2 weeks.', 'As per leaflet.', 12, 2, []],
    ['cetirizine', 'Cetirizine 10 mg strip', 'Cetirizine', 1, 35, 'Allergy', 'Sneezing, itching, mild allergy', 'May cause drowsiness. Swelling or breathing trouble: call 108.', 'As per leaflet.', 18, 2, ['cetirizine', 'antihistamine']],
    ['povidone', 'Povidone-iodine solution', 'Povidone-iodine', 1, 45, 'Antiseptic', 'Minor cuts and scrapes', 'External use only. Avoid if allergic to iodine.', 'Apply as per label.', 0, 2, ['iodine', 'povidone']],
    ['lozenges', 'Throat lozenges', 'Lozenges', 1, 40, 'Cold / throat', 'Sore throat', 'Not for young children.', 'As per leaflet.', 12, 2, []],
    ['amoxicillin', 'Amoxicillin 500 mg', 'Amoxicillin', 2, 90, 'Antibiotic', 'Bacterial infections (prescribed)', 'Penicillin allergy: do not use.', 'Exactly as prescribed.', 18, 1, ['penicillin', 'amoxicillin']],
    ['azithromycin', 'Azithromycin 500 mg', 'Azithromycin', 2, 110, 'Antibiotic', 'Bacterial infections (prescribed)', 'Take only as prescribed.', 'Exactly as prescribed.', 18, 1, ['azithromycin', 'macrolide']],
    ['amlodipine', 'Amlodipine 5 mg', 'Amlodipine', 2, 40, 'Blood pressure', 'High blood pressure (prescribed)', 'Do not stop suddenly.', 'Exactly as prescribed.', 18, 1, ['amlodipine']],
    ['metformin', 'Metformin 500 mg', 'Metformin', 2, 35, 'Diabetes', 'Type 2 diabetes (prescribed)', 'Kidney disease: ask doctor.', 'Exactly as prescribed.', 18, 1, ['metformin']],
    ['pantoprazole', 'Pantoprazole 40 mg', 'Pantoprazole', 2, 60, 'Digestive', 'Acid reflux (prescribed)', 'Take only as prescribed.', 'Exactly as prescribed.', 18, 1, ['pantoprazole']],
    ['adrenaline', 'Adrenaline auto-injector (emergency pack)', 'Adrenaline', 3, 2500, 'Emergency', 'Severe allergic reaction (anaphylaxis)', 'Use only for a severe reaction, then call 108 and go to hospital.', 'Single-event sealed pack with leaflet.', 0, 1, []],
    ['salbutamol', 'Salbutamol inhaler (emergency pack)', 'Salbutamol', 3, 180, 'Emergency', 'Asthma attack / wheeze', 'If no relief, call 108.', 'Single-event sealed pack with leaflet.', 0, 1, ['salbutamol']],
    ['aspirin', 'Aspirin 325 mg chewable (emergency pack)', 'Aspirin', 3, 40, 'Emergency', 'Suspected heart attack (chest pain)', 'Call 108 first. Not if allergic to aspirin or bleeding.', 'Single-event sealed pack with leaflet.', 18, 1, ['aspirin', 'nsaid', 'salicylate']],
    ['isdn', 'Isosorbide dinitrate 5 mg sublingual (emergency pack)', 'Isosorbide dinitrate', 3, 60, 'Emergency', 'Known angina attack', 'Doctor-approved use only. Call 108 if pain persists.', 'Single-event sealed pack with leaflet.', 18, 1, ['nitrate']],
    ['glucose', 'Oral glucose powder (emergency pack)', 'Glucose', 3, 30, 'Emergency', 'Low blood sugar', 'Recheck sugar; see a doctor after use.', 'Single-event sealed pack with leaflet.', 0, 1, []],
    ['antihistamine', 'Antihistamine tablet (emergency pack)', 'Antihistamine', 3, 35, 'Emergency', 'Moderate allergic reaction', 'May cause drowsiness. Severe symptoms: call 108.', 'Single-event sealed pack with leaflet.', 18, 1, ['antihistamine', 'cetirizine']],
    ['ors-em', 'ORS emergency pack', 'ORS emergency', 3, 60, 'Emergency', 'Severe dehydration', 'Seek care for fainting, confusion or no urine.', 'Single-event sealed pack with leaflet.', 0, 1, []],
    ['para-em', 'Paracetamol emergency pack', 'Paracetamol emergency', 3, 40, 'Emergency', 'High fever', 'Seek care if fever persists.', 'Single-event sealed pack with leaflet.', 18, 1, ['paracetamol', 'acetaminophen']],
  ];
  for (const m of meds) run('INSERT INTO medicines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ...m.slice(0, 11), js(m[11]));

  const machines = [
    ['M1', 'Railway Station (demo)', 'Surat Railway Station', 21.2049, 72.8411, 'demo-key-1'],
    ['M2', 'Civil Hospital Gate (demo)', 'Near hospital main gate', 21.1790, 72.8320, 'demo-key-2'],
    ['M3', 'Highway Plaza NH48 (demo)', 'Highway rest stop', 21.1300, 72.7800, 'demo-key-3'],
  ];
  for (const m of machines) run('INSERT INTO machines (id, name, address, lat, lng, api_key) VALUES (?,?,?,?,?,?)', ...m);
  const lanes = {
    M1: [['paracetamol', 10], ['ors', 10], ['cetirizine', 8], ['adrenaline', 3], ['salbutamol', 3], ['aspirin', 5]],
    M2: [['paracetamol', 6], ['antacid', 6], ['povidone', 6], ['amoxicillin', 4], ['glucose', 4], ['isdn', 3]],
    M3: [['paracetamol', 4], ['ors', 4], ['lozenges', 4], ['antihistamine', 2], ['salbutamol', 2], ['cetirizine', 4]],
  };
  for (const [mid, ls] of Object.entries(lanes)) ls.forEach(([med, qty], i) =>
    run('INSERT INTO lanes (id, machine_id, lane_no, medicine_id, qty, batch, expiry) VALUES (?,?,?,?,?,?,?)',
      `${mid}-${i + 1}`, mid, i + 1, med, qty, `B-${i + 1}-DEMO`, '2028-06-30'));
}
