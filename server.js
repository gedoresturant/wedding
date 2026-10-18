const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-before-deployment';
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'wedding-halls.sqlite');
const PENDING_RESTORE_PATH = path.join(DATA_DIR, 'pending-restore.sqlite');
// Apply a staged restore before opening SQLite, after the previous process has released file locks.
if (fs.existsSync(PENDING_RESTORE_PATH)) {
 try {
  const candidate = new Database(PENDING_RESTORE_PATH, { readonly: true, fileMustExist: true });
  const integrity = candidate.pragma('integrity_check', { simple: true });
  const tables = candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  candidate.close();
  if (integrity !== 'ok' || !['companies','users','bookings'].every(t=>tables.includes(t))) throw new Error('النسخة المعلقة غير صالحة');
  if (fs.existsSync(DB_PATH)) {
   const safety = path.join(DATA_DIR, 'auto-before-restore-startup-' + new Date().toISOString().replace(/[:.]/g,'-') + '.sqlite');
   fs.copyFileSync(DB_PATH, safety);
  }
  for (const suffix of ['-wal','-shm']) { try { fs.unlinkSync(DB_PATH + suffix); } catch(e) { if(e.code!=='ENOENT') throw e; } }
  fs.copyFileSync(PENDING_RESTORE_PATH, DB_PATH);
  fs.unlinkSync(PENDING_RESTORE_PATH);
 } catch (restoreStartupError) {
  try { fs.appendFileSync(path.join(DATA_DIR,'restore-errors.log'), new Date().toISOString()+' '+restoreStartupError.message+'\\n'); } catch(e) {}
  try { if(fs.existsSync(PENDING_RESTORE_PATH)) fs.unlinkSync(PENDING_RESTORE_PATH); } catch(e) {}
 }
}
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 slug TEXT NOT NULL UNIQUE,
 logo_url TEXT DEFAULT '',
 currency TEXT DEFAULT 'EGP',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 username TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'employee',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id, username)
);
CREATE TABLE IF NOT EXISTS halls (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 venue TEXT DEFAULT '',
 capacity INTEGER DEFAULT 0,
 day_price REAL NOT NULL DEFAULT 0,
 evening_price REAL NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 groom_name TEXT DEFAULT '',
 bride_name TEXT DEFAULT '',
 event_type TEXT DEFAULT 'حفل زفاف',
 venue TEXT DEFAULT '',
 hall_id INTEGER REFERENCES halls(id),
 event_date TEXT DEFAULT '',
 event_period TEXT DEFAULT '',
 source TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new',
 budget REAL DEFAULT 0,
 notes TEXT DEFAULT '',
 next_followup TEXT DEFAULT '',
 assigned_to INTEGER REFERENCES users(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 hall_id INTEGER NOT NULL REFERENCES halls(id),
 event_date TEXT NOT NULL,
 event_period TEXT NOT NULL CHECK(event_period IN ('نهاري','مسائي')),
 guest_count INTEGER DEFAULT 0,
 event_type TEXT DEFAULT 'حفل زفاف',
 contract_total REAL NOT NULL DEFAULT 0,
 discount REAL NOT NULL DEFAULT 0,
 paid_total REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'مبدئي',
 notes TEXT DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 invitation_token TEXT DEFAULT '',
 invitation_expires_at TEXT DEFAULT '',
 invitation_used_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS packages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 hall_id INTEGER REFERENCES halls(id),
 name TEXT NOT NULL,
 guest_count INTEGER NOT NULL DEFAULT 0,
 price REAL NOT NULL DEFAULT 0,
 event_period TEXT NOT NULL DEFAULT 'مسائي',
 description TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS paragraphs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 price REAL NOT NULL DEFAULT 0,
 event_period TEXT NOT NULL DEFAULT 'مسائي',
 duration_minutes INTEGER NOT NULL DEFAULT 0,
 show_names TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS saved_documents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 document_type TEXT NOT NULL CHECK(document_type IN ('instruction','contract')),
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 created_by INTEGER REFERENCES users(id),
 updated_by INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_saved_documents_company_type ON saved_documents(company_id,document_type,updated_at DESC);
CREATE TABLE IF NOT EXISTS menu_groups (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 price REAL NOT NULL DEFAULT 0,
 event_period TEXT NOT NULL DEFAULT 'مسائي',
 price_mode TEXT NOT NULL DEFAULT 'per_person',
 description TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS menu_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 menu_group_id INTEGER NOT NULL REFERENCES menu_groups(id),
 name TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'أكل',
 quantity TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booking_paragraphs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 paragraph_id INTEGER REFERENCES paragraphs(id),
 name_snapshot TEXT NOT NULL,
 price_snapshot REAL NOT NULL DEFAULT 0,
 duration_snapshot INTEGER NOT NULL DEFAULT 0,
 show_names_snapshot TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS booking_menu_groups (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 menu_group_id INTEGER REFERENCES menu_groups(id),
 name_snapshot TEXT NOT NULL,
 price_snapshot REAL NOT NULL DEFAULT 0,
 items_snapshot TEXT DEFAULT '',
 unit_price_snapshot REAL NOT NULL DEFAULT 0,
 guest_count_snapshot INTEGER NOT NULL DEFAULT 0,
 price_mode_snapshot TEXT NOT NULL DEFAULT 'fixed'
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 amount REAL NOT NULL CHECK(amount > 0),
 method TEXT DEFAULT 'نقدي',
 reference TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 paid_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS expenses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 title TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount > 0),
 category TEXT DEFAULT 'عام',
 expense_date TEXT NOT NULL,
 notes TEXT DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS followups (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 due_at TEXT NOT NULL,
 note TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 assigned_to INTEGER REFERENCES users(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 completed_at TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 requested_discount REAL NOT NULL,
 requested_by INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending',
 reviewed_by INTEGER REFERENCES users(id),
 review_reason TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 notification_type TEXT DEFAULT 'info',
 entity_type TEXT DEFAULT '',
 entity_id INTEGER DEFAULT 0,
 is_read INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contractors (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL,
 service_type TEXT DEFAULT '',
 phone TEXT DEFAULT '',
 default_price REAL NOT NULL DEFAULT 0,
 notes TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booking_contractors (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 service_name TEXT NOT NULL,
 price REAL NOT NULL DEFAULT 0,
 notes TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contractor_payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 amount REAL NOT NULL CHECK(amount > 0),
 method TEXT NOT NULL DEFAULT 'كاش',
 payment_date TEXT NOT NULL,
 notes TEXT DEFAULT '',
 paid_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS costs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER REFERENCES bookings(id),
 title TEXT NOT NULL,
 category TEXT DEFAULT 'عام',
 amount REAL NOT NULL CHECK(amount > 0),
 cost_date TEXT NOT NULL,
 notes TEXT DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cash_transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 transaction_type TEXT NOT NULL CHECK(transaction_type IN ('in','out')),
 amount REAL NOT NULL CHECK(amount > 0),
 category TEXT NOT NULL,
 method TEXT NOT NULL DEFAULT 'كاش',
 reference TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 transaction_date TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 entity TEXT NOT NULL,
 entity_id INTEGER DEFAULT 0,
 details TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookings_company_date ON bookings(company_id,event_date);
CREATE INDEX IF NOT EXISTS idx_customers_company_phone ON customers(company_id,phone);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
`);

// Booking advance/deposit and refundable insurance receipts.
// Soft-delete bookings while retaining linked receipts, cash movements, and audit history.
const bookingColsV37 = db.prepare('PRAGMA table_info(bookings)').all().map(c=>c.name);
if (!bookingColsV37.includes('deleted_at')) db.exec("ALTER TABLE bookings ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''");
if (!bookingColsV37.includes('deleted_by')) db.exec("ALTER TABLE bookings ADD COLUMN deleted_by INTEGER REFERENCES users(id)");
if (!bookingColsV37.includes('delete_reason')) db.exec("ALTER TABLE bookings ADD COLUMN delete_reason TEXT NOT NULL DEFAULT ''");
const paymentColsV30 = db.prepare('PRAGMA table_info(payments)').all().map(c=>c.name);
if (!paymentColsV30.includes('payment_type')) db.exec("ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'دفعة'");
db.exec(`CREATE TABLE IF NOT EXISTS booking_insurance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 amount REAL NOT NULL CHECK(amount > 0),
 method TEXT NOT NULL DEFAULT 'كاش',
 reference TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'محتفظ به',
 received_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS insurance_refunds (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id),
 insurance_id INTEGER NOT NULL REFERENCES booking_insurance(id),
 amount REAL NOT NULL CHECK(amount > 0),
 method TEXT NOT NULL DEFAULT 'كاش',
 reference TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 refunded_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

// Configurable per-user discount permissions and percentage/amount approval requests.
const userColsV10 = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
const initialUserColsV12 = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
if(!initialUserColsV12.includes('job_title')) db.exec("ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT ''");
if(!initialUserColsV12.includes('permissions_json')) db.exec("ALTER TABLE users ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'");
const allPermissionKeysV12=['dashboard','customers','followups','bookings','cashierView','bookingDelete','calendar','halls','packages','paragraphs','menus','instructions','contracts','finance','contractors','costs','cashbox','discountRequests','reports','users','logs','settings'];
const allPermissionsJsonV12=JSON.stringify(allPermissionKeysV12);
db.exec("UPDATE users SET job_title=CASE role WHEN 'admin' THEN 'مدير النظام' WHEN 'manager' THEN 'مدير' WHEN 'reception' THEN 'استقبال' WHEN 'accountant' THEN 'حسابات' ELSE 'موظف' END WHERE job_title=''");
const legacyPermissionSetsV12={
 admin:allPermissionKeysV12,
 manager:['dashboard','customers','followups','bookings','calendar','halls','packages','paragraphs','menus','finance','contractors','costs','cashbox','reports','users','logs','settings'],
 reception:['dashboard','customers','followups','bookings','calendar','halls','paragraphs','menus'],
 accountant:['dashboard','bookings','calendar','finance','contractors','cashbox'],
 employee:['dashboard']
};
for(const [role,perms] of Object.entries(legacyPermissionSetsV12))
 db.prepare("UPDATE users SET permissions_json=? WHERE role=? AND permissions_json='[]'").run(JSON.stringify(perms),role);

const addedDiscountLimitValueV10=!userColsV10.includes('discount_limit_value');
if(!userColsV10.includes('discount_limit_type')) db.exec("ALTER TABLE users ADD COLUMN discount_limit_type TEXT NOT NULL DEFAULT 'percent'");
if(addedDiscountLimitValueV10) {
 db.exec("ALTER TABLE users ADD COLUMN discount_limit_value REAL NOT NULL DEFAULT 0");
 db.exec("UPDATE users SET discount_limit_value=CASE role WHEN 'admin' THEN 100 WHEN 'manager' THEN 30 WHEN 'reception' THEN 20 ELSE 0 END");
}
const discountReqColsV10 = db.prepare('PRAGMA table_info(discount_requests)').all().map(c=>c.name);
if(!discountReqColsV10.includes('requested_mode')) db.exec("ALTER TABLE discount_requests ADD COLUMN requested_mode TEXT NOT NULL DEFAULT 'amount'");
if(!discountReqColsV10.includes('requested_value')) db.exec("ALTER TABLE discount_requests ADD COLUMN requested_value REAL NOT NULL DEFAULT 0");
if(!discountReqColsV10.includes('allowed_discount')) db.exec("ALTER TABLE discount_requests ADD COLUMN allowed_discount REAL NOT NULL DEFAULT 0");
if(!discountReqColsV10.includes('request_reason')) db.exec("ALTER TABLE discount_requests ADD COLUMN request_reason TEXT NOT NULL DEFAULT ''");

// Per-person meal pricing migrations.
const menuGroupColsV7 = db.prepare('PRAGMA table_info(menu_groups)').all().map(c => c.name);
if (!menuGroupColsV7.includes('price_mode')) { db.exec("ALTER TABLE menu_groups ADD COLUMN price_mode TEXT NOT NULL DEFAULT 'fixed'"); db.exec("UPDATE menu_groups SET price_mode='fixed'"); }
const bookingMenuColsV7 = db.prepare('PRAGMA table_info(booking_menu_groups)').all().map(c => c.name);
if (!bookingMenuColsV7.includes('unit_price_snapshot')) db.exec("ALTER TABLE booking_menu_groups ADD COLUMN unit_price_snapshot REAL NOT NULL DEFAULT 0");
if (!bookingMenuColsV7.includes('guest_count_snapshot')) db.exec("ALTER TABLE booking_menu_groups ADD COLUMN guest_count_snapshot INTEGER NOT NULL DEFAULT 0");
if (!bookingMenuColsV7.includes('price_mode_snapshot')) db.exec("ALTER TABLE booking_menu_groups ADD COLUMN price_mode_snapshot TEXT NOT NULL DEFAULT 'fixed'");

// Package catalog migrations.
const bookingColsV6 = db.prepare('PRAGMA table_info(bookings)').all().map(c => c.name);
if (!bookingColsV6.includes('package_id')) db.exec("ALTER TABLE bookings ADD COLUMN package_id INTEGER REFERENCES packages(id)");
if (!bookingColsV6.includes('package_name_snapshot')) db.exec("ALTER TABLE bookings ADD COLUMN package_name_snapshot TEXT DEFAULT ''");

// Safe migrations for databases created by earlier versions.
const bookingColumns = db.prepare('PRAGMA table_info(bookings)').all().map(c => c.name);
if (!bookingColumns.includes('base_contract_total')) db.exec("ALTER TABLE bookings ADD COLUMN base_contract_total REAL NOT NULL DEFAULT 0");
if (!bookingColumns.includes('invitation_token')) db.exec("ALTER TABLE bookings ADD COLUMN invitation_token TEXT DEFAULT ''");
if (!bookingColumns.includes('invitation_expires_at')) db.exec("ALTER TABLE bookings ADD COLUMN invitation_expires_at TEXT DEFAULT ''");
if (!bookingColumns.includes('invitation_used_at')) db.exec("ALTER TABLE bookings ADD COLUMN invitation_used_at TEXT DEFAULT ''");

// Safe schema upgrades for existing installations.
function ensureColumn(table, column, definition) {
 const columns=db.prepare(`PRAGMA table_info(${table})`).all();
 if(!columns.some(c=>c.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('packages','event_period',"TEXT NOT NULL DEFAULT 'مسائي'");
ensureColumn('packages','included_guest_count','INTEGER NOT NULL DEFAULT 0');
ensureColumn('packages','extra_guest_price','REAL NOT NULL DEFAULT 0');
ensureColumn('packages','included_items',"TEXT NOT NULL DEFAULT ''");
ensureColumn('bookings','extra_guest_total','REAL NOT NULL DEFAULT 0');
ensureColumn('bookings','included_guest_count_snapshot','INTEGER NOT NULL DEFAULT 0');
ensureColumn('bookings','included_items_snapshot',"TEXT NOT NULL DEFAULT ''");
ensureColumn('paragraphs','event_period',"TEXT NOT NULL DEFAULT 'مسائي'");
ensureColumn('menu_groups','event_period',"TEXT NOT NULL DEFAULT 'مسائي'");

function seed() {
 // Fresh installation: create only the company workspace and one administrator.
 // No sample halls, customers, bookings, packages, payments, contractors, or expenses are inserted.
 const companyCount = db.prepare('SELECT COUNT(*) c FROM companies').get().c;
 if (companyCount) return;
 const company = db.prepare('INSERT INTO companies(name,slug,logo_url) VALUES(?,?,?)')
   .run('شركة قاعات الأفراح','wedding-halls','');
 const cid = company.lastInsertRowid;
 const hash = bcrypt.hashSync('ChangeMe@12345', 10);
 db.prepare('INSERT INTO users(company_id,name,username,password_hash,role,job_title) VALUES(?,?,?,?,?,?)')
   .run(cid,'مدير النظام','admin',hash,'admin','مدير النظام');
}
seed();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req,res,next) {
 const token = req.cookies.token || (req.headers.authorization || '').replace(/^Bearer /,'');
 if (!token) return res.status(401).json({error:'يجب تسجيل الدخول'});
 try {
   const user = jwt.verify(token, JWT_SECRET);
   const current = db.prepare('SELECT id,company_id,name,username,role,active,job_title,permissions_json,discount_limit_type,discount_limit_value FROM users WHERE id=?').get(user.id);
   if (!current || !current.active) return res.status(401).json({error:'الحساب غير مفعل'});
   let permissions=[];
   try { permissions=JSON.parse(current.permissions_json||'[]'); } catch(e) { permissions=[]; }
   current.permissions=Array.isArray(permissions)?permissions:[];
   // Legacy administrator accounts retain full access; all other access follows the permissions selected by the owner.
   if(current.role==='admin' && current.permissions.length===0) current.permissions=['dashboard','customers','followups','bookings','cashierView','bookingDelete','calendar','halls','packages','paragraphs','menus','instructions','contracts','finance','contractors','costs','cashbox','discountRequests','reports','users','logs','settings'];
   const pathName=req.path||'';
   const moduleRules=[
    [/^\/api\/auth\//,'dashboard'],
    [/^\/api\/dashboard(\/|$)/,'dashboard'],
    [/^\/api\/expenses?(\/|$)/,'costs'],
    [/^\/api\/payments?(\/|$)/,'finance'],
    [/^\/api\/(customers|clients)(\/|$)/,'customers'],
    [/^\/api\/followups?(\/|$)/,'followups'],
    [/^\/api\/bookings?(\/|$)/,'bookings'],
    [/^\/api\/calendar(\/|$)/,'calendar'],
    [/^\/api\/halls?(\/|$)/,'halls'],
    [/^\/api\/packages?(\/|$)/,'packages'],
    [/^\/api\/menu-groups?(\/|$)/,'menus'],
    [/^\/api\/menu-items?(\/|$)/,'menus'],
    [/^\/api\/(paragraphs|shows)(\/|$)/,'paragraphs'],
    [/^\/api\/(menus|menu-groups|menu-items)(\/|$)/,'menus'],
    [/^\/api\/finance(\/|$)/,'finance'],
    [/^\/api\/contractors?(\/|$)/,'contractors'],
    [/^\/api\/costs?(\/|$)/,'costs'],
    [/^\/api\/cashbox(\/|$)/,'cashbox'],
    [/^\/api\/discount-requests(\/|$)/,'discountRequests'],
    [/^\/api\/reports(\/|$)/,'reports'],
    [/^\/api\/documents\/instruction(\/|$)/,'instructions'],
    [/^\/api\/documents\/contract(\/|$)/,'contracts'],
    [/^\/api\/admin\/users(\/|$)/,'users'],
    [/^\/api\/logs(\/|$)/,'logs'],
    [/^\/api\/admin\/(backup|restore|company)(\/|$)/,'settings']
   ];
   const matched=moduleRules.find(([rx])=>rx.test(pathName));
   if(matched && !current.permissions.includes(matched[1]) && current.role!=='admin')
    return res.status(403).json({error:'ليس لديك صلاحية لهذا القسم. اطلب من مدير النظام تعديل صلاحيات حسابك.'});
   req.user = current;
   next();
 } catch { return res.status(401).json({error:'انتهت الجلسة، سجل الدخول مرة أخرى'}); }
}
function admin(req,res,next) {
 // Access is enforced centrally by auth() using the module permission mapped to this API path.
 return next();
}
function allowRoles(...roles) {
 return (req,res,next) => {
  if(req.user.role==='admin') return next();
  const pathName=req.path||'';
  const map=[
   [/^\/api\/halls/,'halls'],[/^\/api\/customers/,'customers'],[/^\/api\/followups/,'followups'],[/^\/api\/bookings/,'bookings'],
   [/^\/api\/packages/,'packages'],[/^\/api\/paragraphs/,'paragraphs'],[/^\/api\/(menu-groups|menu-items)/,'menus'],
   [/^\/api\/expenses/,'costs'],[/^\/api\/costs/,'costs'],[/^\/api\/cashbox/,'cashbox'],[/^\/api\/contractors/,'contractors'],
   [/^\/api\/payments/,'finance'],[/^\/api\/discount-requests/,'discountRequests'],[/^\/api\/reports/,'reports']
  ].find(([rx])=>rx.test(pathName));
  if(map && req.user.permissions?.includes(map[1])) return next();
  return res.status(403).json({error:'ليس لديك صلاحية لتنفيذ العملية'});
 };
}
function logAction(user,action,entity,entityId=0,details='') {
 db.prepare('INSERT INTO audit_logs(company_id,user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)')
 .run(user.company_id,user.id,action,entity,entityId,String(details).slice(0,1000));
}

function notifyUser(companyId,userId,title,message,type='info',entityType='',entityId=0) {
 db.prepare('INSERT INTO notifications(company_id,user_id,title,message,notification_type,entity_type,entity_id) VALUES(?,?,?,?,?,?,?)')
 .run(companyId,userId,title,message,type,entityType,entityId);
}
function notifyAdmins(companyId,title,message,type='info',entityType='',entityId=0) {
 const admins=db.prepare("SELECT id,role,permissions_json FROM users WHERE company_id=? AND active=1").all(companyId).filter(a=>{if(a.role==='admin')return true;try{return JSON.parse(a.permissions_json||'[]').includes('discountRequests')}catch(e){return false}});
 for(const a of admins) notifyUser(companyId,a.id,title,message,type,entityType,entityId);
}
function defaultDiscountLimit(role) {
 if (role === 'admin') return {type:'percent',value:100};
 if (role === 'manager') return {type:'percent',value:30};
 if (role === 'reception') return {type:'percent',value:20};
 return {type:'percent',value:0};
}
function discountPermission(user, packageBase) {
 const fallback=defaultDiscountLimit(user.role);
 const type=user.discount_limit_type==='amount'?'amount':'percent';
 const value=Math.max(0,Number(user.discount_limit_value??fallback.value));
 return {type,value,amount:type==='amount'?Math.min(value,Math.max(0,packageBase)):Math.max(0,packageBase)*Math.min(value,100)/100};
}
function requestedDiscountAmount(mode,value,packageBase) {
 const n=Math.max(0,Number(value)||0);
 return mode==='percent'?Math.max(0,packageBase)*n/100:n;
}
function safeError(res, err) {
 if (String(err.message).includes('UNIQUE constraint')) return res.status(409).json({error:'البيانات موجودة بالفعل'});
 if (String(err.message).includes('FOREIGN KEY')) return res.status(400).json({error:'لا يمكن إتمام العملية بسبب ارتباطات البيانات'});
 return res.status(400).json({error:err.message || 'حدث خطأ'});
}
const scoped = (table, companyId, id) => db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(id,companyId);
const cairoDateString = date => {
 const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date || new Date());
 const get = type => parts.find(p=>p.type===type)?.value || '';
 return `${get('year')}-${get('month')}-${get('day')}`;
};
const invitationExpiryFor = eventDate => {
 const d = new Date(String(eventDate) + 'T12:00:00Z');
 d.setUTCDate(d.getUTCDate() + 1);
 return d.toISOString().slice(0,10) + 'T00:00:00';
};
function ensureInvitation(bookingId, companyId) {
 const b = db.prepare(`SELECT b.*,c.groom_name,c.bride_name,h.name hall_name FROM bookings b
 JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id
 WHERE b.id=? AND b.company_id=?`).get(bookingId, companyId);
 if (!b) return null;
 if (!b.invitation_token) {
   const token = crypto.randomBytes(24).toString('hex');
   const expires = invitationExpiryFor(b.event_date);
   db.prepare('UPDATE bookings SET invitation_token=?,invitation_expires_at=? WHERE id=? AND company_id=?')
     .run(token, expires, b.id, companyId);
   return { ...b, invitation_token: token, invitation_expires_at: expires };
 }
 return b;
}


app.post('/api/auth/login',(req,res)=>{
 const {username,password,companySlug='wedding-halls'} = req.body || {};
 const company = db.prepare('SELECT * FROM companies WHERE slug=?').get(String(companySlug).trim());
 if (!company) return res.status(401).json({error:'بيانات الدخول غير صحيحة'});
 const user = db.prepare('SELECT * FROM users WHERE company_id=? AND username=? AND active=1').get(company.id,String(username||'').trim());
 if (!user || !bcrypt.compareSync(String(password||''),user.password_hash)) return res.status(401).json({error:'بيانات الدخول غير صحيحة'});
 const token = jwt.sign({id:user.id},JWT_SECRET,{expiresIn:'12h'});
 res.cookie('token',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000});
 res.json({user:{id:user.id,name:user.name,username:user.username,role:user.role,job_title:user.job_title,permissions:JSON.parse(user.permissions_json||'[]'),discount_limit_type:user.discount_limit_type,discount_limit_value:user.discount_limit_value},company:{id:company.id,name:company.name,logo_url:company.logo_url,currency:company.currency}});
});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('token');res.json({ok:true});});
app.get('/api/auth/me',auth,(req,res)=>{
 const company=db.prepare('SELECT id,name,logo_url,currency FROM companies WHERE id=?').get(req.user.company_id);
 res.json({user:req.user,company});
});
app.get('/api/dashboard',auth,(req,res)=>{
 const c=req.user.company_id;
 const month=new Date().toISOString().slice(0,7);
 const bookings=db.prepare("SELECT COUNT(*) n FROM bookings WHERE company_id=? AND substr(event_date,1,7)=?").get(c,month).n;
 const late=db.prepare("SELECT COUNT(*) n FROM followups WHERE company_id=? AND status='pending' AND due_at < date('now')").get(c).n;
 const collections=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE company_id=? AND substr(created_at,1,7)=?").get(c,month).n;
 const leads=db.prepare("SELECT COUNT(*) n FROM customers WHERE company_id=? AND status IN ('new','interested','visit')").get(c).n;
 const upcoming=db.prepare(`SELECT b.id,b.event_date,b.event_period,b.status,b.contract_total,b.paid_total,
 c.name customer_name,c.phone,h.name hall_name,h.venue
 FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id
 WHERE b.company_id=? AND b.event_date>=date('now') ORDER BY b.event_date LIMIT 8`).all(c);
 const recentCustomers=db.prepare("SELECT id,name,phone,status,event_date,created_at FROM customers WHERE company_id=? ORDER BY id DESC LIMIT 6").all(c);
 res.json({metrics:{bookings,late,collections,leads},upcoming,recentCustomers});
});

app.get('/api/halls',auth,(req,res)=>res.json(db.prepare('SELECT * FROM halls WHERE company_id=? ORDER BY id DESC').all(req.user.company_id)));
app.post('/api/halls',auth,admin,(req,res)=>{
 try {
 const {name}=req.body;
 if(!String(name||'').trim()) return res.status(400).json({error:'اسم القاعة مطلوب'});
 const active=req.body.active===false||req.body.active===0||req.body.active==='0'?0:1;
 const r=db.prepare('INSERT INTO halls(company_id,name,venue,capacity,day_price,evening_price,active) VALUES(?,?,?,?,?,?,?)')
 .run(req.user.company_id,String(name).trim(),' ',0,0,0,active);
 logAction(req.user,'إضافة','hall',r.lastInsertRowid,name); res.status(201).json(scoped('halls',req.user.company_id,r.lastInsertRowid));
 } catch(e){safeError(res,e)}
});
app.put('/api/halls/:id',auth,admin,(req,res)=>{
 try {const old=scoped('halls',req.user.company_id,req.params.id); if(!old)return res.status(404).json({error:'القاعة غير موجودة'});
 const d={...old,...req.body};
 db.prepare('UPDATE halls SET name=?,venue=?,capacity=?,day_price=?,evening_price=?,active=? WHERE id=? AND company_id=?')
 .run(d.name,d.venue,Number(d.capacity)||0,Number(d.day_price)||0,Number(d.evening_price)||0,d.active===false||d.active===0?0:1,old.id,req.user.company_id);
 logAction(req.user,'تعديل','hall',old.id,d.name);res.json(scoped('halls',req.user.company_id,old.id));}catch(e){safeError(res,e)}
});
app.delete('/api/halls/:id',auth,admin,(req,res)=>{
 const h=scoped('halls',req.user.company_id,req.params.id);if(!h)return res.status(404).json({error:'القاعة غير موجودة'});
 try {db.prepare('UPDATE halls SET active=0 WHERE id=? AND company_id=?').run(h.id,req.user.company_id);logAction(req.user,'تعطيل','hall',h.id,h.name);res.json({ok:true});}catch(e){safeError(res,e)}
});

app.get('/api/customers',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 const q=String(req.query.q||'').trim(),status=String(req.query.status||'');
 let sql=`SELECT c.*,h.name hall_name,u.name assigned_name FROM customers c LEFT JOIN halls h ON h.id=c.hall_id LEFT JOIN users u ON u.id=c.assigned_to WHERE c.company_id=?`;
 const args=[req.user.company_id];
 if(q){sql+=' AND (c.name LIKE ? OR c.phone LIKE ? OR c.groom_name LIKE ? OR c.bride_name LIKE ?)';args.push(...Array(4).fill('%'+q+'%'))}
 if(status && status!=='all'){sql+=' AND c.status=?';args.push(status)}
 sql+=' ORDER BY c.id DESC';
 res.json(db.prepare(sql).all(...args));
});
app.post('/api/customers',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 try {
 const d=req.body||{}; if(!String(d.name||'').trim()||!String(d.phone||'').trim())return res.status(400).json({error:'اسم العميل ورقم الموبايل مطلوبان'});
 const r=db.prepare(`INSERT INTO customers(company_id,name,phone,groom_name,bride_name,event_type,venue,hall_id,event_date,event_period,source,status,budget,notes,next_followup,assigned_to,created_by)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.company_id,d.name.trim(),d.phone.trim(),d.groom_name||'',d.bride_name||'',d.event_type||'حفل زفاف',d.venue||'',d.hall_id||null,d.event_date||'',d.event_period||'',d.source||'',d.status||'new',Number(d.budget)||0,d.notes||'',d.next_followup||'',d.assigned_to||req.user.id,req.user.id);
 if(d.next_followup){
  const existing=db.prepare("SELECT id FROM followups WHERE company_id=? AND customer_id=? AND due_at=? AND status='pending'").get(req.user.company_id,r.lastInsertRowid,d.next_followup);
  if(!existing) db.prepare('INSERT INTO followups(company_id,customer_id,due_at,note,assigned_to,created_by) VALUES(?,?,?,?,?,?)').run(req.user.company_id,r.lastInsertRowid,d.next_followup,'متابعة استفسار العميل',d.assigned_to||req.user.id,req.user.id);
 }
 logAction(req.user,'إضافة','customer',r.lastInsertRowid,d.name);res.status(201).json(scoped('customers',req.user.company_id,r.lastInsertRowid));
 }catch(e){safeError(res,e)}
});
app.put('/api/customers/:id',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 try {const old=scoped('customers',req.user.company_id,req.params.id);if(!old)return res.status(404).json({error:'العميل غير موجود'});
 if(req.user.role==='employee'&&old.assigned_to!==req.user.id)return res.status(403).json({error:'هذا العميل غير مسند إليك'});
 const d={...old,...req.body};
 db.prepare(`UPDATE customers SET name=?,phone=?,groom_name=?,bride_name=?,event_type=?,venue=?,hall_id=?,event_date=?,event_period=?,source=?,status=?,budget=?,notes=?,next_followup=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
 .run(d.name,d.phone,d.groom_name||'',d.bride_name||'',d.event_type||'حفل زفاف',d.venue||'',d.hall_id||null,d.event_date||'',d.event_period||'',d.source||'',d.status||'new',Number(d.budget)||0,d.notes||'',d.next_followup||'',d.assigned_to||old.assigned_to,old.id,req.user.company_id);
 if(d.next_followup){
  const existing=db.prepare("SELECT id FROM followups WHERE company_id=? AND customer_id=? AND due_at=? AND status='pending'").get(req.user.company_id,old.id,d.next_followup);
  if(!existing) db.prepare('INSERT INTO followups(company_id,customer_id,due_at,note,assigned_to,created_by) VALUES(?,?,?,?,?,?)').run(req.user.company_id,old.id,d.next_followup,'متابعة استفسار العميل',d.assigned_to||old.assigned_to||req.user.id,req.user.id);
 }
 logAction(req.user,'تعديل','customer',old.id,d.name);res.json(scoped('customers',req.user.company_id,old.id));
 }catch(e){safeError(res,e)}
});
app.get('/api/followups',auth,(req,res)=>res.json(db.prepare(`SELECT f.*,c.name customer_name,c.phone,u.name assigned_name FROM followups f JOIN customers c ON c.id=f.customer_id LEFT JOIN users u ON u.id=f.assigned_to WHERE f.company_id=? ORDER BY CASE WHEN f.status='pending' THEN 0 ELSE 1 END,f.due_at`).all(req.user.company_id)));
app.post('/api/followups',auth,(req,res)=>{
 try {const d=req.body||{};if(!scoped('customers',req.user.company_id,d.customer_id))return res.status(400).json({error:'العميل غير موجود'});
 if(!d.due_at||!d.note)return res.status(400).json({error:'موعد المتابعة والتفاصيل مطلوبان'});
 const r=db.prepare('INSERT INTO followups(company_id,customer_id,due_at,note,assigned_to,created_by) VALUES(?,?,?,?,?,?)').run(req.user.company_id,d.customer_id,d.due_at,d.note,d.assigned_to||req.user.id,req.user.id);
 logAction(req.user,'إضافة','followup',r.lastInsertRowid,d.note);res.status(201).json(db.prepare('SELECT * FROM followups WHERE id=?').get(r.lastInsertRowid));
 }catch(e){safeError(res,e)}
});
app.patch('/api/followups/:id/complete',auth,(req,res)=>{
 const f=scoped('followups',req.user.company_id,req.params.id);if(!f)return res.status(404).json({error:'المتابعة غير موجودة'});
 db.prepare("UPDATE followups SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?").run(f.id,req.user.company_id);logAction(req.user,'إكمال','followup',f.id,f.note);res.json({ok:true});
});

app.get('/api/bookings',auth,(req,res)=>{
 const q=String(req.query.q||'').trim(),status=req.user.role==='accountant'?'مؤكد':String(req.query.status||'all');
 let sql=`SELECT b.*,c.name customer_name,c.phone,c.groom_name,c.bride_name,h.name hall_name,h.venue,u.name booking_employee_name FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id JOIN users u ON u.id=b.created_by WHERE b.company_id=? AND COALESCE(b.deleted_at,'')=''`;
 const args=[req.user.company_id];
 if(q){sql+=' AND (c.name LIKE ? OR c.phone LIKE ? OR c.groom_name LIKE ? OR c.bride_name LIKE ? OR h.name LIKE ?)';args.push('%'+q+'%','%'+q+'%','%'+q+'%','%'+q+'%','%'+q+'%')}
 if(status!=='all'){sql+=' AND b.status=?';args.push(status)}
 sql+=' ORDER BY b.event_date DESC,b.id DESC';
 res.json(db.prepare(sql).all(...args).map(b=>{const subtotal=Math.max(0,Number(b.contract_total||0)-Number(b.discount||0)),service_amount=subtotal*0.15,total_due=subtotal+service_amount;return {...b,service_rate:15,service_amount,total_due,remaining:Math.max(0,total_due-Number(b.paid_total||0))}}));
});
app.post('/api/bookings',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 const tx=db.transaction(()=>{
 const d=req.body||{};
 if(!d.customer_id||!d.hall_id||!d.event_date||!d.event_period)return {error:'العميل والقاعة والتاريخ والفترة مطلوبة'};
 const customer=scoped('customers',req.user.company_id,d.customer_id),hall=scoped('halls',req.user.company_id,d.hall_id);
 if(!customer||!hall||!hall.active)return {error:'العميل أو القاعة غير صحيح'};
 if(Number(d.guest_count||0)>hall.capacity && hall.capacity>0)return {error:`سعة القاعة ${hall.capacity} فرد فقط`};
 const conflict=db.prepare("SELECT id FROM bookings WHERE company_id=? AND COALESCE(deleted_at,'')='' AND hall_id=? AND event_date=? AND event_period=? AND status NOT IN ('ملغي','مرفوض')").get(req.user.company_id,hall.id,d.event_date,d.event_period);
 if(conflict)return {error:'القاعة محجوزة بالفعل في نفس التاريخ والفترة'};
 const selectedPackage=d.package_id?scoped('packages',req.user.company_id,d.package_id):null;
 if(d.package_id&&!selectedPackage)return {error:'الباكدج غير موجود'};
 if(selectedPackage&&(selectedPackage.event_period||'مسائي')!==(d.event_period==='نهاري'?'نهاري':'مسائي'))return {error:'الباكدج لا يخص نوع الفرح المختار'};
 if(selectedPackage&&selectedPackage.hall_id&&Number(selectedPackage.hall_id)!==Number(hall.id))return {error:'الباكدج المختار غير مخصص لهذه القاعة'};
 const guestCount=Math.max(0,Number(d.guest_count)||(selectedPackage?Number(selectedPackage.guest_count)||0:0));
 const includedGuests=selectedPackage?Math.max(0,Number(selectedPackage.included_guest_count||0)):0;
 const extraGuestPrice=selectedPackage?Math.max(0,Number(selectedPackage.extra_guest_price||0)):0;
 if(selectedPackage&&Number(selectedPackage.guest_count)>0&&guestCount>Number(selectedPackage.guest_count)&&!(includedGuests>0&&extraGuestPrice>=0))return {error:`السعر المختار يغطي حتى ${selectedPackage.guest_count} فرد فقط؛ اختر شريحة سعر أعلى`};
 const extraGuestTotal=selectedPackage&&includedGuests>0?Math.max(0,guestCount-includedGuests)*extraGuestPrice:0;
 const baseTotal=selectedPackage?Number(selectedPackage.price):(Number(d.contract_total)||0);
 const discountMode=d.discount_mode==='percent'?'percent':'amount';
 const discountInput=Math.max(0,Number(d.discount_value??d.discount)||0);
 const requestedDiscount=requestedDiscountAmount(discountMode,discountInput,baseTotal);
 if(baseTotal<0||discountInput<0||requestedDiscount>baseTotal+0.001)return {error:'الخصم يُطبق على سعر الباكدج الأساسي فقط، ولا يمكن أن يتجاوز سعر الباكدج'};
 const permission=discountPermission(req.user,baseTotal),discountCap=permission.amount;
 const needsDiscountApproval=requestedDiscount>discountCap+0.001 && req.user.role!=='admin';
 const requestReason=String(d.discount_request_reason||'').trim();
 if(needsDiscountApproval&&!requestReason)return {error:'اكتب سبب طلب الخصم الاستثنائي قبل الإرسال'};
 
 const discount=needsDiscountApproval?discountCap:requestedDiscount;
 const paragraphIds=[...new Set((Array.isArray(d.paragraph_ids)?d.paragraph_ids:[]).map(Number).filter(Number.isInteger))];
 const menuGroupIds=[...new Set((Array.isArray(d.menu_group_ids)?d.menu_group_ids:[]).map(Number).filter(Number.isInteger))];
 const paragraphs=paragraphIds.map(id=>scoped('paragraphs',req.user.company_id,id)).filter(p=>p&&p.active);
 const menuGroups=menuGroupIds.map(id=>scoped('menu_groups',req.user.company_id,id)).filter(g=>g&&g.active);
 if(paragraphs.length!==paragraphIds.length||menuGroups.length!==menuGroupIds.length)return {error:'يوجد اختيار فقرة أو مجموعة منيو غير صالح'};
 const period=d.event_period==='نهاري'?'نهاري':'مسائي';
 if(paragraphs.some(p=>(p.event_period||'مسائي')!==period))return {error:'يوجد إضافة لا تخص نوع الفرح المختار'};
 if(menuGroups.some(g=>(g.event_period||'مسائي')!==period))return {error:'يوجد منيو لا يخص نوع الفرح المختار'};
 const paragraphTotal=paragraphs.reduce((sum,p)=>sum+Number(p.price||0),0);
 const menuTotal=menuGroups.reduce((sum,g)=>sum+(g.price_mode==='fixed'?Number(g.price||0):Number(g.price||0)*guestCount),0);
 const extrasTotal=paragraphTotal+menuTotal;
 const contractorServices=Array.isArray(d.contractor_services)?d.contractor_services:[];
 const contractorIds=[...new Set(contractorServices.map(x=>Number(x.contractor_id)).filter(Number.isInteger))];
 if(contractorIds.length!==contractorServices.length)return {error:'اختيار متعهد غير صالح'};
 const validatedContractors=contractorServices.map(x=>{const c=scoped('contractors',req.user.company_id,x.contractor_id);const price=Number(x.price);if(!c||!Number.isFinite(price)||price<0)throw new Error('بيانات متعهد أو سعر غير صحيح');return {contractor_id:c.id,service_name:String(x.service_name||c.service_type||c.name),price,notes:String(x.notes||'')};});
 const contractorTotal=validatedContractors.reduce((sum,c)=>sum+c.price,0);
 const total=baseTotal+extraGuestTotal+extrasTotal+contractorTotal;
 if(discount>total)return {error:'الخصم لا يمكن أن يتجاوز إجمالي العقد بعد إضافة الفقرات والمنيو'};
 const r=db.prepare(`INSERT INTO bookings(company_id,customer_id,hall_id,event_date,event_period,guest_count,event_type,contract_total,base_contract_total,package_id,package_name_snapshot,discount,paid_total,status,notes,created_by,extra_guest_total,included_items_snapshot,included_guest_count_snapshot)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.company_id,customer.id,hall.id,d.event_date,d.event_period,guestCount,d.event_type||customer.event_type,total,baseTotal,selectedPackage?selectedPackage.id:null,selectedPackage?selectedPackage.name:'',discount,0,(needsDiscountApproval?'مبدئي':(d.status||'مؤكد')),d.notes||'',req.user.id,extraGuestTotal,selectedPackage?String(selectedPackage.included_items||''):'',includedGuests);
 const insertParagraph=db.prepare('INSERT INTO booking_paragraphs(company_id,booking_id,paragraph_id,name_snapshot,price_snapshot,duration_snapshot,show_names_snapshot) VALUES(?,?,?,?,?,?,?)');
 for(const p of paragraphs)insertParagraph.run(req.user.company_id,r.lastInsertRowid,p.id,p.name,p.price,p.duration_minutes,p.show_names||'');
 const insertMenu=db.prepare('INSERT INTO booking_menu_groups(company_id,booking_id,menu_group_id,name_snapshot,price_snapshot,items_snapshot,unit_price_snapshot,guest_count_snapshot,price_mode_snapshot) VALUES(?,?,?,?,?,?,?,?,?)');
 for(const g of menuGroups){
   const items=db.prepare('SELECT name,category,quantity,notes FROM menu_items WHERE company_id=? AND menu_group_id=? ORDER BY id').all(req.user.company_id,g.id);
   const unitPrice=Number(g.price||0),groupTotal=g.price_mode==='fixed'?unitPrice:unitPrice*guestCount;
   insertMenu.run(req.user.company_id,r.lastInsertRowid,g.id,g.name,groupTotal,JSON.stringify(items),unitPrice,guestCount,g.price_mode==='fixed'?'fixed':'per_person');
 }
 const insertContractor=db.prepare('INSERT INTO booking_contractors(company_id,booking_id,contractor_id,service_name,price,notes) VALUES(?,?,?,?,?,?)');
 for(const c of validatedContractors)insertContractor.run(req.user.company_id,r.lastInsertRowid,c.contractor_id,c.service_name,c.price,c.notes);
 if(needsDiscountApproval){
   const dr=db.prepare("INSERT INTO discount_requests(company_id,booking_id,requested_discount,requested_by,status,requested_mode,requested_value,allowed_discount,request_reason) VALUES(?,?,?,?, 'pending',?,?,?,?)").run(req.user.company_id,r.lastInsertRowid,requestedDiscount,req.user.id,discountMode,discountInput,discountCap,requestReason);
   const requestedLabel=discountMode==='percent'?`${discountInput}% (${requestedDiscount} جنيه)`:`${requestedDiscount} جنيه`;
   notifyAdmins(req.user.company_id,'طلب موافقة خصم — يتطلب قرار المدير العام',`الحجز #${r.lastInsertRowid} | العميل: ${customer.name} | العريس: ${customer.groom_name||'—'} | العروسة: ${customer.bride_name||'—'} | القاعة: ${hall.name} | التاريخ: ${d.event_date} (${d.event_period}) | عدد الأفراد: ${guestCount} | سعر الباكدج: ${baseTotal} جنيه | الخصم المطلوب: ${requestedLabel} | حد الموظف: ${permission.type==='percent'?permission.value+'%':permission.value+' جنيه'} (${discountCap} جنيه) | سبب الطلب: ${requestReason} | الخصم المطبق مؤقتًا حتى القرار: ${discountCap} جنيه. افتح طلبات الخصم للموافقة أو الرفض مع كتابة السبب.`, 'warning','discount_request',dr.lastInsertRowid);
   logAction(req.user,'طلب موافقة خصم','discount_request',r.lastInsertRowid,`المطلوب ${requestedDiscount} جنيه؛ الحد المسموح ${discountCap} جنيه`);
 } else if(requestedDiscount>0) {
   logAction(req.user,'تطبيق خصم على الباكدج','booking',r.lastInsertRowid,`خصم ${discount} جنيه (${baseTotal?Math.round(discount/baseTotal*100):0}%)`);
 }
 db.prepare("UPDATE customers SET status=?,hall_id=?,venue=?,event_date=?,event_period=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?").run((!needsDiscountApproval&&d.status==='مؤكد')?'booked':'initial',hall.id,hall.venue,d.event_date,d.event_period,customer.id,req.user.company_id);
 logAction(req.user,'إنشاء حجز','booking',r.lastInsertRowid,customer.name);
 if (!needsDiscountApproval && (d.status||'مبدئي') === 'مؤكد') ensureInvitation(r.lastInsertRowid, req.user.company_id);
 return {booking:db.prepare('SELECT * FROM bookings WHERE id=?').get(r.lastInsertRowid),discount_pending:needsDiscountApproval};
 });
 try {const result=tx();if(result.error)return res.status(400).json({error:result.error});res.status(201).json({...result.booking,discount_pending:result.discount_pending})}catch(e){safeError(res,e)}
});

app.get('/api/bookings/:id/invitation',auth,async (req,res)=>{
 try {
   const b = scoped('bookings', req.user.company_id, req.params.id);
   if (!b) return res.status(404).json({error:'الحجز غير موجود'});
   if (b.status !== 'مؤكد') return res.status(400).json({error:'يجب تأكيد الحجز أولًا لإصدار كارت الدعوة'});
   const invitation = ensureInvitation(b.id, req.user.company_id);
   const details = db.prepare(`SELECT b.id,b.event_date,b.event_period,b.invitation_token,b.invitation_expires_at,b.invitation_used_at,
      c.groom_name,c.bride_name,h.name hall_name,h.venue,co.name company_name,co.logo_url
      FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id JOIN companies co ON co.id=b.company_id
      WHERE b.id=? AND b.company_id=?`).get(b.id, req.user.company_id);
   const base = `${req.protocol}://${req.get('host')}`;
   const scanUrl = `${base}/entry/${details.invitation_token}`;
   const qrDataUrl = await QRCode.toDataURL(scanUrl, {errorCorrectionLevel:'H',margin:2,width:320,color:{dark:'#17243b',light:'#ffffff'}});
   res.json({...details, scan_url:scanUrl, qr_data_url:qrDataUrl});
 } catch(e) { safeError(res,e); }
});

app.post('/api/bookings/:id/archive',auth,(req,res)=>{
 const hasPermission = req.user.role==='admin' || (Array.isArray(req.user.permissions)&&req.user.permissions.includes('bookingDelete'));
 if(!hasPermission)return res.status(403).json({error:'ليس لديك صلاحية حذف/أرشفة الحجوزات'});
 const b=db.prepare("SELECT * FROM bookings WHERE id=? AND company_id=? AND COALESCE(deleted_at,'')=''").get(req.params.id,req.user.company_id);
 if(!b)return res.status(404).json({error:'الحجز غير موجود أو تمت أرشفته بالفعل'});
 const reason=String(req.body?.reason||'').trim();
 if(!reason)return res.status(400).json({error:'سبب الأرشفة مطلوب'});
 const now=new Date().toISOString();
 db.transaction(()=>{
  db.prepare("UPDATE bookings SET deleted_at=?,deleted_by=?,delete_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?").run(now,req.user.id,reason,b.id,req.user.company_id);
  db.prepare("INSERT INTO audit_logs(company_id,user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)").run(req.user.company_id,req.user.id,'أرشفة حجز','booking',b.id,JSON.stringify({customer_id:b.customer_id,hall_id:b.hall_id,event_date:b.event_date,event_period:b.event_period,status:b.status,reason,paid_total:b.paid_total}));
 })();
 res.json({ok:true,message:'تمت أرشفة الحجز مع الاحتفاظ بالسجلات المالية'});
});
app.get('/api/bookings/:id',auth,(req,res)=>{
 const b=db.prepare(`SELECT b.*,c.name customer_name,c.phone,c.groom_name,c.bride_name,c.venue customer_venue,h.name hall_name,h.venue,u.name booking_employee_name FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id JOIN users u ON u.id=b.created_by WHERE b.id=? AND b.company_id=? AND COALESCE(b.deleted_at,'')=''`).get(req.params.id,req.user.company_id);
 if(!b)return res.status(404).json({error:'الحجز غير موجود'});
 if(req.user.role==='accountant' && b.status!=='مؤكد')return res.status(403).json({error:'الحسابات يمكنها فتح الحجوزات المؤكدة فقط'});
 b.service_rate=15;b.subtotal_after_discount=Math.max(0,Number(b.contract_total||0)-Number(b.discount||0));b.service_amount=b.subtotal_after_discount*0.15;b.total_due=b.subtotal_after_discount+b.service_amount;b.remaining=Math.max(0,b.total_due-Number(b.paid_total||0));
 b.payments=db.prepare('SELECT p.*,u.name paid_by_name FROM payments p JOIN users u ON u.id=p.paid_by WHERE p.booking_id=? AND p.company_id=? ORDER BY p.id DESC').all(b.id,req.user.company_id);
 b.paragraphs=db.prepare('SELECT * FROM booking_paragraphs WHERE booking_id=? AND company_id=? ORDER BY id').all(b.id,req.user.company_id);
 b.menu_groups=db.prepare('SELECT * FROM booking_menu_groups WHERE booking_id=? AND company_id=? ORDER BY id').all(b.id,req.user.company_id).map(g=>({...g,items:JSON.parse(g.items_snapshot||'[]')}));
 b.extras_total=b.paragraphs.reduce((s,p)=>s+Number(p.price_snapshot||0),0)+b.menu_groups.reduce((s,g)=>s+Number(g.price_snapshot||0),0);
 b.contractor_services=db.prepare('SELECT bc.*,c.name contractor_name FROM booking_contractors bc JOIN contractors c ON c.id=bc.contractor_id AND c.company_id=bc.company_id WHERE bc.booking_id=? AND bc.company_id=? ORDER BY bc.id').all(b.id,req.user.company_id);
 b.contractor_total=b.contractor_services.reduce((s,c)=>s+Number(c.price||0),0);
 res.json(b);
});
app.patch('/api/bookings/:id/status',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 const b=scoped('bookings',req.user.company_id,req.params.id);if(!b)return res.status(404).json({error:'الحجز غير موجود'});
 const allowed=['مبدئي','مؤكد','ملغي','مرفوض','تمت المناسبة'];
 if(!allowed.includes(req.body.status))return res.status(400).json({error:'حالة غير صحيحة'});
 db.prepare('UPDATE bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?').run(req.body.status,b.id,req.user.company_id);
 if (req.body.status === 'مؤكد') ensureInvitation(b.id, req.user.company_id);
 logAction(req.user,'تغيير حالة','booking',b.id,req.body.status);res.json({ok:true});
});
app.post('/api/bookings/:id/payments',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const tx=db.transaction(()=>{
 const b=scoped('bookings',req.user.company_id,req.params.id);if(!b)return {error:'الحجز غير موجود'};
 if(b.status!=='مؤكد')return {error:'لا يمكن تحصيل مبلغ لحجز غير مؤكد'};
 const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<=0)return {error:'أدخل مبلغًا صحيحًا'};
 const allowedMethods=['كاش','إنستا باي','فيزا','محفظة إلكترونية'];if(!allowedMethods.includes(req.body.method))return {error:'اختر وسيلة تحصيل صحيحة'};
 const totalDue=Math.max(0,(Number(b.contract_total)-Number(b.discount))*1.15);
 const remaining=totalDue-Number(b.paid_total||0);
 const paymentType=String(req.body.payment_type||'دفعة');
 if(!['مقدم حجز','تحصيل باقي المبلغ'].includes(paymentType))return {error:'نوع التحصيل غير صحيح'};
 if(paymentType==='مقدم حجز'&&db.prepare("SELECT 1 FROM payments WHERE company_id=? AND booking_id=? AND payment_type='مقدم حجز' LIMIT 1").get(req.user.company_id,b.id))return {error:'مقدم الحجز مسجل بالفعل. راجع رقم الإيصال ولا تكرر التحصيل'};
 if(paymentType==='تحصيل باقي المبلغ'&&db.prepare("SELECT 1 FROM payments WHERE company_id=? AND booking_id=? AND payment_type='تحصيل باقي المبلغ' LIMIT 1").get(req.user.company_id,b.id))return {error:'تم تحصيل باقي المبلغ بالفعل. راجع رقم الإيصال'};
 if(amount>remaining+0.001)return {error:'المبلغ أكبر من المتبقي على الحجز'};
 if(paymentType==='تحصيل باقي المبلغ'&&Math.abs(amount-remaining)>0.01)return {error:'مبلغ التحصيل النهائي يجب أن يساوي الرصيد المتبقي بالكامل'};
 const r=db.prepare('INSERT INTO payments(company_id,booking_id,amount,method,reference,notes,paid_by,payment_type) VALUES(?,?,?,?,?,?,?,?)').run(req.user.company_id,b.id,amount,req.body.method||'كاش',req.body.reference||'',req.body.notes||'',req.user.id,paymentType);
 db.prepare('UPDATE bookings SET paid_total=paid_total+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?').run(amount,b.id,req.user.company_id);
 logAction(req.user,'تسجيل تحصيل','payment',r.lastInsertRowid,amount);
 return {ok:true,booking_id:b.id,payment_id:r.lastInsertRowid,amount,method:req.body.method,remaining:remaining-amount};
 });
 try {const r=tx();if(r.error)return res.status(400).json({error:r.error});res.status(201).json(r)}catch(e){safeError(res,e)}
});
app.post('/api/bookings/:id/insurance',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 try{
  const b=scoped('bookings',req.user.company_id,req.params.id);if(!b)return res.status(404).json({error:'الحجز غير موجود'});
  if(b.status!=='مؤكد')return res.status(400).json({error:'لا يمكن تسجيل التأمين إلا لحجز مؤكد'});
  if(db.prepare("SELECT 1 FROM booking_insurance WHERE company_id=? AND booking_id=? LIMIT 1").get(req.user.company_id,b.id))return res.status(409).json({error:'تم تسجيل تأمين لهذا الحجز بالفعل. افتح إيصال التأمين الحالي بدل تسجيله مرة أخرى'});
  const amount=Number(req.body.amount||5000);if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'أدخل مبلغ تأمين صحيحًا'});
  const method=String(req.body.method||'كاش');if(!['كاش','إنستا باي','فيزا','محفظة إلكترونية'].includes(method))return res.status(400).json({error:'اختر وسيلة استلام صحيحة'});
  const r=db.prepare("INSERT INTO booking_insurance(company_id,booking_id,amount,method,reference,notes,received_by) VALUES(?,?,?,?,?,?,?)").run(req.user.company_id,b.id,amount,method,req.body.reference||'',req.body.notes||'',req.user.id);
  logAction(req.user,'استلام تأمين','booking_insurance',r.lastInsertRowid,amount);res.status(201).json({ok:true,insurance_id:r.lastInsertRowid,amount});
 }catch(e){safeError(res,e)}
});
app.get('/api/bookings/:id/insurance',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const rows=db.prepare(`SELECT i.*,u.name received_by_name FROM booking_insurance i JOIN users u ON u.id=i.received_by WHERE i.booking_id=? AND i.company_id=? ORDER BY i.id DESC`).all(req.params.id,req.user.company_id);
 res.json(rows.map(i=>({...i,refunds:db.prepare('SELECT * FROM insurance_refunds WHERE insurance_id=? AND company_id=? ORDER BY id DESC').all(i.id,req.user.company_id)})));
});
app.post('/api/insurance/:id/refund',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const tx=db.transaction(()=>{
  const i=db.prepare('SELECT * FROM booking_insurance WHERE id=? AND company_id=?').get(req.params.id,req.user.company_id);
  if(!i)return {error:'إيصال التأمين غير موجود'};
  if(i.status==='مسترد')return {error:'تم استرداد هذا التأمين بالفعل ولا يمكن صرفه مرة أخرى'};
  const amount=Number(i.amount);const method=String(req.body.method||'كاش');
  if(!['كاش','إنستا باي','فيزا','محفظة إلكترونية'].includes(method))return {error:'اختر وسيلة رد صحيحة'};
  const r=db.prepare('INSERT INTO insurance_refunds(company_id,insurance_id,amount,method,reference,notes,refunded_by) VALUES(?,?,?,?,?,?,?)').run(req.user.company_id,i.id,amount,method,req.body.reference||'',req.body.notes||'',req.user.id);
  db.prepare("UPDATE booking_insurance SET status='مسترد' WHERE id=? AND company_id=?").run(i.id,req.user.company_id);
  logAction(req.user,'رد تأمين','insurance_refund',r.lastInsertRowid,amount);return {ok:true,refund_id:r.lastInsertRowid,insurance_id:i.id,amount};
 });
 try{const r=tx();if(r.error)return res.status(400).json({error:r.error});res.status(201).json(r)}catch(e){safeError(res,e)}
});
app.get('/api/insurance/:id/receipt',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const i=db.prepare(`SELECT i.*,b.event_date,b.event_period,b.guest_count,c.name customer_name,c.groom_name,c.bride_name,h.name hall_name,h.venue,co.name company_name,co.logo_url,u.name cashier_name FROM booking_insurance i JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id JOIN companies co ON co.id=i.company_id JOIN users u ON u.id=i.received_by WHERE i.id=? AND i.company_id=?`).get(req.params.id,req.user.company_id);
 if(!i)return res.status(404).json({error:'إيصال التأمين غير موجود'});
 res.json(i);
});
app.get('/api/insurance-refunds/:id/receipt',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const r=db.prepare(`SELECT r.*,i.booking_id,i.id insurance_id,i.reference original_reference,i.created_at insurance_received_at,i.method insurance_method,i.received_by,i.amount insurance_amount,b.event_date,b.event_period,c.name customer_name,c.groom_name,c.bride_name,h.name hall_name,h.venue,co.name company_name,u.name cashier_name,ui.name original_cashier_name FROM insurance_refunds r JOIN booking_insurance i ON i.id=r.insurance_id AND i.company_id=r.company_id JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id JOIN companies co ON co.id=r.company_id JOIN users u ON u.id=r.refunded_by JOIN users ui ON ui.id=i.received_by WHERE r.id=? AND r.company_id=?`).get(req.params.id,req.user.company_id);
 if(!r)return res.status(404).json({error:'إيصال استرداد التأمين غير موجود'});res.json(r);
});
app.get('/api/payments/:id/receipt',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const p=db.prepare(`SELECT p.*,b.id booking_id,b.base_contract_total,b.package_name_snapshot,b.guest_count,b.event_date,b.event_period,b.contract_total,b.discount,b.paid_total,
 c.groom_name,c.bride_name,c.name customer_name,h.name hall_name,h.venue,
 paid.name cashier_name,booker.name booking_employee_name,co.name company_name,co.logo_url
 FROM payments p JOIN bookings b ON b.id=p.booking_id AND b.company_id=p.company_id
 JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id
 JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 JOIN users paid ON paid.id=p.paid_by JOIN users booker ON booker.id=b.created_by
 JOIN companies co ON co.id=p.company_id WHERE p.id=? AND p.company_id=?`).get(req.params.id,req.user.company_id);
 if(!p)return res.status(404).json({error:'إيصال التحصيل غير موجود'});
 const paragraphs=db.prepare('SELECT name_snapshot,price_snapshot,duration_snapshot,show_names_snapshot FROM booking_paragraphs WHERE booking_id=? AND company_id=? ORDER BY id').all(p.booking_id,req.user.company_id);
 const menu_groups=db.prepare('SELECT name_snapshot,price_snapshot,items_snapshot,unit_price_snapshot,guest_count_snapshot,price_mode_snapshot FROM booking_menu_groups WHERE booking_id=? AND company_id=? ORDER BY id').all(p.booking_id,req.user.company_id).map(g=>({...g,items:JSON.parse(g.items_snapshot||'[]')}));
 const paragraph_total=paragraphs.reduce((sum,x)=>sum+Number(x.price_snapshot||0),0);
 const menu_total=menu_groups.reduce((sum,x)=>sum+Number(x.price_snapshot||0),0);
 const advance_paid=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE company_id=? AND booking_id=? AND payment_type='مقدم حجز'").get(req.user.company_id,p.booking_id).total;
 const all_payments=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE company_id=? AND booking_id=?").get(req.user.company_id,p.booking_id).total;
 res.json({...p,advance_paid:Number(advance_paid||0),all_payments:Number(all_payments||0),paragraphs,menu_groups,paragraph_total,menu_total,extras_total:paragraph_total+menu_total,
 base_contract_total:Number(p.base_contract_total ?? (p.contract_total-paragraph_total-menu_total)),
 service_rate:15,service_amount:Math.max(0,p.contract_total-p.discount)*0.15,remaining:Math.max(0,(p.contract_total-p.discount)*1.15-p.paid_total),total_due:Math.max(0,(p.contract_total-p.discount)*1.15)});
});
app.get('/api/expenses',auth,allowRoles('admin','manager'),(req,res)=>res.json(db.prepare('SELECT e.*,u.name created_by_name FROM expenses e JOIN users u ON u.id=e.created_by WHERE e.company_id=? ORDER BY expense_date DESC,id DESC').all(req.user.company_id)));
app.post('/api/expenses',auth,allowRoles('admin','manager'),admin,(req,res)=>{
 try {const d=req.body||{};if(!d.title||!(Number(d.amount)>0)||!d.expense_date)return res.status(400).json({error:'العنوان والمبلغ والتاريخ مطلوبة'});
 const r=db.prepare('INSERT INTO expenses(company_id,title,amount,category,expense_date,notes,created_by) VALUES(?,?,?,?,?,?,?)').run(req.user.company_id,d.title,Number(d.amount),d.category||'عام',d.expense_date,d.notes||'',req.user.id);
 logAction(req.user,'إضافة مصروف','expense',r.lastInsertRowid,d.title);res.status(201).json({id:r.lastInsertRowid});
 }catch(e){safeError(res,e)}
});

