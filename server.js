const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const DBF = path.join(__dirname, 'data', 'db.json');
const DAY = 864e5, iso = d => new Date(d).toISOString().slice(0, 10), add = (s, n) => iso(new Date(s).getTime() + n * DAY);
const today = () => iso(Date.now()), diff = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);
const hash = p => crypto.scryptSync(String(p), 'vaxiquest', 32).toString('hex');
const fam = v => v.replace(/-\d+$/, '');
const SCHED = [['BCG', 0], ['OPV-1', 0], ['Penta-1', 42], ['OPV-2', 70], ['Penta-2', 70], ['PCV-1', 70], ['OPV-3', 98], ['Penta-3', 98], ['PCV-2', 98], ['MR-1', 270], ['JE-1', 270], ['Vitamin A-1', 270], ['MMR-1', 480]];
const QUIZ = [
  { q: 'Which vaccine is given at birth?', o: ['BCG', 'MR-1', 'JE-1'], a: 0 },
  { q: 'Penta-1 is scheduled at what age?', o: ['6 weeks', '9 months', '16 months'], a: 0 },
  { q: 'MR-1 (measles-rubella) is scheduled at?', o: ['Birth', '9 months', '14 weeks'], a: 1 },
  { q: 'Why is on-time vaccination important?', o: ['It protects the child early', 'It is optional', 'Only adults need it'], a: 0 },
  { q: 'Where should the vaccination card be kept?', o: ['Safe place, bring to every visit', 'Throw away after use', 'Give to a neighbour'], a: 0 },
  { q: 'Vitamin A-1 is given along with which visit?', o: ['9 months', 'Birth', '10 weeks'], a: 0 }];
let db;
const save = () => fs.writeFileSync(DBF, JSON.stringify(db, null, 1));

function seed() {
  let s = 42; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, T = today();
  db = { config: { points: { profile: 50, done: 100, ontime: 150, ack: 10, quiz: 20, book: 30, w_done: 20, w_data: 10, w_follow: 15, w_recover: 30 } },
    users: [], children: [], appts: [], audit: [], followups: [],
    inventory: { BCG: 45, OPV: 80, MR: 32, Penta: 51, PCV: 40, JE: 30, MMR: 25, 'Vitamin A': 60 } };
  const mk = (id, role, name, mobile, pw, area) => { const u = { id, role, name, mobile, pass: hash(pw), area, consent: role !== 'parent', quizDone: [], acks: 0, books: 0, lastAck: '', early: r() < .6 }; db.users.push(u); return u; };
  mk('W1', 'worker', 'Sunita (ASHA)', '9000000101', 'worker123', 'A,B'); mk('W2', 'worker', 'Kavita (ANM)', '9000000102', 'worker123', 'C,D');
  mk('M1', 'manager', 'District Manager', '9000000201', 'manager123', 'All'); mk('A1', 'admin', 'System Admin', '9000000301', 'admin123', 'All');
  const names = ['Aarav', 'Riya', 'Mohit', 'Sana', 'Vivaan', 'Diya', 'Kabir', 'Anaya', 'Ishaan', 'Meera', 'Arjun', 'Kiara', 'Reyansh', 'Tara', 'Dev', 'Nisha', 'Rohan', 'Pooja', 'Aditya', 'Simran'];
  const offs = [95, 270, 98, 70, 42, 70, 98, 270], miss = { A: .04, B: .12, C: .32, D: .08 };
  for (let i = 0; i < 60; i++) {
    const area = 'ABCD'[i % 4], dob = add(T, -(i < 8 ? offs[i] : Math.floor(r() * 520)));
    const p = mk('P' + (i + 1), 'parent', 'Parent of ' + names[i % 20] + (i >= 20 ? ' ' + (Math.floor(i / 20) + 1) : ''), String(9000000001 + i), 'parent123', area);
    const worker = 'AB'.includes(area) ? 'W1' : 'W2';
    const vax = SCHED.map(([n, o]) => { const due = add(dob, o), v = { name: n, due, done: null };
      if (due < T && (i === 0 || r() > miss[area])) { v.done = add(due, r() < .85 ? Math.floor(r() * 4) : 8 + Math.floor(r() * 10)); v.by = worker; v.entered = r() < .94 ? v.done : add(v.done, 2); }
      return v; });
    db.children.push({ id: 'VX-' + (10452 + i), name: names[i % 20] + (i >= 20 ? ' ' + (Math.floor(i / 20) + 1) : ''), dob, area, parent: p.id, worker, vax });
  }
  save();
}
if (!fs.existsSync(DBF) || process.argv.includes('--reseed')) seed(); else db = JSON.parse(fs.readFileSync(DBF));

