// ===== ระบบสั่งอาหารร้านค้า: MongoDB Atlas + Auto-Migration จาก 3 JSONBins + Screen Wake Lock =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

const SPICE_LEVELS = ['ไม่พริก', 'เผ็ดน้อย', 'เผ็ดกลาง', 'เผ็ดมาก'];

function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const a = crypto.scryptSync(String(pw), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidImageStr(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.startsWith('data:image/')) {
    return s.length > 200;
  }
  return s.startsWith('http://') || s.startsWith('https://');
}

// Mongoose Schema สำหรับ MongoDB Atlas
const storeDataSchema = new mongoose.Schema({
  key: { type: String, default: 'main_store' },
  users: Array,
  sessions: Object,
  menu: Array,
  orders: Array,
  tables: Array,
  options: Array,
  toppings: Array,
  settings: Object,
  images: Object,
  nextMenuId: Number,
  nextOrderId: Number,
  nextOptionId: Number,
  nextToppingId: Number
}, { timestamps: true, strict: false });

const StoreModel = mongoose.model('StoreData', storeDataSchema);

let db = {
  users: [{ username: 'admin', password: hashPw('admin123'), role: 'admin' }],
  sessions: {},
  menu: [],
  orders: [],
  tables: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  options: [], 
  settings: { 
    theme: '#e85d04', 
    shopName: 'เลยมาตำ', 
    logo: '', 
    soundType: 'bell', 
    customAudio: '', 
    soundVolume: '1.0', 
    loopInterval: '5',
    categoryOrder: [] 
  },
  nextMenuId: 1,
  nextOrderId: 1,
  nextOptionId: 1,
  toppings: [],
  nextToppingId: 1,
  images: {} 
};

    await StoreModel.updateOne(
      { key: 'main_store' },
      { $set: { key: 'main_store', ...mergedData } },
      { upsert: true }
    );
    console.log(`🎉 ✅ ย้ายข้อมูลสำเร็จ! ดึง Toppings เข้ามาได้ทั้งหมด ${toppingsList.length} รายการ`);
  } catch (e) {
    console.error('❌ Migration Error:', e.message);
  }
}

async function initStorage() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ เชื่อมต่อ MongoDB Atlas สำเร็จ');

    let record = await StoreModel.findOne({ key: 'main_store' });

    if (record) {
      if (record.users) db.users = record.users;
      if (record.sessions) db.sessions = record.sessions;
      if (record.menu) db.menu = record.menu;
      if (record.orders) db.orders = record.orders;
      if (record.tables) db.tables = record.tables;
      if (record.options) db.options = record.options;
      if (record.toppings) db.toppings = record.toppings;
      if (record.settings) db.settings = { ...db.settings, ...record.settings };
      if (record.images) db.images = record.images;
      if (record.nextMenuId) db.nextMenuId = record.nextMenuId;
      if (record.nextOrderId) db.nextOrderId = record.nextOrderId;
      if (record.nextOptionId) db.nextOptionId = record.nextOptionId;
      if (record.nextToppingId) db.nextToppingId = record.nextToppingId;
    }

    if (!db.users || db.users.length === 0) {
      db.users = [{ username: 'admin', password: hashPw('admin123'), role: 'admin' }];
    } else {
      const adminUser = db.users.find(u => u.username === 'admin');
      if (!adminUser) db.users.push({ username: 'admin', password: hashPw('admin123'), role: 'admin' });
    }

    if (!db.sessions) db.sessions = {};
    if (!db.menu) db.menu = [];
    if (!db.orders) db.orders = [];
    if (!db.tables) db.tables = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    if (!db.toppings) db.toppings = [];
    if (!db.options) db.options = [];
    if (!db.settings) db.settings = {};
    if (!db.images) db.images = {};

    save();
  } catch (err) {
    console.error('❌ initStorage Error:', err.message);
  }
}


// 🟢 ฟังก์ชันบันทึกข้อมูลลง MongoDB Atlas (แก้ไข async/await ถูกต้อง)
let saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await StoreModel.updateOne(
        { key: 'main_store' },
        { 
          $set: {
            users: db.users,
            sessions: db.sessions,
            menu: db.menu,
            orders: db.orders,
            tables: db.tables,
            options: db.options,
            toppings: db.toppings,
            settings: db.settings,
            images: db.images,
            nextMenuId: db.nextMenuId,
            nextOrderId: db.nextOrderId,
            nextOptionId: db.nextOptionId,
            nextToppingId: db.nextToppingId
          }
        },
        { upsert: true }
      );
      console.log('✅ บันทึกข้อมูลลง MongoDB Atlas เรียบร้อย');
    } catch (e) {
      console.error('❌ บันทึกข้อมูลลง MongoDB ล้มเหลว:', e.message);
    }
  }, 1000);
}

// เชื่อมโยงฟังก์ชันเซฟเดิมทั้งหมดเข้ากับระบบ MongoDB
function saveMenu() { save(); }
function saveToppings() { save(); }
function saveImages() { save(); }

function getMenuWithImages() {
  return db.menu.map(m => ({
    ...m,
    image: (isValidImageStr(db.images['menu_' + m.id]) ? db.images['menu_' + m.id] : (isValidImageStr(m.image) ? m.image : ''))
  }));
}
function getSettingsWithLogo() {
  return {
    ...db.settings,
    logo: (isValidImageStr(db.images['logo']) ? db.images['logo'] : (isValidImageStr(db.settings.logo) ? db.settings.logo : ''))
  };
}

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
  const toppingIds = Array.isArray(b.toppings)
    ? b.toppings.map(Number).filter(id => db.toppings.some(t => t.id === id))
    : [];
  const optionIds = Array.isArray(b.options)
    ? b.options.map(Number).filter(id => db.options.some(o => o.id === id))
    : [];
  return {
    name: name.slice(0, 100),
    price: price,
    category: String(b.category || '').trim() || 'อื่นๆ',
    image: String(b.image || '').trim(),
    available: b.available !== false,
    recommended: !!b.recommended,
    hasPlaraOption: !!b.hasPlaraOption,
    hasSpiceOption: !!b.hasSpiceOption,
    hasToppingOption: !!b.hasToppingOption,
    hasOptionChoice: !!b.hasOptionChoice,
    toppings: toppingIds,
    options: optionIds
  };
}
function cleanTopping(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return { name: name.slice(0, 60), price: price, category: String(b.category || '').trim() || 'ท็อปปิ้งทั่วไป' };
}
function cleanOption(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return { name: name.slice(0, 60), price: price, groupName: String(b.groupName || '').trim() || 'ตัวเลือกทั่วไป' };
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
    
    const sess = db.sessions ? db.sessions[token] : null;
    const user = sess && sess.expires > Date.now() ? sess : null;

    const need = (...roles) => {
      if (!user) { send(res, 401, { error: 'กรุณาเข้าสู่ระบบ' }); return false; }
      if (!roles.includes(user.role)) { send(res, 403, { error: 'คุณไม่มีสิทธิ์ทำรายการนี้' }); return false; }
      return true;
    };
    const [, part, id] = p.split('/').filter(Boolean);

    if (part === 'tables') {
      if (method === 'GET') return send(res, 200, db.tables);
      if (!need('admin')) return;
      if (method === 'POST') {
        const tableName = String(body.name || '').trim();
        if (!tableName) return send(res, 400, { error: 'กรุณาระบุชื่อหรือหมายเลขโต๊ะ' });
        if (db.tables.includes(tableName)) return send(res, 400, { error: 'มีโต๊ะนี้อยู่ในระบบแล้ว' });
        db.tables.push(tableName);
        db.tables.sort((a, b) => String(a).localeCompare(String(b), 'th', { numeric: true }));
        save();
        return send(res, 201, db.tables);
      }
      if (method === 'DELETE' && id) {
        const tableName = decodeURIComponent(id);
        db.tables = db.tables.filter(t => t !== tableName);
        save();
        return send(res, 200, db.tables);
      }
    }

    if (part === 'toppings') {
      if (method === 'GET') return send(res, 200, db.toppings);
      if (!need('admin')) return;
      if (method === 'POST' && !id) {
        const t = cleanTopping(body);
        if (!t) return send(res, 400, { error: 'ข้อมูลท็อปปิ้งไม่ถูกต้อง' });
        t.id = db.nextToppingId++;
        db.toppings.push(t); 
        save();
        return send(res, 201, t);
      }
      if (method === 'DELETE' && id) {
        const tid = Number(id);
        db.toppings = db.toppings.filter(t => t.id !== tid);
        db.menu.forEach(m => { m.toppings = (m.toppings || []).filter(x => x !== tid); });
        save();
        return send(res, 200, db.toppings);
      }
    }

    if (part === 'options') {
      if (method === 'GET') return send(res, 200, db.options);
      if (!need('admin')) return;
      if (method === 'POST' && !id) {
        const o = cleanOption(body);
        if (!o) return send(res, 400, { error: 'ข้อมูลตัวเลือกไม่ถูกต้อง' });
        o.id = db.nextOptionId++;
        db.options.push(o); 
        save();
        return send(res, 201, o);
      }
      if (method === 'DELETE' && id) {
        const oid = Number(id);
        db.options = db.options.filter(o => o.id !== oid);
        db.menu.forEach(m => { m.options = (m.options || []).filter(x => x !== oid); });
        save();
        return send(res, 200, db.options);
      }
    }

    if (part === 'settings' && method === 'GET') return send(res, 200, getSettingsWithLogo());
    if (part === 'settings' && method === 'PUT') {
      if (!need('admin')) return;
      if (body.theme) db.settings.theme = String(body.theme);
      if (body.shopName) db.settings.shopName = String(body.shopName);
      if (body.logo && isValidImageStr(body.logo)) {
        db.images['logo'] = String(body.logo).trim();
      }
      if (body.soundType) db.settings.soundType = String(body.soundType);
      if (body.customAudio !== undefined) db.settings.customAudio = String(body.customAudio);
      if (body.soundVolume) db.settings.soundVolume = String(body.soundVolume);
      if (body.loopInterval) db.settings.loopInterval = String(body.loopInterval);
      if (Array.isArray(body.categoryOrder)) db.settings.categoryOrder = body.categoryOrder;
      save();
      return send(res, 200, getSettingsWithLogo());
    }

    if (part === 'login' && method === 'POST') {
      const u = db.users.find(x => x.username === body.username);
      if (!u || !checkPw(body.password || '', u.password))
        return send(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      
      const t = crypto.randomBytes(32).toString('hex');
      if (!db.sessions) db.sessions = {};
      db.sessions[t] = { username: u.username, role: u.role, expires: Date.now() + 12 * 3600e3 };
      save();

      return send(res, 200, { token: t });
    }
    if (part === 'logout' && method === 'POST') {
      if (db.sessions && token) delete db.sessions[token];
      save();
      return send(res, 200, { ok: true });
    }
    if (part === 'me' && method === 'GET') {
      if (!need('admin', 'staff')) return;
      return send(res, 200, { username: user.username, role: user.role });
    }

    if (part === 'menu') {
      if (method === 'GET' && !id) return send(res, 200, getMenuWithImages());
      if (!need('admin')) return;
      if (method === 'POST' && !id) {
        const item = cleanMenu(body);
        if (!item) return send(res, 400, { error: 'ข้อมูลเมนูไม่ถูกต้อง' });
        if (!db.nextMenuId) db.nextMenuId = Math.max(...db.menu.map(m => m.id), 0) + 1;
        item.id = db.nextMenuId++;
        
        if (item.image && isValidImageStr(item.image)) {
          db.images['menu_' + item.id] = item.image;
        }
        
        db.menu.push(item); 
        save();
        return send(res, 201, { ...item, image: db.images['menu_' + item.id] || '' });
      }
      const i = db.menu.findIndex(x => x.id === Number(id));
      if (i < 0) return send(res, 404, { error: 'ไม่พบเมนู' });
      if (method === 'PUT') {
        const item = cleanMenu(body);
        if (!item) return send(res, 400, { error: 'ข้อมูลเมนูไม่ถูกต้อง' });
        item.id = db.menu[i].id;

        if (body.image && isValidImageStr(body.image)) {
          db.images['menu_' + item.id] = body.image.trim();
        }

        db.menu[i] = item; 
        save();
        return send(res, 200, { ...item, image: db.images['menu_' + item.id] || '' });
      }
      if (method === 'DELETE') { 
        const delId = db.menu[i].id;
        db.menu.splice(i, 1); 
        delete db.images['menu_' + delId];
        save(); 
        return send(res, 200, { ok: true }); 
      }
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

          let plara = null, spice = null;
          if (mm.hasPlaraOption) {
            plara = (it.plara === 'ไม่ใส่' || it.plara === 'ใส่') ? it.plara : null;
            if (!plara) return send(res, 400, { error: 'กรุณาเลือกใส่/ไม่ใส่ปลาร้าก่อนสั่งเมนู "' + mm.name + '"' });
          }
          if (mm.hasSpiceOption) {
            spice = SPICE_LEVELS.includes(it.spice) ? it.spice : null;
            if (!spice) return send(res, 400, { error: 'กรุณาเลือกระดับความเผ็ดก่อนสั่งเมนู "' + mm.name + '"' });
          }

          const optionLines = [];
          if (mm.hasOptionChoice && (mm.options || []).length > 0) {
            const menuOpts = db.options.filter(o => (mm.options || []).includes(o.id));
            const groups = [...new Set(menuOpts.map(o => o.groupName || 'ตัวเลือก'))];
            const submittedOpts = Array.isArray(it.options) ? it.options.map(Number) : [];

            for (const g of groups) {
              const groupOptIds = menuOpts.filter(o => (o.groupName || 'ตัวเลือก') === g).map(o => o.id);
              const chosen = submittedOpts.find(id => groupOptIds.includes(id));
              if (!chosen) {
                return send(res, 400, { error: 'กรุณาเลือกตัวเลือกกลุ่ม "' + g + '" สำหรับเมนู "' + mm.name + '"' });
              }
              const foundOpt = db.options.find(x => x.id === chosen);
              if (foundOpt) optionLines.push({ id: foundOpt.id, name: foundOpt.name, price: foundOpt.price, groupName: foundOpt.groupName });
            }
          }

          const selectedToppingIds = (mm.hasToppingOption && Array.isArray(it.toppings)) ? it.toppings.map(Number) : [];
          const toppingLines = [];
          selectedToppingIds.forEach(tid => {
            if ((mm.toppings || []).includes(tid)) {
              const t = db.toppings.find(x => x.id === tid);
              if (t) toppingLines.push({ id: t.id, name: t.name, price: t.price });
            }
          });

          const optionsSum = optionLines.reduce((a, o) => a + o.price, 0);
          const toppingsSum = toppingLines.reduce((a, t) => a + t.price, 0);
          const unitPrice = mm.price + optionsSum + toppingsSum;

          lines.push({ 
            menuId: mm.id, 
            name: mm.name, 
            price: unitPrice, 
            basePrice: mm.price,
            qty: qty,
            note: String(it.note || '').slice(0, 150),
            plara: plara,
            spice: spice,
            toppings: toppingLines,
            options: optionLines
          });
        }
        if (!db.nextOrderId) db.nextOrderId = Math.max(...db.orders.map(o => o.id), 0) + 1;
        const order = {
          id: db.nextOrderId++,
          table: table,
          items: lines,
          total: lines.reduce((s, l) => s + l.price * l.qty, 0),
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        db.orders.push(order); 
        save();
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
        o.status = body.status; 
        save();
        return send(res, 200, o);
      }
      if (method === 'DELETE' && !id) {
        if (!need('admin')) return;
        db.orders = [];
        save();
        return send(res, 200, { ok: true });
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
        db.users.push({ username: username, password: hashPw(password), role: role }); 
        save();
        return send(res, 201, { username: username, role: role });
      }
      if (method === 'DELETE' && id) {
        const name = decodeURIComponent(id);
        if (name === user.username) return send(res, 400, { error: 'ลบบัญชีตัวเองไม่ได้' });
        db.users = db.users.filter(u => u.username !== name);
        if (db.sessions) {
          for (const [t, s] of Object.entries(db.sessions)) {
            if (s.username === name) delete db.sessions[t];
          }
        }
        save();
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: 'ไม่พบ API' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'เซิร์ฟเวอร์ผิดพลาด' });
  }
});

