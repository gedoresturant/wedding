const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('core application files exist', () => {
  for (const file of ['server.js','package.json','public/index.html','public/styles.css','public/app.js','README_AR.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('tenant scoping and booking extras endpoints are present', () => {
  const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
  for (const token of ['company_id','/api/customers','/api/bookings','/api/paragraphs','/api/menu-groups','/api/menu-items','booking_paragraphs','booking_menu_groups']) {
    assert.ok(server.includes(token), `Expected ${token}`);
  }
});

test('frontend has RTL and all expected modules', () => {
  const html = fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  const js = fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  assert.match(html, /dir="rtl"/);
  for (const page of ['dashboard','customers','followups','bookings','halls','paragraphs','menus','finance','reports','users','logs','settings']) {
    assert.ok(js.includes(`'${page}'`) || html.includes(`data-page="${page}"`), `Expected page ${page}`);
  }
  assert.match(js, /paragraph_ids/);
  assert.match(js, /menu_group_ids/);
});

test('frontend and backend JavaScript parse successfully when Node is available', () => {
  const { spawnSync } = require('node:child_process');
  for (const file of ['server.js','public/app.js']) {
    const result = spawnSync(process.execPath, ['--check', path.join(root,file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('invitation QR flow has expiry, scan validation, and one-time consumption', () => {
  const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
  const js = fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  for (const token of ["invitation_token", "invitation_expires_at", "invitation_used_at", "/api/bookings/:id/invitation", "/entry/:token", "/entry/:token/use", "Africa/Cairo", "QRCode.toDataURL"]) {
    assert.ok(server.includes(token), `Expected invitation flow marker ${token}`);
  }
  assert.match(server, /invitation_used_at IS NULL/);
  assert.match(js, /showInvitationCard/);
  assert.match(js, /تأكيد الحالة|تغيير حالة الحجز/);
});


test('custom permission system preserves booking and thermal receipt workflows', () => {
  const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
  const js = fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  for (const token of ["'reception'", "'accountant'", "allowRoles('admin','manager','reception')", "allowRoles('admin','manager','accountant')", "/api/payments/:id/receipt", "booking_employee_name", "cashier_name", "invitation_used_at"]) {
    assert.ok(server.includes(token), `Expected backend marker ${token}`);
  }
  for (const token of ["اكتب أي مسمى", "صلاحيات المستخدم — اختار الأقسام", "إنستا باي", "محفظة إلكترونية", "printPaymentReceipt", "@page{size:80mm auto", "موظف الحجز", "موظف التحصيل"]) {
    assert.ok(js.includes(token), `Expected frontend marker ${token}`);
  }
});


test('itemized paragraph/show prices in booking and receipts', () => {
  const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
  const js = fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  for (const token of ['paragraph_total','menu_total','base_contract_total','booking_paragraphs WHERE booking_id=?','booking_menu_groups WHERE booking_id=?']) {
    assert.ok(server.includes(token), `Expected receipt breakdown marker ${token}`);
  }
  for (const token of ['إجمالي الإضافات','أسماء الشو','إجمالي مجموعات المنيو','العقد الأساسي قبل الإضافات والمنيو','فاتورة تفصيلية للحجز','تفاصيل الأسعار']) {
    assert.ok(js.includes(token), `Expected invoice detail marker ${token}`);
  }
});


test('discount approval workflow, contractors, costs, cashbox and calendar are implemented', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['discount_requests','function discountPermission','/api/discount-requests/:id/review','contractors','booking_contractors','contractor_payments','/api/costs','/api/cashbox','/api/calendar']) assert.ok(server.includes(token),`Missing backend feature: ${token}`);
 for(const token of ['تقويم الحجوزات','طلبات الخصم','المتعهدون','التكاليف','الخزنة','renderCalendar','reviewDiscount','contractorStatement','newCost','newCashTransaction','toggleMiniCalendar']) assert.ok(js.includes(token),`Missing UI feature: ${token}`);
});


test('discount rules apply only to package and hold booking pending admin approval', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.ok(server.includes('function discountPermission'));
 assert.ok(server.includes("if (role === 'manager') return {type:'percent',value:30}"));
 assert.ok(server.includes("if (role === 'reception') return {type:'percent',value:20}"));
 assert.ok(server.includes('needsDiscountApproval'));
 assert.ok(server.includes("status='pending'"));
 assert.ok(server.includes("if (!needsDiscountApproval && (d.status||'مبدئي') === 'مؤكد')"));
});


test('package catalog drives booking base price and keeps extras separate', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['CREATE TABLE IF NOT EXISTS packages','/api/packages','selectedPackage?Number(selectedPackage.price)','package_name_snapshot','requestedDiscount>discountCap']) assert.ok(server.includes(token),`Missing package/discount marker ${token}`);
 for(const token of ['شرائح أسعار القاعات','الباكدج (اختياري)','الباكدجات والأسعار','const packageSelect']) assert.ok(js.includes(token),`Missing package UI marker ${token}`);
});


test('per-person meal groups multiply unit price by guest count and snapshot itemized receipt details', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ["price_mode TEXT NOT NULL DEFAULT 'per_person'","g.price_mode==='fixed'?Number(g.price||0):Number(g.price||0)*guestCount","unit_price_snapshot","guest_count_snapshot","price_mode_snapshot","b.guest_count"]) assert.ok(server.includes(token),`Missing meal calculation/snapshot marker ${token}`);
 for(const token of ['سعر للفرد — يُضرب في عدد الأفراد','data-price-mode','سعر الفرد','guest_count_snapshot','إجمالي الوجبات والمنيو','الوجبات ومجموعات المنيو','p.menu_groups']) assert.ok(js.includes(token),`Missing itemized meal UI/receipt marker ${token}`);
});


test('one hall supports multiple guest-count price tiers selected automatically in booking', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes("guestCount>Number(selectedPackage.guest_count)"));
 assert.ok(server.includes("Math.max(0,guestCount-includedGuests)*extraGuestPrice"));
 assert.ok(js.includes('const applyHallTier=()=>'));
 assert.ok(js.includes('Number(p.hall_id)===hallId'));
 assert.ok(js.includes('Number(p.guest_count)>=guests'));
 assert.ok(js.includes('اختار القاعة واكتب عدد الأفراد'));
 assert.ok(js.includes('السعر التلقائي'));
 assert.ok(js.includes('شرائح أسعار القاعات'));
});