// ---------- domain helpers ----------
const summ = c => {
  const T = today(), vs = c.vax.map(v => ({ ...v, status: v.done ? 'done' : v.due < T ? 'missed' : diff(v.due, T) <= 7 ? 'due_soon' : 'on_track', ontime: v.done ? diff(v.done, v.due) <= 7 : null, days: diff(v.due, T) }));
  const done = vs.filter(v => v.done).length, missed = vs.filter(v => v.status === 'missed');
  const next = vs.filter(v => !v.done && v.due >= T).sort((a, b) => a.due < b.due ? -1 : 1)[0] || null;
  let streak = 0; vs.filter(v => v.due <= T && (v.done || v.due < T)).sort((a, b) => a.due < b.due ? -1 : 1).forEach(v => { streak = v.done && v.ontime ? streak + 1 : 0; });
  const risk = missed.length ? 'red' : vs.some(v => v.status === 'due_soon') ? 'yellow' : 'green';
  return { id: c.id, name: c.name, dob: c.dob, area: c.area, worker: c.worker, ageMonths: Math.floor(diff(T, c.dob) / 30.4), vaccines: vs, progress: Math.round(done * 100 / vs.length), done, ontimeCount: vs.filter(v => v.ontime).length, missedCount: missed.length, next, streak, risk };
};
const level = p => p <= 200 ? 'Bronze' : p <= 500 ? 'Silver' : p <= 1000 ? 'Gold' : 'Platinum';
function parentStats(u) {
  const P = db.config.points, kids = db.children.filter(c => c.parent === u.id).map(summ);
  const done = kids.reduce((a, k) => a + k.done, 0), ot = kids.reduce((a, k) => a + k.ontimeCount, 0), streak = Math.max(0, ...kids.map(k => k.streak));
  const points = P.profile + done * P.done + ot * P.ontime + u.acks * P.ack + u.quizDone.length * P.quiz + u.books * P.book;
  const B = [['First Step', 'First vaccination completed', done >= 1], ['On-Time Hero', '3 vaccines on time', ot >= 3], ['Consistency Champion', 'Vaccination streak of 5', streak >= 5],
    ['Health Learner', 'Complete 3 health quizzes', u.quizDone.length >= 3], ['Early Starter', 'Early registration', u.early], ['On-Time Parent', '8 vaccines on time', ot >= 8],
    ['Family Achiever', 'All children fully vaccinated (2+)', kids.length >= 2 && kids.every(k => k.progress === 100)]].map(([name, criteria, earned]) => ({ name, criteria, earned }));
  return { kids, points, level: level(points), badges: B, streak, quizzes: u.quizDone.length };
}
function workerStats(u) {
  const P = db.config.points, all = db.children.flatMap(c => c.vax.filter(v => v.done && v.by === u.id));
  const rec = all.length, timely = all.filter(v => v.entered === v.done).length, rec30 = all.filter(v => diff(v.done, v.due) > 7).length, fu = db.followups.filter(f => f.worker === u.id).length;
  const points = rec * P.w_done + timely * P.w_data + fu * P.w_follow + rec30 * P.w_recover, acc = rec ? Math.round(timely * 100 / rec) : 100;
  const badges = [['Field Champion', rec >= 50], ['Data Champion', acc >= 95], ['Follow-up Hero', fu >= 10]].map(([name, earned]) => ({ name, earned }));
  return { vaccinations: rec, followups: fu, accuracy: acc, recovered: rec30, points, badges };
}
const coverage = (kids, asOf = today()) => { let d = 0, t = 0, o = 0; kids.forEach(c => c.vax.forEach(v => { if (v.due <= asOf) { t++; if (v.done && v.done <= asOf) { d++; if (diff(v.done, v.due) <= 7) o++; } } })); return { cov: t ? Math.round(d * 100 / t) : 100, ontime: t ? Math.round(o * 100 / t) : 100, missed: t - d, total: t }; };
const logA = (u, action) => { db.audit.push({ t: new Date().toISOString(), user: u.id, role: u.role, action }); db.audit = db.audit.slice(-500); };