app.get('/api/calendar',auth,(req,res)=>{
 const from=String(req.query.from||new Date().toISOString().slice(0,8)+'01');
 const to=String(req.query.to||from.slice(0,7)+'-31');
 const rows=db.prepare(`SELECT b.id,b.event_date,b.event_period,b.status,b.guest_count,b.contract_total,b.discount,b.paid_total,
 c.name customer_name,c.groom_name,c.bride_name,h.id hall_id,h.name hall_name
 FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id
 JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 WHERE b.company_id=? AND COALESCE(b.deleted_at,'')='' AND b.event_date BETWEEN ? AND ? AND b.status NOT IN ('ملغي','مرفوض')
 ORDER BY b.event_date,b.event_period,h.name`).all(req.user.company_id,from,to);
 res.json(rows);
});

app.get('/api/contractors',auth,allowRoles('admin','manager','accountant','reception'),(req,res)=>{
 const rows=db.prepare(`SELECT c.*,COALESCE((SELECT SUM(bc.price) FROM booking_contractors bc WHERE bc.contractor_id=c.id AND bc.company_id=c.company_id),0) total_due,
 COALESCE((SELECT SUM(cp.amount) FROM contractor_payments cp WHERE cp.contractor_id=c.id AND cp.company_id=c.company_id),0) total_paid
 FROM contractors c WHERE c.company_id=? ORDER BY c.name`).all(req.user.company_id);
 res.json(rows.map(c=>({...c,remaining:Math.max(0,c.total_due-c.total_paid)})));
});
app.post('/api/contractors',auth,allowRoles('admin','manager'),(req,res)=>{
 const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم المتعهد مطلوب'});
 const r=db.prepare('INSERT INTO contractors(company_id,name,service_type,phone,default_price,notes) VALUES(?,?,?,?,?,?)').run(req.user.company_id,String(d.name).trim(),d.service_type||'',d.phone||'',Math.max(0,Number(d.default_price)||0),d.notes||'');
 logAction(req.user,'إضافة متعهد','contractor',r.lastInsertRowid,d.name);res.status(201).json({id:r.lastInsertRowid});
});
app.put('/api/contractors/:id',auth,allowRoles('admin','manager'),(req,res)=>{
 const c=scoped('contractors',req.user.company_id,req.params.id);if(!c)return res.status(404).json({error:'المتعهد غير موجود'});
 const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم المتعهد مطلوب'});
 db.prepare('UPDATE contractors SET name=?,service_type=?,phone=?,default_price=?,notes=?,active=? WHERE id=? AND company_id=?').run(String(d.name).trim(),d.service_type||'',d.phone||'',Math.max(0,Number(d.default_price)||0),d.notes||'',d.active===0?0:1,c.id,req.user.company_id);
 logAction(req.user,'تعديل متعهد','contractor',c.id,d.name);res.json({ok:true});
});
app.get('/api/bookings/:id/contractors',auth,allowRoles('admin','manager','accountant','reception'),(req,res)=>{
 const b=scoped('bookings',req.user.company_id,req.params.id);if(!b)return res.status(404).json({error:'الحجز غير موجود'});
 res.json(db.prepare(`SELECT bc.*,c.name contractor_name,c.service_type FROM booking_contractors bc JOIN contractors c ON c.id=bc.contractor_id AND c.company_id=bc.company_id WHERE bc.booking_id=? AND bc.company_id=? ORDER BY bc.id`).all(b.id,req.user.company_id));
});
app.post('/api/bookings/:id/contractors',auth,allowRoles('admin','manager','reception'),(req,res)=>{
 const b=scoped('bookings',req.user.company_id,req.params.id);if(!b)return res.status(404).json({error:'الحجز غير موجود'});
 const d=req.body||{},c=scoped('contractors',req.user.company_id,d.contractor_id);
 if(!c)return res.status(400).json({error:'اختر متعهدًا صحيحًا'});
 const price=Number(d.price);if(!Number.isFinite(price)||price<0)return res.status(400).json({error:'أدخل سعرًا صحيحًا'});
 const r=db.prepare('INSERT INTO booking_contractors(company_id,booking_id,contractor_id,service_name,price,notes) VALUES(?,?,?,?,?,?)').run(req.user.company_id,b.id,c.id,d.service_name||c.service_type||c.name,price,d.notes||'');
 logAction(req.user,'إسناد خدمة لمتعهد','booking_contractor',r.lastInsertRowid,`الحجز ${b.id}؛ ${c.name}؛ ${price} جنيه`);
 res.status(201).json({id:r.lastInsertRowid});
});
app.get('/api/contractors/:id/statement',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const c=scoped('contractors',req.user.company_id,req.params.id);if(!c)return res.status(404).json({error:'المتعهد غير موجود'});
 const services=db.prepare(`SELECT bc.*,b.event_date,b.event_period,b.status,cus.groom_name,cus.bride_name,h.name hall_name
 FROM booking_contractors bc JOIN bookings b ON b.id=bc.booking_id AND b.company_id=bc.company_id
 JOIN customers cus ON cus.id=b.customer_id AND cus.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 WHERE bc.contractor_id=? AND bc.company_id=? ORDER BY b.event_date DESC`).all(c.id,req.user.company_id);
 const payments=db.prepare('SELECT cp.*,u.name paid_by_name FROM contractor_payments cp JOIN users u ON u.id=cp.paid_by WHERE cp.contractor_id=? AND cp.company_id=? ORDER BY payment_date DESC,id DESC').all(c.id,req.user.company_id);
 const total_due=services.reduce((s,x)=>s+Number(x.price||0),0),total_paid=payments.reduce((s,x)=>s+Number(x.amount||0),0);
 res.json({contractor:c,services,payments,total_due,total_paid,remaining:Math.max(0,total_due-total_paid)});
});
app.post('/api/contractors/:id/payments',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const c=scoped('contractors',req.user.company_id,req.params.id);if(!c)return res.status(404).json({error:'المتعهد غير موجود'});
 const d=req.body||{},amount=Number(d.amount);if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'أدخل مبلغًا صحيحًا'});
 const due=db.prepare('SELECT COALESCE(SUM(price),0) total FROM booking_contractors WHERE contractor_id=? AND company_id=?').get(c.id,req.user.company_id).total;
 const paid=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM contractor_payments WHERE contractor_id=? AND company_id=?').get(c.id,req.user.company_id).total;
 if(amount>Math.max(0,due-paid)+0.001)return res.status(400).json({error:'المبلغ أكبر من المستحق المتبقي للمتعهد'});
 const r=db.prepare('INSERT INTO contractor_payments(company_id,contractor_id,amount,method,payment_date,notes,paid_by) VALUES(?,?,?,?,?,?,?)').run(req.user.company_id,c.id,amount,d.method||'كاش',d.payment_date||new Date().toISOString().slice(0,10),d.notes||'',req.user.id);
 logAction(req.user,'صرف مستحقات متعهد','contractor_payment',r.lastInsertRowid,`${c.name}: ${amount} جنيه`);
 res.status(201).json({id:r.lastInsertRowid});
});


