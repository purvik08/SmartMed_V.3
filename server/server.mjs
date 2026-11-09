// SmartMed local server: REST API for the Android app, machine endpoint, and the machine simulator page.
// Runs fully offline on your laptop. No npm packages. Needs Node.js 22.13 or newer.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  get, all, run, uid, token, now, ago, ahead, js, parse, tx, audit, CFG, DATA_DIR, HttpError,
} from './lib.mjs';
import { checkEligibility, planStock, allergyHit } from './rules.mjs';
import { qrSvg } from './qr.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const need = (cond, status, msg, code) => { if (!cond) throw new HttpError(status, msg, code); };
const last10 = (p) => String(p ?? '').replace(/\D/g, '').slice(-10);
const ageOf = (dob) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000) : null);

// ---------- output shapers ----------
const userOut = (u) => ({
  id: u.id, phone: u.phone, role: u.role, name: u.name, dob: u.dob, weight_kg: u.weight_kg, gender: u.gender,
  allergies: parse(u.allergies, []), conditions: parse(u.conditions, []), current_meds: parse(u.current_meds, []),
});
const brandOf = (id) => get('SELECT brand FROM medicines WHERE id = ?', id)?.brand ?? id;
const withBrand = (items) => parse(items, []).map((i) => ({ ...i, brand: brandOf(i.medicine_id) }));
const orderOut = (o) => ({ ...o, items: parse(o.items, []), red_flags: parse(o.red_flags, []) });
const reqOut = (r) => ({ ...r, requested_items: withBrand(r.requested_items), approved_items: withBrand(r.approved_items) });
const passOut = (p) => ({
  ...p, items: withBrand(p.items), red_flag_keys: parse(p.red_flag_keys, []), document_ids: parse(p.document_ids, []),
});
const machineOut = (m) => ({
  id: m.id, name: m.name, address: m.address, lat: m.lat, lng: m.lng, pharmacy_partner: m.pharmacy_partner,
  online: m.status === 'active' && !!m.last_seen && Date.now() - new Date(m.last_seen).getTime() < CFG.machineOnlineMs,
});

const ROLES = new Set(['patient', 'doctor', 'worker']);

function capturePayment(orderId, provider, reference) {
  const o = get("SELECT * FROM orders WHERE id = ? AND status = 'created'", orderId);
  if (!o) return get('SELECT * FROM orders WHERE id = ?', orderId);
  tx(() => {
    run("INSERT INTO payments VALUES (?,?,'local_qr',?,?,'captured',?)", uid(), o.id, reference, o.total, now());
    run("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'created'", now(), o.id);
    if (o.ent_type === 'emergency') run("UPDATE emergency_requests SET status = 'PAID' WHERE id = ? AND status = 'APPROVED'", o.ent_id);
    audit(o.patient_id, 'order.paid', 'order', o.id, { total: o.total, provider });
  });
  return get('SELECT * FROM orders WHERE id = ?', orderId);
}

// ---------- domain operations ----------
function failOrder(orderId, reason) {
  tx(() => {
    const o = get("SELECT * FROM orders WHERE id = ? AND status = 'dispensing'", orderId);
    if (!o) return; // already handled (idempotent)
    run("UPDATE orders SET status = 'failed' WHERE id = ?", orderId);
    const ev = get('SELECT * FROM dispense_events WHERE order_id = ? ORDER BY started_at DESC LIMIT 1', orderId);
    run("UPDATE dispense_events SET result = 'fail', reason = ?, finished_at = ? WHERE order_id = ? AND result = 'pending'", reason, now(), orderId);
    run("UPDATE commands SET status = 'done' WHERE order_id = ?", orderId);
    for (const a of parse(ev?.lanes, [])) run('UPDATE lanes SET qty = qty + ? WHERE id = ?', a.qty, a.lane_id);
    const pay = get("SELECT * FROM payments WHERE order_id = ? AND status = 'captured'", orderId);
    if (pay) {
      run("UPDATE payments SET status = 'refunded' WHERE id = ?", pay.id);
      run("INSERT INTO refunds VALUES (?,?,?,?,?,'processed',?)", uid(), orderId, pay.id, pay.amount, reason, now());
    }
    run("UPDATE orders SET status = 'refunded' WHERE id = ?", orderId);
    if (o.ent_type === 'emergency') run("UPDATE emergency_requests SET status = 'APPROVED' WHERE id = ? AND status = 'PAID'", o.ent_id);
    run("INSERT INTO tickets (id, user_id, order_id, subject, body, created_at) VALUES (?,?,?,?,?,?)",
      uid(), o.patient_id, orderId, 'Dispense failed - automatic refund', reason, now());
    audit(null, 'order.failed_refunded', 'order', orderId, { reason });
  });
}