function recordVax(u, childId, vaccine, date) {
  const c = db.children.find(x => x.id === childId && x.worker === u.id); if (!c) throw new Error('Child not assigned to you');
  const v = c.vax.find(x => x.name === vaccine); if (!v) throw new Error('Unknown vaccine'); if (v.done) throw new Error('Already recorded');
  const d = date || today(); if (d > today()) throw new Error('Date cannot be in the future');
  const f = fam(vaccine); if ((db.inventory[f] || 0) <= 0) throw new Error(f + ' out of stock');
  db.inventory[f]--; v.done = d; v.by = u.id; v.entered = today(); logA(u, `Recorded ${vaccine} for ${childId}`); save();
}

// ---------- app / auth ----------
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const tokens = new Map(), otps = new Map();
const auth = role => (req, res, next) => { const u = db.users.find(x => x.id === tokens.get(req.headers['x-token'] || req.query.token)); if (!u || u.active === false) return res.status(401).json({ error: 'Login required' }); if (role && u.role !== role) return res.status(403).json({ error: 'Forbidden for your role' }); req.user = u; next(); };
const wrap = fn => (req, res) => { try { fn(req, res); } catch (e) { res.status(400).json({ error: e.message }); } };

app.post('/api/otp', wrap((req, res) => { const u = db.users.find(x => x.mobile === req.body.id || x.id === req.body.id); if (!u) throw new Error('User not found'); const code = String(100000 + Math.floor(Math.random() * 900000)); otps.set(u.id, code); console.log(`[OTP] ${u.mobile}: ${code}`); res.json({ demoOtp: code }); }));
app.post('/api/login', wrap((req, res) => {
  const { id, password, otp, role } = req.body, u = db.users.find(x => x.mobile === id || x.id === id);
  const ok = u && ((password && u.pass === hash(password)) || (otp && otps.get(u.id) === otp));
  if (ok && u.active === false) throw new Error('Account is deactivated. Contact admin.'); if (!ok) throw new Error('Invalid credentials'); if (role && u.role !== role) throw new Error('This account is not a ' + role);
  otps.delete(u.id); const token = crypto.randomBytes(24).toString('hex'); tokens.set(token, u.id); logA(u, 'Login');
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
}));
app.get('/api/me', auth(), (req, res) => res.json({ id: req.user.id, name: req.user.name, role: req.user.role }));
app.post('/api/logout', auth(), (req, res) => { tokens.delete(req.headers['x-token']); logA(req.user, 'Logout'); res.json({ ok: 1 }); });
app.post('/api/consent', auth('parent'), wrap((req, res) => { req.user.consent = true; logA(req.user, 'Consent given'); save(); res.json({ ok: 1 }); }));