test('discount request is automatic and notifies admins and requester on decision', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['CREATE TABLE IF NOT EXISTS notifications','function notifyAdmins','notifyAdmins(req.user.company_id','notifyUser(req.user.company_id,r.requested_by','/api/notifications/read-all','requested_mode','يتطلب قرار المدير العام']) assert.ok(server.includes(token),`Missing notification/approval marker ${token}`);
 for(const token of ['يجب الحصول على موافقة المدير العام','openNotifications','refreshNotifications','notificationBadge','تحديد الكل كمقروء']) assert.ok(js.includes(token),`Missing notification UI marker ${token}`);
});
test('contractor account export and printable receipts plus financial CSV reports exist', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['/api/contractors/:id/payments/:paymentId/receipt','/api/contractors/:id/statement.csv','/api/reports/contractors.csv','/api/reports/costs.csv','/api/reports/financial.csv']) assert.ok(server.includes(token),`Missing export/receipt route ${token}`);
 for(const token of ['printContractorReceipt','تصدير كشف الحساب Excel','تصدير التقرير المالي Excel','تصدير التكاليف Excel']) assert.ok(js.includes(token),`Missing export/receipt UI ${token}`);
});


test('user-specific discount limits support percentage or fixed amount and are configurable by admin', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['discount_limit_type','discount_limit_value','function discountPermission','function requestedDiscountAmount',"app.put('/api/admin/users/:id'"]) assert.ok(server.includes(token),`Missing per-user discount limit marker ${token}`);
 assert.ok(server.includes("app.put('/api/admin/users/:id'"));
 assert.ok(server.includes("requested_mode"));
 assert.ok(js.includes('تعديل المستخدم والصلاحيات'));
 assert.ok(js.includes('نسبة مئوية من سعر الباكدج (%)'));
 assert.ok(js.includes('مبلغ ثابت بالجنيه'));
 assert.ok(js.includes('يجب الحصول على موافقة المدير العام'));
});
test('discount approval request is automatic over limit and rejection retains the user permitted discount', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes('const needsDiscountApproval=requestedDiscount>discountCap+0.001'));
 assert.ok(server.includes('const finalDiscount=decision===\'approved\'?Number(r.requested_discount):Math.min(Number(r.allowed_discount||0),Number(b.base_contract_total||b.contract_total))'));
 assert.ok(server.includes('تم رفض طلب الخصم'));
 assert.ok(js.includes('سيتم إرسال طلب تلقائيًا بكل تفاصيل الحجز'));
 assert.ok(js.includes('فتح الحجوزات لاستكمال التأكيد'));
});