function completeOrder(orderId, machineId) {
  tx(() => {
    const o = get("SELECT * FROM orders WHERE id = ? AND machine_id = ? AND status = 'dispensing'", orderId, machineId);
    if (!o) return; // duplicate report
    run("UPDATE orders SET status = 'dispensed' WHERE id = ?", orderId);
    run("UPDATE dispense_events SET result = 'success', finished_at = ? WHERE order_id = ? AND result = 'pending'", now(), orderId);
    run("UPDATE commands SET status = 'done' WHERE order_id = ?", orderId);
    const remind = (userId, kind, title, hours) =>
      run('INSERT INTO reminders (id, user_id, kind, title, due_at) VALUES (?,?,?,?,?)', uid(), userId, kind, title, ahead(hours * 3600e3));
    if (o.ent_type === 'emergency') {
      run("UPDATE emergency_requests SET status = 'DISPENSED', dispensed_at = ? WHERE id = ?", now(), o.ent_id);
      remind(o.patient_id, 'follow_up', 'See a doctor for follow-up after your emergency pack', 2);
    } else if (o.ent_type === 'pass') {
      const p = get('SELECT * FROM passes WHERE id = ?', o.ent_id);
      const left = Math.max(0, p.uses_left - 1);
      run('UPDATE passes SET uses_left = ?, status = ? WHERE id = ?', left, left === 0 ? 'EXHAUSTED' : p.status, p.id);
      run('INSERT INTO pass_usage VALUES (?,?,?,?,?,?)', uid(), p.id, machineId, o.id, now(), o.red_flags);
      remind(o.patient_id, 'follow_up', 'Your doctor will call within 24 hours. See a doctor after using emergency medicine.', 2);
      if (p.doctor_id) remind(p.doctor_id, 'pass_used', 'Pass used: call the patient within 24 hours', 1);
    } else if (o.ent_type === 'rx') {
      run('UPDATE prescriptions SET used = 1 WHERE id = ?', o.ent_id);
    }
    audit(null, 'order.dispensed', 'order', orderId, { machine: machineId });
  });
}

function sweep() {
  for (const ev of all("SELECT order_id FROM dispense_events WHERE result = 'pending' AND started_at < ?", ago(CFG.dispenseTimeoutMs)))
    failOrder(ev.order_id, 'timeout: no dispense confirmation');
  run("UPDATE emergency_requests SET status = 'TIMED_OUT' WHERE status = 'DOCTOR_ALERTED' AND alerted_at < ?", ago(CFG.requestTimeoutMs));
  run("UPDATE passes SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND valid_until < ?", now());
}
setInterval(sweep, 3000).unref();

function doctorCanView(doctorId, patientId) {
  return !!get(`SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM passes WHERE patient_id = ?1 AND (status = 'UNDER_REVIEW' OR doctor_id = ?2))
    OR EXISTS (SELECT 1 FROM emergency_requests WHERE patient_id = ?1 AND (status = 'DOCTOR_ALERTED' OR doctor_id = ?2))`, patientId, doctorId);
}

// ---------- router ----------
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
};

// ---- auth (local OTP transport; in production an SMS/identity provider owns delivery) ----
route('POST', '/api/auth/otp', ({ body }) => {
  need(last10(body.phone).length === 10, 400, 'Enter a 10-digit mobile number');
  console.log(`[otp] demo OTP for ${last10(body.phone)} is ${CFG.otp}`);
  return { ok: true, hint: `Demo OTP is ${CFG.otp}` };
}, { public: true });

route('POST', '/api/auth/verify', ({ body }) => {
  const phone = last10(body.phone);
  need(phone.length === 10, 400, 'Enter a 10-digit mobile number');
  need(String(body.otp) === CFG.otp, 401, 'Wrong OTP');
  let u = get('SELECT * FROM users WHERE phone = ?', phone);
  if (!u) {
    const role = String(body.role ?? 'patient').toLowerCase();
    need(ROLES.has(role), 400, 'Choose patient, doctor, or worker');
    const id = 'u' + uid();
    run('INSERT INTO users (id, phone, role, role_selected, created_at) VALUES (?,?,?,?,?)', id, phone, role, 1, now());
    if (role === 'doctor') run('INSERT INTO doctors (user_id, registration_no, verified, online, is_backup) VALUES (?,?,?,?,?)', id, `LOCAL-${phone}`, 1, 1, 0);
    u = get('SELECT * FROM users WHERE id = ?', id);
  }
  const t = token(16);
  run('INSERT INTO auth_tokens VALUES (?,?,?)', t, u.id, now());
  return { token: t, user: userOut(u) };
}, { public: true });

route('GET', '/api/me', ({ user }) => {
  const d = get('SELECT * FROM doctors WHERE user_id = ?', user.id);
  return { ...userOut(user), online: d ? !!d.online : null };
});
route('PUT', '/api/me', ({ user, body }) => {
  if (body.dob) need(/^\d{4}-\d{2}-\d{2}$/.test(body.dob) && !Number.isNaN(Date.parse(body.dob)), 400, 'Date of birth must be YYYY-MM-DD');
  const list = (v) => js((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean));
  run('UPDATE users SET name = ?, dob = ?, weight_kg = ?, gender = ?, allergies = ?, conditions = ?, current_meds = ? WHERE id = ?',
    body.name ?? user.name, body.dob || null, body.weight_kg ?? null, body.gender ?? null,
    list(body.allergies), list(body.conditions), list(body.current_meds), user.id);
  return userOut(get('SELECT * FROM users WHERE id = ?', user.id));
});

// ---- catalogue and machines ----
route('GET', '/api/medicines', ({ query }) => {
  const q = `%${(query.q ?? '').toLowerCase()}%`;
  const rows = query.tier
    ? all('SELECT * FROM medicines WHERE tier = ? AND (lower(brand) LIKE ? OR lower(generic) LIKE ?) ORDER BY brand', Number(query.tier), q, q)
    : all('SELECT * FROM medicines WHERE tier <= ? AND (lower(brand) LIKE ? OR lower(generic) LIKE ?) ORDER BY brand', Number(query.max_tier ?? 3), q, q);
  return rows.map(({ allergy_tags, ...m }) => m);
});
route('GET', '/api/machines', () => all('SELECT * FROM machines ORDER BY name').map(machineOut));
route('GET', '/api/machines/:id/lanes', ({ params }) =>
  all(`SELECT l.lane_no, l.medicine_id, l.qty, l.batch, l.expiry, m.brand, m.generic, m.tier
       FROM lanes l LEFT JOIN medicines m ON m.id = l.medicine_id WHERE l.machine_id = ? ORDER BY l.lane_no`, params.id));