// ---------- parent ----------
app.get('/api/parent', auth('parent'), (req, res) => {
  const u = req.user, st = parentStats(u), q = QUIZ.findIndex((_, i) => !u.quizDone.includes(i)), notes = [];
  st.kids.forEach(k => { if (k.next) { const d = k.next.days; notes.push(d === 0 ? `🔔 ${k.name}'s ${k.next.name} vaccine is due TODAY.` : `🔔 ${k.name}'s ${k.next.name} vaccine is due in ${d} days.`); if (d <= 1) notes.push('🔔 Reminder: vaccination appointment at 10 AM'); }
    k.vaccines.filter(v => v.status === 'missed').forEach(v => notes.push(`⚠️ ${k.name} missed ${v.name} (due ${v.due}). Please visit the centre.`)); });
  st.badges.filter(b => b.earned).forEach(b => notes.push(`🏆 Congratulations! You earned the ${b.name} badge!`));
  const first = st.kids[0], nx = first && first.next;
  res.json({ user: { name: u.name, consent: u.consent, points: st.points, level: st.level, badges: st.badges, streak: st.streak, quizzes: st.quizzes }, children: st.kids, notifications: notes,
    sms: nx ? `Your child's ${nx.name} vaccination is due on ${nx.due}.` : 'All scheduled vaccines are up to date.', ivr: nx ? `आपके बच्चे का अगला टीका ${nx.due} को है...` : 'सभी टीके पूरे हैं।',
    quiz: q >= 0 ? { id: q, q: QUIZ[q].q, o: QUIZ[q].o } : null, config: db.config.points,
    appts: db.appts.filter(a => st.kids.some(k => k.id === a.childId)) });
});
app.post('/api/parent/book', auth('parent'), wrap((req, res) => {
  const { childId, date } = req.body, c = db.children.find(x => x.id === childId && x.parent === req.user.id); if (!c) throw new Error('Not your child'); if (!date || date < today()) throw new Error('Choose today or a future date');
  const k = summ(c), v = k.next || k.vaccines.find(x => x.status === 'missed'); if (!v) throw new Error('No pending vaccine');
  if (!db.appts.some(a => a.childId === childId && a.vaccine === v.name)) req.user.books++;
  db.appts = db.appts.filter(a => !(a.childId === childId && a.vaccine === v.name)); db.appts.push({ childId, vaccine: v.name, date, centre: 'PHC ' + c.area });
  logA(req.user, `Booked ${v.name} for ${childId}`); save(); res.json({ ok: 1 });
}));
app.post('/api/parent/quiz', auth('parent'), wrap((req, res) => { const { id, answer } = req.body, u = req.user; if (!QUIZ[id] || u.quizDone.includes(id)) throw new Error('Invalid question'); const ok = QUIZ[id].a === answer; if (ok) u.quizDone.push(id); save(); res.json({ correct: ok, points: ok ? db.config.points.quiz : 0 }); }));
app.post('/api/parent/ack', auth('parent'), wrap((req, res) => { const u = req.user; if (u.lastAck === today()) return res.json({ earned: 0 }); u.lastAck = today(); u.acks++; save(); res.json({ earned: db.config.points.ack }); }));

// ---------- worker ----------
app.get('/api/worker', auth('worker'), (req, res) => {
  const u = req.user, T = today(), kids = db.children.filter(c => c.worker === u.id).map(summ), st = workerStats(u);
  const dueToday = [], missed = [], soon = [];
  kids.forEach(k => k.vaccines.forEach(v => { const it = { childId: k.id, name: k.name, vaccine: v.name, due: v.due, days: v.days, area: k.area };
    if (!v.done && v.due === T) dueToday.push(it); else if (v.status === 'missed') missed.push({ ...it, overdue: -v.days, followed: db.followups.some(f => f.childId === k.id && f.vaccine === v.name) }); else if (v.status === 'due_soon') soon.push(it); }));
  missed.sort((a, b) => b.overdue - a.overdue);
  const doneToday = db.children.reduce((a, c) => a + c.vax.filter(v => v.done === T && v.by === u.id).length, 0);
  const teams = db.users.filter(x => x.role === 'worker').map(w => ({ team: 'Team ' + w.area, mine: w.id === u.id, points: workerStats(w).points }));
  res.json({ user: { name: u.name, area: u.area }, tasks: { total: doneToday + dueToday.length, completed: doneToday, pending: dueToday.length }, dueToday, missed, soon, priority: [...missed.map(m => ({ ...m, level: 'red' })), ...dueToday.map(m => ({ ...m, level: 'yellow' })), ...soon.map(m => ({ ...m, level: 'yellow' }))].slice(0, 15),
    children: kids.map(k => ({ id: k.id, name: k.name, dob: k.dob, area: k.area, risk: k.risk, progress: k.progress, pending: k.vaccines.filter(v => !v.done).map(v => ({ name: v.name, due: v.due, status: v.status })) })),
    perf: st, inventory: db.inventory, teams, appts: db.appts.filter(a => kids.some(k => k.id === a.childId)) });
});
app.post('/api/worker/record', auth('worker'), wrap((req, res) => { recordVax(req.user, req.body.childId, req.body.vaccine, req.body.date); res.json({ ok: 1 }); }));
app.post('/api/worker/sync', auth('worker'), wrap((req, res) => { const out = (req.body.records || []).map(r => { try { recordVax(req.user, r.childId, r.vaccine, r.date); return { ok: 1 }; } catch (e) { return { ok: 0, error: e.message }; } }); res.json({ results: out }); }));
app.post('/api/worker/followup', auth('worker'), wrap((req, res) => { const { childId, vaccine } = req.body; if (!db.children.some(c => c.id === childId && c.worker === req.user.id)) throw new Error('Not assigned'); db.followups.push({ childId, vaccine, worker: req.user.id, date: today() }); logA(req.user, `Follow-up ${childId} ${vaccine}`); save(); res.json({ ok: 1 }); }));