app.get('/api/contractors/:id/payments/:paymentId/receipt',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const c=scoped('contractors',req.user.company_id,req.params.id);if(!c)return res.status(404).json({error:'المتعهد غير موجود'});
 const p=db.prepare(`SELECT cp.*,u.name paid_by_name FROM contractor_payments cp JOIN users u ON u.id=cp.paid_by
 WHERE cp.id=? AND cp.contractor_id=? AND cp.company_id=?`).get(req.params.paymentId,c.id,req.user.company_id);
 if(!p)return res.status(404).json({error:'إيصال الصرف غير موجود'});
 const due=db.prepare('SELECT COALESCE(SUM(price),0) total FROM booking_contractors WHERE contractor_id=? AND company_id=?').get(c.id,req.user.company_id).total;
 const paidBefore=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM contractor_payments WHERE contractor_id=? AND company_id=? AND id<?').get(c.id,req.user.company_id,p.id).total;
 res.json({company:db.prepare('SELECT name FROM companies WHERE id=?').get(req.user.company_id),contractor:c,payment:p,total_due:due,total_paid:paidBefore+Number(p.amount),remaining:Math.max(0,due-paidBefore-Number(p.amount))});
});

app.get('/api/contractors/:id/statement.csv',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const c=scoped('contractors',req.user.company_id,req.params.id);if(!c)return res.status(404).json({error:'المتعهد غير موجود'});
 const rows=db.prepare(`SELECT b.event_date,b.event_period,h.name hall_name,cus.groom_name,cus.bride_name,bc.service_name,bc.price
 FROM booking_contractors bc JOIN bookings b ON b.id=bc.booking_id AND b.company_id=bc.company_id
 JOIN customers cus ON cus.id=b.customer_id AND cus.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 WHERE bc.contractor_id=? AND bc.company_id=? ORDER BY b.event_date,bc.id`).all(c.id,req.user.company_id);
 const payments=db.prepare('SELECT payment_date,amount,method,notes FROM contractor_payments WHERE contractor_id=? AND company_id=? ORDER BY payment_date,id').all(c.id,req.user.company_id);
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['كشف حساب المتعهد',c.name],[],['التاريخ','اليوم','الفترة','القاعة','العريس','العروسة','الخدمة','المستحق'],...rows.map(r=>[r.event_date,new Date(r.event_date+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long'}),r.event_period,r.hall_name,r.groom_name,r.bride_name,r.service_name,r.price]),[],['إجمالي المستحقات',rows.reduce((s,r)=>s+Number(r.price||0),0)],[],['تاريخ الصرف','المبلغ','طريقة الدفع','ملاحظات'],...payments.map(p=>[p.payment_date,p.amount,p.method,p.notes]),[],['إجمالي المدفوع',payments.reduce((s,p)=>s+Number(p.amount||0),0)],['المتبقي',Math.max(0,rows.reduce((s,r)=>s+Number(r.price||0),0)-payments.reduce((s,p)=>s+Number(p.amount||0),0))]].map(r=>r.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="contractor-${c.id}-statement.csv"`);res.send(csv);
});
app.get('/api/reports/contractors.csv',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const rows=db.prepare(`SELECT c.name contractor,c.service_type,c.phone,
 COALESCE((SELECT SUM(bc.price) FROM booking_contractors bc WHERE bc.contractor_id=c.id AND bc.company_id=c.company_id),0) due,
 COALESCE((SELECT SUM(cp.amount) FROM contractor_payments cp WHERE cp.contractor_id=c.id AND cp.company_id=c.company_id),0) paid
 FROM contractors c WHERE c.company_id=? ORDER BY c.name`).all(req.user.company_id);
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['المتعهد','الخدمة','الهاتف','إجمالي المستحق','إجمالي المدفوع','المتبقي'],...rows.map(r=>[r.contractor,r.service_type,r.phone,r.due,r.paid,Math.max(0,r.due-r.paid)])].map(r=>r.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="contractors-report.csv"');res.send(csv);
});
app.get('/api/reports/costs.csv',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const rows=db.prepare(`SELECT x.cost_date,x.title,x.category,x.amount,x.notes,u.name created_by_name,b.event_date,c.groom_name,c.bride_name
 FROM costs x JOIN users u ON u.id=x.created_by LEFT JOIN bookings b ON b.id=x.booking_id AND b.company_id=x.company_id LEFT JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id
 WHERE x.company_id=? AND x.cost_date BETWEEN ? AND ? ORDER BY x.cost_date,x.id`).all(req.user.company_id,req.query.from||'0001-01-01',req.query.to||'9999-12-31');
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['التاريخ','بيان التكلفة','التصنيف','المبلغ','ملاحظات','الموظف','تاريخ الحفل','العريس','العروسة'],...rows.map(r=>[r.cost_date,r.title,r.category,r.amount,r.notes,r.created_by_name,r.event_date,r.groom_name,r.bride_name])].map(r=>r.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="costs-report.csv"');res.send(csv);
});
app.get('/api/reports/financial.csv',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const company=req.user.company_id,from=req.query.from||'0001-01-01',to=req.query.to||'9999-12-31';
 const payments=db.prepare(`SELECT p.created_at date,p.amount,p.method,p.notes,c.name customer,b.event_date,h.name hall,u.name employee FROM payments p JOIN bookings b ON b.id=p.booking_id AND b.company_id=p.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id JOIN users u ON u.id=p.received_by WHERE p.company_id=? AND substr(p.created_at,1,10) BETWEEN ? AND ? ORDER BY p.created_at`).all(company,from,to);
 const costs=db.prepare('SELECT cost_date date,title,category,amount,notes FROM costs WHERE company_id=? AND cost_date BETWEEN ? AND ? ORDER BY cost_date').all(company,from,to);
 const cash=db.prepare('SELECT transaction_date date,transaction_type,category,amount,method,reference,notes FROM cash_transactions WHERE company_id=? AND transaction_date BETWEEN ? AND ? ORDER BY transaction_date').all(company,from,to);
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['نوع الحركة','التاريخ','البيان','التصنيف / القاعة','العميل / المرجع','طريقة الدفع','المبلغ','الموظف','ملاحظات'],...payments.map(p=>['تحصيل حجز',p.date,p.customer,p.hall,p.event_date,p.method,p.amount,p.employee,p.notes]),...costs.map(c=>['تكلفة',c.date,c.title,c.category,'','',c.amount,'',c.notes]),...cash.map(x=>[x.transaction_type==='in'?'إيراد خزنة':'صرف خزنة',x.date,x.category,x.reference,x.method,x.method,x.amount,'',x.notes])].map(r=>r.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="financial-report.csv"');res.send(csv);
});