// Offline, rule-based Q&A. It deliberately gives general guidance and never diagnoses or authorises a medicine.
route('POST', '/api/assistant', ({ body }) => {
  const question = String(body.question ?? '').trim().slice(0, 500);
  need(question, 400, 'Ask a health or medicine question');
  const q = question.toLowerCase();
  const urgent = /chest pain|trouble breathing|difficulty breathing|unconscious|fainting|seizure|stroke|severe bleeding|throat swelling|anaphyl/.test(q);
  if (urgent) return { urgent: true, answer: 'This may be an emergency. Call 108 or 112 now and seek urgent medical care. SmartMed cannot assess emergencies.', suggestions: [] };
  const terms = q.split(/[^a-z0-9]+/).filter((x) => x.length >= 3).slice(0, 8);
  const meds = all('SELECT id, brand, generic, uses, warnings FROM medicines WHERE tier = 1 ORDER BY brand')
    .filter((m) => terms.some((t) => `${m.brand} ${m.generic} ${m.uses}`.toLowerCase().includes(t))).slice(0, 3);
  const answer = meds.length
    ? 'These OTC catalogue items may be relevant to the words you entered. Read their warnings and leaflet, and use the app to check your profile and local stock. This is general information, not a diagnosis or a prescription.'
    : 'I can provide general catalogue guidance only. For new, severe, persistent, or unclear symptoms, speak with a clinician. Do not use this assistant to delay emergency care.';
  return { urgent: false, answer, suggestions: meds };
}, { public: true });

// ---- orders ----
route('POST', '/api/orders', ({ user, body }) => {
  const { machine_id: machineId, items } = body;
  need(machineId, 400, 'Choose a machine first');
  const ent = checkEligibility(user, items, { prescription_id: body.prescription_id, emergency_request_id: body.emergency_request_id, pass_id: body.pass_id, red_flags: body.red_flags });
  planStock(machineId, items); // fail early if offline or out of stock
  const total = items.reduce((s, i) => s + ent.meds.get(i.medicine_id).price * i.qty, 0);
  const snap = items.map((i) => ({ medicine_id: i.medicine_id, brand: ent.meds.get(i.medicine_id).brand, qty: i.qty, unit_price: ent.meds.get(i.medicine_id).price }));
  const id = 'o' + uid();
  run('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,NULL)', id, user.id, machineId, js(snap), total, 'created', ent.type, ent.id, js(body.red_flags ?? []), now());
  audit(user.id, 'order.created', 'order', id, { type: ent.type, total });
  return { order: orderOut(get('SELECT * FROM orders WHERE id = ?', id)) };
}, { role: 'patient' });

const ownOrder = (user, id) => {
  const o = get('SELECT * FROM orders WHERE id = ? AND patient_id = ?', id, user.id);
  need(o, 404, 'Order not found');
  return o;
};
const entOf = (o) => ({
  emergency_request_id: o.ent_type === 'emergency' ? o.ent_id : undefined,
  pass_id: o.ent_type === 'pass' ? o.ent_id : undefined,
  prescription_id: o.ent_type === 'rx' ? o.ent_id : undefined,
  red_flags: parse(o.red_flags, []),
});

// Legacy local confirmation endpoint. The app uses the order-bound payment QR endpoints below.
route('POST', '/api/orders/:id/pay', ({ user, params }) => {
  const o = ownOrder(user, params.id);
  if (o.status !== 'created') return { order: orderOut(o) }; // idempotent
  const items = parse(o.items, []).map((i) => ({ medicine_id: i.medicine_id, qty: i.qty }));
  checkEligibility(user, items, entOf(o), o.id);
  planStock(o.machine_id, items);
  return { order: orderOut(capturePayment(o.id, 'legacy_local', 'LOCAL-' + token(3).toUpperCase())) };
}, { role: 'patient' });

// A payment QR is separate from a machine-identity QR. The machine only displays this
// order-bound local settlement request; it cannot be used to start dispensing.
route('POST', '/api/orders/:id/payment-session', ({ user, params }) => {
  const o = ownOrder(user, params.id);
  need(o.status === 'created', 409, `Order is ${o.status}; payment is not available`);
  const items = parse(o.items, []).map((i) => ({ medicine_id: i.medicine_id, qty: i.qty }));
  checkEligibility(user, items, entOf(o), o.id);
  planStock(o.machine_id, items);
  const t = token(12);
  tx(() => {
    // A physical screen can present one active payment request at a time.
    run('DELETE FROM payment_sessions WHERE machine_id = ?', o.machine_id);
    run('INSERT INTO payment_sessions (token, order_id, machine_id, expires_at, created_at) VALUES (?,?,?,?,?)', t, o.id, o.machine_id, ahead(5 * 60_000), now());
  });
  const qr = `smartmed://pay/${o.id}?t=${t}`;
  return { order_id: o.id, machine_id: o.machine_id, qr, expires_in: 300 };
}, { role: 'patient' });