test('admin can download and restore a validated backup with automatic pre-restore safety copy', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ["app.get('/api/admin/backup'","app.post('/api/admin/restore'","express.raw({type:'application/octet-stream',limit:'100mb'})",'integrity_check','auto-before-restore-','PENDING_RESTORE_PATH','pending-restore.sqlite','process.exit(0)','START_WINDOWS.bat']) assert.ok(server.includes(token),`Missing backup/restore safety marker ${token}`);
 for(const token of ['restoreForm','restoreFile','استعادة النسخة الاحتياطية','تنزيل نسخة احتياطية الآن','سيتم استبدال البيانات الحالية']) assert.ok(js.includes(token),`Missing backup/restore UI marker ${token}`);
});


test('users can have a free-form job title and individually selected module permissions', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['job_title','permissions_json','current.permissions','moduleRules','req.user.permissions?.includes(map[1])']) assert.ok(server.includes(token),`Missing custom role/permission marker ${token}`);
 for(const token of ['اكتب أي مسمى','مدير استقبال، محاسب تكاليف، مدير حسابات','صلاحيات المستخدم — اختار الأقسام','readPermissionsFromForm','hasPermission(key)']) assert.ok(js.includes(token),`Missing custom permissions UI marker ${token}`);
 assert.ok(js.includes("field('المسمى الوظيفي — اكتب أي مسمى','job_title'"));
 assert.ok(!js.includes("field('الدور','role','select'"));
});


test('booking form looks up customers by normalized phone and creates a new customer when no match exists', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const token of ['lookup_phone','customerLookupResult','normalizePhone','تم العثور على العميل المسجل','الرقم غير مسجل لدينا','new_customer_name','api(\'/customers\',{method:\'POST\',body:{name,phone']) {
  assert.ok(js.includes(token),`Missing customer phone lookup marker ${token}`);
 }
 assert.ok(js.includes('c.groom_name'));
 assert.ok(js.includes('c.bride_name'));
 assert.ok(js.includes('تاريخ المناسبة السابق'));
});


test('new booking modal defines its fields, includes phone lookup, and reports load failures visibly', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const start=js.indexOf('async function newBooking');
 const end=js.indexOf('async function editBooking',start);
 const section=js.slice(start,end>start?end:start+14000);
 assert.ok(section.includes('const fields=customerLookup+'), 'Booking form must include the phone lookup field');
 assert.ok(section.includes('id="customerLookupResult"'), 'Phone lookup result should be rendered');
 assert.ok(js.includes('window.openNewBooking'), 'Guarded click handler should be available');
 assert.ok(section.includes('تعذر فتح نموذج الحجز'), 'API errors should be shown rather than silently swallowed');
 assert.ok(!section.includes("if(!customers.length){toast('سجّل العميل أولًا قبل إنشاء الحجز'"), 'Booking must allow inline creation when there are no existing customers');
});