app.get('/api/costs',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 res.json(db.prepare(`SELECT x.*,b.event_date,c.groom_name,c.bride_name,u.name created_by_name FROM costs x LEFT JOIN bookings b ON b.id=x.booking_id AND b.company_id=x.company_id LEFT JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN users u ON u.id=x.created_by WHERE x.company_id=? ORDER BY x.cost_date DESC,x.id DESC`).all(req.user.company_id));
});
app.post('/api/costs',auth,allowRoles('admin','manager'),(req,res)=>{
 const d=req.body||{};if(!String(d.title||'').trim()||!(Number(d.amount)>0)||!d.cost_date)return res.status(400).json({error:'البيان والمبلغ والتاريخ مطلوبة'});
 if(d.booking_id&&!scoped('bookings',req.user.company_id,d.booking_id))return res.status(400).json({error:'الحجز غير صحيح'});
 const r=db.prepare('INSERT INTO costs(company_id,booking_id,title,category,amount,cost_date,notes,created_by) VALUES(?,?,?,?,?,?,?,?)').run(req.user.company_id,d.booking_id||null,String(d.title).trim(),d.category||'تشغيل',Number(d.amount),d.cost_date,d.notes||'',req.user.id);
 logAction(req.user,'إضافة تكلفة','cost',r.lastInsertRowid,`${d.title}: ${d.amount} جنيه`);res.status(201).json({id:r.lastInsertRowid});
});
app.get('/api/cashbox',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const c=req.user.company_id,from=req.query.from||new Date().toISOString().slice(0,8)+'01',to=req.query.to||new Date().toISOString().slice(0,10);
 const bookingIncome=db.prepare(`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN bookings b ON b.id=p.booking_id AND b.company_id=p.company_id WHERE p.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(p.created_at) BETWEEN ? AND ?`).get(c,from,to).total;
 const contractorOut=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM contractor_payments WHERE company_id=? AND payment_date BETWEEN ? AND ?').get(c,from,to).total;
 const expenseOut=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE company_id=? AND expense_date BETWEEN ? AND ?').get(c,from,to).total;
 const costsOut=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM costs WHERE company_id=? AND cost_date BETWEEN ? AND ?').get(c,from,to).total;
 const insuranceIncome=db.prepare(`SELECT COALESCE(SUM(i.amount),0) total FROM booking_insurance i JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id WHERE i.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(i.created_at) BETWEEN ? AND ?`).get(c,from,to).total;
 const insuranceRefunds=db.prepare(`SELECT COALESCE(SUM(r.amount),0) total FROM insurance_refunds r JOIN booking_insurance i ON i.id=r.insurance_id AND i.company_id=r.company_id JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id WHERE r.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(r.created_at) BETWEEN ? AND ?`).get(c,from,to).total;
 const otherIn=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM cash_transactions WHERE company_id=? AND transaction_type='in' AND transaction_date BETWEEN ? AND ?").get(c,from,to).total;
 const otherOut=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM cash_transactions WHERE company_id=? AND transaction_type='out' AND transaction_date BETWEEN ? AND ?").get(c,from,to).total;
 const transactions=db.prepare(`SELECT 'تحصيل حجز' kind,p.amount,p.method,p.created_at transaction_date,p.reference,p.notes,c.name customer_name,h.name hall_name,b.event_date,b.id booking_id FROM payments p JOIN bookings b ON b.id=p.booking_id AND b.company_id=p.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id WHERE p.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(p.created_at) BETWEEN ? AND ?
 UNION ALL SELECT 'تأمين مسترد',i.amount,i.method,i.created_at, i.reference,'تأمين مسترد منفصل عن تكلفة الحفل',c.name,h.name,b.event_date,b.id FROM booking_insurance i JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id WHERE i.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(i.created_at) BETWEEN ? AND ?
 UNION ALL SELECT 'استرداد تأمين',-r.amount,r.method,r.created_at,r.reference,'رد تأمين للعميل',c.name,h.name,b.event_date,b.id FROM insurance_refunds r JOIN booking_insurance i ON i.id=r.insurance_id AND i.company_id=r.company_id JOIN bookings b ON b.id=i.booking_id AND b.company_id=i.company_id JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id WHERE r.company_id=? AND COALESCE(b.deleted_at,'')='' AND date(r.created_at) BETWEEN ? AND ?
 UNION ALL SELECT 'صرف متعهد',amount,method,created_at, '',notes,'—','—',NULL,NULL FROM contractor_payments WHERE company_id=? AND payment_date BETWEEN ? AND ?
 UNION ALL SELECT 'مصروف',amount,'كاش',expense_date,'',notes,'—','—',NULL,NULL FROM expenses WHERE company_id=? AND expense_date BETWEEN ? AND ?
 UNION ALL SELECT 'تكلفة',amount,'كاش',cost_date,'',notes,'—','—',NULL,NULL FROM costs WHERE company_id=? AND cost_date BETWEEN ? AND ?
 UNION ALL SELECT category,amount,method,transaction_date,reference,notes,'—','—',NULL,NULL FROM cash_transactions WHERE company_id=? AND transaction_date BETWEEN ? AND ?
 ORDER BY transaction_date DESC`).all(c,from,to,c,from,to,c,from,to,c,from,to,c,from,to,c,from,to,c,from,to);
 res.json({from,to,bookingIncome,insuranceIncome,insuranceRefunds,contractorOut,expenseOut,costsOut,otherIn,otherOut,net:bookingIncome+insuranceIncome-insuranceRefunds+otherIn-contractorOut-expenseOut-costsOut-otherOut,transactions});
});
app.post('/api/cashbox',auth,allowRoles('admin','manager','accountant'),(req,res)=>{
 const d=req.body||{};if(!['in','out'].includes(d.transaction_type)||!(Number(d.amount)>0)||!d.category||!d.transaction_date)return res.status(400).json({error:'راجع نوع الحركة والبيان والمبلغ والتاريخ'});
 const r=db.prepare('INSERT INTO cash_transactions(company_id,transaction_type,amount,category,method,reference,notes,transaction_date,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user.company_id,d.transaction_type,Number(d.amount),d.category,d.method||'كاش',d.reference||'',d.notes||'',d.transaction_date,req.user.id);
 logAction(req.user,'حركة خزنة',d.transaction_type==='in'?'إيراد خزنة':'مصروف خزنة',r.lastInsertRowid,`${d.category}: ${d.amount} جنيه`);
 res.status(201).json({id:r.lastInsertRowid});
});

app.get('/api/reports/summary',auth,allowRoles('admin','manager'),(req,res)=>{
 const c=req.user.company_id,from=req.query.from||new Date().toISOString().slice(0,7)+'-01',to=req.query.to||new Date().toISOString().slice(0,10);
 const bookings=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(contract_total-discount),0) contracts,COALESCE(SUM(paid_total),0) collected,COALESCE(SUM(contract_total-discount-paid_total),0) remaining FROM bookings WHERE company_id=? AND event_date BETWEEN ? AND ? AND status!='ملغي'").get(c,from,to);
 const expenses=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE company_id=? AND expense_date BETWEEN ? AND ?').get(c,from,to).total;
 const byHall=db.prepare(`SELECT h.name hall_name,COUNT(b.id) bookings,COALESCE(SUM(b.contract_total-b.discount),0) contracts,COALESCE(SUM(b.paid_total),0) collected FROM halls h LEFT JOIN bookings b ON b.hall_id=h.id AND b.company_id=h.company_id AND b.event_date BETWEEN ? AND ? AND b.status!='ملغي' WHERE h.company_id=? GROUP BY h.id ORDER BY bookings DESC`).all(from,to,c);
 const bySource=db.prepare('SELECT source,COUNT(*) count FROM customers WHERE company_id=? AND created_at BETWEEN ? AND ? GROUP BY source ORDER BY count DESC').all(c,from+' 00:00:00',to+' 23:59:59');
 res.json({from,to,bookings,expenses,net:bookings.collected-expenses,byHall,bySource});
});
app.get('/api/reports/discounts.csv',auth,allowRoles('admin','manager'),(req,res)=>{
 const rows=db.prepare(`SELECT b.id booking_id,c.name customer,c.phone,h.name hall,b.event_date,b.event_period,b.status booking_status,
 b.contract_total,b.base_contract_total,b.discount,
 CASE WHEN r.id IS NULL THEN 'بدون طلب استثنائي' WHEN r.status='approved' THEN 'تمت الموافقة' WHEN r.status='rejected' THEN 'تم الرفض' ELSE 'بانتظار الموافقة' END approval_status,
 CASE WHEN r.id IS NULL THEN '' WHEN r.requested_mode='percent' THEN CAST(r.requested_value AS TEXT)||'%' ELSE CAST(r.requested_discount AS TEXT)||' جنيه' END requested_discount,
 COALESCE(r.request_reason,'') request_reason,COALESCE(asker.name,booking_user.name,'') discount_user,
 COALESCE(reviewer.name,'') admin_reviewer,COALESCE(r.review_reason,'') admin_decision_reason,COALESCE(r.reviewed_at,'') reviewed_at
 FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id
 JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 LEFT JOIN discount_requests r ON r.booking_id=b.id AND r.company_id=b.company_id
 LEFT JOIN users asker ON asker.id=r.requested_by
 LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
 LEFT JOIN users booking_user ON booking_user.id=b.created_by
 WHERE b.company_id=? ORDER BY b.event_date DESC,b.id DESC`).all(req.user.company_id);
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const header=['رقم الحجز','العميل','الموبايل','القاعة','تاريخ المناسبة','الفترة','حالة الحجز','إجمالي العقد','السعر الأساسي','الخصم المطبق','حالة موافقة الخصم','الخصم المطلوب','سبب طلب الخصم','المستخدم طالب الخصم','المدير العام صاحب القرار','سبب قرار المدير','تاريخ القرار'];
 const csv='\uFEFF'+[header,...rows.map(r=>[r.booking_id,r.customer,r.phone,r.hall,r.event_date,r.event_period,r.booking_status,r.contract_total,r.base_contract_total,r.discount,r.approval_status,r.requested_discount,r.request_reason,r.discount_user,r.admin_reviewer,r.admin_decision_reason,r.reviewed_at])].map(row=>row.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="discounts-report.csv"');res.send(csv);
});
app.get('/api/reports/bookings.csv',auth,allowRoles('admin','manager'),(req,res)=>{
 const rows=db.prepare(`SELECT c.name customer,c.phone,h.name hall,b.event_date,b.event_period,b.status,b.guest_count,b.contract_total,b.discount,b.paid_total,(b.contract_total-b.discount-b.paid_total) remaining FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id WHERE b.company_id=? ORDER BY b.event_date`).all(req.user.company_id);
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['العميل','الموبايل','القاعة','التاريخ','الفترة','الحالة','الأفراد','العقد','الخصم','المدفوع','المتبقي'],...rows.map(r=>[r.customer,r.phone,r.hall,r.event_date,r.event_period,r.status,r.guest_count,r.contract_total,r.discount,r.paid_total,r.remaining])].map(r=>r.map(esc).join(',')).join('\r\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="bookings-report.csv"');res.send(csv);
});
app.get('/api/admin/users',auth,admin,(req,res)=>res.json(db.prepare('SELECT id,name,username,role,job_title,permissions_json,active,discount_limit_type,discount_limit_value,created_at FROM users WHERE company_id=? ORDER BY id').all(req.user.company_id)));
app.post('/api/admin/users',auth,admin,(req,res)=>{
 try {
  const d=req.body||{};
  if(!String(d.name||'').trim()||!String(d.username||'').trim()||String(d.password||'').length<10)
   return res.status(400).json({error:'الاسم واسم المستخدم وكلمة مرور 10 أحرف على الأقل مطلوبة'});
  const title=String(d.job_title||'').trim();
  if(!title)return res.status(400).json({error:'اكتب المسمى الوظيفي بحرية، مثل مدير استقبال أو محاسب تكاليف'});
  const allowed=['dashboard','customers','followups','bookings','cashierView','bookingDelete','calendar','halls','packages','paragraphs','menus','finance','contractors','costs','cashbox','discountRequests','reports','users','logs','settings'];
  const permissions=Array.isArray(d.permissions)?[...new Set(d.permissions.filter(p=>allowed.includes(p)))]:[];
  const type=d.discount_limit_type==='amount'?'amount':'percent',value=Math.max(0,Number(d.discount_limit_value)||0);
  if(type==='percent'&&value>100)return res.status(400).json({error:'نسبة الخصم لا يمكن أن تزيد عن 100%'});
  const r=db.prepare('INSERT INTO users(company_id,name,username,password_hash,role,job_title,permissions_json,discount_limit_type,discount_limit_value) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(req.user.company_id,String(d.name).trim(),String(d.username).trim(),bcrypt.hashSync(d.password,10),'employee',title,JSON.stringify(permissions),type,value);
  logAction(req.user,'إضافة مستخدم','user',r.lastInsertRowid,`${title}; الصلاحيات: ${permissions.join(', ')}`);
  res.status(201).json({id:r.lastInsertRowid});
 }catch(e){safeError(res,e)}
});
app.put('/api/admin/users/:id',auth,admin,(req,res)=>{
 const u=scoped('users',req.user.company_id,req.params.id);if(!u)return res.status(404).json({error:'المستخدم غير موجود'});
 const d=req.body||{},title=String(d.job_title??u.job_title??'').trim();
 const type=d.discount_limit_type==='amount'?'amount':'percent',value=Math.max(0,Number(d.discount_limit_value)||0);
 const allowed=['dashboard','customers','followups','bookings','cashierView','bookingDelete','calendar','halls','packages','paragraphs','menus','finance','contractors','costs','cashbox','discountRequests','reports','users','logs','settings'];
 const permissions=Array.isArray(d.permissions)?[...new Set(d.permissions.filter(p=>allowed.includes(p)))]:JSON.parse(u.permissions_json||'[]');
 if(type==='percent'&&value>100)return res.status(400).json({error:'نسبة الخصم لا يمكن أن تزيد عن 100%'});
 if(!String(d.name||u.name).trim()||!String(d.username||u.username).trim()||!title)return res.status(400).json({error:'الاسم واسم المستخدم والمسمى الوظيفي مطلوبون'});
 try{
  db.prepare('UPDATE users SET name=?,username=?,job_title=?,permissions_json=?,discount_limit_type=?,discount_limit_value=? WHERE id=? AND company_id=?')
   .run(String(d.name||u.name).trim(),String(d.username||u.username).trim(),title,JSON.stringify(permissions),type,value,u.id,req.user.company_id);
  logAction(req.user,'تعديل صلاحيات مستخدم','user',u.id,`${title}; الصلاحيات: ${permissions.join(', ')}; حد الخصم ${type==='percent'?value+'%':value+' جنيه'}`);
  res.json(db.prepare('SELECT id,name,username,role,job_title,permissions_json,active,discount_limit_type,discount_limit_value,created_at FROM users WHERE id=? AND company_id=?').get(u.id,req.user.company_id));
 }catch(e){safeError(res,e)}
});
app.put('/api/admin/company',auth,admin,(req,res)=>{
 const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم الشركة مطلوب'});
 db.prepare('UPDATE companies SET name=?,logo_url=?,currency=? WHERE id=?').run(d.name.trim(),d.logo_url||'',d.currency||'EGP',req.user.company_id);
 logAction(req.user,'تعديل إعدادات الشركة','company',req.user.company_id,d.name);
 res.json(db.prepare('SELECT id,name,logo_url,currency FROM companies WHERE id=?').get(req.user.company_id));
});
app.get('/api/discount-requests',auth,allowRoles('admin','manager'),(req,res)=>{
 const rows=db.prepare(`SELECT r.*,b.event_date,b.event_period,b.contract_total,b.base_contract_total,b.discount,b.guest_count,b.status booking_status,c.groom_name,c.bride_name,c.name customer_name,c.phone customer_phone,h.name hall_name,asker.name requested_by_name,reviewer.name reviewed_by_name
 FROM discount_requests r JOIN bookings b ON b.id=r.booking_id AND b.company_id=r.company_id
 JOIN customers c ON c.id=b.customer_id AND c.company_id=b.company_id JOIN halls h ON h.id=b.hall_id AND h.company_id=b.company_id
 JOIN users asker ON asker.id=r.requested_by LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
 WHERE r.company_id=? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.id DESC`).all(req.user.company_id);
 res.json(rows);
});
app.post('/api/discount-requests/:id/review',auth,allowRoles('admin'),(req,res)=>{
 const r=db.prepare('SELECT * FROM discount_requests WHERE id=? AND company_id=?').get(req.params.id,req.user.company_id);
 if(!r)return res.status(404).json({error:'طلب الخصم غير موجود'});
 if(r.status!=='pending')return res.status(400).json({error:'تمت مراجعة هذا الطلب من قبل'});
 const decision=req.body.decision,reason=String(req.body.reason||'').trim();
 if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'اختر الموافقة أو الرفض'});
 if(!reason)return res.status(400).json({error:'اكتب سبب الموافقة أو الرفض'});
 const b=scoped('bookings',req.user.company_id,r.booking_id);
 const finalDiscount=decision==='approved'?Number(r.requested_discount):Math.min(Number(r.allowed_discount||0),Number(b.base_contract_total||b.contract_total));
 if(finalDiscount>Number(b.base_contract_total||b.contract_total)+0.001)return res.status(400).json({error:'الخصم يتجاوز سعر الباكدج'});
 db.prepare('UPDATE bookings SET discount=?,status=CASE WHEN status=\'مؤكد\' THEN status ELSE \'مبدئي\' END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?').run(finalDiscount,b.id,req.user.company_id);
 db.prepare("UPDATE discount_requests SET status=?,reviewed_by=?,review_reason=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?").run(decision,req.user.id,reason,r.id,req.user.company_id);
 logAction(req.user,decision==='approved'?'الموافقة على طلب خصم':'رفض طلب خصم','discount_request',r.id,`سبب المراجعة: ${reason}; قيمة الخصم: ${r.requested_discount}`);
 const bookingInfo=db.prepare('SELECT c.groom_name,c.bride_name,c.name customer_name FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=? AND b.company_id=?').get(r.booking_id,req.user.company_id);
 const outcome=decision==='approved'?'تمت الموافقة على الخصم الاستثنائي':'تم رفض الخصم الاستثنائي';
 const amountText=decision==='approved'?`الخصم المعتمد ${r.requested_mode==='percent'?r.requested_value+'%':''} (${r.requested_discount} جنيه) وتم تطبيقه تلقائيًا على الحجز. يمكنك الآن فتح الحجوزات ومراجعة الحجز ثم تأكيده.`:`لم تتم الموافقة على الخصم المطلوب. تم الإبقاء على الخصم المسموح لك به تلقائيًا (${finalDiscount} جنيه). يمكنك الآن فتح الحجوزات ومراجعة الحجز ثم تأكيده.`;
 notifyUser(req.user.company_id,r.requested_by,decision==='approved'?'تمت الموافقة على طلب الخصم':'تم رفض طلب الخصم',`${outcome}. رقم الحجز: #${r.booking_id}. ${amountText} السبب الذي سجله المدير العام: ${reason}`,decision==='approved'?'success':'danger','discount_request',r.id);
 res.json({ok:true,decision,discount:finalDiscount,reason,booking_id:r.booking_id});
});

