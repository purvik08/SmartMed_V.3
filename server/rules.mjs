// The rules engine: the server is the only authority. Re-run at order time AND at dispense time.
import { get, all, parse, HttpError, CFG } from './lib.mjs';

export const allergyHit = (user, med) => {
  const allergies = parse(user.allergies, []).map((a) => String(a).toLowerCase().trim()).filter(Boolean);
  const tags = parse(med.allergy_tags, []);
  return allergies.find((a) => tags.some((t) => a.includes(t) || t.includes(a)) || med.generic.toLowerCase().includes(a)) ?? null;
};

export function checkEligibility(user, items, ent = {}, excludeOrderId = null) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Cart is empty');
  const ids = items.map((i) => i.medicine_id);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Duplicate medicine in cart');
  for (const i of items) if (!Number.isInteger(i.qty) || i.qty < 1) throw new HttpError(400, 'Invalid quantity');
  const meds = new Map();
  for (const id of ids) {
    const m = get('SELECT * FROM medicines WHERE id = ?', id);
    if (!m) throw new HttpError(400, 'Unknown medicine');
    meds.set(id, m);
  }
  const tiers = new Set([...meds.values()].map((m) => m.tier));
  if (tiers.size > 1) throw new HttpError(400, 'Order OTC, prescription and emergency medicines separately');
  const tier = [...tiers][0];
  const age = user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / 31557600000) : null;
  for (const i of items) {
    const m = meds.get(i.medicine_id);
    if (i.qty > m.max_per_order) throw new HttpError(400, `Maximum ${m.max_per_order} of ${m.brand} per order`);
    if (m.min_age > 0) {
      if (age === null || Number.isNaN(age)) throw new HttpError(400, 'Add your date of birth in Profile first', 'PROFILE_INCOMPLETE');
      if (age < m.min_age) throw new HttpError(403, `${m.brand} is not available under ${m.min_age} years`, 'AGE');
    }
    const hit = allergyHit(user, m);
    if (hit) throw new HttpError(403, `Allergy warning: your profile lists "${hit}" and ${m.brand} may conflict`, 'ALLERGY');
  }
  if (tier === 1) return { tier, type: 'otc', id: null, meds };

  const notThis = excludeOrderId ?? '';
  if (tier === 2) {
    if (!ent.prescription_id) throw new HttpError(403, 'A valid e-prescription is required', 'RX_REQUIRED');
    const rx = get("SELECT * FROM prescriptions WHERE id = ? AND patient_id = ? AND kind = 'rx'", ent.prescription_id, user.id);
    if (!rx || rx.used || new Date(rx.valid_until) < new Date()) throw new HttpError(403, 'Prescription is invalid, used or expired', 'RX_INVALID');
    const lines = parse(rx.items, []);
    for (const i of items) {
      const l = lines.find((x) => x.medicine_id === i.medicine_id);
      if (!l || i.qty > l.qty) throw new HttpError(403, 'Item not covered by the prescription', 'RX_ITEM');
    }
    if (get("SELECT 1 AS x FROM orders WHERE ent_id = ? AND status IN ('paid','dispensing','dispensed') AND id != ?", rx.id, notThis))
      throw new HttpError(409, 'Prescription already used in another order', 'RX_USED');
    return { tier, type: 'rx', id: rx.id, meds };
  }

  // Tier 3: one emergency pack per patient per 24 hours, then doctor approval or an active pass.
  const recent = get(`SELECT 1 AS x FROM orders WHERE patient_id = ? AND ent_type IN ('emergency','pass')
    AND status IN ('paid','dispensing','dispensed') AND created_at > ? AND id != ?`, user.id, new Date(Date.now() - 864e5).toISOString(), notThis);
  if (recent) throw new HttpError(429, 'Only one emergency pack is allowed per 24 hours', 'LIMIT_24H');

  if (ent.emergency_request_id) {
    const r = get('SELECT * FROM emergency_requests WHERE id = ? AND patient_id = ?', ent.emergency_request_id, user.id);
    if (!r || !['APPROVED', 'PAID'].includes(r.status)) throw new HttpError(403, 'Doctor approval is not active', 'NOT_APPROVED');
    if (Date.now() - new Date(r.decided_at).getTime() > 3600e3) throw new HttpError(403, 'Doctor approval has expired (1 hour)', 'APPROVAL_EXPIRED');
    const ap = parse(r.approved_items, []);
    for (const i of items) {
      const a = ap.find((x) => x.medicine_id === i.medicine_id);
      if (!a || i.qty > a.qty) throw new HttpError(403, 'Item was not approved by the doctor', 'NOT_APPROVED');
    }
    return { tier, type: 'emergency', id: r.id, meds };
  }
  if (ent.pass_id) {
    const p = get('SELECT * FROM passes WHERE id = ? AND patient_id = ?', ent.pass_id, user.id);
    const t = new Date();
    if (!p || p.status !== 'ACTIVE' || p.uses_left < 1 || !p.valid_until || new Date(p.valid_until) < t || new Date(p.valid_from) > t)
      throw new HttpError(403, 'Pass is not active (expired, used up or revoked)', 'PASS_INACTIVE');
    const pi = parse(p.items, []);
    for (const i of items) {
      const a = pi.find((x) => x.medicine_id === i.medicine_id);
      if (!a || i.qty > a.max_qty) throw new HttpError(403, 'Medicine is not on your pass or exceeds its limit', 'PASS_ITEM');
    }
    const keys = parse(p.red_flag_keys, []);
    if (!(ent.red_flags ?? []).some((a) => keys.includes(a)))
      throw new HttpError(403, 'Your answers do not match the condition on this pass. Call 108/112 or request a doctor.', 'RED_FLAGS');
    return { tier, type: 'pass', id: p.id, meds };
  }
  throw new HttpError(403, 'Emergency medicines need live doctor approval or an active pass', 'T3_REQUIRED');
}

// Picks lanes (earliest expiry first); blocks offline machines, empty and expired lanes.
export function planStock(machineId, items) {
  const m = get('SELECT * FROM machines WHERE id = ?', machineId);
  if (!m) throw new HttpError(404, 'Machine not found');
  if (m.status !== 'active' || !m.last_seen || Date.now() - new Date(m.last_seen).getTime() > CFG.machineOnlineMs)
    throw new HttpError(409, 'This machine is offline. Pick another machine.', 'OFFLINE');
  const today = new Date().toISOString().slice(0, 10);
  const lanes = all('SELECT * FROM lanes WHERE machine_id = ?', machineId);
  return items.map((i) => {
    const c = lanes.filter((l) => l.medicine_id === i.medicine_id && l.qty >= i.qty && (!l.expiry || l.expiry >= today))
      .sort((a, b) => String(a.expiry ?? '9999').localeCompare(String(b.expiry ?? '9999')))[0];
    if (!c) throw new HttpError(409, 'Out of stock (or expired) at this machine', 'NO_STOCK');
    return { lane_id: c.id, lane_no: c.lane_no, medicine_id: i.medicine_id, qty: i.qty };
  });
}