route('POST', '/api/orders/:id/pay-by-qr', ({ user, params, body }) => {
  const o = ownOrder(user, params.id);
  const match = /^smartmed:\/\/pay\/([^?]+)\?t=([0-9a-f]{8,64})$/i.exec(String(body.qr ?? '').trim());
  need(match && match[1] === o.id, 400, 'That is not this order’s payment QR', 'BAD_PAYMENT_QR');
  if (o.status === 'paid' || o.status === 'dispensing' || o.status === 'dispensed') return { order: orderOut(o) };
  need(o.status === 'created', 409, `Order is ${o.status}; it cannot be paid`);
  const s = get('SELECT * FROM payment_sessions WHERE token = ? AND order_id = ?', match[2], o.id);
  need(s && !s.used_at && new Date(s.expires_at) > new Date(), 410, 'Payment QR expired. Request a new one at the machine.', 'PAYMENT_QR_EXPIRED');
  const items = parse(o.items, []).map((i) => ({ medicine_id: i.medicine_id, qty: i.qty }));
  checkEligibility(user, items, entOf(o), o.id);
  planStock(o.machine_id, items);
  need(run('UPDATE payment_sessions SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?', now(), s.token, now()).changes === 1,
    409, 'Payment QR was already used or expired', 'PAYMENT_QR_USED');
  return { order: orderOut(capturePayment(o.id, 'local_qr', 'QR-' + token(4).toUpperCase())) };
}, { role: 'patient' });

route('POST', '/api/orders/:id/dispense', ({ user, params, body }) => {
  const m = /^smartmed:\/\/m\/([A-Za-z0-9_-]+)\?t=([0-9a-f]{8,64})$/i.exec(String(body.qr ?? '').trim());
  need(m, 400, 'That is not a SmartMed machine QR', 'BAD_QR');
  const [, qrMachine, tok] = m;
  const o = ownOrder(user, params.id);
  if (['dispensing', 'dispensed'].includes(o.status)) return { status: o.status }; // idempotent
  need(o.status === 'paid', 409, `Order is ${o.status}; it must be paid first`);
  need(o.machine_id === qrMachine, 409, 'This order was placed for a different machine', 'WRONG_MACHINE');
  const s = get('SELECT * FROM qr_sessions WHERE token = ?', tok);
  need(s && s.machine_id === qrMachine, 400, 'QR not recognised', 'BAD_QR');
  need(!s.used_at, 409, 'QR ALREADY REDEEMED. Wait for the next QR.', 'QR_USED');
  need(new Date(s.expires_at) > new Date(), 410, 'QR EXPIRED. Scan the new QR on the machine.', 'QR_EXPIRED');

  const items = parse(o.items, []).map((i) => ({ medicine_id: i.medicine_id, qty: i.qty }));
  checkEligibility(user, items, entOf(o), o.id); // re-check everything at the moment of use
  const plan = planStock(o.machine_id, items);
  tx(() => {
    need(run('UPDATE qr_sessions SET used_at = ?, order_id = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?', now(), o.id, tok, now()).changes === 1,
      409, 'QR ALREADY REDEEMED or expired', 'QR_USED');
    need(run("UPDATE orders SET status = 'dispensing' WHERE id = ? AND status = 'paid'", o.id).changes === 1, 409, 'Order already in progress');
    for (const p of plan) // reserve stock atomically; restored if the dispense fails
      need(run('UPDATE lanes SET qty = qty - ? WHERE id = ? AND qty >= ?', p.qty, p.lane_id, p.qty).changes === 1, 409, 'Out of stock at this machine', 'NO_STOCK');
    run("INSERT INTO dispense_events VALUES (?,?,?,?, 'pending', NULL, ?, NULL)", uid(), o.id, o.machine_id, js(plan), now());
    run("INSERT INTO commands VALUES (?,?,?,?, 'pending', ?)", uid(), o.machine_id, o.id, js(plan.map((p) => ({ lane_no: p.lane_no, qty: p.qty }))), now());
    audit(user.id, 'dispense.started', 'order', o.id, { machine: o.machine_id, lanes: plan.map((p) => p.lane_no) });
  });
  return { status: 'dispensing' };
}, { role: 'patient' });

route('GET', '/api/orders', ({ user }) => all('SELECT * FROM orders WHERE patient_id = ? ORDER BY created_at DESC LIMIT 50', user.id).map(orderOut), { role: 'patient' });
route('GET', '/api/orders/:id', ({ user, params }) => orderOut(ownOrder(user, params.id)), { role: 'patient' });
route('GET', '/api/prescriptions', ({ user }) =>
  all("SELECT * FROM prescriptions WHERE patient_id = ? AND kind = 'rx' AND used = 0 AND valid_until > ?", user.id, now())
    .map((r) => ({ ...r, items: withBrand(r.items) })), { role: 'patient' });

// ---- emergency (patient side) ----
route('POST', '/api/emergency', ({ user, body }) => {
  run("UPDATE emergency_requests SET status = 'TIMED_OUT' WHERE patient_id = ? AND status = 'DOCTOR_ALERTED' AND alerted_at < ?", user.id, ago(CFG.requestTimeoutMs));
  need(!get("SELECT 1 AS x FROM emergency_requests WHERE patient_id = ? AND status IN ('DOCTOR_ALERTED','DOCTOR_ACCEPTED','APPROVED','PAID')", user.id),
    409, 'You already have an open emergency request', 'OPEN_REQUEST');
  need(!get(`SELECT 1 AS x FROM orders WHERE patient_id = ? AND ent_type IN ('emergency','pass') AND status IN ('paid','dispensing','dispensed') AND created_at > ?`,
    user.id, ago(864e5)), 429, 'Only one emergency pack is allowed per 24 hours. Call 108/112.', 'LIMIT_24H');
  const items = Array.isArray(body.items) ? body.items : [];
  need(items.length, 400, 'Choose at least one emergency pack');
  for (const i of items) {
    const m = get('SELECT * FROM medicines WHERE id = ?', i.medicine_id);
    need(m && m.tier === 3, 400, 'Only emergency-pack medicines can be requested here');
    const hit = allergyHit(user, m); // checked before the doctor sees it, and again at dispense
    need(!hit, 403, `Allergy warning: "${hit}" conflicts with ${m.brand}`, 'ALLERGY');
  }
  const id = 'r' + uid();
  run("INSERT INTO emergency_requests (id, patient_id, machine_id, status, situation, requested_items, created_at, alerted_at) VALUES (?,?,?,'DOCTOR_ALERTED',?,?,?,?)",
    id, user.id, body.machine_id ?? null, body.situation ?? '', js(items.map((i) => ({ medicine_id: i.medicine_id, qty: 1 }))), now(), now());
  audit(user.id, 'emergency.requested', 'emergency_request', id, { to: 'REQUESTED' });
  audit(user.id, 'emergency.doctor_alerted', 'emergency_request', id, { to: 'DOCTOR_ALERTED' });
  return { request: reqOut(get('SELECT * FROM emergency_requests WHERE id = ?', id)) };
}, { role: 'patient' });

