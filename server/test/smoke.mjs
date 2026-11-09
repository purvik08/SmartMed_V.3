// End-to-end test: starts the server on a temp database and walks every flow over HTTP.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medivend-'));
const PORT = 18080, base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['--no-warnings', path.join(import.meta.dirname, '..', 'server.mjs')],
  { env: { ...process.env, PORT, DATA_DIR: dir, DISPENSE_TIMEOUT_MS: '2500', ESCALATE_MS: '3000' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

async function api(method, p, body, tok, extraHeaders = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}
const login = async (phone) => (await api('POST', '/api/auth/verify', { phone, otp: '123456' })).d.token;
const machine = (id, key, body) => api('POST', '/api/machine', { machine_id: id, ...body }, null, { 'x-machine-key': key });
const expectErr = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.d)); if (code) assert.equal(r.d.code, code); };

// machine acts like the firmware: take the QR, then run the pending command
async function qrFor(id, key) { const r = await machine(id, key, { action: 'session' }); assert.equal(r.status, 200); assert.match(r.d.svg, /^<svg/); return r.d.qr; }
async function runCommand(id, key, result = 'success') {
  let cmd; for (let i = 0; i < 5 && !cmd; i++) { cmd = (await machine(id, key, { action: 'poll' })).d.command; if (!cmd) await sleep(200); }
  assert.ok(cmd, 'machine got a command');
  await machine(id, key, { action: 'report', order_id: cmd.order_id, result, reason: result === 'fail' ? 'jam' : undefined });
  return cmd;
}

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await sleep(150); }
  const M1 = ['M1', 'demo-key-1'];
  await machine(...M1, { action: 'heartbeat' });

  console.log('Auth and profile');
  expectErr(await api('POST', '/api/auth/verify', { phone: '9000000001', otp: '000000' }), 401);
  expectErr(await api('GET', '/api/me'), 401);
  const pat = await login('9000000001'), doc = await login('9000000011'), bak = await login('9000000012'), wk = await login('9000000021');
  const pat2 = await login('9000000002');
  ok('login with demo OTP, wrong OTP and missing token are refused');
  expectErr(await api('GET', '/api/doctor/queue', null, pat), 403);
  ok('roles enforced');

  const list = (await api('GET', '/api/medicines?max_tier=2', null, pat)).d;
  assert.ok(list.length === 11 && list.every((m) => m.tier <= 2) && !('allergy_tags' in list[0]));
  const med = (id) => id;
  ok('catalogue hides emergency packs from normal search');

  console.log('OTC order');
  const cart = { machine_id: 'M1', items: [{ medicine_id: 'ors', qty: 2 }] };
  const o1 = (await api('POST', '/api/orders', cart, pat)); assert.equal(o1.status, 200); assert.equal(o1.d.order.total, 40);
  expectErr(await api('POST', '/api/orders', { machine_id: 'M1', items: [{ medicine_id: 'ors', qty: 9 }] }, pat), 400);
  expectErr(await api('POST', '/api/orders', { machine_id: 'M1', items: [{ medicine_id: 'paracetamol', qty: 1 }] }, pat), 400, 'PROFILE_INCOMPLETE');
  ok('server computes the total, enforces max per order and age/profile rules');
  const oid = o1.d.order.id;
  expectErr(await api('POST', `/api/orders/${oid}/dispense`, { qr: await qrFor(...M1) }, pat), 409); // unpaid
  assert.equal((await api('POST', `/api/orders/${oid}/pay`, {}, pat)).d.order.status, 'paid');
  assert.equal((await api('POST', `/api/orders/${oid}/pay`, {}, pat)).d.order.status, 'paid'); // idempotent
  expectErr(await api('POST', `/api/orders/${oid}/dispense`, { qr: 'hello' }, pat), 400, 'BAD_QR');
  expectErr(await api('POST', `/api/orders/${oid}/dispense`, { qr: await qrFor('M2', 'demo-key-2') }, pat), 409, 'WRONG_MACHINE');
  ok('payment is idempotent; unpaid, junk and wrong-machine QR refused');
  const qr = await qrFor(...M1);
  assert.equal((await api('POST', `/api/orders/${oid}/dispense`, { qr }, pat)).d.status, 'dispensing');
  assert.equal((await api('POST', `/api/orders/${oid}/dispense`, { qr }, pat)).d.status, 'dispensing'); // double tap
  const lanesAfter = (await api('GET', '/api/machines/M1/lanes', null, pat)).d.find((l) => l.medicine_id === 'ors');
  assert.equal(lanesAfter.qty, 8);
  await runCommand(...M1);
  assert.equal((await api('GET', `/api/orders/${oid}`, null, pat)).d.status, 'dispensed');
  ok('dispense reserves stock, machine report completes the order, double tap is harmless');
  expectErr(await api('POST', `/api/orders/${(await api('POST', '/api/orders', cart, pat)).d.order.id}/dispense`, { qr }, pat), 409); // same QR again
  ok('a used QR can never be replayed');

  console.log('Jam, refund and stock restore');
  const o2 = (await api('POST', '/api/orders', { machine_id: 'M1', items: [{ medicine_id: 'ors', qty: 1 }] }, pat)).d.order;
  await api('POST', `/api/orders/${o2.id}/pay`, {}, pat);
  await api('POST', `/api/orders/${o2.id}/dispense`, { qr: await qrFor(...M1) }, pat);
  await runCommand(...M1, 'fail');
  assert.equal((await api('GET', `/api/orders/${o2.id}`, null, pat)).d.status, 'refunded');
  assert.equal((await api('GET', '/api/machines/M1/lanes', null, pat)).d.find((l) => l.medicine_id === 'ors').qty, 8);
  ok('failed dispense is refunded automatically and stock is restored');

  console.log('Timeout without machine confirmation');
  const o3 = (await api('POST', '/api/orders', { machine_id: 'M1', items: [{ medicine_id: 'ors', qty: 1 }] }, pat)).d.order;
  await api('POST', `/api/orders/${o3.id}/pay`, {}, pat);
  await api('POST', `/api/orders/${o3.id}/dispense`, { qr: await qrFor(...M1) }, pat);
  await sleep(6500);
  assert.equal((await api('GET', `/api/orders/${o3.id}`, null, pat)).d.status, 'refunded');
  ok('no sensor confirmation within the timeout means automatic refund');

  console.log('Allergy rule');
  await api('PUT', '/api/me', { name: 'Demo Patient', dob: '1995-05-05', allergies: ['aspirin'], conditions: [], current_meds: [] }, pat2);
  expectErr(await api('POST', '/api/emergency', { machine_id: 'M1', situation: 'chest pain', items: [{ medicine_id: 'aspirin' }] }, pat2), 403, 'ALLERGY');
  ok('allergy blocks an emergency request before any doctor sees it');

  console.log('Rx flow');
  await api('PUT', '/api/me', { name: 'Demo Patient', dob: '1995-05-05', allergies: [], conditions: [], current_meds: [] }, pat);
  const rxCart = { machine_id: 'M2', items: [{ medicine_id: 'amoxicillin', qty: 1 }] };
  await machine('M2', 'demo-key-2', { action: 'heartbeat' });
  expectErr(await api('POST', '/api/orders', rxCart, pat), 403, 'RX_REQUIRED');
  expectErr(await api('POST', '/api/doctor/rx', { patient_phone: '9000000001', items: [{ medicine_id: 'paracetamol' }] }, doc), 400);
  const rx = (await api('POST', '/api/doctor/rx', { patient_phone: '9000000001', items: [{ medicine_id: 'amoxicillin', qty: 1 }], valid_days: 3 }, doc)).d.id;
  assert.equal((await api('GET', '/api/prescriptions', null, pat)).d.length, 1);
  const ro = (await api('POST', '/api/orders', { ...rxCart, prescription_id: rx }, pat)).d.order;
  await api('POST', `/api/orders/${ro.id}/pay`, {}, pat);
  await api('POST', `/api/orders/${ro.id}/dispense`, { qr: await qrFor('M2', 'demo-key-2') }, pat);
  await runCommand('M2', 'demo-key-2');
  assert.equal((await api('GET', '/api/prescriptions', null, pat)).d.length, 0);
  expectErr(await api('POST', '/api/orders', { ...rxCart, prescription_id: rx }, pat), 403, 'RX_INVALID');
  ok('Rx needs a doctor e-prescription and it is one-time use');

  console.log('Emergency flow (live doctor)');
  expectErr(await api('POST', '/api/orders', { machine_id: 'M2', items: [{ medicine_id: 'glucose', qty: 1 }] }, pat), 403, 'T3_REQUIRED');
  const er = (await api('POST', '/api/emergency', { machine_id: 'M2', situation: 'Low blood sugar', items: [{ medicine_id: 'glucose' }] }, pat)).d.request;
  expectErr(await api('POST', '/api/emergency', { machine_id: 'M2', situation: 'x', items: [{ medicine_id: 'glucose' }] }, pat), 409, 'OPEN_REQUEST');
  const bq = (await api('GET', '/api/doctor/queue', null, bak)).d; assert.equal(bq.length, 0);
  assert.equal((await api('GET', '/api/doctor/queue', null, doc)).d.length, 1);
  expectErr(await api('POST', `/api/doctor/cases/${er.id}/accept`, {}, bak), 403);
  await sleep(3200);
  assert.equal((await api('GET', '/api/doctor/queue', null, bak)).d.length, 1);
  ok('request goes to the on-duty doctor first, backup panel only after the escalation delay');
  assert.equal((await api('POST', `/api/doctor/cases/${er.id}/accept`, {}, doc)).status, 200);
  expectErr(await api('POST', `/api/doctor/cases/${er.id}/accept`, {}, bak), 409);
  const caseView = (await api('GET', `/api/doctor/cases/${er.id}`, null, doc)).d; assert.equal(caseView.patient.name, 'Demo Patient');
  expectErr(await api('GET', `/api/doctor/cases/${er.id}`, null, bak), 404);
  expectErr(await api('POST', `/api/doctor/cases/${er.id}/decide`, { decision: 'approve', items: [{ medicine_id: 'amoxicillin', qty: 1 }] }, doc), 400);
  assert.equal((await api('POST', `/api/doctor/cases/${er.id}/decide`, { decision: 'approve', items: [{ medicine_id: 'glucose', qty: 1 }], note: 'Take as leaflet' }, doc)).status, 200);
  ok('only one doctor can take a case; only Tier 3 packs can be approved');
  const eo = (await api('POST', '/api/orders', { machine_id: 'M2', items: [{ medicine_id: 'glucose', qty: 1 }], emergency_request_id: er.id }, pat)).d.order;
  expectErr(await api('POST', '/api/orders', { machine_id: 'M2', items: [{ medicine_id: 'adrenaline', qty: 1 }], emergency_request_id: er.id }, pat), 403, 'NOT_APPROVED');
  await api('POST', `/api/orders/${eo.id}/pay`, {}, pat);
  assert.equal((await api('GET', `/api/emergency/${er.id}`, null, pat)).d.status, 'PAID');
  await api('POST', `/api/orders/${eo.id}/dispense`, { qr: await qrFor('M2', 'demo-key-2') }, pat);
  await runCommand('M2', 'demo-key-2');
  assert.equal((await api('GET', `/api/emergency/${er.id}`, null, pat)).d.status, 'DISPENSED');
  await api('POST', `/api/doctor/cases/${er.id}/followup`, {}, doc);
  assert.equal((await api('GET', `/api/emergency/${er.id}`, null, pat)).d.status, 'FOLLOW_UP');
  ok('approve, pay, dispense, follow-up: every state reached');
  expectErr(await api('POST', '/api/emergency', { machine_id: 'M2', situation: 'again', items: [{ medicine_id: 'glucose' }] }, pat), 429, 'LIMIT_24H');
  ok('second emergency pack inside 24 hours is refused');

  console.log('Emergency Access Pass');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const d1 = (await api('POST', '/api/documents', { doc_type: 'lab report', filename: 'report.png', data_b64: png.toString('base64') }, pat2)).d.id;
  await api('PUT', '/api/me', { name: 'Second Patient', dob: '1990-01-01', allergies: [], conditions: ['peanut allergy'], current_meds: [] }, pat2);
  expectErr(await api('POST', '/api/passes/apply', { condition: 'Peanut allergy', document_ids: [] }, pat2), 400);
  const pass = (await api('POST', '/api/passes/apply', { condition: 'Peanut allergy', note: 'carry epipen', document_ids: [d1] }, pat2)).d.pass;
  const rawDoc = await fetch(`${base}/api/documents/${d1}`, { headers: { Authorization: 'Bearer ' + doc } });
  assert.equal(rawDoc.status, 200); assert.equal(rawDoc.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/api/documents/${d1}`, { headers: { Authorization: 'Bearer ' + pat } })).status, 403);
  ok('doctor can open the applicant\'s record; other patients cannot');
  const rv = (await api('GET', `/api/doctor/passes/${pass.id}`, null, doc)).d; assert.equal(rv.documents.length, 1);
  expectErr(await api('POST', `/api/doctor/passes/${pass.id}/issue`, { items: [{ medicine_id: 'amoxicillin' }], red_flag_keys: ['x'] }, doc), 400);
  assert.equal((await api('POST', `/api/doctor/passes/${pass.id}/issue`, { items: [{ medicine_id: 'adrenaline', max_qty: 1 }], red_flag_keys: ['throat swelling', 'trouble breathing'], uses_allowed: 1, valid_days: 30, instructions: 'Use on thigh' }, doc)).status, 200);
  const po = { machine_id: 'M1', items: [{ medicine_id: 'adrenaline', qty: 1 }], pass_id: pass.id };
  expectErr(await api('POST', '/api/orders', { ...po, red_flags: ['headache'] }, pat2), 403, 'RED_FLAGS');
  expectErr(await api('POST', '/api/orders', { ...po, red_flags: ['trouble breathing'] }, await login('9000000003')), 403, 'PASS_INACTIVE'); // someone else's pass
  const pord = (await api('POST', '/api/orders', { ...po, red_flags: ['trouble breathing'] }, pat2)).d.order;
  await api('POST', `/api/orders/${pord.id}/pay`, {}, pat2);
  await api('POST', `/api/orders/${pord.id}/dispense`, { qr: await qrFor(...M1) }, pat2);
  await runCommand(...M1);
  const after = (await api('GET', '/api/passes', null, pat2)).d[0];
  assert.equal(after.status, 'EXHAUSTED'); assert.equal(after.uses_left, 0);
  const usage = (await api('GET', `/api/doctor/passes/${pass.id}`, null, doc)).d.usage; assert.equal(usage.length, 1);
  ok('pass: red flags must match, no live doctor needed, use is counted and the pass is exhausted');

  console.log('Worker');
  expectErr(await api('POST', '/api/worker/refill', {}, pat), 403);
  assert.equal((await api('POST', '/api/worker/refill', { machine_id: 'M3', lane_no: 1, medicine_id: 'paracetamol', qty: 12, batch: 'NEW-1', expiry: '2029-01-31' }, wk)).status, 200);
  assert.equal((await api('GET', '/api/machines/M3/lanes', null, wk)).d[0].qty, 12);
  const nm = (await api('POST', '/api/worker/machines', { name: 'Test machine', address: 'x', lat: 21.1, lng: 72.8 }, wk)).d;
  assert.ok(nm.id && nm.api_key);
  ok('worker refills lanes and registers machines');

  console.log('Machine auth');
  expectErr(await machine('M1', 'wrong-key', { action: 'poll' }), 401);
  ok('machine endpoint needs the machine key');

  console.log(`\nAll ${passed} checks passed`);
} catch (e) {
  console.error('\nFAILED:', e.message); console.error(e.stack?.split('\n').slice(1, 4).join('\n')); process.exitCode = 1;
} finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