test('hall form only asks for name and status, and phone input does not steal focus while typing', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const start=js.indexOf('function newHall()'), end=js.indexOf('async function renderFollowups',start);
 const hall=js.slice(start,end);
 assert.ok(hall.includes("field('اسم القاعة'")); assert.ok(hall.includes("field('الحالة'")); 
 assert.ok(!hall.includes("field('السعة")); assert.ok(!hall.includes("field('سعر النهاري'"));
 const phoneStart=js.indexOf("phoneLookup?.addEventListener('input'");
 const phoneEnd=js.indexOf('customerSelectEl?.addEventListener',phoneStart);
 const phone=js.slice(phoneStart,phoneEnd);
 assert.ok(!phone.includes('.focus('),'Typing the phone number must not move focus');
 assert.ok(js.includes('inputmode="${escapeHtml(opts.inputmode)}"'));
 assert.ok(server.includes("const active=req.body.active===false||req.body.active===0||req.body.active==='0'?0:1"));
});


test('hall list displays only hall name and active/out-of-service status', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const start=js.indexOf('async function renderHalls()'), end=js.indexOf('function newHall()',start);
 const section=js.slice(start,end);
 assert.ok(section.includes("table(['اسم القاعة','الحالة'],rows)"));
 assert.ok(section.includes('خارج الخدمة'));
 for(const unwanted of ['h.venue','h.capacity','h.day_price','h.evening_price','سعر النهاري','سعر المسائي']) assert.ok(!section.includes(unwanted),`Hall list should not display ${unwanted}`);
});


test('booking package selection shows the requested package composition and hall options show only hall names', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const start=js.indexOf('async function newBooking'), end=js.indexOf('window.openNewBooking',start);
 const section=js.slice(start,end);
 for(const item of ['إيجار القاعة (مكيفة أو Open Area)','دانس فلور','كوشة للعروسين','ليزر موفنج بيم','DJ','تصوير فيديو HD','ترابيزات استيل وكراسي استيل جولد','سنتر بيس','ديكور مدخل','زينة مدخل','شاشات عرض','تصوير فيديو جميع القاعات بكاميرا مونو HD']) assert.ok(section.includes(item),`Missing package component ${item}`);
 assert.ok(section.includes('id="packageCompositionPreview"'));
 assert.ok(section.includes('renderPackageComposition(tier)'));
 assert.ok(section.includes('label:h.name}'), 'Hall dropdown should show hall name only');
 assert.ok(!section.includes("label:h.name+' · '+h.venue+' (سعة '+h.capacity+')"), 'Hall dropdown must not show venue/capacity');
});


test('customer next_followup date is copied into the followups queue on create and update', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const post=server.slice(server.indexOf("app.post('/api/customers'"),server.indexOf("app.put('/api/customers'"));
 const put=server.slice(server.indexOf("app.put('/api/customers/:id'"),server.indexOf("app.get('/api/followups'",server.indexOf("app.put('/api/customers/:id'")));
 assert.ok(post.includes('if(d.next_followup)'));
 assert.ok(put.includes('if(d.next_followup)'));
 assert.ok(post.includes("INSERT INTO followups(company_id,customer_id,due_at,note,assigned_to,created_by)"));
 assert.ok(put.includes("INSERT INTO followups(company_id,customer_id,due_at,note,assigned_to,created_by)"));
});

test('booking requires hall first and filters packages to the selected hall', () => {
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const start=js.indexOf('async function newBooking'), end=js.indexOf('window.openNewBooking',start);
 const section=js.slice(start,end);
 assert.ok(section.indexOf("field('القاعة'") < section.indexOf("field('الباكدج (اختياري)'"), 'Hall field must come before package field');
 assert.ok(section.includes('updatePackagesForHall'));
 assert.ok(section.includes('Number(p.hall_id)===hallId'));
 assert.ok(section.includes('اختار القاعة أولًا'));
 assert.ok(section.includes('renderPackageComposition(p)'));
});


test('exceptional discount requests require and store the employee reason', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes("ALTER TABLE discount_requests ADD COLUMN request_reason TEXT NOT NULL DEFAULT ''"));
 assert.ok(server.includes('if(needsDiscountApproval&&!requestReason)return {error:'));
 assert.ok(server.includes('requested_mode,requested_value,allowed_discount,request_reason)'));
 assert.ok(server.includes('| سبب الطلب: ${requestReason}'));
 assert.ok(app.includes("field('سبب طلب الخصم للمدير العام','discount_request_reason'"));
 assert.ok(app.includes("sendDiscountRequestButton.textContent='إرسال طلب للمدير العام'"));
 assert.ok(app.includes('sendDiscountRequestButton.style.display=exceeds?\'inline-flex\':\'none\''));
});