initStorage().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('===== เซิร์ฟเวอร์ทำงานแล้ว (ระบบเชื่อมต่อ MongoDB Atlas + Auto-Migrate พร้อมใช้งาน) =====');
  });
});

const CSS = `
:root { --primary: ${db.settings.theme}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f8f9fa; color: #212529; }
header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: var(--primary); color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
.brand { display: flex; align-items: center; gap: 12px; }
.brand img { width: 55px; height: 55px; border-radius: 50%; object-fit: cover; background: #fff; border: 2px solid rgba(255,255,255,.8); flex-shrink: 0; }
header h1 { margin: 0; font-size: 1.2rem; font-weight: bold; white-space: nowrap; }
.sticky-category-bar { position: sticky; top: 0; z-index: 99; background: #f8f9fa; padding: 8px 0; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
.catTabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.catTabs::-webkit-scrollbar { display: none; }
.catTabs button { white-space: nowrap; background: #e2e8f0; border: none; flex-shrink: 0; padding: 6px 14px; border-radius: 8px; font-size: 0.9rem; cursor: pointer; }
.catTabs button.active { background: var(--primary); color: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.card, .panel { background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.06); border: 1px solid #edf2f7; }
.card img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; background: #eee; }
.card h3 { margin: 8px 0 4px; font-size: 1rem; }
.narrow { max-width: 420px; margin: 40px auto; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; gap: 8px; }
input, select, textarea { width: 100%; padding: 10px; margin: 6px 0; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
header input, label input[type=checkbox] { width: auto; }
button { padding: 8px 14px; margin: 2px 0; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; cursor: pointer; font: inherit; font-weight: 500; transition: opacity .2s; }
button:hover { opacity: .9; }
button:disabled { opacity: .4; cursor: default; }
button.primary { background: var(--primary); color: #fff; border: none; width: 100%; padding: 10px; margin-top: 6px; }
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
.tag-plara { background: #7c3aed; color: #fff; font-size: 0.7rem; padding: 2px 7px; border-radius: 8px; display: inline-block; margin-left: 4px; }
.tag-spice { background: #ea580c; color: #fff; font-size: 0.7rem; padding: 2px 7px; border-radius: 8px; display: inline-block; margin-left: 4px; }
.tag-topping { background: #0891b2; color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; display: inline-block; margin: 2px 4px 0 0; }
.tag-option { background: #4f46e5; color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; display: inline-block; margin: 2px 4px 0 0; }
[hidden] { display: none !important; }
@keyframes pulseOrder { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.55); } 70% { box-shadow: 0 0 0 10px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
.order-new { border-left: 5px solid #f59e0b !important; animation: pulseOrder 1.6s infinite; }
.order-new-tag { background: #f59e0b; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 3px 9px; border-radius: 10px; margin-right: 6px; animation: pulseOrder 1.6s infinite; }
.soundBar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
.modalOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; overflow-y: auto; }
.modalBox { background: #fff; border-radius: 12px; padding: 20px; max-width: 400px; width: 100%; text-align: center; max-height: 90vh; overflow-y: auto; position: relative; }
.modalBox button { width: 100%; margin-top: 8px; }
.modalCloseBtn { position: absolute; top: 10px; right: 10px; width: auto !important; padding: 4px 10px !important; margin: 0 !important; background: #f1f5f9; border: none; font-weight: bold; }
.choiceGroup { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin: 8px 0 14px; }
.choiceGroup button { width: auto; margin: 0; flex: 1 1 auto; min-width: 70px; background: #f1f5f9; border: 1px solid #cbd5e1; }
.choiceGroup button.selected { background: var(--primary); color: #fff; border-color: var(--primary); }
.toppingRow { display: flex; align-items: center; gap: 8px; text-align: left; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.toppingRow input { width: auto; margin: 0; }
.confirmBtn:disabled { opacity: .4; }
.catGroupHeader { display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
`;

const COMMON_JS = `
const $ = function (id) { return document.getElementById(id); };
const STATUS = { pending: 'รอรับออเดอร์', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' };
const SPICE_LEVELS = ['ไม่พริก', 'เผ็ดน้อย', 'เผ็ดกลาง', 'เผ็ดมาก'];
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
let customCatOrder = [];
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    if (s.theme) document.documentElement.style.setProperty('--primary', s.theme);
    if (s.shopName && $('shopNameText')) $('shopNameText').textContent = s.shopName;
    if (Array.isArray(s.categoryOrder)) customCatOrder = s.categoryOrder;
    document.querySelectorAll('.shopLogo').forEach(img => {
      if (s.logo && s.logo.trim() !== '') { img.onerror = function () { img.hidden = true; }; img.src = s.logo; img.hidden = false; }
      else { img.hidden = true; }
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
  <div class="brand" style="cursor: pointer;" ondblclick="location.href='/admin'">
    <img class="shopLogo" hidden alt="Logo">
    <h1 id="shopNameText">เลยมาตำ</h1>
  </div>
  <label style="margin:0;">โต๊ะ: <input id="table" size="4" onchange="localStorage.setItem('table', this.value); loadTableOrders();"></label>
</header>

<div class="sticky-category-bar">
  <div class="category-inner">
    <input id="searchBox" placeholder="🔍 ค้นหาเมนูอาหาร..." style="margin-bottom:8px; background:#fff;">
    <div id="catTabs" class="catTabs"></div>
  </div>
</div>

<main class="layout">
  <section>
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
<div id="plaraModal" class="modalOverlay" hidden>
  <div class="modalBox">
    <button type="button" class="modalCloseBtn" onclick="closePlaraModal()">✕</button>
    <h3 style="margin-top:0;">🍲 <span id="plaraItemName"></span></h3>

    <div id="plaraOnlySection" hidden>
      <p class="muted" style="margin:10px 0 4px; text-align:left;">🐟 ต้องการใส่ปลาร้าไหม? (บังคับเลือก)</p>
      <div class="choiceGroup" id="plaraChoiceGroup">
        <button type="button" data-v="ใส่" onclick="choosePlara('ใส่')">✅ ใส่ปลาร้า</button>
        <button type="button" data-v="ไม่ใส่" onclick="choosePlara('ไม่ใส่')">🚫 ไม่ใส่ปลาร้า</button>
      </div>
    </div>

    <div id="spiceOnlySection" hidden>
      <p class="muted" style="margin:10px 0 4px; text-align:left;">🔥 ระดับความเผ็ด (บังคับเลือก)</p>
      <div class="choiceGroup" id="spiceChoiceGroup">
        <button type="button" data-v="ไม่พริก" onclick="chooseSpice('ไม่พริก')">ไม่พริก</button>
        <button type="button" data-v="เผ็ดน้อย" onclick="chooseSpice('เผ็ดน้อย')">เผ็ดน้อย</button>
        <button type="button" data-v="เผ็ดกลาง" onclick="chooseSpice('เผ็ดกลาง')">เผ็ดกลาง</button>
        <button type="button" data-v="เผ็ดมาก" onclick="chooseSpice('เผ็ดมาก')">เผ็ดมาก</button>
      </div>
    </div>

    <div id="optionSection" hidden>
      <div id="optionGroupsContainer"></div>
    </div>

    <div id="toppingSection" hidden>
      <p class="muted" style="margin:10px 0 4px; text-align:left;">➕ ท็อปปิ้งเสริม (ไม่บังคับ)</p>
      <div id="toppingList"></div>
    </div>

    <button class="primary confirmBtn" id="confirmAddBtn" onclick="confirmAdd()">เพิ่มลงตะกร้า</button>
  </div>
</div>
`;