// ---------- manager ----------
const areaRows = () => ['A', 'B', 'C', 'D'].map(a => { const ks = db.children.filter(c => c.area === a); return { area: 'Area ' + a, children: ks.length, ...coverage(ks) }; });
app.get('/api/manager', auth('manager'), (req, res) => {
  const T = today(), areas = areaRows(), all = coverage(db.children), risky = areas.filter(a => a.cov < 75);
  const trend = [5, 4, 3, 2, 1, 0].map(w => { const d = add(T, -7 * w); return { label: d.slice(5), cov: coverage(db.children, d).cov }; });
  const plans = areas.filter(a => a.cov < 80).map(a => ({ area: a.area, problem: `Coverage = ${a.cov}%, Missed = ${a.missed}`, actions: ['Deploy more healthcare workers', 'Plan vaccination camp', 'Launch awareness campaign', 'Review vaccine/resource allocation', 'Create follow-up strategy for missed beneficiaries'] }));
  const notes = [...areas.filter(a => a.cov < 90).map(a => `🔔 Coverage in ${a.area} has fallen below the configured target (${a.cov}%).`), ...risky.map(a => `🔔 High-risk area alert: ${a.area} coverage at ${a.cov}%`), '🔔 Weekly report ready for review'];
  res.json({ overview: { totalChildren: db.children.length, coverage: all.cov, ontime: all.ontime, missed: all.missed, highRisk: risky.length }, areas, trend, plans, notes, inventory: db.inventory, workers: db.users.filter(u => u.role === 'worker').map(w => ({ name: w.name, area: w.area, ...workerStats(w) })) });
});
app.get('/api/manager/report.csv', auth('manager'), (req, res) => { res.type('text/csv').send('Area,Children,Coverage %,On-time %,Missed\n' + areaRows().map(a => [a.area, a.children, a.cov, a.ontime, a.missed].join(',')).join('\n')); });