test('discount report includes applied amount, requesting employee, admin reviewer, and reasons', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes("app.get('/api/reports/discounts.csv'"));
 for(const col of ['approval_status','requested_discount','request_reason','discount_user','admin_reviewer','admin_decision_reason']) assert.ok(server.includes(col));
 assert.ok(app.includes('href="/api/reports/discounts.csv"'));
 assert.ok(app.includes('سبب الطلب: ${escapeHtml(r.request_reason||\'—\')}'));
});

test('employees are notified promptly when discount decisions arrive', () => {
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(app.includes('setInterval(()=>{if(state.user)refreshNotifications()},5000)'));
 assert.ok(app.includes('toast(`${n.title}: ${n.message}`'));
});


test('legacy packages remain visible for matching active halls and unassigned packages', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes('Legacy package relink migration'));
 assert.ok(server.includes('active_hall.name=old_hall.name AND active_hall.active=1'));
 assert.ok(app.includes('(!p.hall_id||Number(p.hall_id)===hallId)'));
 assert.ok(app.includes('(p.hall_id&&Number(p.hall_id)!==Number(hallSelect.value))'));
 assert.ok(app.includes('ده قسم اختياري مستقل عن الباكدجات'));
});




test('additions catalog exposes only name, price, and status while reusing booking price snapshots', () => {
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.ok(app.includes("pageHead('الإضافات'"));
 assert.ok(app.includes("field('اسم الإضافة','name'"));
 assert.ok(app.includes("field('السعر','price'"));
 assert.ok(!app.includes("field('المدة بالدقائق','duration_minutes'"));
 assert.ok(server.includes('INSERT INTO booking_paragraphs'));
});

test('instructions and contracts are saved per company and can be edited, deleted, and printed', () => {
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.ok(server.includes('CREATE TABLE IF NOT EXISTS saved_documents'));
 assert.ok(server.includes("app.get('/api/documents/:type'"));
 assert.ok(server.includes("app.post('/api/documents/:type'"));
 assert.ok(server.includes("app.put('/api/documents/:type/:id'"));
 assert.ok(server.includes("app.delete('/api/documents/:type/:id'"));
 assert.ok(app.includes('function renderInstructions()'));
 assert.ok(app.includes('function renderContracts()'));
 assert.ok(app.includes('function printSavedDocument(type,id)'));
 assert.ok(app.includes("['instructions','التعليمات'],['contracts','كتابة العقود']"));
});


test('instructions and contracts have separate permission gates', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes("'instructions','contracts','finance'"));
 assert.ok(server.includes("[/^\\/api\\/documents\\/instruction(\\/|$)/,'instructions']"));
 assert.ok(server.includes("[/^\\/api\\/documents\\/contract(\\/|$)/,'contracts']"));
 assert.ok(app.includes("['instructions','التعليمات'],['contracts','كتابة العقود']"));
});


test('day and night periods are stored separately for packages, additions, and menu groups', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 for(const table of ['packages','paragraphs','menu_groups']) assert.ok(server.includes(`ensureColumn('${table}','event_period'`));
 assert.ok(server.includes("d.event_period==='نهاري'?'نهاري':'مسائي'"));
 assert.ok(app.includes("field('نوع الفرح','event_period','select','نهاري'"));
 assert.ok(app.includes('refreshPeriodOptions'));
 assert.ok(app.includes("p.event_period||'مسائي')===period"));
});


test('packages support included guest counts, per-extra pricing and item snapshots', () => {
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
 assert.ok(server.includes("ensureColumn('packages','included_guest_count'"));
 assert.ok(server.includes("ensureColumn('packages','extra_guest_price'"));
 assert.ok(server.includes('included_guest_count_snapshot'));
 assert.ok(server.includes('extraGuestTotal+extrasTotal'));
 assert.ok(js.includes('عدد الأفراد المشمولين في السعر'));
 assert.ok(js.includes('سعر الفرد الإضافي'));
});