const SHOP_JS = `
const cart = {};
let menu = [];
let toppingsData = [];
let optionsData = [];
let activeCat = 'all';
let pendingAddId = null;
let pendingPlara = null;
let pendingSpice = null;
let pendingToppings = [];
let pendingOptions = {}; 
$('table').value = new URLSearchParams(location.search).get('table') || localStorage.getItem('table') || '1';

async function loadMenu() {
  await loadSettings();
  try {
    menu = await api('/api/menu');
    toppingsData = await api('/api/toppings');
    optionsData = await api('/api/options');
  } catch(e) {}
  renderCatTabs();
  renderMenu(menu);
}

function renderCatTabs() {
  const rawCats = [...new Set(menu.map(m => m.category))];
  const cats = rawCats.sort((a, b) => {
    let indexA = customCatOrder.indexOf(a);
    let indexB = customCatOrder.indexOf(b);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });
  let out = '<button type="button" class="' + (activeCat === 'all' ? 'active' : '') + '" onclick="setCat(\\'all\\')">ทั้งหมด</button>';
  out += '<button type="button" class="' + (activeCat === 'rec' ? 'active' : '') + '" onclick="setCat(\\'rec\\')">🌟 แนะนำ</button>';
  cats.forEach(c => {
    out += '<button type="button" class="' + (activeCat === c ? 'active' : '') + '" onclick="setCat(\\'' + esc(c).replace(/'/g, "\\\\'") + '\\')">' + esc(c) + '</button>';
  });
  $('catTabs').innerHTML = out;
}

function setCat(cat) { activeCat = cat; renderCatTabs(); renderMenu(menu); }

function renderMenu(list) {
  const keyword = ($('searchBox').value || '').toLowerCase().trim();
  let filtered = list.filter(m => m.available && (!keyword || m.name.toLowerCase().includes(keyword) || m.category.toLowerCase().includes(keyword)));
  if (!keyword) {
    if (activeCat === 'rec') filtered = filtered.filter(m => m.recommended);
    else if (activeCat !== 'all') filtered = filtered.filter(m => m.category === activeCat);
  }
  filtered.sort((a, b) => {
    let indexA = customCatOrder.indexOf(a.category);
    let indexB = customCatOrder.indexOf(b.category);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    if (indexA !== indexB) return indexA - indexB;
    return a.name.localeCompare(b.name, 'th');
  });
  let out = '<div class="grid">';
  filtered.forEach(m => out += cardHtml(m));
  out += '</div>';
  $('menu').innerHTML = filtered.length ? out : '<p>ไม่พบเมนูอาหารที่คุณค้นหา</p>';
  renderCart();
}

function cardHtml(m) {
  const priceDisplay = m.price > 0 ? (m.price + ' บาท') : 'เลือกราคาตามตัวเลือก';
  return '<div class="card">' +
    (m.image ? '<img src="' + esc(m.image) + '" alt="" onerror="this.style.display=\\'none\\'"> ' : '<div style="height:120px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.9rem;">ไม่มีรูปภาพ</div>') +
    (m.recommended ? '<span class="tag-rec">แนะนำ</span>' : '') +
    (m.hasPlaraOption ? '<span class="tag-plara">ปลาร้าเลือกได้</span>' : '') +
    (m.hasSpiceOption ? '<span class="tag-spice">เผ็ดเลือกได้</span>' : '') +
    '<h3>' + esc(m.name) + '</h3><p style="color:var(--primary); font-weight:bold; margin:4px 0;">' + priceDisplay + '</p>' +
    '<button class="primary" style="margin-top:6px; padding:8px;" onclick="add(' + m.id + ')">+ เพิ่มใส่ตะกร้า</button></div>';
}

$('searchBox').oninput = function() { renderMenu(menu); };

function add(id) {
  const m = menu.find(x => x.id === id);
  if (!m) return;
  const showToppings = m.hasToppingOption && (m.toppings || []).length > 0;
  const showOptions = m.hasOptionChoice && (m.options || []).length > 0;
  
  if (m.hasPlaraOption || m.hasSpiceOption || showToppings || showOptions) {
    pendingAddId = id;
    pendingPlara = null;
    pendingSpice = null;
    pendingToppings = [];
    pendingOptions = {};
    $('plaraItemName').textContent = m.name;

    $('plaraOnlySection').hidden = !m.hasPlaraOption;
    $('spiceOnlySection').hidden = !m.hasSpiceOption;
    document.querySelectorAll('#plaraChoiceGroup button').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('#spiceChoiceGroup button').forEach(b => b.classList.remove('selected'));

    if (showOptions) {
      const optItems = optionsData.filter(o => (m.options || []).includes(o.id));
      const byGroup = {};
      optItems.forEach(o => { const g = o.groupName || 'ตัวเลือก'; (byGroup[g] = byGroup[g] || []).push(o); });
      
      let optHtml = '';
      Object.keys(byGroup).forEach(group => {
        optHtml += '<p class="muted" style="margin:10px 0 4px; text-align:left;">📌 ' + esc(group) + ' (บังคับเลือก)</p>';
        optHtml += '<div class="choiceGroup" data-group="' + esc(group) + '">';
        byGroup[group].forEach(o => {
          optHtml += '<button type="button" data-id="' + o.id + '" onclick="chooseOption(\\'' + esc(group).replace(/'/g, "\\\\'") + '\\', ' + o.id + ')">' + esc(o.name) + ' (' + o.price + '฿)</button>';
        });
        optHtml += '</div>';
      });
      $('optionGroupsContainer').innerHTML = optHtml;
      $('optionSection').hidden = false;
    } else {
      $('optionSection').hidden = true;
    }

    if (showToppings) {
      const items = toppingsData.filter(t => (m.toppings || []).includes(t.id));
      const byCat = {};
      items.forEach(t => { const c = t.category || 'ท็อปปิ้งทั่วไป'; (byCat[c] = byCat[c] || []).push(t); });
      let html = '';
      Object.keys(byCat).forEach(cat => {
        html += '<p style="margin:8px 0 2px; font-size:0.85rem; font-weight:bold; text-align:left; color:#0891b2;">📂 ' + esc(cat) + '</p>';
        html += byCat[cat].map(t =>
          '<label class="toppingRow"><input type="checkbox" value="' + t.id + '" onchange="toggleTopping(' + t.id + ', this.checked)"> ' +
          esc(t.name) + ' (+' + t.price + ' บาท)</label>'
        ).join('');
      });
      $('toppingList').innerHTML = html || '<p class="muted">- ไม่มีท็อปปิ้งสำหรับเมนูนี้ -</p>';
      $('toppingSection').hidden = false;
    } else {
      $('toppingSection').hidden = true;
    }

    updateConfirmState();
    $('plaraModal').hidden = false;
    return;
  }
  doAdd(id, null, null, [], []);
}

function closePlaraModal() { $('plaraModal').hidden = true; pendingAddId = null; }

function choosePlara(v) {
  pendingPlara = v;
  document.querySelectorAll('#plaraChoiceGroup button').forEach(b => b.classList.toggle('selected', b.dataset.v === v));
  updateConfirmState();
}
function chooseSpice(v) {
  pendingSpice = v;
  document.querySelectorAll('#spiceChoiceGroup button').forEach(b => b.classList.toggle('selected', b.dataset.v === v));
  updateConfirmState();
}
function chooseOption(group, id) {
  pendingOptions[group] = id;
  const container = document.querySelector('.choiceGroup[data-group="' + group + '"]');
  if (container) {
    container.querySelectorAll('button').forEach(b => b.classList.toggle('selected', Number(b.dataset.id) === id));
  }
  updateConfirmState();
}
function toggleTopping(id, checked) {
  if (checked) { if (!pendingToppings.includes(id)) pendingToppings.push(id); }
  else { pendingToppings = pendingToppings.filter(x => x !== id); }
}
function updateConfirmState() {
  const m = menu.find(x => x.id === pendingAddId);
  if (!m) return;
  const plaraOk = !m.hasPlaraOption || !!pendingPlara;
  const spiceOk = !m.hasSpiceOption || !!pendingSpice;
  
  let optionsOk = true;
  if (m.hasOptionChoice && (m.options || []).length > 0) {
    const optItems = optionsData.filter(o => (m.options || []).includes(o.id));
    const groups = [...new Set(optItems.map(o => o.groupName || 'ตัวเลือก'))];
    groups.forEach(g => { if (!pendingOptions[g]) optionsOk = false; });
  }

  $('confirmAddBtn').disabled = !(plaraOk && spiceOk && optionsOk);
}

function confirmAdd() {
  if (pendingAddId == null) return;
  const m = menu.find(x => x.id === pendingAddId);
  if (m && m.hasPlaraOption && !pendingPlara) { alert('กรุณาเลือกใส่/ไม่ใส่ปลาร้าก่อนนะครับ'); return; }
  if (m && m.hasSpiceOption && !pendingSpice) { alert('กรุณาเลือกระดับความเผ็ดก่อนนะครับ'); return; }
  
  if (m && m.hasOptionChoice && (m.options || []).length > 0) {
    const optItems = optionsData.filter(o => (m.options || []).includes(o.id));
    const groups = [...new Set(optItems.map(o => o.groupName || 'ตัวเลือก'))];
    for (const g of groups) {
      if (!pendingOptions[g]) { alert('กรุณาเลือกตัวเลือกกลุ่ม "' + g + '" ด้วยครับ'); return; }
    }
  }

  const optIds = Object.values(pendingOptions);
  doAdd(pendingAddId, pendingPlara, pendingSpice, pendingToppings.slice(), optIds);
  $('plaraModal').hidden = true;
  pendingAddId = null;
}

function doAdd(id, plara, spice, toppingIds, optionIds) {
  if (!cart[id]) cart[id] = { qty: 1, note: '', plara: plara, spice: spice, toppings: toppingIds || [], options: optionIds || [] };
  else { cart[id].qty++; }
  renderCart();
}
function changeQty(id, d) { cart[id].qty += d; if (cart[id].qty <= 0) delete cart[id]; renderCart(); }
function changeNote(id, val) { if (cart[id]) cart[id].note = val; }

function renderCart() {
  let total = 0, out = '';
  Object.keys(cart).forEach(id => {
    const m = menu.find(x => x.id == id);
    if (!m || !m.available) { delete cart[id]; return; }
    const toppingItems = (cart[id].toppings || []).map(tid => toppingsData.find(t => t.id === tid)).filter(Boolean);
    const optionItems = (cart[id].options || []).map(oid => optionsData.find(o => o.id === oid)).filter(Boolean);
    
    const optionSum = optionItems.reduce((s, o) => s + o.price, 0);
    const toppingSum = toppingItems.reduce((s, t) => s + t.price, 0);
    const itemUnitPrice = m.price + optionSum + toppingSum;
    total += itemUnitPrice * cart[id].qty;

    let tagLine = '';
    if (cart[id].plara) tagLine += '🐟 ' + esc(cart[id].plara) + 'ปลาร้า';
    if (cart[id].spice) tagLine += (tagLine ? ' · ' : '') + '🔥 ' + esc(cart[id].spice);

    const priceTag = ' (' + itemUnitPrice + '฿)';

    out += '<div style="border-bottom:1px solid #edf2f7; padding:8px 0;">' +
      '<div class="row"><span><b>' + esc(m.name) + '</b>' + priceTag + '</span><span>' +
      '<button onclick="changeQty(' + id + ',-1)">−</button> ' + cart[id].qty + ' ' +
      '<button onclick="changeQty(' + id + ',1)">+</button></span></div>' +
      (tagLine ? '<div style="font-size:0.8rem; color:#7c3aed;">' + tagLine + '</div>' : '') +
      (optionItems.length ? '<div style="margin:2px 0; font-size:0.85rem; color:#4f46e5;">📌 ' + optionItems.map(o => esc(o.name) + ' (' + o.price + '฿)').join(', ') + '</div>' : '') +
      (toppingItems.length ? '<div style="margin:4px 0;">+เพิ่ม: ' + toppingItems.map(t => '<span class="tag-topping">' + esc(t.name) + '</span>').join(' ') + '</div>' : '') +
      '<input placeholder="หมายเหตุเฉพาะเมนูนี้ เช่น ไม่ใส่ผัก" value="' + esc(cart[id].note) + '" oninput="changeNote(' + id + ', this.value)" style="margin:4px 0 0; padding:6px; font-size:0.85rem;">' +
      '</div>';
  });
  $('cart').innerHTML = out || '<p class="muted">ยังไม่มีรายการในตะกร้า</p>';
  $('total').textContent = total;
}

$('orderBtn').onclick = async function () {
  const table = $('table').value.trim();
  if (!table) return alert('กรุณาใส่หมายเลขโต๊ะ');
  const items = Object.keys(cart).map(id => ({ 
    menuId: Number(id), 
    qty: cart[id].qty, 
    note: cart[id].note, 
    plara: cart[id].plara, 
    spice: cart[id].spice, 
    toppings: cart[id].toppings || [],
    options: cart[id].options || [] 
  }));
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

let lastTableOrdersCacheStr = '';
async function loadTableOrders() {
  const table = $('table').value.trim();
  if (!table) return;
  try {
    const orders = await api('/api/orders/table?no=' + encodeURIComponent(table));
    const str = JSON.stringify(orders);
    if (str === lastTableOrdersCacheStr) return;
    lastTableOrdersCacheStr = str;

    $('myTableOrders').innerHTML = orders.map(o => {
      let s = '<div style="border-bottom:1px dashed #eee; padding:8px 0;"><div class="row"><span><b>#' + o.id + '</b> (' + o.total + '฿)</span><span class="badge ' + o.status + '">' + STATUS[o.status] + '</span></div><ul style="margin:4px 0; padding-left:18px; font-size:0.9rem;">';
      o.items.forEach(i => {
        let tagLine = '';
        if (i.plara) tagLine += esc(i.plara) + 'ปลาร้า';
        if (i.spice) tagLine += (tagLine ? ' · ' : '') + esc(i.spice);
        
        let detailHtml = '';
        if (tagLine) detailHtml += '<div style="color:#7c3aed; font-size:0.9rem;">- ' + tagLine + '</div>';
        if (i.options && i.options.length) detailHtml += '<div style="color:#4f46e5; font-size:0.9rem;">- ตัวเลือก: ' + i.options.map(o => esc(o.name) + ' (' + o.price + '฿)').join(', ') + '</div>';
        
        if (i.toppings && i.toppings.length) {
          detailHtml += '<div style="background:#e0f2fe; border-left:3px solid #0284c7; padding:3px 6px; margin:3px 0; border-radius:4px; color:#0369a1; font-size:0.9rem; font-weight:bold;">' +
            '➕ +เพิ่ม: ' + i.toppings.map(t => esc(t.name)).join(', ') + '</div>';
        }

        if (i.note) detailHtml += '<div class="muted" style="font-size:0.85rem;">- หมายเหตุ: ' + esc(i.note) + '</div>';

        s += '<li style="margin-bottom:8px;"><b>' + esc(i.name) + '</b> (' + i.price + '฿) × ' + i.qty + detailHtml + '</li>';
      });
      s += '</ul></div>';
      return s;
    }).join('') || '<p class="muted">- ยังไม่มีออเดอร์ของโต๊ะนี้ -</p>';
  } catch(e) {}
}
loadMenu();
loadTableOrders();
setInterval(loadTableOrders, 10000);
setInterval(loadMenu, 60000);
`;

