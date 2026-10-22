// ===== ระบบสั่งอาหารร้านค้า: อัปโหลดเสียงเอง, แยกวันออเดอร์, ดูย้อนหลัง, หมายเหตุแยกรายเมนู =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = crypto.scryptSync(String(pw), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let db;
if (fs.existsSync(DATA_FILE)) {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db.settings) db.settings = { theme: '#e85d04', shopName: 'ร้านอาหารของเรา', logo: '', soundType: 'bell', customAudio: '', soundVolume: '1.0', loopInterval: '5' };
  if (!db.settings.soundVolume) db.settings.soundVolume = '1.0';
  if (!db.settings.customAudio) db.settings.customAudio = '';
  if (!db.settings.loopInterval) db.settings.loopInterval = '5';
} else {
  db = {
    users: [{ username: 'admin', password: hashPw('admin123'), role: 'admin' }],
    menu: [
      { id: 1, name: 'ข้าวผัดกะเพราหมู', price: 60, category: 'อาหารจานเดียว', image: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=500', available: true, recommended: true },
      { id: 2, name: 'ต้มยำกุ้ง', price: 120, category: 'ต้ม/แกง', image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=500', available: true, recommended: true },
      { id: 3, name: 'ชาเย็น', price: 35, category: 'เครื่องดื่ม', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', available: true, recommended: false }
    ],
    orders: [],
    settings: { theme: '#e85d04', shopName: 'ร้านอาหารของเรา', logo: '', soundType: 'bell', customAudio: '', soundVolume: '1.0', loopInterval: '5' },
    nextMenuId: 4,
    nextOrderId: 1
  };
}
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
save();

const sessions = new Map();
const STATUSES = ['pending', 'cooking', 'served', 'cancelled'];

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function readBody(req) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 25e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
  });
}
function cleanMenu(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return {
    name: name.slice(0, 100),
    price: price,
    category: String(b.category || '').trim() || 'อื่นๆ',
    image: String(b.image || '').trim(),
    available: b.available !== false,
    recommended: !!b.recommended
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://localhost').pathname;
    const method = req.method;

    if (method === 'GET' && (p === '/' || p === '/index.html')) return sendHtml(res, SHOP_PAGE);
    if (method === 'GET' && (p === '/admin' || p === '/admin.html')) return sendHtml(res, ADMIN_PAGE);
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'ไม่พบหน้านี้' });

    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const sess = sessions.get(token);
    const user = sess && sess.expires > Date.now() ? sess : null;
    const need = (...roles) => {
      if (!user) { send(res, 401, { error: 'กรุณาเข้าสู่ระบบ' }); return false; }
      if (!roles.includes(user.role)) { send(res, 403, { error: 'คุณไม่มีสิทธิ์ทำรายการนี้' }); return false; }
      return true;
    };
    const [, part, id] = p.split('/').filter(Boolean);

    if (part === 'settings' && method === 'GET') return send(res, 200, db.settings);
    if (part === 'settings' && method === 'PUT') {
      if (!need('admin')) return;
      if (body.theme) db.settings.theme = String(body.theme);
      if (body.shopName) db.settings.shopName = String(body.shopName);
      if (body.logo !== undefined) db.settings.logo = String(body.logo);
      if (body.soundType) db.settings.soundType = String(body.soundType);
      if (body.customAudio !== undefined) db.settings.customAudio = String(body.customAudio);
      if (body.soundVolume) db.settings.soundVolume = String(body.soundVolume);
      if (body.loopInterval) db.settings.loopInterval = String(body.loopInterval);
      save();
      return send(res, 200, db.settings);
    }

    if (part === 'login' && method === 'POST') {
      const u = db.users.find(x => x.username === body.username);
      if (!u || !checkPw(body.password || '', u.password))
        return send(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      const t = crypto.randomBytes(32).toString('hex');
      sessions.set(t, { username: u.username, role: u.role, expires: Date.now() + 12 * 3600e3 });
      return send(res, 200, { token: t });
    }
    if (part === 'logout' && method === 'POST') { sessions.delete(token); return send(res, 200, { ok: true }); }
    if (part === 'me' && method === 'GET') {
      if (!need('admin', 'staff')) return;
      return send(res, 200, { username: user.username, role: user.role });
    }

    if (part === 'menu') {
      if (method === 'GET' && !id) return send(res, 200, db.menu);
      if (!need('admin')) return;
      if (method === 'POST' && !id) {
        const item = cleanMenu(body);
        if (!item) return send(res, 400, { error: 'ข้อมูลเมนูไม่ถูกต้อง' });
        item.id = db.nextMenuId++;
        db.menu.push(item); save();
        return send(res, 201, item);
      }
      const i = db.menu.findIndex(x => x.id === Number(id));
      if (i < 0) return send(res, 404, { error: 'ไม่พบเมนู' });
      if (method === 'PUT') {
        const item = cleanMenu(body);
        if (!item) return send(res, 400, { error: 'ข้อมูลเมนูไม่ถูกต้อง' });
        item.id = db.menu[i].id;
        db.menu[i] = item; save();
        return send(res, 200, item);
      }
      if (method === 'DELETE') { db.menu.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    }

    if (part === 'orders') {
      if (method === 'POST' && !id) {
        const table = String(body.table || '').trim().slice(0, 20);
        if (!table) return send(res, 400, { error: 'กรุณาระบุหมายเลขโต๊ะ' });
        if (!Array.isArray(body.items) || !body.items.length) return send(res, 400, { error: 'ตะกร้าว่าง' });
        const lines = [];
        for (const it of body.items) {
          const mm = db.menu.find(x => x.id === Number(it.menuId) && x.available);
          const qty = Math.floor(Number(it.qty));
          if (!mm || !(qty > 0 && qty <= 99)) return send(res, 400, { error: 'มีรายการที่ไม่พร้อมขาย' });
          lines.push({ 
            menuId: mm.id, 
            name: mm.name, 
            price: mm.price, 
            qty: qty,
            note: String(it.note || '').slice(0, 150)
          });
        }
        const order = {
          id: db.nextOrderId++,
          table: table,
          items: lines,
          total: lines.reduce((s, l) => s + l.price * l.qty, 0),
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        db.orders.push(order); save();
        return send(res, 201, order);
      }
      if (method === 'GET' && id) {
        if (id === 'table') {
          const tbl = new URL(req.url, 'http://localhost').searchParams.get('no') || '';
          const tblOrders = db.orders.filter(x => x.table === tbl).slice(-50).reverse();
          return send(res, 200, tblOrders);
        }
        const o = db.orders.find(x => x.id === Number(id));
        return o ? send(res, 200, o) : send(res, 404, { error: 'ไม่พบออเดอร์' });
      }
      if (!need('admin', 'staff')) return;
      if (method === 'GET') return send(res, 200, db.orders.slice(-200).reverse());
      if (method === 'PATCH' && id) {
        const o = db.orders.find(x => x.id === Number(id));
        if (!o) return send(res, 404, { error: 'ไม่พบออเดอร์' });
        if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'สถานะไม่ถูกต้อง' });
        o.status = body.status; save();
        return send(res, 200, o);
      }
    }

    if (part === 'users') {
      if (!need('admin')) return;
      if (method === 'GET') return send(res, 200, db.users.map(u => ({ username: u.username, role: u.role })));
      if (method === 'POST') {
        const { username, password, role } = body;
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username || ''))
          return send(res, 400, { error: 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, _ ยาว 3-20 ตัว' });
        if (String(password || '').length < 6) return send(res, 400, { error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว' });
        if (!['admin', 'staff'].includes(role)) return send(res, 400, { error: 'สิทธิ์ไม่ถูกต้อง' });
        if (db.users.some(u => u.username === username)) return send(res, 400, { error: 'มีชื่อผู้ใช้นี้แล้ว' });
        db.users.push({ username: username, password: hashPw(password), role: role }); save();
        return send(res, 201, { username: username, role: role });
      }
      if (method === 'DELETE' && id) {
        const name = decodeURIComponent(id);
        if (name === user.username) return send(res, 400, { error: 'ลบบัญชีตัวเองไม่ได้' });
        db.users = db.users.filter(u => u.username !== name); save();
        for (const [t, s] of sessions) if (s.username === name) sessions.delete(t);
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: 'ไม่พบ API' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'เซิร์ฟเวอร์ผิดพลาด' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('===== เซิร์ฟเวอร์ทำงานแล้ว =====');
});

const CSS = `
:root { --primary: ${db.settings.theme}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f8f9fa; color: #212529; }
header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 14px 20px; background: var(--primary); color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
.brand { display: flex; align-items: center; gap: 10px; }
.brand img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #fff; }
header h1 { margin: 0; font-size: 1.4rem; }
main, #app { padding: 16px; max-width: 1200px; margin: 0 auto; }
.layout { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
@media (max-width: 850px) { .layout { grid-template-columns: 1fr; } }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.card, .panel { background: #fff; border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.06); border: 1px solid #edf2f7; }
.card img { width: 100%; height: 130px; object-fit: cover; border-radius: 8px; background: #eee; }
.card h3 { margin: 10px 0 4px; font-size: 1.05rem; }
.narrow { max-width: 420px; margin: 40px auto; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; gap: 8px; }
input, select, textarea { width: 100%; padding: 10px; margin: 6px 0; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
header input, label input[type=checkbox] { width: auto; }
button { padding: 8px 14px; margin: 2px 0; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; cursor: pointer; font: inherit; font-weight: 500; transition: opacity .2s; }
button:hover { opacity: .9; }
button:disabled { opacity: .4; cursor: default; }
button.primary { background: var(--primary); color: #fff; border: none; width: 100%; padding: 11px; margin-top: 8px; }
nav { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
nav button { background: #e2e8f0; border: none; }
nav button.active { background: var(--primary); color: #fff; }
table { width: 100%; margin-top: 12px; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
th, td { padding: 10px; border-bottom: 1px solid #edf2f7; text-align: left; font-size: 0.95rem; }
th { background: #f1f5f9; }
.muted { color: #64748b; }
.badge { padding: 3px 10px; border-radius: 20px; font-size: .8rem; color: #fff; font-weight: 600; }
.badge.pending { background: #f59e0b; } .badge.cooking { background: #06b6d4; }
.badge.served { background: #10b981; } .badge.cancelled { background: #64748b; }
.tag-rec { background: #ef4444; color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; display: inline-block; margin-bottom: 4px; }
[hidden] { display: none !important; }
@keyframes pulseOrder { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.55); } 70% { box-shadow: 0 0 0 10px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
.order-new { border-left: 5px solid #f59e0b !important; animation: pulseOrder 1.6s infinite; }
.order-new-tag { background: #f59e0b; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 3px 9px; border-radius: 10px; margin-right: 6px; animation: pulseOrder 1.6s infinite; }
.soundBar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
`;

const COMMON_JS = `
const $ = function (id) { return document.getElementById(id); };
const STATUS = { pending: 'รอรับออเดอร์', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
async function api(url, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error(data.error || 'เกิดข้อผิดพลาด'); err.status = r.status; throw err; }
  return data;
}
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    if (s.theme) document.documentElement.style.setProperty('--primary', s.theme);
    if (s.shopName && $('shopNameText')) $('shopNameText').textContent = s.shopName;
    document.querySelectorAll('.shopLogo').forEach(img => {
      if (s.logo) {
        img.onerror = function () { img.hidden = true; };
        img.src = s.logo;
        img.hidden = false;
      } else {
        img.hidden = true;
      }
    });
    window.currentSoundType = s.soundType || 'bell';
    window.currentCustomAudio = s.customAudio || '';
    window.currentSoundVol = Number(s.soundVolume || '1.0');
    window.currentLoopInterval = Number(s.loopInterval || '5') * 1000;
  } catch(e){}
}
loadSettings();
`;

const SHOP_BODY = `
<header>
  <div class="brand">
    <img class="shopLogo" hidden alt="Logo">
    <h1 id="shopNameText">🍜 ร้านอาหารของเรา</h1>
  </div>
  <label>โต๊ะ: <input id="table" size="4" onchange="localStorage.setItem('table', this.value); loadTableOrders();"></label>
</header>
<main class="layout">
  <section>
    <input id="searchBox" placeholder="🔍 ค้นหาเมนูอาหาร..." style="margin-bottom:14px; background:#fff;">
    <div id="menu"></div>
  </section>
  <aside class="panel">
    <h2>🛒 ตะกร้าสินค้า</h2>
    <div id="cart"></div>
    <p>รวมทั้งสิ้น: <b id="total" style="font-size:1.2rem; color:var(--primary);">0</b> บาท</p>
    <button id="orderBtn" class="primary">ยืนยันสั่งอาหาร</button>
    
    <h3 style="margin-top:20px;">📜 ออเดอร์ของโต๊ะนี้</h3>
    <div id="myTableOrders"></div>
  </aside>
</main>
`;

const SHOP_JS = `
const cart = {};
let menu = [];
$('table').value = new URLSearchParams(location.search).get('table') || localStorage.getItem('table') || '1';

async function loadMenu() {
  menu = await api('/api/menu');
  renderMenu(menu);
}

function renderMenu(list) {
  const keyword = ($('searchBox').value || '').toLowerCase().trim();
  const filtered = list.filter(m => m.available && (!keyword || m.name.toLowerCase().includes(keyword) || m.category.toLowerCase().includes(keyword)));
  
  const recs = filtered.filter(m => m.recommended);
  const others = filtered.filter(m => !m.recommended);
  
  let out = '';
  if (recs.length && !keyword) {
    out += '<h2 style="border-bottom:2px solid var(--primary); padding-bottom:6px; margin-top:10px; color:var(--primary);">🌟 เมนูแนะนำยอดฮิต</h2><div class="grid">';
    recs.forEach(m => out += cardHtml(m));
    out += '</div>';
  }

  const cats = {};
  others.forEach(m => { (cats[m.category] = cats[m.category] || []).push(m); });
  
  Object.keys(cats).forEach(cat => {
    out += '<h2 style="border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin-top:20px;">' + esc(cat) + '</h2><div class="grid">';
    cats[cat].forEach(m => out += cardHtml(m));
    out += '</div>';
  });

  $('menu').innerHTML = out || '<p>ไม่พบเมนูอาหารที่คุณค้นหา</p>';
  renderCart();
}

function cardHtml(m) {
  return '<div class="card">' +
    (m.image ? '<img src="' + esc(m.image) + '" alt="" onerror="this.style.display=\\'none\\'"> ' : '<div style="height:130px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.9rem;">ไม่มีรูปภาพ</div>') +
    (m.recommended ? '<span class="tag-rec">แนะนำ</span>' : '') +
    '<h3>' + esc(m.name) + '</h3><p style="color:var(--primary); font-weight:bold; margin:4px 0;">' + m.price + ' บาท</p>' +
    '<button class="primary" style="margin-top:6px; padding:8px;" onclick="add(' + m.id + ')">+ เพิ่มใส่ตะกร้า</button></div>';
}

$('searchBox').oninput = function() { renderMenu(menu); };

function add(id) {
  if (!cart[id]) cart[id] = { qty: 1, note: '' };
  else cart[id].qty++;
  renderCart();
}
function changeQty(id, d) {
  cart[id].qty += d;
  if (cart[id].qty <= 0) delete cart[id];
  renderCart();
}
function changeNote(id, val) {
  if (cart[id]) cart[id].note = val;
}

function renderCart() {
  let total = 0, out = '';
  Object.keys(cart).forEach(id => {
    const m = menu.find(x => x.id == id);
    if (!m || !m.available) { delete cart[id]; return; }
    total += m.price * cart[id].qty;
    out += '<div style="border-bottom:1px solid #edf2f7; padding:8px 0;">' +
      '<div class="row"><span><b>' + esc(m.name) + '</b></span><span>' +
      '<button onclick="changeQty(' + id + ',-1)">−</button> ' + cart[id].qty + ' ' +
      '<button onclick="changeQty(' + id + ',1)">+</button></span></div>' +
      '<input placeholder="หมายเหตุเฉพาะเมนูนี้ เช่น ไม่ใส่ผัก" value="' + esc(cart[id].note) + '" oninput="changeNote(' + id + ', this.value)" style="margin:4px 0 0; padding:6px; font-size:0.85rem;">' +
      '</div>';
  });
  $('cart').innerHTML = out || '<p class="muted">ยังไม่มีรายการในตะกร้า</p>';
  $('total').textContent = total;
}

$('orderBtn').onclick = async function () {
  const table = $('table').value.trim();
  if (!table) return alert('กรุณาใส่หมายเลขโต๊ะ');
  const items = Object.keys(cart).map(id => ({ menuId: Number(id), qty: cart[id].qty, note: cart[id].note }));
  if (!items.length) return alert('ตะกร้าว่างเปล่า');
  try {
    const order = await api('/api/orders', { method: 'POST', body: { table: table, items: items } });
    localStorage.setItem('table', table);
    Object.keys(cart).forEach(k => delete cart[k]);
    renderCart();
    loadTableOrders();
    alert('สั่งอาหารเรียบร้อย! เลขที่ออเดอร์ #' + order.id);
  } catch (e) { alert(e.message); }
};

async function loadTableOrders() {
  const table = $('table').value.trim();
  if (!table) return;
  try {
    const orders = await api('/api/orders/table?no=' + encodeURIComponent(table));
    $('myTableOrders').innerHTML = orders.map(o => {
      let s = '<div style="border-bottom:1px dashed #eee; padding:8px 0;"><div class="row"><span><b>#' + o.id + '</b> (' + o.total + '฿)</span><span class="badge ' + o.status + '">' + STATUS[o.status] + '</span></div><ul style="margin:4px 0; padding-left:18px; font-size:0.9rem;">';
      o.items.forEach(i => {
        s += '<li>' + esc(i.name) + ' × <b>' + i.qty + '</b>' + (i.note ? ' <span class="muted">(' + esc(i.note) + ')</span>' : '') + '</li>';
      });
      s += '</ul></div>';
      return s;
    }).join('') || '<p class="muted">- ยังไม่มีออเดอร์ของโต๊ะนี้ -</p>';
  } catch(e) {}
}
loadMenu();
loadTableOrders();
setInterval(loadTableOrders, 5000);
setInterval(loadMenu, 30000);
`;

const ADMIN_BODY = `
<header>
  <div class="brand">
    <img class="shopLogo" hidden alt="Logo">
    <h1>🔐 ระบบหลังร้าน</h1>
  </div>
  <span>
    <span id="who"></span> 
    <button id="stopAlertBtn" type="button" onclick="stopLoopAlert()" style="background:#ef4444; color:#fff; border:none; margin-left:6px;" hidden>🔕 หยุดเสียงเตือน</button>
    <button id="logoutBtn" type="button" hidden>ออกจากระบบ</button>
  </span>
</header>
<div id="loginBox" class="panel narrow">
  <h2>เข้าสู่ระบบ</h2>
  <input id="u" placeholder="ชื่อผู้ใช้" autocapitalize="off" autocomplete="username">
  <input id="p" type="password" placeholder="รหัสผ่าน" autocomplete="current-password">
  <button id="loginBtn" type="button" class="primary">เข้าสู่ระบบ</button>
</div>
<div id="app" hidden>
  <div id="soundUnlockBar" class="soundBar" hidden>
    <span>🔈 เบราว์เซอร์ต้องการให้คุณกดปุ่มนี้ 1 ครั้งก่อน เพื่อให้เสียงแจ้งเตือนทำงานได้ทันทีเมื่อมีออเดอร์ใหม่</span>
    <button type="button" class="primary" style="width:auto; margin:0;" onclick="enableSound()">🔊 เปิดใช้งานเสียงแจ้งเตือน</button>
  </div>
  <nav id="adminNav">
    <button data-tab="orders" class="active" onclick="switchTab('orders')">🛎️ ออเดอร์ลูกค้า</button>
    <button data-tab="menuTab" class="adminOnly" onclick="switchTab('menuTab')">🍲 จัดการเมนูอาหาร</button>
    <button data-tab="settingsTab" class="adminOnly" onclick="switchTab('settingsTab')">🎨 ตั้งค่าร้านและเสียง</button>
    <button data-tab="users" class="adminOnly" onclick="switchTab('users')">👥 จัดการผู้ใช้</button>
  </nav>

  <section id="orders" class="tab">
    <div class="panel" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button type="button" id="filterToday" onclick="setOrderDate('today')" class="primary" style="margin:0; width:auto;">ออเดอร์วันนี้</button>
        <button type="button" id="filterAll" onclick="setOrderDate('all')" style="margin:0; width:auto; background:#e2e8f0; border:none;">ประวัติทั้งหมด</button>
        <label style="margin:0; font-size:0.9rem;">เลือกดูตามวันที่: <input type="date" id="filterDateInput" onchange="setOrderDate('custom', this.value)" style="width:auto; display:inline-block; padding:6px; margin-left:4px;"></label>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <select id="filterTableSelect" onchange="loadOrders()" style="width:auto; padding:6px; margin:0;">
          <option value="">-- ทุกโต๊ะ --</option>
        </select>
        <button type="button" id="stopAlertBtn2" onclick="stopLoopAlert()" style="background:#ef4444; color:#fff; border:none; margin:0; width:auto;" hidden>🔕 หยุดเสียงเตือน</button>
      </div>
    </div>
    <p id="newOrderSummary" class="muted" style="margin:0 0 12px;"></p>
    <div id="ordersContainer" class="grid"></div>
  </section>

  <section id="menuTab" class="tab" hidden>
    <form id="quickMenuForm" class="panel" style="margin-bottom:16px; background:#f8fafc; border:1px dashed var(--primary);" onsubmit="submitQuickMenu(event)">
      <h3 style="margin-top:0; color:var(--primary);">⚡ เพิ่มเมนูด่วน (สำหรับร้านที่มีรายการเยอะ)</h3>
      <div style="display:grid; grid-template-columns: 2fr 1fr 1.5fr auto; gap:8px; align-items:center;">
        <input id="qName" placeholder="ชื่อเมนู" required style="margin:0;">
        <input id="qPrice" type="number" min="0" placeholder="ราคา" required style="margin:0;">
        <input id="qCat" placeholder="หมวดหมู่" required style="margin:0;">
        <button type="submit" class="primary" style="margin:0; padding:10px 16px;">+ เพิ่มทันที</button>
      </div>
    </form>

    <form id="menuForm" class="panel" style="margin-bottom:20px;" onsubmit="submitMenuForm(event)">
      <h3>รายละเอียดและรูปภาพเมนู (แก้ไขแบบละเอียด)</h3>
      <input type="hidden" id="mId">
      <input id="mName" placeholder="ชื่อเมนูอาหาร" required>
      <input id="mPrice" type="number" min="0" placeholder="ราคา (บาท)" required>
      <input id="mCat" placeholder="หมวดหมู่ เช่น อาหารจานเดียว, เครื่องดื่ม" required>
      
      <label style="display:block; margin-top:8px;">อัปโหลดรูปภาพจากในเครื่อง หรือวางลิงก์:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="file" id="mFile" accept="image/*" style="padding:6px;" onchange="handleFile(event)">
        <input id="mImg" placeholder="หรือวาง URL รูปภาพ" style="margin:0;">
      </div>
      
      <div style="display:flex; gap:20px; margin:12px 0;">
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mAvail" checked> เปิดขายเมนูนี้</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mRec"> 🌟 ตั้งเป็นเมนูแนะนำ (ขึ้นโชว์ด้านบน)</label>
      </div>
      <button type="submit" class="primary">บันทึกการแก้ไขเมนู</button>
      <button type="button" id="mReset" onclick="resetMenuForm()" style="width:100%; margin-top:6px;">ล้างฟอร์ม</button>
    </form>
    <h3>รายการเมนูทั้งหมดในระบบ</h3>
    <div style="overflow-x:auto;"><table id="menuTable"></table></div>
  </section>

  <section id="settingsTab" class="tab" hidden>
    <div class="panel narrow" style="max-width:500px;">
      <h3>🎨 ตั้งค่าร้าน โลโก้ และเสียงเตือน</h3>
      <label>ชื่อร้านอาหาร:</label>
      <input id="setName" placeholder="ชื่อร้าน">
      
      <label style="margin-top:10px; display:block;">โลโก้ร้าน (อัปโหลดจากเครื่อง):</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="file" id="logoFile" accept="image/*" style="padding:6px;" onchange="handleLogoFile(event)">
        <input id="setLogo" placeholder="หรือวาง URL โลโก้" style="margin:0;">
      </div>
      <div style="margin-top:8px;"><img id="logoPreview" hidden style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0;" alt="ตัวอย่างโลโก้"></div>

      <label style="margin-top:10px; display:block;">เลือกโทนสีหลักของร้าน:</label>
      <div style="display:flex; gap:10px; margin:8px 0;">
        <input type="color" id="setTheme" value="#e85d04" style="height:40px; padding:2px; cursor:pointer;">
        <button type="button" onclick="document.getElementById('setTheme').value='#e85d04'">ส้ม</button>
        <button type="button" onclick="document.getElementById('setTheme').value='#dc2626'">แดง</button>
        <button type="button" onclick="document.getElementById('setTheme').value='#0284c7'">น้ำเงิน</button>
        <button type="button" onclick="document.getElementById('setTheme').value='#059669'">เขียว</button>
      </div>

      <label style="margin-top:12px; display:block;">รูปแบบเสียงแจ้งเตือนออเดอร์:</label>
      <select id="setSound" style="margin-top:4px;">
        <option value="bell">🛎️ เสียงกระดิ่งกริ่ง (Bell)</option>
        <option value="beep">🔔 เสียงดิจิทัลบี๊บ (Beep)</option>
        <option value="alarm">🚨 เสียงเตือนรัว (Alarm)</option>
        <option value="custom">🎵 เสียงอัปโหลดของคุณเอง (Custom Audio)</option>
      </select>

      <label style="margin-top:10px; display:block;">อัปโหลดไฟล์เสียงแจ้งเตือนของคุณเอง (MP3/WAV):</label>
      <input type="file" id="audioFile" accept="audio/*" style="padding:6px;" onchange="handleAudioFile(event)">
      <input id="setCustomAudio" placeholder="หรือลิงก์ไฟล์เสียง / Base64" style="font-size:0.85rem; margin-top:4px;">

      <label style="margin-top:10px; display:block;">ระดับความดังเสียง (Volume):</label>
      <select id="setVol" style="margin-top:4px;">
        <option value="0.5">ระดับ 1 (ปานกลาง)</option>
        <option value="1.0">ระดับ 2 (ดัง)</option>
        <option value="2.0">ระดับ 3 (ดังมาก - เร่งโวลุ่มพิเศษ)</option>
      </select>

      <label style="margin-top:10px; display:block;">ระยะเวลาวนลูปเสียงเตือน (วินาที):</label>
      <select id="setLoopInterval" style="margin-top:4px;">
        <option value="3">ทุก 3 วินาที (เร็ว)</option>
        <option value="5">ทุก 5 วินาที (ปานกลาง)</option>
        <option value="10">ทุก 10 วินาที (ช้าลงหน่อย)</option>
        <option value="15">ทุก 15 วินาที</option>
      </select>

      <button type="button" onclick="testSound()" style="width:100%; margin-top:8px; background:#f1f5f9;">🔊 ทดสอบเสียงแจ้งเตือน</button>
      <button type="button" onclick="saveSettings()" class="primary" style="margin-top:15px;">บันทึกการตั้งค่าทั้งหมด</button>
    </div>
  </section>

  <section id="users" class="tab" hidden>
    <form id="userForm" class="panel narrow" style="max-width:500px; margin-bottom:20px;" onsubmit="submitUserForm(event)">
      <h3>เพิ่มบัญชีพนักงาน / ผู้ดูแล</h3>
      <input id="nu" placeholder="ชื่อผู้ใช้ (a-z, 0-9, _)" autocapitalize="off" required>
      <input id="np" type="password" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" required>
      <select id="nr">
        <option value="staff">พนักงาน (ดู/เปลี่ยนสถานะออเดอร์)</option>
        <option value="admin">ผู้ดูแล (จัดการเมนูและตั้งค่าได้)</option>
      </select>
      <button type="submit" class="primary" style="margin-top:10px;">เพิ่มผู้ใช้ระบบ</button>
    </form>
    <h3>รายชื่อผู้มีสิทธิ์ใช้งาน</h3>
    <div style="overflow-x:auto;"><table id="userTable"></table></div>
  </section>
</div>
`;

const ADMIN_JS = `
let me = null, menuData = [], allOrdersCache = [];
let lastOrderCount = -1;
let loopAlertTimer = null;
let currentFilterMode = 'today';
let currentFilterDateVal = '';
let sharedAudioCtx = null;
let soundUnlocked = false;
window.currentSoundType = 'bell';
window.currentCustomAudio = '';
window.currentSoundVol = 1.0;
window.currentLoopInterval = 5000;

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) { $('mImg').value = evt.target.result; };
  reader.readAsDataURL(file);
}

function handleLogoFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    $('setLogo').value = evt.target.result;
    const prev = $('logoPreview');
    if (prev) { prev.src = evt.target.result; prev.hidden = false; }
  };
  reader.readAsDataURL(file);
}

function handleAudioFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) { 
    $('setCustomAudio').value = evt.target.result; 
    $('setSound').value = 'custom';
  };
  reader.readAsDataURL(file);
}

function getCtx() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(()=>{});
  return sharedAudioCtx;
}

function enableSound() {
  try {
    getCtx();
    // play a near-silent tick to fully unlock on some browsers
    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.001;
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.05);
    soundUnlocked = true;
    if ($('soundUnlockBar')) $('soundUnlockBar').hidden = true;
    playSound(window.currentSoundType, window.currentSoundVol, window.currentCustomAudio);
  } catch(e) {}
}

function playSound(type, vol, customData) {
  try {
    const multiplier = Number(vol || 1.0);
    if (type === 'custom' && customData) {
      const audio = new Audio(customData);
      audio.volume = Math.min(Math.max(multiplier * 0.5, 0.1), 1.0);
      audio.play().catch(() => {
        if ($('soundUnlockBar') && !soundUnlocked) $('soundUnlockBar').hidden = false;
      });
      return;
    }

    const ctx = getCtx();
    const now = ctx.currentTime;
    const gainNode = ctx.createGain();

    if (type === 'beep') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.setValueAtTime(1000, now + 0.15);
      gainNode.gain.setValueAtTime(0.4 * multiplier, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gainNode); gainNode.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'alarm') {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now + (i * 0.15));
        osc.frequency.setValueAtTime(1200, now + (i * 0.15) + 0.08);
        g.gain.setValueAtTime(0.4 * multiplier, now + (i * 0.15));
        g.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.15) + 0.12);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now + (i * 0.15)); osc.stop(now + (i * 0.15) + 0.12);
      }
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.6);
      gainNode.gain.setValueAtTime(0.5 * multiplier, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gainNode); gainNode.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.6);
    }
    if ($('soundUnlockBar')) $('soundUnlockBar').hidden = true;
    soundUnlocked = true;
  } catch(e) {
    if ($('soundUnlockBar') && !soundUnlocked) $('soundUnlockBar').hidden = false;
  }
}

function startLoopAlert() {
  playSound(window.currentSoundType, window.currentSoundVol, window.currentCustomAudio);
  if (loopAlertTimer) return;
  loopAlertTimer = setInterval(() => {
    playSound(window.currentSoundType, window.currentSoundVol, window.currentCustomAudio);
  }, window.currentLoopInterval || 5000);
  if ($('stopAlertBtn')) $('stopAlertBtn').hidden = false;
  if ($('stopAlertBtn2')) $('stopAlertBtn2').hidden = false;
}

function stopLoopAlert() {
  if (loopAlertTimer) {
    clearInterval(loopAlertTimer);
    loopAlertTimer = null;
  }
  if ($('stopAlertBtn')) $('stopAlertBtn').hidden = true;
  if ($('stopAlertBtn2')) $('stopAlertBtn2').hidden = true;
}

function testSound() {
  const t = $('setSound') ? $('setSound').value : 'bell';
  const v = $('setVol') ? $('setVol').value : '1.0';
  const ca = $('setCustomAudio') ? $('setCustomAudio').value : '';
  playSound(t, v, ca);
}

async function init() {
  try { me = await api('/api/me'); } catch (e) { me = null; localStorage.removeItem('token'); }
  $('loginBox').hidden = !!me;
  $('app').hidden = !me;
  $('logoutBtn').hidden = !me;
  $('who').textContent = me ? me.username + ' (' + (me.role === 'admin' ? 'ผู้ดูแล' : 'พนักงาน') + ')' : '';
  if (!me) return;
  document.querySelectorAll('.adminOnly').forEach(el => { el.hidden = me.role !== 'admin'; });
  if ($('soundUnlockBar')) $('soundUnlockBar').hidden = false;
  switchTab('orders');
  loadOrders();
  loadSettingsForm();
  if (me.role === 'admin') { loadMenu(); loadUsers(); }
}

document.addEventListener('DOMContentLoaded', () => {
  $('loginBtn').onclick = async function () {
    try {
      const r = await api('/api/login', { method: 'POST', body: { username: $('u').value.trim(), password: $('p').value } });
      localStorage.setItem('token', r.token);
      $('p').value = '';
      init();
    } catch (e) { alert(e.message); }
  };
  // any click/keypress anywhere unlocks audio for subsequent auto-played alerts
  document.addEventListener('click', function initAudioOnce() {
    try { getCtx(); } catch(e) {}
  }, { once: false });
});

$('logoutBtn').onclick = async function () {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  localStorage.removeItem('token');
  stopLoopAlert();
  init();
};

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== tabId; });
  document.querySelectorAll('#adminNav button').forEach(b => {
    if(b.dataset.tab === tabId) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function setOrderDate(mode, val) {
  currentFilterMode = mode;
  if (mode === 'today') {
    $('filterToday').className = 'primary';
    $('filterAll').style.background = '#e2e8f0'; $('filterAll').style.color = '#212529';
    $('filterDateInput').value = '';
  } else if (mode === 'all') {
    $('filterAll').className = 'primary';
    $('filterToday').style.background = '#e2e8f0'; $('filterToday').style.color = '#212529';
    $('filterDateInput').value = '';
  } else if (mode === 'custom') {
    currentFilterDateVal = val;
    $('filterToday').style.background = '#e2e8f0'; $('filterToday').style.color = '#212529';
    $('filterAll').style.background = '#e2e8f0'; $('filterAll').style.color = '#212529';
  }
  renderOrdersView();
}

async function loadOrders() {
  if (!me) return;
  try {
    const orders = await api('/api/orders');
    allOrdersCache = orders;
    
    const tables = [...new Set(orders.map(o => o.table))].sort();
    const sel = $('filterTableSelect');
    const curSel = sel.value;
    let optHtml = '<option value="">-- ทุกโต๊ะ --</option>';
    tables.forEach(t => { optHtml += '<option value="' + esc(t) + '">โต๊ะ ' + esc(t) + '</option>'; });
    sel.innerHTML = optHtml;
    sel.value = curSel;

    const hasPending = orders.some(o => o.status === 'pending');
    if (lastOrderCount !== -1 && orders.length > lastOrderCount) {
      startLoopAlert();
    } else if (hasPending && !loopAlertTimer) {
      // there are still unreceived orders but the alert isn't running (e.g. page just loaded) - keep nagging
      startLoopAlert();
    } else if (!hasPending) {
      stopLoopAlert();
    }
    lastOrderCount = orders.length;

    renderOrdersView();
  } catch (e) { if (e.status === 401) init(); }
}

function renderOrdersView() {
  const selectedTable = $('filterTableSelect').value;
  const todayStr = new Date().toISOString().split('T')[0];

  let filtered = allOrdersCache.filter(o => {
    if (selectedTable && o.table !== selectedTable) return false;
    const oDate = o.createdAt.split('T')[0];
    if (currentFilterMode === 'today') return oDate === todayStr;
    if (currentFilterMode === 'custom' && currentFilterDateVal) return oDate === currentFilterDateVal;
    return true;
  });

  // ออเดอร์ที่ยังไม่ได้รับ (pending) ให้ขึ้นก่อนเสมอ
  filtered = filtered.slice().sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1;
    const pb = b.status === 'pending' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const pendingCount = filtered.filter(o => o.status === 'pending').length;
  $('newOrderSummary').textContent = pendingCount > 0 ? '🆕 มีออเดอร์ที่ยังไม่ได้รับ ' + pendingCount + ' รายการ' : 'ไม่มีออเดอร์ใหม่ที่ค้างอยู่';

  $('ordersContainer').innerHTML = filtered.map(o => {
    const isNew = o.status === 'pending';
    let s = '<div class="panel' + (isNew ? ' order-new' : '') + '" style="border-left:5px solid var(--primary);"><div class="row">' +
      '<b>' + (isNew ? '<span class="order-new-tag">🆕 ใหม่</span>' : '') + '#' + o.id + ' โต๊ะ ' + esc(o.table) + '</b>' +
      '<span class="badge ' + o.status + '">' + STATUS[o.status] + '</span></div>' +
      '<small class="muted">' + new Date(o.createdAt).toLocaleString('th-TH') + '</small><ul style="margin:8px 0; padding-left:20px;">';
    o.items.forEach(i => { 
      s += '<li>' + esc(i.name) + ' × <b>' + i.qty + '</b>' + (i.note ? ' <span class="muted">(' + esc(i.note) + ')</span>' : '') + '</li>'; 
    });
    s += '</ul><p style="margin:8px 0;"><b>รวมราคาทั้งสิ้น: ' + o.total + ' บาท</b></p><div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:8px;">';
    
    Object.keys(STATUS).forEach(k => {
      s += '<button type="button" data-id="' + o.id + '" data-s="' + k + '" onclick="setStatus(this)" style="font-size:0.8rem; padding:5px 10px;"' +
        (k === o.status ? ' disabled style="background:#cbd5e1; border-color:#cbd5e1;"' : '') + '>' + STATUS[k] + '</button> ';
    });
    return s + '</div></div>';
  }).join('') || '<p>ยังไม่มีรายการออเดอร์ในเงื่อนไขนี้</p>';
}

async function setStatus(btn) {
  try { 
    await api('/api/orders/' + btn.dataset.id, { method: 'PATCH', body: { status: btn.dataset.s } }); 
    loadOrders(); 
  } catch (e) { alert(e.message); }
}
setInterval(loadOrders, 4000);

async function loadMenu() {
  menuData = await api('/api/menu');
  let s = '<tr><th>รูป</th><th>ชื่อเมนู</th><th>ราคา</th><th>หมวด</th><th>สถานะ</th><th>จัดการ</th></tr>';
  menuData.forEach(m => {
    s += '<tr>' +
      '<td>' + (m.image ? '<img src="' + esc(m.image) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" onerror="this.style.display=\\'none\\'">' : '-') + '</td>' +
      '<td><b>' + esc(m.name) + '</b> ' + (m.recommended ? '<span style="color:red; font-size:0.8rem;">(แนะนำ)</span>' : '') + '</td>' +
      '<td>' + m.price + '฿</td><td>' + esc(m.category) + '</td>' +
      '<td>' + (m.available ? '<span style="color:green;">พร้อมขาย</span>' : '<span style="color:red;">หมด</span>') + '</td>' +
      '<td><button type="button" onclick="editMenu(' + m.id + ')">แก้ไข</button> <button type="button" onclick="delMenu(' + m.id + ')" style="color:red;">ลบ</button></td></tr>';
  });
  $('menuTable').innerHTML = s;
}

async function submitQuickMenu(e) {
  e.preventDefault();
  const body = {
    name: $('qName').value.trim(),
    price: Number($('qPrice').value),
    category: $('qCat').value.trim(),
    image: '',
    available: true,
    recommended: false
  };
  try {
    await api('/api/menu', { method: 'POST', body: body });
    $('qName').value = ''; $('qPrice').value = '';
    loadMenu();
    alert('เพิ่มเมนูด่วนสำเร็จ!');
  } catch(err) { alert(err.message); }
}

function editMenu(id) {
  const m = menuData.find(x => x.id === id);
  $('mId').value = m.id; $('mName').value = m.name; $('mPrice').value = m.price;
  $('mCat').value = m.category; $('mImg').value = m.image || ''; 
  $('mAvail').checked = m.available; $('mRec').checked = !!m.recommended;
  window.scrollTo({ top: 300, behavior: 'smooth' });
}
function resetMenuForm() { $('menuForm').reset(); $('mId').value = ''; }

async function submitMenuForm(e) {
  e.preventDefault();
  const body = { name: $('mName').value, price: Number($('mPrice').value), category: $('mCat').value,
                 image: $('mImg').value, available: $('mAvail').checked, recommended: $('mRec').checked };
  try {
    if ($('mId').value) await api('/api/menu/' + $('mId').value, { method: 'PUT', body: body });
    else await api('/api/menu', { method: 'POST', body: body });
    resetMenuForm();
    loadMenu();
    alert('บันทึกเมนูสำเร็จ!');
  } catch (err) { alert(err.message); }
}

async function delMenu(id) {
  if (!confirm('ต้องการลบเมนูนี้ใช่หรือไม่?')) return;
  try { await api('/api/menu/' + id, { method: 'DELETE' }); loadMenu(); } catch (e) { alert(e.message); }
}

async function loadSettingsForm() {
  try {
    const s = await api('/api/settings');
    if (s.theme && $('setTheme')) $('setTheme').value = s.theme;
    if (s.shopName && $('setName')) $('setName').value = s.shopName;
    if (s.logo && $('setLogo')) {
      $('setLogo').value = s.logo;
      const prev = $('logoPreview');
      if (prev) { prev.src = s.logo; prev.hidden = false; }
    }
    if (s.soundType && $('setSound')) $('setSound').value = s.soundType;
    if (s.customAudio && $('setCustomAudio')) $('setCustomAudio').value = s.customAudio;
    if (s.soundVolume && $('setVol')) $('setVol').value = s.soundVolume;
    if (s.loopInterval && $('setLoopInterval')) $('setLoopInterval').value = s.loopInterval;
    
    window.currentSoundType = s.soundType || 'bell';
    window.currentCustomAudio = s.customAudio || '';
    window.currentSoundVol = Number(s.soundVolume || '1.0');
    window.currentLoopInterval = Number(s.loopInterval || '5') * 1000;
  } catch(e){}
}

async function saveSettings() {
  try {
    const body = {
      theme: $('setTheme').value,
      shopName: $('setName').value,
      logo: $('setLogo').value,
      soundType: $('setSound').value,
      customAudio: $('setCustomAudio').value,
      soundVolume: $('setVol').value,
      loopInterval: $('setLoopInterval').value
    };
    const res = await api('/api/settings', { method: 'PUT', body: body });
    document.documentElement.style.setProperty('--primary', res.theme);
    if ($('shopNameText')) $('shopNameText').textContent = res.shopName;
    document.querySelectorAll('.shopLogo').forEach(img => {
      if(res.logo) { img.onerror = function(){ img.hidden = true; }; img.src = res.logo; img.hidden = false; } else { img.hidden = true; }
    });
    window.currentSoundType = res.soundType;
    window.currentCustomAudio = res.customAudio;
    window.currentSoundVol = Number(res.soundVolume);
    window.currentLoopInterval = Number(res.loopInterval || '5') * 1000;

    alert('บันทึกการตั้งค่าสำเร็จ!');
  } catch(e) { alert(e.message); }
}

async function loadUsers() {
  const users = await api('/api/users');
  let s = '<tr><th>ชื่อผู้ใช้</th><th>ระดับสิทธิ์</th><th>จัดการ</th></tr>';
  users.forEach(u => {
    s += '<tr><td><b>' + esc(u.username) + '</b></td><td>' + (u.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'พนักงาน (Staff)') + '</td><td>' +
      (u.username !== me.username ? '<button type="button" data-u="' + esc(u.username) + '" onclick="delUser(this.dataset.u)" style="color:red;">ลบ</button>' : '<span class="muted">บัญชีของคุณ</span>') +
      '</td></tr>';
  });
  $('userTable').innerHTML = s;
}

async function submitUserForm(e) {
  e.preventDefault();
  try {
    await api('/api/users', { method: 'POST', body: { username: $('nu').value.trim(), password: $('np').value, role: $('nr').value } });
    $('userForm').reset();
    loadUsers();
    alert('เพิ่มผู้ใช้สำเร็จ!');
  } catch (err) { alert(err.message); }
}

async function delUser(name) {
  if (!confirm('ต้องการลบบัญชี ' + name + '?')) return;
  try { await api('/api/users/' + encodeURIComponent(name), { method: 'DELETE' }); loadUsers(); }
  catch (e) { alert(e.message); }
}
init();
`;

function page(title, bodyHtml, script) {
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + title + '</title><style>' + CSS + '</style></head><body>' +
    bodyHtml + '<script>' + COMMON_JS + script + '</script></body></html>';
}
const SHOP_PAGE = page('สั่งอาหาร', SHOP_BODY, SHOP_JS);
const ADMIN_PAGE = page('หลังร้าน', ADMIN_BODY, ADMIN_JS);