// ---------- registration (worker / admin) ----------
app.post('/api/register-child', auth(), wrap((req, res) => {
  const u = req.user; if (!['worker', 'admin'].includes(u.role)) throw new Error('Only worker/admin can register');
  const { childName, dob, area, parentName, mobile, password, given = [] } = req.body, T = today();
  if (!childName || !parentName || !/^\d{10}$/.test(mobile || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) throw new Error('Child name, valid DOB, parent name and 10-digit mobile required');
  if (dob > T) throw new Error('DOB cannot be in the future'); if (!/^[ABCD]$/.test(area || '')) throw new Error('Choose a valid area');
  if (u.role === 'worker' && !u.area.split(',').includes(area)) throw new Error('You can register only in your own areas');
  const worker = u.role === 'worker' ? u : db.users.find(x => x.role === 'worker' && x.area.split(',').includes(area)); if (!worker) throw new Error('No worker assigned to this area');
  let p = db.users.find(x => x.mobile === mobile); if (p && p.role !== 'parent') throw new Error('Mobile already used by a staff account');
  const isNew = !p, pw = password || 'parent123';
  if (isNew) { p = { id: 'P' + (Math.max(0, ...db.users.filter(x => x.role === 'parent').map(x => +x.id.slice(1) || 0)) + 1), role: 'parent', name: parentName, mobile, pass: hash(pw), area, consent: false, quizDone: [], acks: 0, books: 0, lastAck: '', early: diff(T, dob) <= 30 }; db.users.push(p); }
  const vax = SCHED.map(([n, o]) => { const due = add(dob, o), v = { name: n, due, done: null }; if (given.includes(n) && due <= T) { v.done = due; v.by = 'history'; v.entered = due; } return v; });
  const id = 'VX-' + (Math.max(...db.children.map(c => +c.id.slice(3))) + 1);
  db.children.push({ id, name: childName, dob, area, parent: p.id, worker: worker.id, vax }); logA(u, `Registered ${id} (${mobile})`); save();
  res.json({ ok: 1, childId: id, mobile, password: isNew ? pw : null, worker: worker.name });
}));

// ---------- admin ----------
app.get('/api/admin', auth('admin'), (req, res) => res.json({ users: db.users.map(({ id, role, name, mobile, area, active }) => ({ id, role, name, mobile, area, active: active !== false })), config: db.config.points, audit: db.audit.slice(-100).reverse(), children: db.children.map(c => ({ id: c.id, name: c.name, dob: c.dob, area: c.area, worker: c.worker, mobile: (db.users.find(u => u.id === c.parent) || {}).mobile })) }));
app.post('/api/password', auth(), wrap((req, res) => { const { oldPassword, newPassword } = req.body; if (req.user.pass !== hash(oldPassword || '')) throw new Error('Current password is wrong'); if (String(newPassword || '').length < 6) throw new Error('New password must be at least 6 characters'); req.user.pass = hash(newPassword); logA(req.user, 'Changed own password'); save(); res.json({ ok: 1 }); }));
const countAdmins = () => db.users.filter(x => x.role === 'admin' && x.active !== false).length;
const checkMobile = (m, self) => { if (!/^\d{10}$/.test(m)) throw new Error('Mobile must be 10 digits'); if (db.users.some(x => x.mobile === m && x !== self)) throw new Error('Mobile already registered'); };
app.get('/api/profile', auth(), (req, res) => { const u = req.user; res.json({ name: u.name, mobile: u.mobile, area: u.area, role: u.role }); });
app.post('/api/profile', auth(), wrap((req, res) => {
  const u = req.user, { name, mobile, area, password } = req.body; if (u.pass !== hash(password || '')) throw new Error('Current password is wrong');
  if (mobile && mobile !== u.mobile) checkMobile(mobile, u);
  if (area && area !== u.area) { if (u.role !== 'parent') throw new Error('Only admin can change area for your role'); if (!/^[ABCD]$/.test(area)) throw new Error('Area must be A, B, C or D'); }
  if (mobile) u.mobile = mobile; if (name) u.name = name; if (area && u.role === 'parent') u.area = area; logA(u, 'Edited own profile'); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/user/update', auth('admin'), wrap((req, res) => {
  const u = db.users.find(x => x.id === req.body.id); if (!u) throw new Error('User not found'); const { name, mobile, area, password, role } = req.body;
  if (mobile && mobile !== u.mobile) checkMobile(mobile, u);
  if (password && password.length < 6) throw new Error('Password must be at least 6 characters');
  const newRole = role || u.role; if (!['parent', 'worker', 'manager', 'admin'].includes(newRole)) throw new Error('Invalid role');
  if (newRole !== u.role) {
    if (u.role === 'parent' && db.children.some(c => c.parent === u.id)) throw new Error('This parent has children registered; role cannot be changed');
    if (u.role === 'worker' && db.children.some(c => c.worker === u.id)) throw new Error("Reassign this worker's children first (Children → Edit)");
    if (u.role === 'admin' && countAdmins() < 2) throw new Error('Cannot change the last admin');
  }
  let plan = [];
  if (area && area !== u.area && newRole === 'worker') {
    if (!/^[ABCD](,[ABCD])*$/.test(area)) throw new Error('Worker area must look like A or A,B');
    plan = db.children.filter(c => c.worker === u.id && !area.split(',').includes(c.area)).map(c => ({ c, w: db.users.find(x => x.role === 'worker' && x.id !== u.id && x.active !== false && x.area.split(',').includes(c.area)) }));
    if (plan.some(p => !p.w)) throw new Error('Some children would be left without a worker. Cover that area with another worker first.');
  }
  plan.forEach(p => p.c.worker = p.w.id);
  if (mobile) u.mobile = mobile; if (name) u.name = name; if (area) u.area = area; if (password) u.pass = hash(password);
  if (newRole !== u.role) { u.role = newRole; if (newRole !== 'parent') u.consent = true; }
  logA(req.user, 'Edited user ' + u.id + (plan.length ? ` (${plan.length} children reassigned)` : '')); save(); res.json({ ok: 1, reassigned: plan.length });
}));
app.post('/api/admin/user/status', auth('admin'), wrap((req, res) => {
  const u = db.users.find(x => x.id === req.body.id); if (!u) throw new Error('User not found'); const active = !!req.body.active;
  if (!active && u.id === req.user.id) throw new Error('You cannot deactivate yourself'); if (!active && u.role === 'admin' && countAdmins() < 2) throw new Error('Cannot deactivate the last admin');
  u.active = active; if (!active) for (const [t, id] of tokens) if (id === u.id) tokens.delete(t); logA(req.user, (active ? 'Activated ' : 'Deactivated ') + u.id); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/user/delete', auth('admin'), wrap((req, res) => {
  const u = db.users.find(x => x.id === req.body.id); if (!u) throw new Error('User not found'); if (u.id === req.user.id) throw new Error('You cannot delete yourself');
  if (u.role === 'admin' && countAdmins() < 2) throw new Error('Cannot delete the last admin');
  if (u.role === 'parent' && db.children.some(c => c.parent === u.id)) throw new Error('Parent has children. Delete the children first, or deactivate the parent instead.');
  if (u.role === 'worker' && db.children.some(c => c.worker === u.id)) throw new Error('Worker has assigned children. Reassign them first, or deactivate instead.');
  db.users = db.users.filter(x => x !== u); for (const [t, id] of tokens) if (id === u.id) tokens.delete(t); logA(req.user, 'Deleted user ' + u.id); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/child/update', auth('admin'), wrap((req, res) => {
  const c = db.children.find(x => x.id === req.body.id); if (!c) throw new Error('Child not found'); const { name, dob, area, worker } = req.body, orig = c.worker;
  if (dob && dob !== c.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > today())) throw new Error('Invalid date of birth');
  let nArea = c.area, nWorker = c.worker;
  if (area && area !== c.area) { if (!/^[ABCD]$/.test(area)) throw new Error('Area must be A, B, C or D'); const w = db.users.find(x => x.role === 'worker' && x.active !== false && x.area.split(',').includes(area)); if (!w) throw new Error('No worker covers area ' + area); nArea = area; nWorker = w.id; }
  if (worker && worker !== orig) { const w = db.users.find(x => x.id === worker && x.role === 'worker' && x.active !== false); if (!w) throw new Error('Worker ID not found'); nWorker = w.id; }
  c.area = nArea; c.worker = nWorker; if (dob && dob !== c.dob) { c.dob = dob; c.vax.forEach((v, i) => v.due = add(dob, SCHED[i][1])); } if (name) c.name = name;
  logA(req.user, 'Edited child ' + c.id); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/child/delete', auth('admin'), wrap((req, res) => {
  const c = db.children.find(x => x.id === req.body.id); if (!c) throw new Error('Child not found');
  db.children = db.children.filter(x => x !== c); db.appts = db.appts.filter(a => a.childId !== c.id); db.followups = db.followups.filter(f => f.childId !== c.id); logA(req.user, 'Deleted child ' + c.id); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/user', auth('admin'), wrap((req, res) => {
  const { name, mobile, role, password, area } = req.body; if (!name || !/^\d{10}$/.test(mobile || '') || !password || !['parent', 'worker', 'manager', 'admin'].includes(role)) throw new Error('Name, 10-digit mobile, role and password required');
  if (db.users.some(u => u.mobile === mobile)) throw new Error('Mobile already registered');
  db.users.push({ id: role[0].toUpperCase() + Date.now().toString().slice(-6), role, name, mobile, pass: hash(password), area: area || 'All', consent: role !== 'parent', quizDone: [], acks: 0, books: 0, lastAck: '', early: false }); logA(req.user, 'Created user ' + mobile); save(); res.json({ ok: 1 });
}));
app.post('/api/admin/config', auth('admin'), wrap((req, res) => { Object.keys(db.config.points).forEach(k => { const n = Number(req.body[k]); if (Number.isFinite(n) && n >= 0) db.config.points[k] = n; }); logA(req.user, 'Updated reward config'); save(); res.json({ ok: 1 }); }));

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log('VaxiQuest running → http://localhost:' + PORT));
