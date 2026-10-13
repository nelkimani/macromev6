/* ═══════════════════════════════════════════════════════════════
   MACROME CLOUD LAYER (Firebase)  —  Phase 1: sign-in, roles, shops
   Plain wrapper around the Firebase SDK. It draws no screens; app.js calls it.

   Cloud.on      = a Firebase config is present in js/firebase-config.js
   Cloud.broken  = config present but the Firebase library files are missing (run tools/vendor.py)
   With no config, Cloud.on is false and the app keeps today's single-device mode.

   Sign-in: staff type a username; Firebase sees  username@<emailDomain>.
   Offline: Firebase cannot check a password without internet. After each online sign-in this phone keeps a
   salted hash of that person's password (same scheme as the old local mode). Offline sign-in is accepted only
   for the person whose Firebase session is still on this phone, so a different person must sign in online once.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const CFG = window.MACROME_CLOUD || {};
  const FB = CFG.firebase || {};
  const DOMAIN = String(CFG.emailDomain || 'macrome.app').replace(/^@/, '');
  const REC_KEY = 'macrome-cloud-device-v1';   // who last signed in on this phone (+ password hash for offline sign-in)
  const OWNER_KEY = 'macrome-cloud-owner-v1';  // remembers that the owner account exists
  const SHOPS = ['A', 'B', 'C'];

  const configured = !!(FB.apiKey && FB.projectId);
  const hasSdk = typeof firebase !== 'undefined' && !!firebase.initializeApp && !!firebase.auth && !!firebase.firestore;
  const C = { on: configured, broken: configured && !hasSdk, persistence: 'unknown' };
  window.Cloud = C;
  if (!configured || !hasSdk) return;

  /* ── start-up ───────────────────────────────────────────── */
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FB);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  try { db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED }); } catch (e) { /* already set */ }
  // Local copy of the data, so the till keeps working with no internet. Must be switched on before any other call.
  const dbReady = db.enablePersistence({ synchronizeTabs: true })
    .then(() => { C.persistence = 'on'; })
    .catch((e) => { C.persistence = (e && e.code) || 'failed'; });   // e.g. private browsing: works, but online only
  // resolves once Firebase has restored the saved session (works offline)
  const authReady = new Promise((res) => { const off = auth.onAuthStateChanged((u) => { off(); res(u); }); });

  const ts = () => firebase.firestore.FieldValue.serverTimestamp();
  const coded = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  const emailFor = (u) => String(u || '').trim().toLowerCase() + '@' + DOMAIN;
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

  function prof(snap) {
    if (!snap || !snap.exists) return null;
    const d = snap.data() || {};
    return { id: snap.id, name: d.name || '', username: d.username || '', role: d.role || '', shop: d.shop || '', code: d.code || '', active: d.active === true };
  }

  /* ── errors ─────────────────────────────────────────────── */
  C.isNetwork = function (e) {
    const c = (e && e.code) || '';
    return c === 'auth/network-request-failed' || c === 'unavailable' || c === 'deadline-exceeded' || c === 'auth/timeout';
  };
  C.isBadLogin = function (e) {
    return ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials', 'auth/invalid-email'].includes(e && e.code);
  };
  C.friendly = function (e) {
    const c = (e && e.code) || '';
    switch (c) {
      case 'auth/invalid-credential': case 'auth/user-not-found': case 'auth/wrong-password':
      case 'auth/invalid-login-credentials': case 'auth/invalid-email': return 'Incorrect username or password.';
      case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes and try again.';
      case 'auth/user-disabled': case 'macrome/disabled': return 'This account has been switched off. Ask the owner.';
      case 'macrome/no-profile': return 'This account has no access to Macrome. Ask the owner to add you.';
      case 'macrome/offline-other': return 'No internet. Offline, only the person who last signed in on this phone can sign in. Connect once and try again.';
      case 'auth/email-already-in-use': return 'That username is already taken.';
      case 'auth/weak-password': return 'Password must be at least 6 characters.';
      case 'auth/requires-recent-login': return 'Please sign in again, then retry.';
      case 'auth/operation-not-allowed': return 'Email/password sign-in is not switched on in Firebase (Authentication → Sign-in method).';
      case 'auth/invalid-api-key': case 'auth/api-key-not-valid': case 'auth/app-not-authorized': return 'The Firebase settings in js/firebase-config.js are not correct.';
      case 'permission-denied': return 'The server refused this. You may not have permission, or the setup code is wrong.';
      case 'macrome/no-session': return 'You are not signed in to the cloud on this phone. Sign out and in again.';
      case 'unavailable': case 'auth/network-request-failed': case 'deadline-exceeded': case 'auth/timeout': return 'No internet connection.';
      default: return 'Something went wrong' + (c ? ' (' + c + ')' : '') + '.';
    }
  };

  /* ── who is on this phone ───────────────────────────────── */
  C.authReady = () => authReady;
  C.currentUid = () => (auth.currentUser ? auth.currentUser.uid : '');
  C.record = function () { try { return JSON.parse(ls(REC_KEY)) || null; } catch (e) { return null; } };
  C.remember = function (p, password) {          // call after every successful ONLINE sign-in / password change
    const salt = rndHex(16);                     // rndHex / hashPw live in app.js
    lsSet(REC_KEY, JSON.stringify({ uid: p.id, username: p.username, name: p.name, role: p.role, shop: p.shop, code: p.code, salt, hash: hashPw(password, salt), at: Date.now() }));
  };
  function refreshRecord(p) {                    // keep role/shop on this phone in step with the server
    const r = C.record();
    if (r && r.uid === p.id) { r.name = p.name; r.role = p.role; r.shop = p.shop; r.code = p.code; lsSet(REC_KEY, JSON.stringify(r)); }
  }

  /* ── sign-in ────────────────────────────────────────────── */
  async function signInOnline(username, password) {
    await dbReady;
    const cred = await auth.signInWithEmailAndPassword(emailFor(username), password);
    const p = prof(await db.doc('users/' + cred.user.uid).get());
    if (!p) { try { await auth.signOut(); } catch (e) { /* ignore */ } throw coded('macrome/no-profile'); }
    if (!p.active) { try { await auth.signOut(); } catch (e) { /* ignore */ } throw coded('macrome/disabled'); }
    C.remember(p, password);
    lsSet(OWNER_KEY, '1');
    return p;
  }
  // A bad mobile connection can hang for a long time: after 9 s treat it as "offline" so the till can fall back.
  C.signIn = function (username, password) {
    return Promise.race([signInOnline(username, password), new Promise((_, rej) => setTimeout(() => rej(coded('auth/timeout')), 9000))]);
  };
  C.offlineSignIn = async function (username, password) {
    const r = C.record();
    await authReady;
    if (!r || r.username !== String(username).trim().toLowerCase() || !auth.currentUser || auth.currentUser.uid !== r.uid) throw coded('macrome/offline-other');
    if (hashPw(password, r.salt) !== r.hash) throw coded('auth/invalid-credential');
    return { id: r.uid, name: r.name, username: r.username, role: r.role, shop: r.shop, code: r.code, active: true, offline: true };
  };
  C.signOutDevice = async function () { C.stopSession(); try { await auth.signOut(); } catch (e) { /* ignore */ } try { localStorage.removeItem(REC_KEY); } catch (e) { /* ignore */ } };

  /* ── first-time owner setup ─────────────────────────────── */
  C.ownerExists = async function () {            // true / false, or null when it cannot be checked (offline)
    await dbReady;
    try {
      const s = await db.doc('meta/owner').get({ source: 'server' });
      if (s.exists) lsSet(OWNER_KEY, '1');
      return s.exists;
    } catch (e) { return ls(OWNER_KEY) === '1' ? true : null; }
  };
  C.setupOwner = async function (o) {            // {name, username, password, code, setupCode}
    await dbReady;
    const email = emailFor(o.username);
    let cred, created = false;
    try { cred = await auth.createUserWithEmailAndPassword(email, o.password); created = true; }
    catch (e) {
      if (e.code !== 'auth/email-already-in-use') throw e;
      cred = await auth.signInWithEmailAndPassword(email, o.password);   // an earlier attempt stopped half-way
    }
    const uid = cred.user.uid;
    try {
      // one all-or-nothing write: the rules accept it only with the right setup code and only while no owner exists
      await db.runTransaction(async (t) => {
        t.set(db.doc('bootstrap/' + o.setupCode), { uid });
        t.set(db.doc('meta/owner'), { uid, at: ts() });
        t.set(db.doc('users/' + uid), { name: o.name, username: o.username, role: 'super', shop: '', code: o.code, active: true, created: ts() });
      });
    } catch (e) {
      if (created) { try { await cred.user.delete(); } catch (_) { /* ignore */ } }   // never leave a stray login behind
      throw e;
    }
    lsSet(OWNER_KEY, '1');
    const p = prof(await db.doc('users/' + uid).get());
    C.remember(p, o.password);
    return p;
  };

  /* ── staff (managers only; the rules enforce who may do what) ── */
  function secondaryAuth() {                     // a second Firebase app, so creating a login does not sign the manager out
    let a; try { a = firebase.app('staff'); } catch (e) { a = firebase.initializeApp(FB, 'staff'); }
    return a.auth();
  }
  C.createStaff = async function (o) {           // {name, username, password, role, shop, code}
    await dbReady;
    const sa = secondaryAuth();
    try { await sa.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) { /* ignore */ }
    const cred = await sa.createUserWithEmailAndPassword(emailFor(o.username), o.password);
    try {
      await db.runTransaction(async (t) => {    // needs the server: fails (instead of queueing) when offline
        t.set(db.doc('users/' + cred.user.uid), { name: o.name, username: o.username, role: o.role, shop: o.shop || '', code: o.code, active: true, created: ts() });
      });
    } catch (e) {
      try { await cred.user.delete(); } catch (_) { /* ignore */ }
      try { await sa.signOut(); } catch (_) { /* ignore */ }
      throw e;
    }
    try { await sa.signOut(); } catch (e) { /* ignore */ }
    return cred.user.uid;
  };
  C.updateUser = async function (uid, fields) {  // name / shop / active / code
    await dbReady;
    await db.runTransaction(async (t) => { t.update(db.doc('users/' + uid), fields); });
  };
  C.changeOwnPassword = async function (current, next) {
    const u = auth.currentUser;
    if (!u) throw coded('macrome/no-session');
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, current));
    await u.updatePassword(next);
  };

  /* ── live session: my own profile + (managers) the staff list ── */
  let unsubs = [];
  C.startSession = function (p, h) {             // h = {onProfile(profile|null), onUsers(list), onError(e)}
    C.stopSession();
    unsubs.push(db.doc('users/' + p.id).onSnapshot((s) => {
      const np = prof(s);
      if (np) refreshRecord(np);
      if (h.onProfile && !(s.metadata.fromCache && !np)) h.onProfile(np);   // a missing doc seen only in the cache is not proof
    }, (e) => h.onError && h.onError(e)));
    if (p.role === 'super' || p.role === 'admin') {
      const col = db.collection('users');
      const q = p.shop ? col.where('shop', '==', p.shop) : col;   // a shop manager may only list their own shop
      unsubs.push(q.onSnapshot((s) => { h.onUsers && h.onUsers(s.docs.map(prof).filter(Boolean)); }, (e) => h.onError && h.onError(e)));
    }
  };
  C.stopSession = function () { unsubs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); unsubs = []; };

  /* ── helpers for the staff screen ───────────────────────── */
  C.makeCode = function (name, taken) {         // 3-letter attendant code for receipt numbers: Grace -> GRC
    const w = String(name || '').toUpperCase().replace(/[^A-Z\s]/g, '').trim().split(/\s+/)[0] || 'STF';
    let c = (w[0] + w.slice(1).replace(/[AEIOU]/g, '') + w.slice(1) + 'XX').slice(0, 3);
    const used = new Set(taken || []);
    for (let n = 2; used.has(c) && n < 10; n++) c = c.slice(0, 2) + n;
    return c;
  };
  C.shops = SHOPS;
})();