app.get('/api/notifications',auth,(req,res)=>{
 const rows=db.prepare('SELECT * FROM notifications WHERE company_id=? AND user_id=? ORDER BY id DESC LIMIT 100').all(req.user.company_id,req.user.id);
 res.json({unread:rows.filter(n=>!n.is_read).length,items:rows});
});
app.post('/api/notifications/:id/read',auth,(req,res)=>{
 const r=db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND company_id=? AND user_id=?').run(req.params.id,req.user.company_id,req.user.id);
 res.json({ok:true,changed:r.changes});
});
app.post('/api/notifications/read-all',auth,(req,res)=>{
 db.prepare('UPDATE notifications SET is_read=1 WHERE company_id=? AND user_id=?').run(req.user.company_id,req.user.id);
 res.json({ok:true});
});

app.get('/api/logs',auth,admin,(req,res)=>res.json(db.prepare('SELECT l.*,u.name user_name FROM audit_logs l JOIN users u ON u.id=l.user_id WHERE l.company_id=? ORDER BY l.id DESC LIMIT 500').all(req.user.company_id)));
app.get('/api/admin/backup',auth,admin,(req,res)=>{
 try {
  db.pragma('wal_checkpoint(TRUNCATE)');
  res.download(path.join(DATA_DIR,'wedding-halls.sqlite'),'wedding-halls-backup.sqlite');
 } catch(e) { res.status(500).json({error:'تعذر إنشاء النسخة الاحتياطية'}); }
});