route('GET', '/api/emergency/active', ({ user }) => {
  const r = get("SELECT * FROM emergency_requests WHERE patient_id = ? AND status IN ('DOCTOR_ALERTED','DOCTOR_ACCEPTED','APPROVED','PAID') AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    user.id, ago(2 * 3600e3));
  return { request: r ? reqOut(r) : null };
}, { role: 'patient' });
route('GET', '/api/emergency/:id', ({ user, params }) => {
  const r = get('SELECT * FROM emergency_requests WHERE id = ? AND patient_id = ?', params.id, user.id);
  need(r, 404, 'Request not found');
  const o = get("SELECT id FROM orders WHERE ent_id = ? AND status = 'paid'", r.id);
  return { ...reqOut(r), order_id: o?.id ?? null, timeout_s: Math.floor(CFG.requestTimeoutMs / 1000), elapsed_s: Math.floor((Date.now() - new Date(r.alerted_at ?? r.created_at).getTime()) / 1000) };
}, { role: 'patient' });

// ---- passes and documents (patient side) ----
route('GET', '/api/passes', ({ user }) => all('SELECT * FROM passes WHERE patient_id = ? ORDER BY created_at DESC', user.id).map(passOut), { role: 'patient' });
route('POST', '/api/passes/apply', ({ user, body }) => {
  const ids = Array.isArray(body.document_ids) ? body.document_ids : [];
  need(String(body.condition ?? '').trim(), 400, 'Enter the medical condition');
  need(ids.length, 400, 'Upload at least one report or prescription');
  for (const d of ids) need(get('SELECT 1 AS x FROM documents WHERE id = ? AND patient_id = ?', d, user.id), 400, 'Unknown document');
  const id = 'p' + uid();
  run("INSERT INTO passes (id, patient_id, condition, note, document_ids, status, created_at) VALUES (?,?,?,?,?,'UNDER_REVIEW',?)",
    id, user.id, String(body.condition).trim(), body.note ?? null, js(ids), now());
  audit(user.id, 'pass.applied', 'pass', id, { to: 'APPLIED' });
  audit(user.id, 'pass.under_review', 'pass', id, { to: 'UNDER_REVIEW' });
  return { pass: passOut(get('SELECT * FROM passes WHERE id = ?', id)) };
}, { role: 'patient' });

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
route('POST', '/api/documents', ({ user, body }) => {
  const buf = Buffer.from(String(body.data_b64 ?? ''), 'base64');
  need(buf.length > 0 && buf.length < 8 * 1024 * 1024, 400, 'File is empty or larger than 8 MB');
  const id = 'd' + uid();
  const name = path.basename(String(body.filename ?? 'file')).replace(/[^\w.\-]/g, '_');
  const file = `${id}_${name}`;
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', file), buf);
  run('INSERT INTO documents VALUES (?,?,?,?,?,?)', id, user.id, body.doc_type ?? 'document', name, file, now());
  return { id };
}, { role: 'patient' });
route('GET', '/api/documents/:id', ({ user, params }) => {
  const d = get('SELECT * FROM documents WHERE id = ?', params.id);
  need(d, 404, 'Document not found');
  need(d.patient_id === user.id || (user.role === 'doctor' && doctorCanView(user.id, d.patient_id)), 403, 'Not allowed');
  const ext = d.filename.split('.').pop().toLowerCase();
  return { __raw: fs.readFileSync(path.join(DATA_DIR, 'uploads', d.path)), type: MIME[ext] ?? 'application/octet-stream' };
});

// ---- doctor ----
const doc = (user) => { const d = get('SELECT * FROM doctors WHERE user_id = ?', user.id); need(d?.verified, 403, 'Your doctor account is not verified'); return d; };
route('POST', '/api/doctor/online', ({ user, body }) => { doc(user); run('UPDATE doctors SET online = ? WHERE user_id = ?', body.online ? 1 : 0, user.id); return { ok: true }; }, { role: 'doctor' });
route('GET', '/api/doctor/queue', ({ user }) => {
  const d = doc(user);
  return all(`SELECT r.*, u.name AS patient_name, u.dob AS patient_dob FROM emergency_requests r JOIN users u ON u.id = r.patient_id
    WHERE (r.status = 'DOCTOR_ALERTED' AND r.alerted_at > ? AND (?2 = 0 OR r.alerted_at < ?3)) OR r.doctor_id = ?4
    ORDER BY r.created_at DESC LIMIT 30`, ago(CFG.requestTimeoutMs), d.is_backup, ago(CFG.escalateMs), user.id)
    .map((r) => ({ ...reqOut(r), patient_age: ageOf(r.patient_dob) }));
}, { role: 'doctor' });
route('GET', '/api/doctor/cases/:id', ({ user, params }) => {
  doc(user);
  const r = get('SELECT * FROM emergency_requests WHERE id = ?', params.id);
  need(r && (r.doctor_id === user.id || r.status === 'DOCTOR_ALERTED'), 404, 'Case not available');
  const p = get('SELECT * FROM users WHERE id = ?', r.patient_id);
  return { request: reqOut(r), patient: { ...userOut(p), age: ageOf(p.dob) } };
}, { role: 'doctor' });
route('POST', '/api/doctor/cases/:id/accept', ({ user, params }) => {
  const d = doc(user);
  const r = get('SELECT * FROM emergency_requests WHERE id = ?', params.id);
  need(r && r.status === 'DOCTOR_ALERTED' && new Date(r.alerted_at) > new Date(ago(CFG.requestTimeoutMs)), 409, 'Request is no longer available');
  need(!(d.is_backup && Date.now() - new Date(r.alerted_at).getTime() < CFG.escalateMs), 403, 'Backup panel can accept after 60 seconds');
  need(run("UPDATE emergency_requests SET status = 'DOCTOR_ACCEPTED', doctor_id = ?, accepted_at = ? WHERE id = ? AND status = 'DOCTOR_ALERTED'", user.id, now(), r.id).changes === 1,
    409, 'Another doctor accepted first');
  audit(user.id, 'emergency.accepted', 'emergency_request', r.id, { to: 'DOCTOR_ACCEPTED' });
  return { ok: true };
}, { role: 'doctor' });
route('POST', '/api/doctor/cases/:id/decide', ({ user, params, body }) => {
  doc(user);
  const r = get('SELECT * FROM emergency_requests WHERE id = ? AND doctor_id = ?', params.id, user.id);
  need(r && r.status === 'DOCTOR_ACCEPTED', 409, 'Accept the case first');
  if (body.decision === 'reject') {
    run("UPDATE emergency_requests SET status = 'REJECTED', note = ?, decided_at = ? WHERE id = ?", body.note ?? null, now(), r.id);
    audit(user.id, 'emergency.rejected', 'emergency_request', r.id, { to: 'REJECTED', note: body.note });
    return { ok: true };
  }
  const items = Array.isArray(body.items) ? body.items : [];
  need(items.length, 400, 'Select at least one medicine');
  const patient = get('SELECT * FROM users WHERE id = ?', r.patient_id);
  for (const i of items) {
    const m = get('SELECT * FROM medicines WHERE id = ?', i.medicine_id);
    need(m && m.tier === 3, 400, 'Only Tier 3 emergency packs can be approved here');
    need(Number.isInteger(i.qty) && i.qty >= 1 && i.qty <= m.max_per_order, 400, `Quantity for ${m.brand} is not allowed`);
    const hit = allergyHit(patient, m);
    need(!hit, 403, `Patient allergy "${hit}" conflicts with ${m.brand}`, 'ALLERGY');
  }
  tx(() => {
    run("INSERT INTO prescriptions VALUES (?,?,?,'emergency',?,?,0,?)", uid(), r.patient_id, user.id, js(items), ahead(3600e3), now());
    run("UPDATE emergency_requests SET status = 'APPROVED', approved_items = ?, note = ?, decided_at = ? WHERE id = ?", js(items.map((i) => ({ medicine_id: i.medicine_id, qty: i.qty }))), body.note ?? null, now(), r.id);
    audit(user.id, 'emergency.approved', 'emergency_request', r.id, { to: 'APPROVED', items });
  });
  return { ok: true };
}, { role: 'doctor' });
route('POST', '/api/doctor/cases/:id/followup', ({ user, params }) => {
  doc(user);
  run("UPDATE emergency_requests SET status = 'FOLLOW_UP' WHERE id = ? AND doctor_id = ? AND status = 'DISPENSED'", params.id, user.id);
  audit(user.id, 'emergency.follow_up', 'emergency_request', params.id, { to: 'FOLLOW_UP' });
  return { ok: true };
}, { role: 'doctor' });

route('GET', '/api/doctor/passes', ({ user }) => {
  doc(user);
  return all(`SELECT p.*, u.name AS patient_name FROM passes p JOIN users u ON u.id = p.patient_id
    WHERE p.status = 'UNDER_REVIEW' OR p.doctor_id = ? ORDER BY p.created_at DESC LIMIT 30`, user.id).map(passOut);
}, { role: 'doctor' });
route('GET', '/api/doctor/passes/:id', ({ user, params }) => {
  doc(user);
  const p = get('SELECT * FROM passes WHERE id = ?', params.id);
  need(p && (p.status === 'UNDER_REVIEW' || p.doctor_id === user.id), 404, 'Pass not available');
  const pat = get('SELECT * FROM users WHERE id = ?', p.patient_id);
  const docs = parse(p.document_ids, []).map((id) => get('SELECT id, doc_type, filename FROM documents WHERE id = ?', id)).filter(Boolean);
  return { pass: passOut(p), patient: { ...userOut(pat), age: ageOf(pat.dob) }, documents: docs, usage: all('SELECT * FROM pass_usage WHERE pass_id = ? ORDER BY used_at DESC', p.id) };
}, { role: 'doctor' });
route('POST', '/api/doctor/passes/:id/issue', ({ user, params, body }) => {
  doc(user);
  const p = get('SELECT * FROM passes WHERE id = ?', params.id);
  need(p && p.status === 'UNDER_REVIEW', 409, 'Application is not under review');
  const items = Array.isArray(body.items) ? body.items : [];
  need(items.length, 400, 'Select at least one medicine');
  for (const i of items) { // antibiotics and other Tier 2 stay on the live-doctor path
    const m = get('SELECT * FROM medicines WHERE id = ?', i.medicine_id);
    need(m && m.tier === 3, 400, 'Only Tier 3 emergency packs can be on a pass');
  }
  const keys = (Array.isArray(body.red_flag_keys) ? body.red_flag_keys : []).map((k) => String(k).trim()).filter(Boolean);
  need(keys.length, 400, 'Add at least one red-flag symptom');
  const uses = Math.min(Math.max(parseInt(body.uses_allowed ?? 1, 10) || 1, 1), 2);
  const days = Math.min(Math.max(parseInt(body.valid_days ?? 30, 10) || 30, 1), 90);
  tx(() => {
    run("UPDATE passes SET status = 'ACTIVE', doctor_id = ?, items = ?, red_flag_keys = ?, valid_from = ?, valid_until = ?, uses_allowed = ?, uses_left = ?, instructions = ? WHERE id = ? AND status = 'UNDER_REVIEW'",
      user.id, js(items.map((i) => ({ medicine_id: i.medicine_id, max_qty: i.max_qty ?? 1 }))), js(keys), now(), ahead(days * 864e5), uses, uses, body.instructions ?? null, p.id);
    run('INSERT INTO reminders (id, user_id, kind, title, due_at) VALUES (?,?,?,?,?)', uid(), p.patient_id, 'pass_expiry', 'Your emergency pass expires in 7 days', ahead((days - 7) * 864e5));
    audit(user.id, 'pass.issued', 'pass', p.id, { to: 'ACTIVE', days, uses });
  });
  return { ok: true };
}, { role: 'doctor' });
route('POST', '/api/doctor/passes/:id/reject', ({ user, params, body }) => {
  doc(user);
  run("UPDATE passes SET status = 'REVOKED', doctor_id = ?, decision_note = ? WHERE id = ? AND status = 'UNDER_REVIEW'", user.id, body.note || 'Application not approved', params.id);
  audit(user.id, 'pass.rejected', 'pass', params.id, { to: 'REVOKED', note: body.note });
  return { ok: true };
}, { role: 'doctor' });
route('POST', '/api/doctor/passes/:id/revoke', ({ user, params, body }) => {
  doc(user);
  run("UPDATE passes SET status = 'REVOKED', decision_note = ? WHERE id = ? AND doctor_id = ? AND status = 'ACTIVE'", body.note || 'Revoked by doctor', params.id, user.id);
  audit(user.id, 'pass.revoked', 'pass', params.id, { to: 'REVOKED' });
  return { ok: true };
}, { role: 'doctor' });

route('POST', '/api/doctor/rx', ({ user, body }) => {
  doc(user);
  const pat = get("SELECT * FROM users WHERE phone = ? AND role = 'patient'", last10(body.patient_phone));
  need(pat, 404, 'No patient with that phone number');
  const items = Array.isArray(body.items) ? body.items : [];
  need(items.length, 400, 'Select at least one medicine');
  for (const i of items) need(get('SELECT 1 AS x FROM medicines WHERE id = ? AND tier = 2', i.medicine_id), 400, 'Only Rx (Tier 2) medicines can be prescribed here');
  const days = Math.min(Math.max(parseInt(body.valid_days ?? 7, 10) || 7, 1), 30);
  const id = 'x' + uid();
  run("INSERT INTO prescriptions VALUES (?,?,?,'rx',?,?,0,?)", id, pat.id, user.id, js(items.map((i) => ({ medicine_id: i.medicine_id, qty: i.qty ?? 1 }))), ahead(days * 864e5), now());
  audit(user.id, 'rx.issued', 'prescription', id, { patient: pat.id });
  return { id };
}, { role: 'doctor' });

// ---- worker ----
route('POST', '/api/worker/refill', ({ user, body }) => {
  need(get('SELECT 1 AS x FROM medicines WHERE id = ?', body.medicine_id), 400, 'Unknown medicine');
  need(Number.isInteger(body.qty) && body.qty >= 0, 400, 'Bad quantity');
  need(/^\d{4}-\d{2}-\d{2}$/.test(body.expiry ?? ''), 400, 'Expiry must be YYYY-MM-DD');
  need(run('UPDATE lanes SET medicine_id = ?, qty = ?, batch = ?, expiry = ? WHERE machine_id = ? AND lane_no = ?',
    body.medicine_id, body.qty, body.batch ?? '', body.expiry, body.machine_id, body.lane_no).changes === 1, 404, 'Lane not found');
  audit(user.id, 'lane.refill', 'machine', body.machine_id, { lane: body.lane_no, medicine: body.medicine_id, qty: body.qty, batch: body.batch, expiry: body.expiry });
  return { ok: true };
}, { role: 'worker' });
route('POST', '/api/worker/machines', ({ user, body }) => {
  need(String(body.name ?? '').trim(), 400, 'Enter a machine name');
  need(Number.isFinite(body.lat) && Number.isFinite(body.lng), 400, 'Enter latitude and longitude');
  const id = 'M' + (all('SELECT id FROM machines').length + 1), key = token(8);
  run('INSERT INTO machines (id, name, address, lat, lng, api_key) VALUES (?,?,?,?,?,?)', id, body.name.trim(), body.address ?? '', body.lat, body.lng, key);
  for (let n = 1; n <= 6; n++) run('INSERT INTO lanes (id, machine_id, lane_no) VALUES (?,?,?)', `${id}-${n}`, id, n);
  audit(user.id, 'machine.register', 'machine', id, { name: body.name });
  return { id, api_key: key };
}, { role: 'worker' });

// ---- machine endpoint (ESP32 or the simulator page). Auth: x-machine-key ----
route('POST', '/api/machine', ({ req, body }) => {
  const m = get('SELECT * FROM machines WHERE id = ? AND api_key = ?', body.machine_id ?? '', req.headers['x-machine-key'] ?? '');
  need(m, 401, 'Unknown machine or bad key');
  run('UPDATE machines SET last_seen = ?, status = ? WHERE id = ?', now(), 'active', m.id);
  switch (body.action) {
    case 'session': { // QR carries only machine id + short-lived single-use token
      const t = token(8);
      run('INSERT INTO qr_sessions (token, machine_id, expires_at) VALUES (?,?,?)', t, m.id, ahead(60_000));
      const qr = `smartmed://m/${m.id}?t=${t}`;
      return { qr, svg: qrSvg(qr), expires_in: 60 };
    }
    case 'payment': {
      const p = get(`SELECT ps.*, o.total FROM payment_sessions ps JOIN orders o ON o.id = ps.order_id
        WHERE ps.machine_id = ? AND ps.used_at IS NULL AND ps.expires_at > ? AND o.status = 'created'
        ORDER BY ps.created_at DESC LIMIT 1`, m.id, now());
      if (!p) return { payment: null };
      const qr = `smartmed://pay/${p.order_id}?t=${p.token}`;
      return { payment: { order_id: p.order_id, amount: p.total, qr, svg: qrSvg(qr), expires_in: Math.max(0, Math.floor((new Date(p.expires_at) - Date.now()) / 1000)) } };
    }
    case 'heartbeat': return { ok: true };
    case 'poll': {
      const c = get("SELECT * FROM commands WHERE machine_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1", m.id);
      if (!c || run("UPDATE commands SET status = 'sent' WHERE id = ? AND status = 'pending'", c.id).changes !== 1) return { command: null };
      return { command: { order_id: c.order_id, items: parse(c.items, []) } };
    }
    case 'report':
      if (body.result === 'success') completeOrder(body.order_id, m.id);
      else failOrder(body.order_id, String(body.reason ?? 'machine reported failure'));
      return { ok: true };
    default: throw new HttpError(400, 'Unknown action');
  }
}, { public: true });

// Used by the local 3D cabinet display so a phone can be pointed at this laptop.
route('GET', '/api/device-info', () => {
  const addresses = lanIps();
  const preferred = addresses.find((ip) => /^(192\.168\.|10\.)/.test(ip)) ?? addresses[0] ?? 'localhost';
  return { port: PORT, addresses, preferred, app_address: `${preferred}:${PORT}` };
}, { public: true });

// ---------- HTTP plumbing ----------
function lanIps() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}
const machineHtml = fs.readFileSync(path.join(import.meta.dirname, 'machine.html'));
const simulationHtml = fs.readFileSync(path.join(import.meta.dirname, '1_3D_Model', 'SmartMed_3D_Model.html'));
const threeJs = fs.readFileSync(path.join(import.meta.dirname, '1_3D_Model', 'three.min.js'));

