const mongoose = require('mongoose');

// 1. ใส่ Connection String ของ MongoDB Atlas (อย่าลืมแก้รหัสผ่านจริง)
const MONGODB_URI = 'mongodb+srv://phacharadanailhorlhom_db_user:KF5VLaewW1JZOnw2@menuimage.5nplzzm.mongodb.net/shop_db?retryWrites=true&w=majority';

// 2. ใส่ BIN ID ทั้ง 3 ตัวของคุณ
const BIN_IDS = [
  '6ad9eacdffd5d1605382454d',
  '6ae0b22effd5d160538ff865',
  '6ae0b27fffd5d160538ff96e'
];

// 3. ใส่ Master Key จาก JSONBin (ถ้ามี)
const MASTER_KEY = '$2a$10$8u3JlCEVMeRuRLHXIL/R/OT0QICvvBrsx2LQykKP4jv/rJD5qN2je';

const storeSchema = new mongoose.Schema({}, { strict: false });
const StoreModel = mongoose.model('StoreData', storeSchema);

async function fetchBinData(binId) {
  const headers = {};
  if (MASTER_KEY) headers['X-Master-Key'] = MASTER_KEY;
  const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers });
  const result = await response.json();
  return result.record || {};
}

async function startMigration() {
  try {
    console.log('⏳ 1. กำลังเชื่อมต่อ MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);

    console.log('⏳ 2. กำลังดึงข้อมูลจากทั้ง 3 Bin พร้อมกัน...');
    const [bin1, bin2, bin3] = await Promise.all(BIN_IDS.map(id => fetchBinData(id)));

    console.log('⏳ 3. กำลังรวมข้อมูลและย้ายเข้า MongoDB...');
    
    // รวมข้อมูลจากทั้ง 3 Bin เข้าด้วยกันโดยอัตโนมัติ
    const mergedData = {
      users: bin1.users || bin2.users || bin3.users || [],
      menu: bin1.menu || bin2.menu || bin3.menu || [],
      orders: bin1.orders || bin2.orders || bin3.orders || [],
      tables: bin1.tables || bin2.tables || bin3.tables || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      options: bin1.options || bin2.options || bin3.options || [],
      toppings: bin1.toppings || bin2.toppings || bin3.toppings || [],
      settings: { ...(bin1.settings || {}), ...(bin2.settings || {}), ...(bin3.settings || {}) },
      images: { ...(bin1.images || {}), ...(bin2.images || {}), ...(bin3.images || {}) },
      nextMenuId: bin1.nextMenuId || bin2.nextMenuId || bin3.nextMenuId || 1,
      nextOrderId: bin1.nextOrderId || bin2.nextOrderId || bin3.nextOrderId || 1,
      nextOptionId: bin1.nextOptionId || bin2.nextOptionId || bin3.nextOptionId || 1,
      nextToppingId: bin1.nextToppingId || bin2.nextToppingId || bin3.nextToppingId || 1
    };

    // บันทึกข้อมูลรวมทั้งหมดลง MongoDB
    await StoreModel.updateOne(
      { key: 'main_store' },
      { $set: { key: 'main_store', ...mergedData } },
      { upsert: true }
    );

    console.log('🎉 ✅ ย้ายข้อมูลจากทั้ง 3 Bin ไปรวมไว้ใน MongoDB Atlas สำเร็จเรียบร้อย!');
    process.exit(0);
  } catch (error) {
    console.error('❌ ย้ายข้อมูลไม่สำเร็จ:', error.message);
    process.exit(1);
  }
}

startMigration();