const ADMIN_BODY = `
<header>
  <div class="brand">
    <img class="shopLogo" hidden alt="Logo">
    <h1 style="font-size: 1.1rem; margin:0;">🔐 ระบบหลังร้าน</h1>
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
    <button data-tab="tablesTab" onclick="switchTab('tablesTab')">🪑 จัดการโต๊ะ</button>
    <button data-tab="menuTab" class="adminOnly" onclick="switchTab('menuTab')">🍲 จัดการเมนูอาหาร</button>
    <button data-tab="optionsTab" class="adminOnly" onclick="switchTab('optionsTab')">📌 จัดการตัวเลือก</button>
    <button data-tab="toppingsTab" class="adminOnly" onclick="switchTab('toppingsTab')">➕ จัดการท็อปปิ้ง</button>
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
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <select id="filterTableSelect" onchange="loadOrders()" style="width:auto; padding:6px; margin:0;">
          <option value="">-- ทุกโต๊ะ --</option>
        </select>
        <button type="button" id="stopAlertBtn2" onclick="stopLoopAlert()" style="background:#ef4444; color:#fff; border:none; margin:0; width:auto;" hidden>🔕 หยุดเสียงเตือน</button>
        <button type="button" onclick="clearAllOrders()" style="background:#64748b; color:#fff; border:none; margin:0; width:auto;" class="adminOnly">🗑️ เคลียร์ประวัติออเดอร์ทั้งหมด</button>
      </div>
    </div>
    <p id="newOrderSummary" class="muted" style="margin:0 0 12px;"></p>
    <div id="ordersContainer" class="grid"></div>
  </section>

  <section id="tablesTab" class="tab" hidden>
    <div class="panel" style="max-width:600px; margin-bottom:20px;" class="adminOnly">
      <h3>➕ เพิ่ม / 🗑️ ลบ โต๊ะอาหารในร้าน</h3>
      <form onsubmit="addNewTable(event)" style="display:flex; gap:8px; margin-top:10px;">
        <input id="newTableName" placeholder="ระบุชื่อหรือหมายเลขโต๊ะ เช่น 11, โซน A1" required style="margin:0; flex:1;">
        <button type="submit" class="primary" style="margin:0; width:auto; padding:10px 20px;">+ เพิ่มโต๊ะใหม่</button>
      </form>
    </div>
    <div class="panel">
      <h3>🪑 ภาพรวมสถานะโต๊ะทั้งหมด</h3>
      <div id="tableStatusContainer" class="grid" style="margin-top: 16px;"></div>
    </div>
  </section>

  <section id="menuTab" class="tab" hidden>
    <form id="menuForm" class="panel" style="margin-bottom:20px;" onsubmit="submitMenuForm(event)">
      <h3>รายละเอียดและรูปภาพเมนู (แก้ไขแบบรายละเอียด)</h3>
      <input type="hidden" id="mId">
      <input id="mName" placeholder="ชื่อเมนูอาหาร" required>
      <input id="mPrice" type="number" min="0" placeholder="ราคาตั้งต้น (บาท) เช่น 0 หรือ 10" required>
      
      <label style="display:block; margin-top:8px;">หมวดหมู่อาหาร:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select id="mCat" required style="margin:6px 0; flex:1;">
          <option value="">-- เลือกหมวดหมู่ที่มีอยู่ --</option>
        </select>
        <button type="button" onclick="addNewCategoryPrompt()" style="white-space:nowrap; padding:10px;">➕ เพิ่มหมวดใหม่</button>
      </div>

      <label style="display:block; margin-top:8px;">อัปโหลดรูปภาพจากในเครื่อง (บีบอัดอัตโนมัติ) หรือวางลิงก์:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="file" id="mFile" accept="image/*" style="padding:6px;" onchange="handleFile(event)">
        <input id="mImg" placeholder="หรือวาง URL รูปภาพ" style="margin:0;">
      </div>
      
      <div style="display:flex; gap:20px; margin:12px 0; flex-wrap:wrap;">
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mAvail" checked> เปิดขายเมนูนี้</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mRec"> 🌟 ตั้งเป็นเมนูแนะนำ (ขึ้นโชว์ด้านบน)</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mPlara"> 🐟 มีตัวเลือกใส่/ไม่ใส่ปลาร้า</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mSpice"> 🌶️ มีตัวเลือกระดับความเผ็ด</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mOptionSwitch"> 📌 มีกลุ่มตัวเลือก (บังคับเลือก เช่น ขนาดน้ำเปล่า)</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="mToppingSwitch"> ➕ มีตัวเลือกท็อปปิ้ง</label>
      </div>

      <div id="mOptionsContainerBox" hidden style="margin-bottom:12px;">
        <label style="display:block; margin-top:8px; color:#4f46e5; font-weight:bold;">📌 เลือกกลุ่มตัวเลือกสำหรับเมนูนี้ (ติ๊กเลือกเพื่อบังคับให้ลูกค้าต้องเลือก):</label>
        <div id="mOptionsList" style="background:#eef2ff; padding:8px; border-radius:8px; margin:6px 0;"></div>
      </div>

      <label style="display:block; margin-top:8px;">➕ ท็อปปิ้งที่เลือกได้สำหรับเมนูนี้:</label>
      <div id="mToppingsList" style="background:#f1f5f9; padding:8px; border-radius:8px; margin:6px 0;">
        <p class="muted" style="margin:4px 0; font-size:0.9rem;">กำลังโหลดรายการท็อปปิ้ง...</p>
      </div>

      <button type="submit" class="primary" id="mSubmitBtn">บันทึกการแก้ไขเมนู</button>
      <button type="button" id="mReset" onclick="resetMenuForm()" style="width:100%; margin-top:6px;">ล้างฟอร์ม</button>
    </form>
    <h3>รายการเมนูทั้งหมดในระบบ (แยกตามหมวดหมู่)</h3>
    <div id="menuByCategory"></div>
  </section>

  <section id="optionsTab" class="tab" hidden>
    <form id="optionForm" class="panel narrow" style="max-width:500px; margin-bottom:20px;" onsubmit="submitOptionForm(event)">
      <h3>📌 เพิ่มตัวเลือก (เช่น ขวดเล็ก 10฿, ขวดใหญ่ 20฿)</h3>
      <input id="oName" placeholder="ชื่อตัวเลือก เช่น ขวดเล็ก, ขวดใหญ่" required>
      <input id="oPrice" type="number" min="0" placeholder="ราคา (บาท) เช่น 10, 20" required>
      <label style="display:block; margin-top:8px;">ชื่อกลุ่มตัวเลือก (เช่น ขนาดน้ำเปล่า):</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select id="oGroup" style="margin:6px 0; flex:1;">
          <option value="">-- เลือกหรือเพิ่มกลุ่มใหม่ --</option>
        </select>
        <button type="button" onclick="addNewOptionGroupPrompt()" style="white-space:nowrap; padding:10px;">➕ เพิ่มกลุ่มใหม่</button>
      </div>
      <button type="submit" class="primary" style="margin-top:10px;">เพิ่มตัวเลือก</button>
    </form>
    <h3>รายการตัวเลือกทั้งหมด (แยกตามกลุ่ม)</h3>
    <div id="optionByCategory"></div>
  </section>

  <section id="toppingsTab" class="tab" hidden>
    <form id="toppingForm" class="panel narrow" style="max-width:500px; margin-bottom:20px;" onsubmit="submitToppingForm(event)">
      <h3>➕ เพิ่มรายการท็อปปิ้ง</h3>
      <input id="tName" placeholder="ชื่อท็อปปิ้ง เช่น ไข่เค็ม, หมูยอ" required>
      <input id="tPrice" type="number" min="0" placeholder="ราคาเพิ่ม (บาท)" required>
      <label style="display:block; margin-top:8px;">หมวดหมู่ท็อปปิ้ง:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select id="tCat" style="margin:6px 0; flex:1;">
          <option value="">-- เลือกหรือเพิ่มหมวดใหม่ --</option>
        </select>
        <button type="button" onclick="addNewToppingCategoryPrompt()" style="white-space:nowrap; padding:10px;">➕ เพิ่มหมวดใหม่</button>
      </div>
      <button type="submit" class="primary" style="margin-top:10px;">เพิ่มท็อปปิ้ง</button>
    </form>
    <h3>รายการท็อปปิ้งทั้งหมด (แยกตามหมวดหมู่)</h3>
    <div id="toppingByCategory"></div>
  </section>

  <section id="settingsTab" class="tab" hidden>
    <div class="panel narrow" style="max-width:500px;">
      <h3>🎨 ตั้งค่าร้าน โลโก้ และเสียงเตือน</h3>
      <label>ชื่อร้านอาหาร:</label>
      <input id="setName" placeholder="ชื่อร้าน">
      
      <label style="margin-top:10px; display:block;">โลโก้ร้าน (บีบอัดอัตโนมัติ):</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="file" id="logoFile" accept="image/*" style="padding:6px;" onchange="handleLogoFile(event)">
        <input id="setLogo" placeholder="หรือวาง URL โลโก้" style="margin:0;">
      </div>
      <div style="margin-top:8px;"><img id="logoPreview" hidden style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0;" alt="ตัวอย่างโลโก้"></div>

      <label style="margin-top:10px; display:block;">จัดลำดับการแสดงหมวดหมู่:</label>
      <div id="categoryOrderList" style="background:#f1f5f9; padding:8px; border-radius:8px; margin-bottom:10px;">
        <p class="muted" style="margin:4px 0; font-size:0.9rem;">กำลังโหลดหมวดหมู่ที่มีในระบบ...</p>
      </div>

      <label style="margin-top:10px; display:block; color:#dc2626;">จัดการลบหมวดหมู่:</label>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
        <select id="delCatSelect" style="margin:0; flex:1;">
          <option value="">-- เลือกหมวดหมู่ที่ต้องการลบ --</option>
        </select>
        <button type="button" onclick="deleteCategory()" style="background:#dc2626; color:#fff; border:none; padding:10px; white-space:nowrap;">🗑️ ลบหมวดนี้</button>
      </div>
      <p class="muted" style="font-size:0.8rem; margin:0 0 10px;">*การลบหมวดหมู่ จะทำให้เมนูทั้งหมดที่อยู่ในหมวดนั้นถูกเปลี่ยนเป็นหมวด "อื่นๆ"</p>

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

      <label style="margin-top:10px; display:block;">อัปโหลดไฟล์เสียงแจ้งเตือนของคุณเอง (ตัดที่ 30 วินาที + บีบอัดอัตโนมัติ):</label>
      <input type="file" id="audioFile" accept="audio/*" style="padding:6px;" onchange="handleAudioFile(event)">
      <input id="setCustomAudio" placeholder="หรือลิงก์ไฟล์เสียง / Base64" style="font-size:0.85rem; margin-top:4px;">

      <label style="margin-top:10px; display:block;">ระดับความดังเสียง (Volume):</label>
      <select id="setVol" style="margin-top:4px;">
        <option value="0.5">ระดับ 1 (ปานกลาง)</option>
        <option value="1.0">ระดับ 2 (ดัง)</option>
        <option value="3">ระดับ 3 (ดังมาก - เร่งโวลุ่มพิเศษ)</option>
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
let me = null, menuData = [], allOrdersCache = [], tablesData = [], toppingsData = [], optionsData = [];
let selectedMenuToppings = [];
let selectedMenuOptions = [];
let menuCatCollapsed = {};
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
window.currentActiveAudio = null;

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const btn = $('mSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังประมวลผลรูปภาพ...'; }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const MAX_WIDTH = 350, MAX_HEIGHT = 350;
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > MAX_WIDTH) { height = Math.round(height * (MAX_WIDTH / width)); width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width = Math.round(width * (MAX_HEIGHT / height)); height = MAX_HEIGHT; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      $('mImg').value = canvas.toDataURL('image/jpeg', 0.45);

      if (btn) { btn.disabled = false; btn.textContent = 'บันทึกการแก้ไขเมนู'; }
    };
    img.onerror = function() {
      if (btn) { btn.disabled = false; btn.textContent = 'บันทึกการแก้ไขเมนู'; }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function handleLogoFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const MAX_SIZE = 200;
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height = Math.round(height * (MAX_SIZE / width)); width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width = Math.round(width * (MAX_SIZE / height)); height = MAX_SIZE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.5);
      $('setLogo').value = compressed;
      const prev = $('logoPreview');
      if (prev) { prev.src = compressed; prev.hidden = false; }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function handleAudioFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const arrayBuffer = evt.target.result;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const maxDuration = 30; 
      const duration = Math.min(audioBuffer.duration, maxDuration);
      
      const targetSampleRate = 22050; 
      const numFrames = Math.floor(duration * targetSampleRate);

      const offlineCtx = new OfflineAudioContext(1, numFrames, targetSampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBase64 = bufferToWavBase64(renderedBuffer);

      $('setCustomAudio').value = wavBase64;
      $('setSound').value = 'custom';
      
      if (audioBuffer.duration > maxDuration) {
        alert('ปรับแต่งเสียงเรียบร้อย! (ไฟล์ยาวเกิน 30 วินาที ระบบจึงตัดเหลือ 30 วินาทีแรกให้อัตโนมัติ)');
      } else {
        alert('ปรับแต่งเสียงเรียบร้อย! (ใช้ความยาวเต็ม ' + audioBuffer.duration.toFixed(1) + ' วินาที)');
      }
    } catch(err) {
      alert('ไม่สามารถประมวลผลไฟล์เสียงนี้ได้ กรุณาลองใช้ไฟล์ MP3 หรือ WAV อื่น');
    }
  };
  reader.readAsArrayBuffer(file);
}

function bufferToWavBase64(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels = [];
  let sample = 0, offset = 0, pos = 0;

  function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  let binary = '';
  const bytes = new Uint8Array(out.buffer);
  const chunk = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:audio/wav;base64,' + btoa(binary);
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
      window.currentActiveAudio = audio;
      audio.volume = Math.min(Math.max(multiplier * 0.5, 0.1), 1.0);
      audio.play().catch(() => { if ($('soundUnlockBar') && !soundUnlocked) $('soundUnlockBar').hidden = false; });
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
  } catch(e) { if ($('soundUnlockBar') && !soundUnlocked) $('soundUnlockBar').hidden = false; }
}
function startLoopAlert() {
  playSound(window.currentSoundType, window.currentSoundVol, window.currentCustomAudio);
  if (loopAlertTimer) return;
  loopAlertTimer = setInterval(() => { playSound(window.currentSoundType, window.currentSoundVol, window.currentCustomAudio); }, window.currentLoopInterval || 5000);
  if ($('stopAlertBtn')) $('stopAlertBtn').hidden = false;
  if ($('stopAlertBtn2')) $('stopAlertBtn2').hidden = false;
}
function stopLoopAlert() {
  if (loopAlertTimer) { clearInterval(loopAlertTimer); loopAlertTimer = null; }
  try {
    if (window.currentActiveAudio) { window.currentActiveAudio.pause(); window.currentActiveAudio.currentTime = 0; window.currentActiveAudio = null; }
  } catch(e) {}
  if ($('stopAlertBtn')) $('stopAlertBtn').hidden = true;
  if ($('stopAlertBtn2')) $('stopAlertBtn2').hidden = true;
}
function testSound() {
  const t = $('setSound') ? $('setSound').value : 'bell';
  const v = $('setVol') ? $('setVol').value : '1.0';
  const ca = $('setCustomAudio') ? $('setCustomAudio').value : '';
  playSound(t, v, ca);
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
  document.addEventListener('click', function initAudioOnce() { try { getCtx(); } catch(e) {} }, { once: false });
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
    if(b.dataset.tab === tabId) b.classList.add('active'); else b.classList.remove('active');
  });
  if (tabId === 'tablesTab') loadTables();
  if (tabId === 'toppingsTab') loadToppings();
  if (tabId === 'optionsTab') loadOptions();
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

let lastOrdersCacheStr = '';
async function loadOrders() {
  if (!me) return;
  try {
    const orders = await api('/api/orders');
    const str = JSON.stringify(orders);
    const isFirst = lastOrdersCacheStr === '';
    
    if (!isFirst && str === lastOrdersCacheStr) return;
    
    allOrdersCache = orders;
    lastOrdersCacheStr = str;

    const tables = [...new Set(orders.map(o => o.table))].sort();
    const sel = $('filterTableSelect');
    const curSel = sel ? sel.value : '';
    let optHtml = '<option value="">-- ทุกโต๊ะ --</option>';
    tables.forEach(t => { optHtml += '<option value="' + esc(t) + '">โต๊ะ ' + esc(t) + '</option>'; });
    if (sel) { sel.innerHTML = optHtml; sel.value = curSel; }

    const hasPending = orders.some(o => o.status === 'pending');
    if (!isFirst && orders.length > lastOrderCount) {
      startLoopAlert();
    }
    lastOrderCount = orders.length;

    if (hasPending && !loopAlertTimer) startLoopAlert();
    else if (!hasPending) stopLoopAlert();

    renderOrdersView();
    renderTableStatusView();
  } catch (e) { if (e.status === 401) init(); }
}

function renderOrdersView() {
  const selectedTable = $('filterTableSelect') ? $('filterTableSelect').value : '';
  const todayStr = new Date().toISOString().split('T')[0];
  let filtered = allOrdersCache.filter(o => {
    if (selectedTable && o.table !== selectedTable) return false;
    const oDate = o.createdAt.split('T')[0];
    if (currentFilterMode === 'today') return oDate === todayStr;
    if (currentFilterMode === 'custom' && currentFilterDateVal) return oDate === currentFilterDateVal;
    return true;
  });
  filtered = filtered.slice().sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1;
    const pb = b.status === 'pending' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  const pendingCount = filtered.filter(o => o.status === 'pending').length;
  if ($('newOrderSummary')) $('newOrderSummary').textContent = pendingCount > 0 ? '🆕 มีออเดอร์ที่ยังไม่ได้รับ ' + pendingCount + ' รายการ' : 'ไม่มีออเดอร์ใหม่ที่ค้างอยู่';

  if ($('ordersContainer')) {
    $('ordersContainer').innerHTML = filtered.map(o => {
      const isNew = o.status === 'pending';
      let s = '<div class="panel' + (isNew ? ' order-new' : '') + '" style="border-left:5px solid var(--primary);"><div class="row">' +
        '<b>' + (isNew ? '<span class="order-new-tag">🆕 ใหม่</span>' : '') + '#' + o.id + ' โต๊ะ ' + esc(o.table) + '</b>' +
        '<span class="badge ' + o.status + '">' + STATUS[o.status] + '</span></div>' +
        '<small class="muted">' + new Date(o.createdAt).toLocaleString('th-TH') + '</small><ul style="margin:8px 0; padding-left:20px;">';
      o.items.forEach(i => {
        let tagLine = '';
        if (i.plara) tagLine += esc(i.plara) + 'ปลาร้า';
        if (i.spice) tagLine += (tagLine ? ' · ' : '') + esc(i.spice);
        
        let detailHtml = '';
        if (tagLine) detailHtml += '<div style="color:#7c3aed; font-size:0.9rem;">- ' + tagLine + '</div>';
        if (i.options && i.options.length) detailHtml += '<div style="color:#4f46e5; font-size:0.9rem;">- ตัวเลือก: ' + i.options.map(o => esc(o.name) + ' (' + o.price + '฿)').join(', ') + '</div>';
        
        if (i.toppings && i.toppings.length) {
          detailHtml += '<div style="background:#e0f2fe; border-left:3px solid #0284c7; padding:3px 6px; margin:3px 0; border-radius:4px; color:#0369a1; font-size:0.9rem; font-weight:bold;">' +
            '➕ +เพิ่ม: ' + i.toppings.map(t => esc(t.name)).join(', ') + '</div>';
        }

        if (i.note) detailHtml += '<div class="muted" style="font-size:0.85rem;">- หมายเหตุ: ' + esc(i.note) + '</div>';

        s += '<li style="margin-bottom:8px;"><b>' + esc(i.name) + '</b> (' + i.price + '฿) × ' + i.qty + detailHtml + '</li>';
      });
      s += '</ul><p style="margin:8px 0;"><b>รวมราคาทั้งสิ้น: ' + o.total + ' บาท</b></p><div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:8px;">';
      Object.keys(STATUS).forEach(k => {
        s += '<button type="button" data-id="' + o.id + '" data-s="' + k + '" onclick="setStatus(this)" style="font-size:0.8rem; padding:5px 10px;"' +
          (k === o.status ? ' disabled style="background:#cbd5e1; border-color:#cbd5e1;"' : '') + '>' + STATUS[k] + '</button> ';
      });
      return s + '</div></div>';
    }).join('') || '<p>ยังไม่มีรายการออเดอร์ในเงื่อนไขนี้</p>';
  }
}

async function loadTables() { try { tablesData = await api('/api/tables'); renderTableStatusView(); } catch(e) {} }

async function addNewTable(e) {
  e.preventDefault();
  const nameInput = $('newTableName');
  const tableName = nameInput.value.trim();
  if (!tableName) return;
  try {
    tablesData = await api('/api/tables', { method: 'POST', body: { name: tableName } });
    nameInput.value = '';
    renderTableStatusView();
    alert('เพิ่มโต๊ะเรียบร้อยแล้ว');
  } catch(err) { alert(err.message); }
}

async function deleteTable(tableName) {
  if (!confirm('ต้องการลบโต๊ะ "' + tableName + '" ออกจากระบบใช่หรือไม่?')) return;
  try {
    tablesData = await api('/api/tables/' + encodeURIComponent(tableName), { method: 'DELETE' });
    renderTableStatusView();
    alert('ลบโต๊ะเรียบร้อยแล้ว');
  } catch(err) { alert(err.message); }
}

function renderTableStatusView() {
  const container = $('tableStatusContainer');
  if (!container) return;
  const allTables = [...new Set([...tablesData, ...allOrdersCache.map(o => o.table)])].sort((a, b) => String(a).localeCompare(String(b), 'th', { numeric: true }));
  let html = '';
  allTables.forEach(tbl => {
    const tblOrders = allOrdersCache.filter(o => o.table === tbl && o.status !== 'cancelled');
    const hasActiveOrder = tblOrders.some(o => o.status === 'pending' || o.status === 'cooking');
    const hasServedOrder = tblOrders.some(o => o.status === 'served');
    let statusText = '🟢 โต๊ะว่าง';
    let statusBg = '#10b981';
    if (hasActiveOrder) { statusText = '🔥 มีออเดอร์/กำลังทำ'; statusBg = '#f59e0b'; }
    else if (hasServedOrder) { statusText = '🍽️ กำลังทานอาหาร'; statusBg = '#06b6d4'; }
    html += '<div class="panel" style="border-top: 5px solid ' + statusBg + '; text-align: center; position: relative;">' +
      (me && me.role === 'admin' ? '<button type="button" onclick="deleteTable(\\'' + esc(tbl) + '\\')" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; font-size: 0.8rem; padding: 2px 6px;" title="ลบโต๊ะ">❌</button>' : '') +
      '<h2 style="margin: 6px 0; font-size: 1.4rem;">โต๊ะ ' + esc(tbl) + '</h2>' +
      '<span class="badge" style="background: ' + statusBg + '; display: inline-block; margin-bottom: 10px;">' + statusText + '</span>' +
      '<p style="font-size: 0.85rem; margin: 4px 0;" class="muted">ออเดอร์ค้าง: ' + tblOrders.length + ' รายการ</p>' +
      (tblOrders.length > 0 ? '<button type="button" onclick="clearTable(\\'' + esc(tbl) + '\\')" style="background: #ef4444; color: #fff; border: none; font-size: 0.8rem; padding: 4px 10px; margin-top: 8px;">🧹 เคลียร์โต๊ะ/เช็กบิล</button>' : '') +
      '</div>';
  });
  container.innerHTML = html;
}

async function clearTable(tableNo) {
  if (!confirm('ต้องการเคลียร์โต๊ะ ' + tableNo + ' (ลูกค้าย้ายออก/เช็กบิลแล้วใช่ไหม?)')) return;
  try {
    const targetOrders = allOrdersCache.filter(o => o.table === tableNo && o.status !== 'cancelled' && o.status !== 'served');
    for (const o of targetOrders) { await api('/api/orders/' + o.id, { method: 'PATCH', body: { status: 'served' } }); }
    loadOrders();
    alert('เคลียร์โต๊ะ ' + tableNo + ' เรียบร้อยแล้ว');
  } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function setStatus(btn) {
  try { stopLoopAlert(); await api('/api/orders/' + btn.dataset.id, { method: 'PATCH', body: { status: btn.dataset.s } }); loadOrders(); }
  catch (e) { alert(e.message); }
}

async function clearAllOrders() {
  if (!confirm('ต้องการลบประวัติออเดอร์ทั้งหมดใช่หรือไม่? (เมนูอาหารจะไม่ถูกลบ)')) return;
  if (!confirm('ยืนยันอีกครั้ง: ข้อมูลออเดอร์ทั้งหมดจะหายถาวร ต้องการดำเนินการต่อหรือไม่?')) return;
  try { await api('/api/orders', { method: 'DELETE' }); stopLoopAlert(); loadOrders(); alert('เคลียร์ประวัติออเดอร์เรียบร้อยแล้ว'); }
  catch (e) { alert(e.message); }
}

setInterval(loadOrders, 8000);

async function loadOptions() {
  try {
    optionsData = await api('/api/options');
    const groups = [...new Set(optionsData.map(o => o.groupName || 'ตัวเลือกทั่วไป'))];
    let groupOpts = '<option value="">-- เลือกหรือเพิ่มกลุ่มใหม่ --</option>';
    groups.forEach(g => { groupOpts += '<option value="' + esc(g) + '">' + esc(g) + '</option>'; });
    if ($('oGroup')) $('oGroup').innerHTML = groupOpts;

    const byGroup = {};
    optionsData.forEach(o => { const g = o.groupName || 'ตัวเลือกทั่วไป'; (byGroup[g] = byGroup[g] || []).push(o); });

    let html = '';
    Object.keys(byGroup).forEach(group => {
      html += '<div class="panel" style="margin-bottom:10px;"><h4 style="margin:0 0 8px;">📌 ' + esc(group) + '</h4><div style="overflow-x:auto;"><table>' +
        '<tr><th>ชื่อตัวเลือก</th><th>ราคา</th><th>จัดการ</th></tr>';
      byGroup[group].forEach(o => {
        html += '<tr><td><b>' + esc(o.name) + '</b></td><td>' + o.price + '฿</td><td><button type="button" onclick="delOption(' + o.id + ')" style="color:red;">ลบ</button></td></tr>';
      });
      html += '</table></div></div>';
    });
    if ($('optionByCategory')) $('optionByCategory').innerHTML = html || '<p class="muted">ยังไม่มีตัวเลือกในระบบ</p>';

    renderMenuOptionsCheckboxes();
  } catch(e) {}
}

function addNewOptionGroupPrompt() {
  const newGroup = prompt('กรอกชื่อกลุ่มตัวเลือกใหม่ (เช่น ขนาดน้ำเปล่า):');
  if (!newGroup || !newGroup.trim()) return;
  const trimmed = newGroup.trim();
  const select = $('oGroup');
  let exists = false;
  for (let i = 0; i < select.options.length; i++) { if (select.options[i].value === trimmed) { exists = true; break; } }
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = trimmed; opt.textContent = trimmed;
    select.appendChild(opt);
  }
  select.value = trimmed;
}

async function submitOptionForm(e) {
  e.preventDefault();
  try {
    await api('/api/options', { method: 'POST', body: { name: $('oName').value, price: Number($('oPrice').value), groupName: $('oGroup').value } });
    $('optionForm').reset();
    loadOptions();
    alert('เพิ่มตัวเลือกสำเร็จ!');
  } catch(err) { alert(err.message); }
}

async function delOption(id) {
  if (!confirm('ต้องการลบตัวเลือกนี้ใช่หรือไม่?')) return;
  try { await api('/api/options/' + id, { method: 'DELETE' }); loadOptions(); loadMenu(); } catch(e) { alert(e.message); }
}

function renderMenuOptionsCheckboxes() {
  const el = $('mOptionsList');
  if (!el) return;
  if (!optionsData.length) {
    el.innerHTML = '<p class="muted" style="margin:4px 0; font-size:0.9rem;">ยังไม่มีตัวเลือกในระบบ (เพิ่มได้ที่แท็บ "จัดการตัวเลือก")</p>';
    return;
  }
  const byGroup = {};
  optionsData.forEach(o => { const g = o.groupName || 'ตัวเลือกทั่วไป'; (byGroup[g] = byGroup[g] || []).push(o); });
  let html = '';
  Object.keys(byGroup).forEach(group => {
    const groupItems = byGroup[group];
    const allChecked = groupItems.every(o => selectedMenuOptions.includes(o.id));
    html += '<div style="margin:6px 0; border-bottom:1px dashed #cbd5e1; padding-bottom:4px;">' +
      '<label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:#4f46e5; cursor:pointer; background:#e0e7ff; padding:4px 8px; border-radius:4px;">' +
      '<input type="checkbox" ' + (allChecked && groupItems.length > 0 ? 'checked' : '') + ' onchange="toggleMenuOptionGroup(\\'' + esc(group).replace(/'/g, "\\\\'") + '\\', this.checked)"> ' +
      '📌 ' + esc(group) + ' (เลือกกลุ่มนี้ทั้งหมด)</label>';
    html += '<div style="padding-left:16px; margin-top:4px;">';
    html += groupItems.map(o =>
      '<label style="display:flex; align-items:center; gap:8px; padding:3px 0; font-weight:normal; color:#212529;"><input type="checkbox" value="' + o.id + '" ' +
      (selectedMenuOptions.includes(o.id) ? 'checked' : '') + ' onchange="toggleMenuOption(' + o.id + ', this.checked)"> ' +
      esc(o.name) + ' (' + o.price + ' บาท)</label>'
    ).join('');
    html += '</div></div>';
  });
  el.innerHTML = html;
}

function toggleMenuOptionGroup(group, checked) {
  const groupOpts = optionsData.filter(o => (o.groupName || 'ตัวเลือกทั่วไป') === group);
  groupOpts.forEach(o => {
    if (checked) {
      if (!selectedMenuOptions.includes(o.id)) selectedMenuOptions.push(o.id);
    } else {
      selectedMenuOptions = selectedMenuOptions.filter(id => id !== o.id);
    }
  });
  renderMenuOptionsCheckboxes();
}

function toggleMenuOption(id, checked) {
  if (checked) { if (!selectedMenuOptions.includes(id)) selectedMenuOptions.push(id); }
  else { selectedMenuOptions = selectedMenuOptions.filter(x => x !== id); }
  renderMenuOptionsCheckboxes();
}

async function loadToppings() {
  try {
    toppingsData = await api('/api/toppings');
    const cats = [...new Set(toppingsData.map(t => t.category || 'ท็อปปิ้งทั่วไป'))];
    let catOpts = '<option value="">-- เลือกหรือเพิ่มหมวดใหม่ --</option>';
    cats.forEach(c => { catOpts += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
    if ($('tCat')) $('tCat').innerHTML = catOpts;

    const byCat = {};
    toppingsData.forEach(t => { const c = t.category || 'ท็อปปิ้งทั่วไป'; (byCat[c] = byCat[c] || []).push(t); });

    let html = '';
    Object.keys(byCat).forEach(cat => {
      html += '<div class="panel" style="margin-bottom:10px;"><h4 style="margin:0 0 8px;">📂 ' + esc(cat) + '</h4><div style="overflow-x:auto;"><table>' +
        '<tr><th>ชื่อท็อปปิ้ง</th><th>ราคา</th><th>จัดการ</th></tr>';
      byCat[cat].forEach(t => {
        html += '<tr><td><b>' + esc(t.name) + '</b></td><td>+' + t.price + '฿</td><td><button type="button" onclick="delTopping(' + t.id + ')" style="color:red;">ลบ</button></td></tr>';
      });
      html += '</table></div></div>';
    });
    if ($('toppingByCategory')) $('toppingByCategory').innerHTML = html || '<p class="muted">ยังไม่มีท็อปปิ้งในระบบ</p>';

    renderMenuToppingsCheckboxes();
  } catch(e) {}
}

function addNewToppingCategoryPrompt() {
  const newCat = prompt('กรอกชื่อหมวดหมู่ท็อปปิ้งใหม่:');
  if (!newCat || !newCat.trim()) return;
  const trimmedCat = newCat.trim();
  const select = $('tCat');
  let exists = false;
  for (let i = 0; i < select.options.length; i++) { if (select.options[i].value === trimmedCat) { exists = true; break; } }
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = trimmedCat; opt.textContent = trimmedCat;
    select.appendChild(opt);
  }
  select.value = trimmedCat;
}

async function submitToppingForm(e) {
  e.preventDefault();
  try {
    await api('/api/toppings', { method: 'POST', body: { name: $('tName').value, price: Number($('tPrice').value), category: $('tCat').value } });
    $('toppingForm').reset();
    loadToppings();
    alert('เพิ่มท็อปปิ้งสำเร็จ!');
  } catch(err) { alert(err.message); }
}

async function delTopping(id) {
  if (!confirm('ต้องการลบท็อปปิ้งนี้ใช่หรือไม่?')) return;
  try { await api('/api/toppings/' + id, { method: 'DELETE' }); loadToppings(); loadMenu(); } catch(e) { alert(e.message); }
}

function renderMenuToppingsCheckboxes() {
  const el = $('mToppingsList');
  if (!el) return;
  if (!toppingsData.length) {
    el.innerHTML = '<p class="muted" style="margin:4px 0; font-size:0.9rem;">ยังไม่มีท็อปปิ้งในระบบ (เพิ่มได้ที่แท็บ "จัดการท็อปปิ้ง")</p>';
    return;
  }
  const byCat = {};
  toppingsData.forEach(t => { const c = t.category || 'ท็อปปิ้งทั่วไป'; (byCat[c] = byCat[c] || []).push(t); });
  let html = '';
  Object.keys(byCat).forEach(cat => {
    const catItems = byCat[cat];
    const allChecked = catItems.every(t => selectedMenuToppings.includes(t.id));
    html += '<div style="margin:6px 0; border-bottom:1px dashed #cbd5e1; padding-bottom:4px;">' +
      '<label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:#0891b2; cursor:pointer; background:#e0f2fe; padding:4px 8px; border-radius:4px;">' +
      '<input type="checkbox" ' + (allChecked && catItems.length > 0 ? 'checked' : '') + ' onchange="toggleMenuToppingCategory(\\'' + esc(cat).replace(/'/g, "\\\\'") + '\\', this.checked)"> ' +
      '📂 ' + esc(cat) + ' (เลือกทั้งหมด)</label>';
    html += '<div style="padding-left:16px; margin-top:4px;">';
    html += catItems.map(t =>
      '<label style="display:flex; align-items:center; gap:8px; padding:3px 0; font-weight:normal; color:#212529;"><input type="checkbox" value="' + t.id + '" ' +
      (selectedMenuToppings.includes(t.id) ? 'checked' : '') + ' onchange="toggleMenuTopping(' + t.id + ', this.checked)"> ' +
      esc(t.name) + ' (+' + t.price + ' บาท)</label>'
    ).join('');
    html += '</div></div>';
  });
  el.innerHTML = html;
}

function toggleMenuToppingCategory(cat, checked) {
  const catToppings = toppingsData.filter(t => (t.category || 'ท็อปปิ้งทั่วไป') === cat);
  catToppings.forEach(t => {
    if (checked) {
      if (!selectedMenuToppings.includes(t.id)) selectedMenuToppings.push(t.id);
    } else {
      selectedMenuToppings = selectedMenuToppings.filter(id => id !== t.id);
    }
  });
  renderMenuToppingsCheckboxes();
}

function toggleMenuTopping(id, checked) {
  if (checked) { if (!selectedMenuToppings.includes(id)) selectedMenuToppings.push(id); }
  else { selectedMenuToppings = selectedMenuToppings.filter(x => x !== id); }
  renderMenuToppingsCheckboxes();
}

async function loadMenu() {
  menuData = await api('/api/menu');
  const cats = [...new Set(menuData.map(m => m.category))].filter(Boolean);
  let catOpts = '<option value="">-- เลือกหมวดหมู่ที่มีอยู่ --</option>';
  cats.forEach(c => { catOpts += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
  if ($('mCat')) $('mCat').innerHTML = catOpts;

  const byCat = {};
  menuData.forEach(m => { const c = m.category || 'อื่นๆ'; (byCat[c] = byCat[c] || []).push(m); });

  let html = '';
  Object.keys(byCat).sort((a,b) => a.localeCompare(b,'th')).forEach(cat => {
    const items = byCat[cat];
    const collapsed = menuCatCollapsed[cat] === undefined ? true : menuCatCollapsed[cat];
    html += '<div class="panel" style="margin-bottom:14px;">' +
      '<div class="catGroupHeader" onclick="toggleMenuCatGroup(\\'' + esc(cat).replace(/'/g, "\\\\'") + '\\')">' +
      '<h3 style="margin:0;">📂 ' + esc(cat) + ' <span class="muted" style="font-size:0.8rem;">(' + items.length + ' รายการ)</span></h3>' +
      '<span>' + (collapsed ? '▼ แสดง' : '▲ ซ่อน') + '</span></div>';
    if (!collapsed) {
      html += '<div style="overflow-x:auto; margin-top:10px;"><table>' +
        '<tr><th>รูปภาพ</th><th>ชื่อเมนู</th><th>ราคา</th><th>สถานะ</th><th>จัดการ</th></tr>';
      items.forEach(m => {
        const priceView = m.price > 0 ? (m.price + '฿') : 'ตามตัวเลือก';
        const hasImage = m.image && m.image.trim() !== '';
        const imgView = hasImage
          ? '<div style="display:flex; align-items:center; gap:4px;"><img src="' + esc(m.image) + '" style="width:36px;height:36px;object-fit:cover;border-radius:4px;" onerror="this.style.display=\\'none\\'"><span style="color:#10b981; font-size:0.75rem; font-weight:bold; white-space:nowrap;">🖼️ มีรูป</span></div>'
          : '<span style="color:#ef4444; font-size:0.75rem; font-weight:bold; white-space:nowrap;">❌ ไม่มีรูป</span>';

        html += '<tr>' +
          '<td>' + imgView + '</td>' +
          '<td><b>' + esc(m.name) + '</b> ' + (m.recommended ? '<span style="color:red; font-size:0.8rem;">(แนะนำ)</span>' : '') +
          (m.hasPlaraOption ? '<span style="color:#7c3aed; font-size:0.8rem;"> (ปลาร้า)</span>' : '') +
          (m.hasSpiceOption ? '<span style="color:#ea580c; font-size:0.8rem;"> (เผ็ด)</span>' : '') +
          (m.hasOptionChoice ? '<span style="color:#4f46e5; font-size:0.8rem;"> (ตัวเลือก)</span>' : '') +
          (m.hasToppingOption ? '<span style="color:#0891b2; font-size:0.8rem;"> (ท็อปปิ้ง ' + (m.toppings ? m.toppings.length : 0) + ')</span>' : '') + '</td>' +
          '<td>' + priceView + '</td>' +
          '<td>' + (m.available ? '<span style="color:green;">พร้อมขาย</span>' : '<span style="color:red;">หมด</span>') + '</td>' +
          '<td><button type="button" onclick="editMenu(' + m.id + ')">แก้ไข</button> <button type="button" onclick="delMenu(' + m.id + ')" style="color:red;">ลบ</button></td></tr>';
      });
      html += '</table></div>';
    }
    html += '</div>';
  });
  if ($('menuByCategory')) $('menuByCategory').innerHTML = html || '<p class="muted">ยังไม่มีเมนูในระบบ</p>';

  if (!toppingsData.length) { try { toppingsData = await api('/api/toppings'); } catch(e) {} }
  if (!optionsData.length) { try { optionsData = await api('/api/options'); } catch(e) {} }
  renderMenuToppingsCheckboxes();
  renderMenuOptionsCheckboxes();
}

function toggleMenuCatGroup(cat) { menuCatCollapsed[cat] = !menuCatCollapsed[cat]; loadMenu(); }

function addNewCategoryPrompt() {
  const newCat = prompt('กรอกชื่อหมวดหมู่ใหม่ที่ต้องการเพิ่ม:');
  if (!newCat || !newCat.trim()) return;
  const trimmedCat = newCat.trim();
  const select = $('mCat');
  let exists = false;
  for (let i = 0; i < select.options.length; i++) { if (select.options[i].value === trimmedCat) { exists = true; break; } }
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = trimmedCat; opt.textContent = trimmedCat;
    select.appendChild(opt);
  }
  select.value = trimmedCat;
}

document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'mOptionSwitch') {
    $('mOptionsContainerBox').hidden = !e.target.checked;
  }
});

function editMenu(id) {
  const m = menuData.find(x => x.id === id);
  $('mId').value = m.id; $('mName').value = m.name; $('mPrice').value = m.price;
  const select = $('mCat');
  let found = false;
  for (let i = 0; i < select.options.length; i++) { if (select.options[i].value === m.category) { found = true; break; } }
  if (!found && m.category) {
    const opt = document.createElement('option');
    opt.value = m.category; opt.textContent = m.category;
    select.appendChild(opt);
  }
  select.value = m.category || '';
  $('mImg').value = m.image || '';
  $('mAvail').checked = m.available; $('mRec').checked = !!m.recommended;
  $('mPlara').checked = !!m.hasPlaraOption;
  $('mSpice').checked = !!m.hasSpiceOption;
  $('mOptionSwitch').checked = !!m.hasOptionChoice;
  $('mOptionsContainerBox').hidden = !m.hasOptionChoice;
  $('mToppingSwitch').checked = !!m.hasToppingOption;
  
  selectedMenuToppings = (m.toppings || []).slice();
  selectedMenuOptions = (m.options || []).slice();
  
  renderMenuToppingsCheckboxes();
  renderMenuOptionsCheckboxes();
  window.scrollTo({ top: 300, behavior: 'smooth' });
}
function resetMenuForm() { 
  $('menuForm').reset(); 
  $('mId').value = ''; 
  selectedMenuToppings = []; 
  selectedMenuOptions = []; 
  $('mOptionsContainerBox').hidden = true;
  renderMenuToppingsCheckboxes(); 
  renderMenuOptionsCheckboxes();
}

async function submitMenuForm(e) {
  e.preventDefault();
  const body = { 
    name: $('mName').value, 
    price: Number($('mPrice').value), 
    category: $('mCat').value,
    image: $('mImg').value, 
    available: $('mAvail').checked, 
    recommended: $('mRec').checked,
    hasPlaraOption: $('mPlara').checked, 
    hasSpiceOption: $('mSpice').checked,
    hasOptionChoice: $('mOptionSwitch').checked,
    hasToppingOption: $('mToppingSwitch').checked, 
    toppings: selectedMenuToppings,
    options: selectedMenuOptions 
  };
  try {
    if ($('mId').value) await api('/api/menu/' + $('mId').value, { method: 'PUT', body: body });
    else await api('/api/menu', { method: 'POST', body: body });
    resetMenuForm();
    loadMenu();
    loadSettingsForm();
    alert('บันทึกเมนูสำเร็จ!');
  } catch (err) { alert(err.message); }
}

async function delMenu(id) {
  if (!confirm('ต้องการลบเมนูนี้ใช่หรือไม่?')) return;
  try { await api('/api/menu/' + id, { method: 'DELETE' }); loadMenu(); loadSettingsForm(); } catch (e) { alert(e.message); }
}

let currentSettingsCatOrder = [];

async function loadSettingsForm() {
  try {
    const s = await api('/api/settings');
    if (s.theme && $('setTheme')) $('setTheme').value = s.theme;
    if (s.shopName && $('setName')) $('setName').value = s.shopName;
    if (Array.isArray(s.categoryOrder)) currentSettingsCatOrder = s.categoryOrder;
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
    renderCategoryOrderUI();
  } catch(e){}
}

async function renderCategoryOrderUI() {
  try {
    const menuList = await api('/api/menu');
    const allCats = [...new Set(menuList.map(m => m.category))].filter(Boolean);
    let ordered = [...currentSettingsCatOrder];
    allCats.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
    ordered = ordered.filter(c => allCats.includes(c));
    currentSettingsCatOrder = ordered;

    let delOpts = '<option value="">-- เลือกหมวดหมู่ที่ต้องการลบ --</option>';
    allCats.forEach(c => { delOpts += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
    if ($('delCatSelect')) $('delCatSelect').innerHTML = delOpts;

    let html = '';
    if (!ordered.length) {
      html = '<p class="muted" style="margin:4px 0; font-size:0.9rem;">ยังไม่มีหมวดหมู่ในระบบ (ให้เพิ่มเมนูก่อน)</p>';
    } else {
      ordered.forEach((cat, idx) => {
        html += '<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:6px 10px; margin:4px 0; border-radius:6px; border:1px solid #cbd5e1;">' +
          '<span><b>' + (idx + 1) + '.</b> ' + esc(cat) + '</span>' +
          '<div>' +
          (idx > 0 ? '<button type="button" onclick="moveCat(' + idx + ', -1)" style="padding:2px 8px; margin-right:4px;">⬆️ ขึ้น</button>' : '') +
          (idx < ordered.length - 1 ? '<button type="button" onclick="moveCat(' + idx + ', 1)" style="padding:2px 8px;">⬇️ ลง</button>' : '') +
          '</div></div>';
      });
    }
    if ($('categoryOrderList')) $('categoryOrderList').innerHTML = html;
  } catch(e) {}
}

function moveCat(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= currentSettingsCatOrder.length) return;
  const temp = currentSettingsCatOrder[index];
  currentSettingsCatOrder[index] = currentSettingsCatOrder[target];
  currentSettingsCatOrder[target] = temp;
  let html = '';
  currentSettingsCatOrder.forEach((cat, idx) => {
    html += '<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:6px 10px; margin:4px 0; border-radius:6px; border:1px solid #cbd5e1;">' +
      '<span><b>' + (idx + 1) + '.</b> ' + esc(cat) + '</span>' +
      '<div>' +
      (idx > 0 ? '<button type="button" onclick="moveCat(' + idx + ', -1)" style="padding:2px 8px; margin-right:4px;">⬆️ ขึ้น</button>' : '') +
      (idx < currentSettingsCatOrder.length - 1 ? '<button type="button" onclick="moveCat(' + idx + ', 1)" style="padding:2px 8px;">⬇️ ลง</button>' : '') +
      '</div></div>';
  });
  if ($('categoryOrderList')) $('categoryOrderList').innerHTML = html;
}

async function deleteCategory() {
  const catToDel = $('delCatSelect').value;
  if (!catToDel) return alert('กรุณาเลือกหมวดหมู่ที่ต้องการลบ');
  if (!confirm('ยืนยันการลบหมวดหมู่ "' + catToDel + '"? เมนูทั้งหมดในหมวดนี้จะถูกย้ายไปที่หมวด "อื่นๆ"')) return;
  try {
    for (const m of menuData) {
      if (m.category === catToDel) { m.category = 'อื่นๆ'; await api('/api/menu/' + m.id, { method: 'PUT', body: m }); }
    }
    alert('ลบหมวดหมู่เรียบร้อยแล้ว');
    loadMenu();
    loadSettingsForm();
  } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function saveSettings() {
  try {
    const logoVal = $('setLogo').value.trim();
    const body = {
      theme: $('setTheme').value, shopName: $('setName').value, logo: logoVal,
      soundType: $('setSound').value, customAudio: $('setCustomAudio').value,
      soundVolume: $('setVol').value, loopInterval: $('setLoopInterval').value,
      categoryOrder: currentSettingsCatOrder
    };
    const res = await api('/api/settings', { method: 'PUT', body: body });
    document.documentElement.style.setProperty('--primary', res.theme);
    if ($('shopNameText')) $('shopNameText').textContent = res.shopName;
    if (Array.isArray(res.categoryOrder)) customCatOrder = res.categoryOrder;
    document.querySelectorAll('.shopLogo').forEach(img => {
      if(res.logo) { img.onerror = function(){ img.hidden = true; }; img.src = res.logo; img.hidden = false; } else { img.hidden = true; }
    });
    window.currentSoundType = res.soundType;
    window.currentCustomAudio = res.customAudio;
    window.currentSoundVol = Number(res.soundVolume);
    window.currentLoopInterval = Number(res.loopInterval || '5') * 1000;
    alert('บันทึกการตั้งค่าสำเร็จ!');
    loadSettingsForm();
  } catch(e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
}

async function loadUsers() {
  const users = await api('/api/users');
  let s = '<tr><th>ชื่อผู้ใช้</th><th>ระดับสิทธิ์</th><th>จัดการ</th></tr>';
  users.forEach(u => {
    s += '<tr><td><b>' + esc(u.username) + '</b></td><td>' + (u.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'พนักงาน (Staff)') + '</td><td>' +
      (u.username !== me.username ? '<button type="button" data-u="' + esc(u.username) + '" onclick="delUser(this.dataset.u)" style="color:red;">ลบ</button>' : '<span class="muted">บัญชีของคุณ</span>') +
      '</td></tr>';
  });
  if ($('userTable')) $('userTable').innerHTML = s;
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

// ===== ระบบป้องกันหน้าจอดับเฉพาะหน้าแอดมิน (Screen Wake Lock) =====
let wakeLock = null;

async function enableKeepScreenOn() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('💡 เปิดโหมดค้างหน้าจอหลังร้านเรียบร้อยแล้ว');
    }
  } catch (err) {
    console.log('Screen Wake Lock Error:', err.message);
  }
}

document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    enableKeepScreenOn();
  }
});

async function init() {
  try { me = await api('/api/me'); } catch (e) { me = null; localStorage.removeItem('token'); }
  $('loginBox').hidden = !!me;
  $('app').hidden = !me;
  $('logoutBtn').hidden = !me;
  $('who').textContent = me ? me.username + ' (' + (me.role === 'admin' ? 'ผู้ดูแล' : 'พนักงาน') + ')' : '';
  if (!me) return;

  enableKeepScreenOn();

  document.querySelectorAll('.adminOnly').forEach(el => { el.hidden = me.role !== 'admin'; });
  if ($('soundUnlockBar')) $('soundUnlockBar').hidden = false;
  switchTab('orders');
  loadOrders();
  loadTables();
  loadSettingsForm();
  if (me.role === 'admin') { loadMenu(); loadUsers(); loadToppings(); loadOptions(); }
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