const server = http.createServer((req, res) => {
  const send = (status, body, type = 'application/json') => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length });
    res.end(buf);
  };
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/') {
    const ips = lanIps();
    return send(200, `<!doctype html><meta charset=utf-8><title>SmartMed server</title><body style="font-family:system-ui;max-width:640px;margin:32px auto">
<h2>SmartMed local server is running</h2><p>Enter this in the Android app (Server settings): <b>${ips.map((i) => `${i}:${PORT}`).join(' or ') || 'localhost:' + PORT}</b>
(emulator: <b>10.0.2.2:${PORT}</b>)</p><p>Machine screens: ${all('SELECT id, api_key FROM machines').map((m) => `<a href="/machine/${m.id}?key=${m.api_key}">${m.id}</a>`).join(' · ')}</p>
<p>Connected 3D prototype: ${all('SELECT id, api_key FROM machines').map((m) => `<a href="/simulation/${m.id}?key=${m.api_key}">${m.id}</a>`).join(' · ')}</p>
<p>Enter any 10-digit number in the app. Local-development OTP: ${CFG.otp}. A role is chosen on first registration.</p></body>`, 'text/html');
  }
  if (req.method === 'GET' && url.pathname.startsWith('/machine/')) return send(200, machineHtml, 'text/html');
  if (req.method === 'GET' && url.pathname.startsWith('/simulation/')) return send(200, simulationHtml, 'text/html');
  if (req.method === 'GET' && url.pathname === '/assets/three.min.js') return send(200, threeJs, 'application/javascript');
  if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { ok: true });

  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 16 * 1024 * 1024) req.destroy(); else chunks.push(c); });
  req.on('end', () => {
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(404, { error: 'Not found' });
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let user = null;
      if (!r.opts.public) {
        const tok = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        user = get('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?', tok);
        need(user, 401, 'Please sign in again');
        const want = r.opts.role;
        need(!want || user.role === want || (want === 'worker' && user.role === 'admin'), 403, `This needs a ${want} account`);
      }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const out = r.handler({ req, user, params, body, query: Object.fromEntries(url.searchParams) });
      if (out && out.__raw) return send(200, out.__raw, out.type);
      send(200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message, code: e.code });
      if (e instanceof SyntaxError) return send(400, { error: 'Bad JSON' });
      console.error(e);
      send(500, { error: 'Server error' });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SmartMed server on port ${PORT}. Data folder: ${DATA_DIR}`);
  console.log('Put one of these in the Android app (Server settings):');
  for (const ip of lanIps()) console.log(`  ${ip}:${PORT}`);
  console.log(`  10.0.2.2:${PORT}   (Android emulator)`);
  console.log(`Machine screen: http://localhost:${PORT}/machine/M1?key=demo-key-1`);
  console.log(`3D prototype: http://localhost:${PORT}/simulation/M1?key=demo-key-1`);
});