// Restore a validated SQLite backup. The current database is preserved before replacement.
// The process exits after the response so the operator can restart it from START_WINDOWS.bat.
app.post('/api/admin/restore',auth,admin,express.raw({type:'application/octet-stream',limit:'100mb'}),(req,res)=>{
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const uploadedPath=path.join(DATA_DIR,`restore-upload-${stamp}.sqlite`);
 const safetyPath=path.join(DATA_DIR,`auto-before-restore-${stamp}.sqlite`);
 let candidate;
 try {
  const bytes=req.body;
  if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.subarray(0,16).toString('utf8')!=='SQLite format 3\u0000')
   return res.status(400).json({error:'الملف ليس نسخة SQLite صالحة. اختر ملف النسخة الاحتياطية الذي تم تنزيله من النظام.'});
  fs.writeFileSync(uploadedPath,bytes);
  candidate=new Database(uploadedPath,{readonly:true,fileMustExist:true});
  const integrity=candidate.pragma('integrity_check',{simple:true});
  const required=['companies','users','bookings'];
  const tables=candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  if(integrity!=='ok'||required.some(t=>!tables.includes(t))) {
   candidate.close();candidate=null;fs.unlinkSync(uploadedPath);
   return res.status(400).json({error:'النسخة الاحتياطية تالفة أو لا تحتوي على جداول النظام المطلوبة. لم يتم تغيير قاعدة البيانات الحالية.'});
  }
  candidate.close();candidate=null;
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(DB_PATH,safetyPath);
  fs.copyFileSync(uploadedPath,PENDING_RESTORE_PATH);
  fs.unlinkSync(uploadedPath);
  res.json({ok:true,message:'تم فحص النسخة بنجاح. سيعيد النظام تشغيل نفسه الآن، مع الاحتفاظ بنسخة أمان من البيانات الحالية.',safety_backup:path.basename(safetyPath),restart_required:true});
  if(process.platform==='win32') {
   const bat=path.join(__dirname,'START_WINDOWS.bat');
   const command=`timeout /t 3 /nobreak >nul & start "" "${bat}"`;
   const child=require('child_process').spawn('cmd.exe',['/c',command],{cwd:__dirname,detached:true,stdio:'ignore',windowsHide:true});
   child.unref();
  }
  setTimeout(()=>process.exit(0),1200);
 } catch(e) {
  try { if(candidate) candidate.close(); } catch(x) {}
  try { if(fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch(x) {}
  try { if(fs.existsSync(PENDING_RESTORE_PATH)) fs.unlinkSync(PENDING_RESTORE_PATH); } catch(x) {}
  if(!res.headersSent)return res.status(400).json({error:'فشلت عملية الاستعادة ولم يتم اعتماد الملف: '+(e.message||'خطأ غير معروف')});
 }
});

// Optional event paragraphs and menu packages.
// V20 compatibility: keep legacy packages visible after a hall was re-created with the same name.
try {
 db.prepare(`UPDATE packages
   SET hall_id = (
     SELECT active_hall.id FROM halls old_hall
     JOIN halls active_hall ON active_hall.company_id=old_hall.company_id
       AND active_hall.name=old_hall.name AND active_hall.active=1
     WHERE old_hall.id=packages.hall_id AND old_hall.company_id=packages.company_id
       AND old_hall.active=0
     ORDER BY active_hall.id DESC LIMIT 1
   )
   WHERE hall_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM halls old_hall WHERE old_hall.id=packages.hall_id
       AND old_hall.company_id=packages.company_id AND old_hall.active=0)
     AND EXISTS (SELECT 1 FROM halls old_hall JOIN halls active_hall
       ON active_hall.company_id=old_hall.company_id AND active_hall.name=old_hall.name AND active_hall.active=1
       WHERE old_hall.id=packages.hall_id AND old_hall.company_id=packages.company_id)
 `).run();
} catch (e) { console.error('Legacy package relink migration skipped:', e.message); }

app.get('/api/packages',auth,(req,res)=>{
 const rows=db.prepare(`SELECT p.*,h.name hall_name FROM packages p LEFT JOIN halls h ON h.id=p.hall_id AND h.company_id=p.company_id WHERE p.company_id=? ORDER BY p.name`).all(req.user.company_id);
 res.json(rows);
});
app.post('/api/packages',auth,allowRoles('admin','manager'),(req,res)=>{
 const d=req.body||{};if(!String(d.name||'').trim()||!(Number(d.price)>=0))return res.status(400).json({error:'اسم الباكدج والسعر مطلوبان'});
 if(d.hall_id&&!scoped('halls',req.user.company_id,d.hall_id))return res.status(400).json({error:'القاعة غير صحيحة'});
 const r=db.prepare('INSERT INTO packages(company_id,hall_id,name,guest_count,price,event_period,description,included_guest_count,extra_guest_price,included_items) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.user.company_id,d.hall_id||null,String(d.name).trim(),Math.max(0,Number(d.guest_count)||0),Number(d.price),d.event_period==='نهاري'?'نهاري':'مسائي',d.description||'',Math.max(0,Number(d.included_guest_count)||0),Math.max(0,Number(d.extra_guest_price)||0),String(d.included_items||''));
 logAction(req.user,'إضافة باكدج','package',r.lastInsertRowid,d.name);res.status(201).json({id:r.lastInsertRowid});
});
app.put('/api/packages/:id',auth,allowRoles('admin','manager'),(req,res)=>{
 const p=scoped('packages',req.user.company_id,req.params.id);if(!p)return res.status(404).json({error:'الباكدج غير موجود'});
 const d=req.body||{};if(!String(d.name||'').trim()||!(Number(d.price)>=0))return res.status(400).json({error:'اسم الباكدج والسعر مطلوبان'});
 if(d.hall_id&&!scoped('halls',req.user.company_id,d.hall_id))return res.status(400).json({error:'القاعة غير صحيحة'});
 db.prepare('UPDATE packages SET hall_id=?,name=?,guest_count=?,price=?,event_period=?,description=?,included_guest_count=?,extra_guest_price=?,included_items=?,active=? WHERE id=? AND company_id=?').run(d.hall_id||null,String(d.name).trim(),Math.max(0,Number(d.guest_count)||0),Number(d.price),d.event_period==='نهاري'?'نهاري':'مسائي',d.description||'',Math.max(0,Number(d.included_guest_count)||0),Math.max(0,Number(d.extra_guest_price)||0),String(d.included_items||''),Number(d.active)===0?0:1,p.id,req.user.company_id);
 logAction(req.user,'تعديل باكدج','package',p.id,d.name);res.json({ok:true});
});

app.get('/api/documents/:type',auth,(req,res)=>{
 const type=String(req.params.type||'');
 if(!['instruction','contract'].includes(type))return res.status(400).json({error:'نوع المستند غير صالح'});
 const rows=db.prepare('SELECT d.*,u.name created_by_name,uu.name updated_by_name FROM saved_documents d LEFT JOIN users u ON u.id=d.created_by LEFT JOIN users uu ON uu.id=d.updated_by WHERE d.company_id=? AND d.document_type=? ORDER BY d.updated_at DESC,d.id DESC').all(req.user.company_id,type);
 res.json(rows);
});
app.post('/api/documents/:type',auth,admin,(req,res)=>{
 try{
  const type=String(req.params.type||''); if(!['instruction','contract'].includes(type))return res.status(400).json({error:'نوع المستند غير صالح'});
  const d=req.body||{}; if(!String(d.title||'').trim())return res.status(400).json({error:'عنوان المستند مطلوب'});
  const r=db.prepare('INSERT INTO saved_documents(company_id,document_type,title,body,created_by,updated_by) VALUES(?,?,?,?,?,?)').run(req.user.company_id,type,String(d.title).trim(),String(d.body||''),req.user.id,req.user.id);
  logAction(req.user,type==='instruction'?'إضافة تعليمات':'إضافة عقد','saved_document',r.lastInsertRowid,d.title);
  res.status(201).json(db.prepare('SELECT * FROM saved_documents WHERE id=? AND company_id=?').get(r.lastInsertRowid,req.user.company_id));
 }catch(e){safeError(res,e)}
});
app.put('/api/documents/:type/:id',auth,admin,(req,res)=>{
 try{
  const type=String(req.params.type||''); if(!['instruction','contract'].includes(type))return res.status(400).json({error:'نوع المستند غير صالح'});
  const id=Number(req.params.id),old=db.prepare('SELECT * FROM saved_documents WHERE id=? AND company_id=? AND document_type=?').get(id,req.user.company_id,type);
  if(!old)return res.status(404).json({error:'المستند غير موجود'});
  const d=req.body||{}; if(!String(d.title||'').trim())return res.status(400).json({error:'عنوان المستند مطلوب'});
  db.prepare('UPDATE saved_documents SET title=?,body=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND document_type=?').run(String(d.title).trim(),String(d.body||''),req.user.id,id,req.user.company_id,type);
  logAction(req.user,type==='instruction'?'تعديل تعليمات':'تعديل عقد','saved_document',id,d.title);
  res.json(db.prepare('SELECT * FROM saved_documents WHERE id=? AND company_id=?').get(id,req.user.company_id));
 }catch(e){safeError(res,e)}
});
app.delete('/api/documents/:type/:id',auth,admin,(req,res)=>{
 const type=String(req.params.type||''),id=Number(req.params.id);
 if(!['instruction','contract'].includes(type))return res.status(400).json({error:'نوع المستند غير صالح'});
 const old=db.prepare('SELECT * FROM saved_documents WHERE id=? AND company_id=? AND document_type=?').get(id,req.user.company_id,type);
 if(!old)return res.status(404).json({error:'المستند غير موجود'});
 db.prepare('DELETE FROM saved_documents WHERE id=? AND company_id=? AND document_type=?').run(id,req.user.company_id,type);
 logAction(req.user,type==='instruction'?'حذف تعليمات':'حذف عقد','saved_document',id,old.title); res.json({ok:true});
});

app.get('/api/paragraphs',auth,(req,res)=>res.json(db.prepare('SELECT * FROM paragraphs WHERE company_id=? ORDER BY active DESC,name').all(req.user.company_id)));
app.post('/api/paragraphs',auth,admin,(req,res)=>{
 try{const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم الفقرة مطلوب'});
 const r=db.prepare('INSERT INTO paragraphs(company_id,name,price,event_period,duration_minutes,show_names) VALUES(?,?,?,?,?,?)').run(req.user.company_id,d.name.trim(),Math.max(0,Number(d.price)||0),d.event_period==='نهاري'?'نهاري':'مسائي',Math.max(0,Number(d.duration_minutes)||0),d.show_names||'');
 logAction(req.user,'إضافة فقرة','paragraph',r.lastInsertRowid,d.name);res.status(201).json(scoped('paragraphs',req.user.company_id,r.lastInsertRowid));
 }catch(e){safeError(res,e)}
});
app.put('/api/paragraphs/:id',auth,admin,(req,res)=>{
 try{const p=scoped('paragraphs',req.user.company_id,req.params.id);if(!p)return res.status(404).json({error:'الفقرة غير موجودة'});const d={...p,...req.body};
 db.prepare('UPDATE paragraphs SET name=?,price=?,event_period=?,duration_minutes=?,show_names=?,active=? WHERE id=? AND company_id=?').run(d.name,Math.max(0,Number(d.price)||0),d.event_period==='نهاري'?'نهاري':'مسائي',Math.max(0,Number(d.duration_minutes)||0),d.show_names||'',d.active===false||d.active===0?0:1,p.id,req.user.company_id);
 logAction(req.user,'تعديل فقرة','paragraph',p.id,d.name);res.json(scoped('paragraphs',req.user.company_id,p.id));
 }catch(e){safeError(res,e)}
});
app.get('/api/menu-groups',auth,(req,res)=>{
 const groups=db.prepare('SELECT * FROM menu_groups WHERE company_id=? ORDER BY active DESC,name').all(req.user.company_id);
 res.json(groups.map(g=>({...g,items:db.prepare('SELECT * FROM menu_items WHERE company_id=? AND menu_group_id=? ORDER BY id').all(req.user.company_id,g.id)})));
});
app.post('/api/menu-groups',auth,admin,(req,res)=>{
 try{const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم مجموعة المنيو مطلوب'});
 const r=db.prepare('INSERT INTO menu_groups(company_id,name,price,event_period,price_mode,description) VALUES(?,?,?,?,?,?)').run(req.user.company_id,d.name.trim(),Math.max(0,Number(d.price)||0),d.event_period==='نهاري'?'نهاري':'مسائي',d.price_mode==='fixed'?'fixed':'per_person',d.description||'');
 logAction(req.user,'إضافة مجموعة منيو','menu_group',r.lastInsertRowid,d.name);res.status(201).json({id:r.lastInsertRowid});
 }catch(e){safeError(res,e)}
});
app.put('/api/menu-groups/:id',auth,admin,(req,res)=>{
 try{const g=scoped('menu_groups',req.user.company_id,req.params.id);if(!g)return res.status(404).json({error:'مجموعة المنيو غير موجودة'});const d={...g,...req.body};
 db.prepare('UPDATE menu_groups SET name=?,price=?,event_period=?,price_mode=?,description=?,active=? WHERE id=? AND company_id=?').run(d.name,Math.max(0,Number(d.price)||0),d.event_period==='نهاري'?'نهاري':'مسائي',d.price_mode==='fixed'?'fixed':'per_person',d.description||'',d.active===false||d.active===0?0:1,g.id,req.user.company_id);
 logAction(req.user,'تعديل مجموعة منيو','menu_group',g.id,d.name);res.json({ok:true});
 }catch(e){safeError(res,e)}
});
app.post('/api/menu-groups/:id/items/bulk',auth,admin,(req,res)=>{
 try{
  const g=scoped('menu_groups',req.user.company_id,req.params.id);
  if(!g)return res.status(404).json({error:'مجموعة المنيو غير موجودة'});
  const items=Array.isArray(req.body?.items)?req.body.items:[];
  if(!items.length)return res.status(400).json({error:'أضف صنفًا واحدًا على الأقل'});
  if(items.length>100)return res.status(400).json({error:'الحد الأقصى 100 صنف في المرة الواحدة'});
  for(const item of items){if(!String(item?.name||'').trim())return res.status(400).json({error:'اسم كل صنف مطلوب'});}
  const insert=db.prepare('INSERT INTO menu_items(company_id,menu_group_id,name,category,quantity,notes) VALUES(?,?,?,?,?,?)');
  const insertAll=db.transaction((rows)=>rows.map(item=>{const name=String(item.name).trim();const r=insert.run(req.user.company_id,g.id,name,String(item.category||'أكل'),String(item.quantity||''),String(item.notes||''));logAction(req.user,'إضافة صنف منيو','menu_item',r.lastInsertRowid,name);return r.lastInsertRowid;}));
  const ids=insertAll(items);
  res.status(201).json({ok:true,ids,count:ids.length});
 }catch(e){safeError(res,e)}
});
app.post('/api/menu-groups/:id/items',auth,admin,(req,res)=>{
 try{const g=scoped('menu_groups',req.user.company_id,req.params.id);if(!g)return res.status(404).json({error:'مجموعة المنيو غير موجودة'});const d=req.body||{};if(!String(d.name||'').trim())return res.status(400).json({error:'اسم الصنف مطلوب'});
 const r=db.prepare('INSERT INTO menu_items(company_id,menu_group_id,name,category,quantity,notes) VALUES(?,?,?,?,?,?)').run(req.user.company_id,g.id,d.name.trim(),d.category||'أكل',d.quantity||'',d.notes||'');
 logAction(req.user,'إضافة صنف منيو','menu_item',r.lastInsertRowid,d.name);res.status(201).json({id:r.lastInsertRowid});
 }catch(e){safeError(res,e)}
});
app.put('/api/menu-items/:id',auth,admin,(req,res)=>{
 try{const item=scoped('menu_items',req.user.company_id,req.params.id);if(!item)return res.status(404).json({error:'الصنف غير موجود'});const d={...item,...req.body};
 db.prepare('UPDATE menu_items SET name=?,category=?,quantity=?,notes=? WHERE id=? AND company_id=?').run(d.name,d.category||'أكل',d.quantity||'',d.notes||'',item.id,req.user.company_id);
 logAction(req.user,'تعديل صنف منيو','menu_item',item.id,d.name);res.json({ok:true});
 }catch(e){safeError(res,e)}
});
app.delete('/api/menu-items/:id',auth,admin,(req,res)=>{
 const item=scoped('menu_items',req.user.company_id,req.params.id);if(!item)return res.status(404).json({error:'الصنف غير موجود'});
 db.prepare('DELETE FROM menu_items WHERE id=? AND company_id=?').run(item.id,req.user.company_id);logAction(req.user,'حذف صنف منيو','menu_item',item.id,item.name);res.json({ok:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'خطأ داخلي في الخادم'});});

app.get('/entry/:token', (req,res)=>{
 const b = db.prepare(`SELECT b.id,b.status,b.event_date,b.event_period,b.invitation_expires_at,b.invitation_used_at,
 c.groom_name,c.bride_name,h.name hall_name,h.venue,co.name company_name
 FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN halls h ON h.id=b.hall_id JOIN companies co ON co.id=b.company_id
 WHERE b.invitation_token=?`).get(String(req.params.token||''));
 const esc = v => String(v??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state='valid', message='الدعوة صالحة — راجع البيانات ثم اضغط تأكيد الدخول لتسجيل استخدام الدعوة.';
 if (!b) { state='invalid'; message='كود الدعوة غير صحيح أو غير موجود.'; }
 else if (b.status !== 'مؤكد') { state='invalid'; message='الحجز غير مؤكد أو تم إلغاؤه؛ لا يسمح بالدخول.'; }
 else if (!b.invitation_expires_at || cairoDateString() >= b.invitation_expires_at.slice(0,10)) { state='invalid'; message='انتهت صلاحية الدعوة.'; }
 else if (b.invitation_used_at) { state='used'; message='تم استخدام هذه الدعوة وتسجيل الدخول بها من قبل. لا يمكن استخدامها مرة أخرى.'; }
 const details = b ? `<div class="detail"><span>اسم القاعة</span><b>${esc(b.hall_name)}</b></div><div class="detail"><span>العريس</span><b>${esc(b.groom_name||'—')}</b></div><div class="detail"><span>العروسة</span><b>${esc(b.bride_name||'—')}</b></div><div class="detail"><span>التاريخ</span><b>${esc(b.event_date)} · ${esc(b.event_period)}</b></div>` : '';
 res.status(state==='valid'||state==='used'?200:403).send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>التحقق من دعوة الفرح</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f4f1eb;color:#202b3c;font-family:Arial,Tahoma,sans-serif;padding:24px;min-height:100vh;display:grid;place-items:center}.card{width:min(100%,520px);background:#fff;border:1px solid #d7bd83;border-radius:24px;overflow:hidden;box-shadow:0 18px 55px #17243b18}.top{padding:28px 24px;text-align:center;background:linear-gradient(135deg,#14233b,#293d5b);color:#fff}.top .orn{color:#e2c17a;font-size:24px;letter-spacing:8px}.top h1{font-size:24px;margin:12px 0 6px}.top p{margin:0;color:#e9d9b5}.content{padding:24px}.state{padding:14px;border-radius:12px;margin-bottom:18px;line-height:1.8;background:${state==='valid'?'#eaf8ef':state==='used'?'#fff4d9':'#fff0f0'};color:${state==='valid'?'#17683b':state==='used'?'#825600':'#a12222'}}.detail{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #eee;padding:13px 0}.detail span{color:#697386}.detail b{text-align:left}.btn{width:100%;border:0;border-radius:12px;padding:15px;background:#b28b45;color:#fff;font-size:16px;font-weight:bold;margin-top:22px;cursor:pointer}.btn:disabled{opacity:.5}.fine{font-size:12px;line-height:1.8;color:#777;text-align:center;margin-top:14px}</style><main class="card"><header class="top"><div class="orn">✦ ✧ ✦</div><h1>التحقق من دعوة الفرح</h1><p>${b?esc(b.company_name):'نظام دعوات الأفراح'}</p></header><section class="content"><div class="state">${message}</div>${details}${state==='valid'?`<form method="POST" action="/entry/${encodeURIComponent(req.params.token)}/use"><button class="btn" type="submit">تأكيد دخول المدعو — استخدام الدعوة</button></form>`:''}<p class="fine">الدعوة شخصية ولمرة واحدة فقط، وتنتهي صلاحيتها مع بداية اليوم التالي للمناسبة.</p></section></main></html>`);
});
app.post('/entry/:token/use', (req,res)=>{
 const token=String(req.params.token||'');
 const b=db.prepare('SELECT id,company_id,status,event_date,invitation_expires_at,invitation_used_at FROM bookings WHERE invitation_token=?').get(token);
 if (!b) return res.status(403).send('كود الدعوة غير صحيح.');
 const now=new Date();
 if (b.status!=='مؤكد') return res.redirect(303,`/entry/${encodeURIComponent(token)}`);
 if (!b.invitation_expires_at || cairoDateString(now)>=b.invitation_expires_at.slice(0,10)) return res.redirect(303,`/entry/${encodeURIComponent(token)}`);
 const result=db.prepare('UPDATE bookings SET invitation_used_at=? WHERE id=? AND company_id=? AND invitation_used_at IS NULL AND status=? AND invitation_expires_at>?')
   .run(now.toISOString(),b.id,b.company_id,'مؤكد',now.toISOString());
 if (result.changes) logAction({company_id:b.company_id,id:db.prepare('SELECT created_by FROM bookings WHERE id=?').get(b.id).created_by},'تسجيل دخول دعوة','booking',b.id,'تم استهلاك QR');
 res.redirect(303,`/entry/${encodeURIComponent(token)}`);
});

app.listen(PORT,HOST,()=>console.log(`Wedding Halls ERP running on http://localhost:${PORT} (LAN host: ${HOST})`));
