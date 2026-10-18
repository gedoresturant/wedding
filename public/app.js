const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = {user:null,company:null,page:'dashboard',halls:[],customers:[],bookings:[],modalBusy:false};
let lastNotificationId=0,notificationsInitialized=false;
const money = n => new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(Number(n)||0);
const dateFmt = d => d ? new Date(d+'T12:00:00').toLocaleDateString('ar-EG',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const statusLabel = s => ({new:'استفسار جديد',interested:'مهتم',visit:'زيارة مباشرة',initial:'حجز مبدئي',booked:'تم الحجز',lost:'لم يتم الحجز',مبدئي:'مبدئي',مؤكد:'مؤكد',ملغي:'ملغي',مرفوض:'مرفوض','تمت المناسبة':'تمت المناسبة'})[s]||s||'—';
const API_BASE='https://ugvtuxuimjcshqckgepi.supabase.co/functions/v1/erp-api';
async function api(url, options={}) {
 const token=sessionStorage.getItem('wedding_erp_token')||'';
 const opts={...options,headers:{'Content-Type':'application/json','Authorization':token?'Bearer '+token:'','apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVndnR1eHVpbWpjc2hxY2tnZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzM3NjEsImV4cCI6MjEwNzkwOTc2MX0.jodjW2DfDqGpGLHWyxA5x5VhCCIHTBat1x81oEqP5q4',...(options.headers||{})}};
 if(opts.body && typeof opts.body!=='string')opts.body=JSON.stringify(opts.body);
 const res=await fetch(API_BASE+url,opts);
 if(res.status===204)return null;
 const type=res.headers.get('content-type')||'';
 if(!type.includes('application/json')){if(!res.ok)throw new Error('فشل الاتصال بالخادم');return res}
 const data=await res.json();if(!res.ok)throw new Error(data.error||data.message||'حدث خطأ');
 if(url.startsWith('/auth/login')&&data.token)sessionStorage.setItem('wedding_erp_token',data.token);
 return data;
}
async function downloadReport(type,id=null){
 try{
  let rows=[];
  if(type==='bookings')rows=await api('/bookings');
  else if(type==='costs')rows=await api('/costs');
  else if(type==='financial')rows=(await api('/cashbox')).transactions;
  else if(type==='contractors')rows=await api('/contractors');
  else if(type==='discounts')rows=await api('/discount-requests');
  else if(type==='contractor-statement'){const d=await api('/contractors/'+id+'/statement');rows=[...d.services.map(x=>({...x,record_type:'خدمة'})),...d.payments.map(x=>({...x,record_type:'صرف'}))]}
  else throw new Error('نوع التصدير غير معروف');
  const keys=[...new Set(rows.flatMap(x=>Object.keys(x)))];
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv='\uFEFF'+[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='wedding-'+type+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }catch(e){toast(e.message||'تعذر التصدير',true)}
}
function toast(msg,bad=false){const n=document.createElement('div');n.className='toast'+(bad?' bad':'');n.textContent=msg;$('#toastRoot').append(n);setTimeout(()=>n.remove(),3500)}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pageHead(title,sub,buttons=''){return `<div class="page-head"><div><p class="eyebrow">إدارة القاعات والحجوزات</p><h1>${title}</h1><p>${sub}</p></div><div class="actions">${buttons}</div></div>`}
function metric(label,value,sub,color=''){return `<div class="metric" ${color?`style="border-top-color:${color}"`:''}><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub||''}</div></div>`}
function panel(title,body,extra=''){return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`}
function table(headers,rows,empty='لا توجد بيانات لعرضها'){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`}
function badge(s){return `<span class="status ${escapeHtml(s)}">${escapeHtml(statusLabel(s))}</span>`}
function modal(title,body){$('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="close-btn" id="closeModal">✕</button></div>${body}</div></div>`;$('#closeModal').onclick=closeModal;$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()})}
function closeModal(){$('#modalRoot').innerHTML=''}
function field(label,name,type='text',value='',opts={}){const required=opts.required?'required':'';if(type==='select')return `<div class="field ${opts.full?'full-width':''}"><label>${label}</label><select name="${name}" ${required}>${(opts.options||[]).map(o=>`<option value="${escapeHtml(o.value)}" ${String(o.value)===String(value)?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;if(type==='textarea')return `<div class="field ${opts.full?'full-width':''}"><label>${label}</label><textarea name="${name}" ${required}>${escapeHtml(value)}</textarea></div>`;return `<div class="field ${opts.full?'full-width':''}"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required} ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.step?`step="${opts.step}"`:''} ${opts.autocomplete?`autocomplete="${escapeHtml(opts.autocomplete)}"`:''} ${opts.inputmode?`inputmode="${escapeHtml(opts.inputmode)}"`:''} placeholder="${escapeHtml(opts.placeholder||'')}"></div>`}
function formModal(title,fields,submitText,onSubmit){modal(title,`<form id="dataForm"><div class="field-grid">${fields}</div><div class="form-actions"><button class="btn primary" type="submit">${submitText}</button><button class="btn" type="button" id="cancelForm">إلغاء</button></div></form>`);$('#cancelForm').onclick=closeModal;$('#dataForm').onsubmit=async e=>{e.preventDefault();if(state.modalBusy)return;state.modalBusy=true;const btn=$('button[type=submit]',e.target);btn.disabled=true;try{const data=Object.fromEntries(new FormData(e.target).entries());await onSubmit(data);closeModal();await renderPage();}catch(err){toast(err.message,true)}finally{state.modalBusy=false;if(btn.isConnected)btn.disabled=false}}}
async function init(){try{const d=await api('/auth/me');state.user=d.user;state.company=d.company;showApp();await renderPage()}catch{$('#loginScreen').classList.remove('hidden');$('#app').classList.add('hidden')}}
function showApp(){
 $('#loginScreen').classList.add('hidden');$('#app').classList.remove('hidden');$('#companyName').textContent=state.company.name;
 $('#brandLogo').textContent=state.company.logo_url?'':'✦';
 if(state.company.logo_url)$('#brandLogo').innerHTML=`<img src="${escapeHtml(state.company.logo_url)}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
 $('#userBadge').textContent=`${state.user.name} · ${state.user.job_title||state.user.role}`;
 const permissions=Array.isArray(state.user.permissions)?state.user.permissions:[];
 const allowed=state.user.role==='admin'?USER_PERMISSION_OPTIONS.map(x=>x[0]):(permissions.includes('cashierView')?['bookings']:permissions);
 $$('[data-page]').forEach(el=>el.classList.toggle('hidden',!allowed.includes(el.dataset.page)));
 $$('.admin-only').forEach(el=>el.classList.toggle('hidden',!hasPermission('users')&&!hasPermission('settings')));
 $$('.superadmin-only').forEach(el=>el.classList.toggle('hidden',!hasPermission('users')));
 if(!allowed.includes(state.page))state.page=allowed.includes('dashboard')?'dashboard':(allowed[0]||'dashboard');
 if(hasPermission('discountRequests'))refreshDiscountBadge();
 refreshNotifications();
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginError').textContent='';const data=Object.fromEntries(new FormData(e.target).entries());try{const d=await api('/auth/login',{method:'POST',body:data});state.user=d.user;state.company=d.company;showApp();await renderPage()}catch(err){$('#loginError').textContent=err.message}};
$('#logoutBtn').onclick=async()=>{try{await api('/auth/logout',{method:'POST'})}finally{sessionStorage.removeItem('wedding_erp_token')}state.user=null;$('#app').classList.add('hidden');$('#loginScreen').classList.remove('hidden')};
$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){go(b.dataset.page);$('#sidebar').classList.remove('open')}});
$('#quickAdd').onclick=()=>quickAdd();

async function go(page){state.page=page;$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$$('.mobile-nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));await renderPage()}
async function renderPage(){const main=$('#mainContent');main.innerHTML='<div class="loading">جاري التحميل...</div>';try{const renderers={dashboard:renderDashboard,customers:renderCustomers,followups:renderFollowups,bookings:renderBookings,calendar:renderCalendar,halls:renderHalls,packages:renderPackages,paragraphs:renderParagraphs,menus:renderMenus,instructions:renderInstructions,contracts:renderContracts,finance:renderFinance,contractors:renderContractors,costs:renderCosts,cashbox:renderCashbox,discountRequests:renderDiscountRequests,reports:renderReports,users:renderUsers,logs:renderLogs,settings:renderSettings};await (renderers[state.page]||renderDashboard)()}catch(e){main.innerHTML=`<section class="panel"><h2>تعذر تحميل الصفحة</h2><p class="error">${escapeHtml(e.message)}</p><button class="btn primary" onclick="renderPage()">إعادة المحاولة</button></section>`}}
async function renderDashboard(){
 const d=await api('/dashboard');$('#followBadge').textContent=d.metrics.late;
 $('#mainContent').innerHTML=pageHead('لوحة التحكم','ملخص سريع لما يحتاج متابعة اليوم',`<button class="btn" onclick="quickAdd()">＋ إضافة جديدة</button><button class="btn gold" onclick="go('reports')">تقارير الإدارة</button>`)+
 `<section class="panel" style="background:linear-gradient(120deg,#071426,#142b49);color:white"><p style="color:#e4b42d;font-weight:800">ابدأ من هنا</p><h2 style="font-size:23px;margin:5px 0 10px">خلّي كل حجز واضح وحسابه مضبوط</h2><p style="color:#c0ccdc;margin:0 0 18px">كل رقم تقدر تفتحه وتراجع تفاصيله مباشرة.</p><div class="quick-links"><button class="btn" onclick="newCustomer()">＋ استفسار جديد</button><button class="btn outline" style="color:white;border-color:#c4d0df" onclick="newFollowup()">＋ متابعة جديدة</button><button class="btn gold" onclick="openNewBooking()">＋ حجز جديد</button></div></section>
 <div class="grid metrics">${metric('حجوزات الشهر',d.metrics.bookings,'الحجوزات المسجلة')}${metric('متابعات متأخرة',d.metrics.late,'تحتاج تدخلًا سريعًا','#e8485e')}${metric('تحصيل الشهر',money(d.metrics.collections),'إجمالي المدفوعات','#15945c')}${metric('العملاء المحتملون',d.metrics.leads,'فرص البيع الحالية','#dcae25')}</div>
 <div class="grid two-col">${panel('أقرب الحجوزات',table(['العميل','المكان / القاعة','التاريخ','الحالة'],d.upcoming.map(b=>`<tr><td><strong>${escapeHtml(b.customer_name)}</strong><br><small>${escapeHtml(b.phone)}</small></td><td>${escapeHtml(b.venue||'')} · ${escapeHtml(b.hall_name)}</td><td>${dateFmt(b.event_date)} · ${escapeHtml(b.event_period)}</td><td>${badge(b.status)}</td></tr>`).join('')) ,`<button class="btn" onclick="go('bookings')">عرض الكل</button>`)}
 ${panel('آخر العملاء',table(['العميل','الموبايل','الحالة','إجراء'],d.recentCustomers.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone)}</td><td>${badge(c.status)}</td><td><button class="btn" onclick="editCustomer(${c.id})">فتح</button></td></tr>`).join('')) ,`<button class="btn" onclick="go('customers')">كل العملاء</button>`)}</div>`;
}
async function getHalls(){state.halls=await api('/halls');return state.halls}
async function renderCustomers(){
 const params=new URLSearchParams();const q=$('#customerSearch')?.value||'';const status=$('#customerStatus')?.value||'all';if(q)params.set('q',q);if(status!=='all')params.set('status',status);
 const data=await api('/customers?'+params);state.customers=data;
 const rows=data.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.groom_name||'')}${c.bride_name?' / '+escapeHtml(c.bride_name):''}</small></td><td><a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></td><td>${escapeHtml(c.hall_name||c.venue||'غير محدد')}</td><td>${c.event_date?dateFmt(c.event_date):'—'}</td><td>${badge(c.status)}</td><td><button class="btn" onclick="editCustomer(${c.id})">فتح</button></td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('العملاء والاستفسارات','كل عميل أمامه إجراء واضح وموعد متابعة منتظم',`<button class="btn green" onclick="newCustomer('visit')">＋ زيارة مباشرة</button><button class="btn primary" onclick="newCustomer()">＋ استفسار جديد</button>`)+
 `<section class="panel"><div class="toolbar"><input id="customerSearch" placeholder="ابحث بالاسم أو رقم الموبايل" value="${escapeHtml(q)}"><select id="customerStatus">${[['all','كل الحالات'],['new','استفسار جديد'],['interested','مهتم'],['visit','زيارة مباشرة'],['initial','حجز مبدئي'],['booked','تم الحجز'],['lost','لم يتم الحجز']].map(([v,l])=>`<option value="${v}" ${status===v?'selected':''}>${l}</option>`).join('')}</select><button class="btn primary" id="customerSearchBtn">بحث</button><button class="btn" onclick="$('#customerSearch').value='';$('#customerStatus').value='all';renderCustomers()">مسح الفلاتر</button></div><div class="muted" style="margin-bottom:12px">عدد العملاء: ${data.length}</div>${table(['العميل / أصحاب المناسبة','الموبايل','المكان / القاعة','التاريخ','الحالة','إجراء'],rows)}</section>`;
 $('#customerSearchBtn').onclick=renderCustomers;$('#customerSearch').onkeydown=e=>{if(e.key==='Enter')renderCustomers()};$('#customerStatus').onchange=renderCustomers;
}
window.openNewBooking=async function(customerId=null){try{return await newBooking(customerId)}catch(err){console.error('Open booking failed:',err);toast('حدث خطأ أثناء فتح الحجز: '+(err?.message||'خطأ غير متوقع'),true)}};
async function newCustomer(initialStatus='new'){
 const halls=await getHalls();
 const fields=field('اسم العميل','name','text','',{required:true})+field('الموبايل','phone','tel','',{required:true,placeholder:'01xxxxxxxxx'})+
 `<div class="field full-width"><label>أسماء أصحاب المناسبة (اختياري)</label><div class="field-grid">${field('اسم العريس','groom_name')}${field('اسم العروسة','bride_name')}</div></div>`+
 field('المكان','venue')+field('القاعة المطلوبة','hall_id','select','',{options:[{value:'',label:'غير محددة'},...halls.map(h=>({value:h.id,label:h.name+' · '+h.venue}))]})+
 field('نوع المناسبة','event_type','select','حفل زفاف',{options:['حفل زفاف','خطوبة','كتب كتاب','عيد ميلاد','حفل تخرج','مؤتمر','أخرى'].map(x=>({value:x,label:x}))})+
 field('تاريخ المناسبة','event_date','date')+field('الفترة','event_period','select','',{options:[{value:'',label:'غير محدد'},{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'مسائي'}]})+
 field('مصدر العميل','source','select','',{options:['','زيارة مباشرة','اتصال','Facebook','Instagram','WhatsApp','إحالة','إعلان','أخرى'].map(x=>({value:x,label:x||'اختر المصدر'}))})+
 field('الحالة','status','select',initialStatus,{options:[['new','استفسار جديد'],['interested','مهتم'],['visit','زيارة مباشرة'],['initial','حجز مبدئي'],['booked','تم الحجز'],['lost','لم يتم الحجز']].map(([value,label])=>({value,label}))})+
 field('الميزانية المتوقعة','budget','number','',{min:0,step:'0.01'})+field('موعد المتابعة','next_followup','date')+field('ملاحظات العميل','notes','textarea','',{full:true});
 formModal('تسجيل عميل جديد',fields,'حفظ العميل',async d=>{await api('/customers',{method:'POST',body:d});toast('تم حفظ العميل بنجاح')});
}
async function editCustomer(id){
 const c=await api('/customers');const item=c.find(x=>x.id===id);if(!item)return toast('العميل غير موجود',true);
 const halls=await getHalls();
 const fields=field('اسم العميل','name','text',item.name,{required:true})+field('الموبايل','phone','tel',item.phone,{required:true})+field('اسم العريس','groom_name','text',item.groom_name)+field('اسم العروسة','bride_name','text',item.bride_name)+field('المكان','venue','text',item.venue)+field('القاعة','hall_id','select',item.hall_id||'',{options:[{value:'',label:'غير محددة'},...halls.map(h=>({value:h.id,label:h.name}))]})+field('نوع المناسبة','event_type','text',item.event_type)+field('تاريخ المناسبة','event_date','date',item.event_date)+field('الفترة','event_period','select',item.event_period,{options:[{value:'',label:'غير محدد'},{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'مسائي'}]})+field('المصدر','source','text',item.source)+field('الحالة','status','select',item.status,{options:[['new','استفسار جديد'],['interested','مهتم'],['visit','زيارة مباشرة'],['initial','حجز مبدئي'],['booked','تم الحجز'],['lost','لم يتم الحجز']].map(([value,label])=>({value,label}))})+field('الميزانية','budget','number',item.budget,{min:0})+field('موعد المتابعة','next_followup','date',item.next_followup)+field('ملاحظات','notes','textarea',item.notes,{full:true});
 formModal('تعديل بيانات العميل',fields,'حفظ التعديلات',async d=>{await api('/customers/'+id,{method:'PUT',body:d});toast('تم تحديث العميل')});
}
async function archiveBooking(id){
 if(!hasPermission('bookingDelete')){toast('ليس لديك صلاحية حذف الحجوزات',true);return}
 if(!confirm(`تأكيد أرشفة الحجز رقم ${id}؟\nسيختفي من القائمة، مع الاحتفاظ بالإيصالات والسجلات المالية للمراجعة.`))return;
 const reason=prompt('اكتب سبب حذف/أرشفة الحجز (مطلوب):');
 if(reason===null)return;
 if(!reason.trim()){toast('سبب الأرشفة مطلوب',true);return}
 try{await api('/bookings/'+id+'/archive',{method:'POST',body:{reason:reason.trim()}});toast('تمت أرشفة الحجز مع الاحتفاظ بالسجلات المالية');await renderBookings()}
 catch(e){toast(e.message||'تعذر أرشفة الحجز',true)}
}
async function renderBookings(){
 const q=$('#bookingSearch')?.value||'',status=state.user.role==='accountant'?'مؤكد':($('#bookingStatus')?.value||'all');const data=await api('/bookings?'+new URLSearchParams({q,status}));state.bookings=data;
 const rows=data.map(b=>`<tr><td><strong>${escapeHtml(b.customer_name)}</strong><br><small>${escapeHtml(b.phone)}</small></td><td>${escapeHtml(b.hall_name)}<br><small>${escapeHtml(b.venue||'')}</small></td><td>${dateFmt(b.event_date)} · ${escapeHtml(b.event_period)}</td><td>${b.guest_count||0}</td><td>${money(b.total_due??((b.contract_total-b.discount)*1.15))}</td><td>${money(b.paid_total)}</td><td><strong>${money(b.remaining)}</strong></td><td>${badge(b.status)}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" onclick="openBooking(${b.id})">فتح الحساب</button>${hasPermission('bookingDelete')?`<button class="btn danger" onclick="archiveBooking(${b.id})">حذف الحجز</button>`:''}</div></td></tr>`).join('');
 const headButtons=(state.user.role==='accountant'||hasPermission('cashierView'))?'':`<button class="btn" onclick="go('reports')">تقارير الحجوزات</button><button class="btn primary" onclick="openNewBooking()">＋ حجز جديد</button>`;
 const statusControl=(state.user.role==='accountant'||hasPermission('cashierView'))?'':`<select id="bookingStatus">${[['all','كل الحجوزات'],['مبدئي','حجز مبدئي'],['مؤكد','مؤكد'],['ملغي','ملغي'],['مرفوض','مرفوض'],['تمت المناسبة','تمت المناسبة']].map(([v,l])=>`<option value="${v}" ${status===v?'selected':''}>${l}</option>`).join('')}</select>`;
 const exportControl=hasPermission('reports')&&!hasPermission('cashierView')?`<a class="btn" href="#" onclick="downloadReport('bookings');return false">تصدير Excel / CSV</a>`:'';
 $('#mainContent').innerHTML=pageHead('الحجوزات','المواعيد والتعاقدات والمدفوعات',headButtons)+
 `<section class="panel"><div class="toolbar"><input id="bookingSearch" placeholder="ابحث باسم العميل أو العريس أو العروسة أو الموبايل" value="${escapeHtml(q)}">${statusControl}<button class="btn primary" id="bookingSearchBtn">بحث</button>${exportControl}</div>${table(['العميل','المكان / القاعة','التاريخ والفترة','الأفراد','قيمة العقد','المدفوع','المتبقي','الحالة','الحساب'],rows)}</section>`;
 $('#bookingSearchBtn').onclick=renderBookings;$('#bookingSearch').onkeydown=e=>{if(e.key==='Enter')renderBookings()};if($('#bookingStatus'))$('#bookingStatus').onchange=renderBookings;
}
async function newBooking(customerId=null){
 let customers,halls,packages,paragraphs,menuGroups,contractors;
 try{
  [customers,halls,packages,paragraphs,menuGroups,contractors]=await Promise.all([api('/customers'),getHalls(),api('/packages'),api('/paragraphs'),api('/menu-groups'),api('/contractors')]);
 }catch(err){
  toast('تعذر فتح نموذج الحجز: '+(err?.message||'تعذر تحميل البيانات')+' — راجع صلاحيات المستخدم واتصال الخادم.',true);
  console.error('newBooking initialization failed:',err);
  return;
 }
 // A new booking can also start when no customer exists yet.
 customers=Array.isArray(customers)?customers:[];
 halls=Array.isArray(halls)?halls:[];
 packages=Array.isArray(packages)?packages:[];
 paragraphs=Array.isArray(paragraphs)?paragraphs:[];
 menuGroups=Array.isArray(menuGroups)?menuGroups:[];
 contractors=Array.isArray(contractors)?contractors:[];
 if(!halls.some(h=>h.active)){toast('أضف قاعة فعالة أولًا قبل إنشاء الحجز.',true);return go('halls')}
 const paraOptions=paragraphs.filter(p=>p.active);
 const menuOptions=menuGroups.filter(g=>g.active);
 const paraHtml=paraOptions.length?paraOptions.map(p=>`<label class="optional-choice"><input type="checkbox" name="paragraph_ids" value="${p.id}" data-price="${p.price}"><span><strong>${escapeHtml(p.name)}</strong><small>إضافة اختيارية</small></span><b>${money(p.price)}</b></label>`).join(''):'<p class="muted">لم تتم إضافة عناصر بعد. يمكنك إضافتها من قسم الإضافات.</p>';
 const menuHtml=menuOptions.length?menuOptions.map(g=>`<label class="optional-choice"><input type="checkbox" name="menu_group_ids" value="${g.id}" data-price="${g.price}" data-price-mode="${g.price_mode||'per_person'}"><span><strong>${escapeHtml(g.name)}</strong><small>${(g.items||[]).map(i=>escapeHtml(i.name)).join('، ')||'لا توجد أصناف'} · ${g.price_mode==='fixed'?'سعر ثابت للمجموعة':'سعر للفرد'}</small></span><b>${money(g.price)}${g.price_mode==='fixed'?'':' / فرد'}</b></label>`).join(''):'<p class="muted">لا توجد مجموعات منيو مضافة حاليًا. ده قسم اختياري مستقل عن الباكدجات، ولن يؤثر على ظهور الباكدج أو سعره.</p>';
 const contractorHtml=contractors.length?contractors.map(c=>`<label class="optional-choice"><input type="checkbox" name="booking_contractor_ids" value="${c.id}" data-price="${Number(c.default_price||0)}" data-name="${escapeHtml(c.name)}" data-service="${escapeHtml(c.service_type||c.name)}"><span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.service_type||'خدمة متعهد')}</small></span><b>${money(c.default_price||0)}</b><input class="contractor-booking-price" aria-label="سعر المتعهد" type="number" min="0" step="0.01" value="${Number(c.default_price||0)}" data-contractor-price="${c.id}" style="max-width:130px"></label>`).join(''):'<p class="muted">لا يوجد متعهدون مسجلون. أضف المتعهد أولًا من قسم المتعهدين والحسابات.</p>';
 const selectedCustomer=customers.find(c=>Number(c.id)===Number(customerId));
 const customerSelect=field('العميل المسجل','customer_id','select',customerId||'',{options:[{value:'',label:'ابحث برقم الموبايل أو اختر عميلًا'},...customers.map(c=>({value:c.id,label:c.name+' · '+c.phone}))]});
 const customerLookup=field('رقم موبايل العميل','lookup_phone','tel',selectedCustomer?.phone||'',{required:true,placeholder:'اكتب رقم الموبايل كاملًا',autocomplete:'tel',inputmode:'tel'})+
 `<div class="field full-width"><div id="customerLookupResult" class="notice">${selectedCustomer?`تم العثور على العميل: <strong>${escapeHtml(selectedCustomer.name)}</strong>`:'اكتب رقم الموبايل لعرض بيانات العميل المسجل أو تسجيل عميل جديد.'}</div></div>`+
 `<div id="newCustomerInlineFields" class="field-grid full-width" style="display:none;border:1px dashed var(--border,#cbd5e1);padding:14px;border-radius:12px"><div class="field full-width"><strong>تسجيل عميل جديد</strong><p class="muted">الرقم غير مسجل. أكمل بيانات العميل وسيتم حفظه تلقائيًا مع الحجز.</p></div>`+
 field('اسم العميل','new_customer_name','text','',{required:false})+field('اسم العريس','new_customer_groom','text','')+field('اسم العروسة','new_customer_bride','text','')+`</div>`;
 const fields=customerLookup+
 customerSelect+
 field('نوع الفرح','event_period','select','نهاري',{required:true,options:[{value:'نهاري',label:'فرح نهاري'},{value:'مسائي',label:'فرح ليلي'}]})+
 field('القاعة','hall_id','select','',{required:true,options:[{value:'',label:'اختار القاعة أولًا'},...halls.filter(h=>h.active).map(h=>({value:h.id,label:h.name}))]})+
 field('الباكدج (اختياري)','package_id','select','',{options:[{value:'',label:'اختار القاعة أولًا'}]})+
 `<div class="field full-width"><div id="packageCompositionPreview" class="notice" style="display:none"><strong>مكونات الباكدج</strong><ul style="margin:8px 0 0;padding-right:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px"><li>إيجار القاعة (مكيفة أو Open Area)</li><li>دانس فلور</li><li>كوشة للعروسين</li><li>ليزر موفنج بيم</li><li>DJ</li><li>تصوير فيديو HD</li><li>ترابيزات استيل وكراسي استيل جولد</li><li>سنتر بيس</li><li>ديكور مدخل</li><li>زينة مدخل</li><li>شاشات عرض</li><li>تصوير فيديو جميع القاعات بكاميرا مونو HD</li></ul><div id="packageCustomDescription" style="margin-top:8px"></div></div></div>`+
 field('تاريخ المناسبة','event_date','date','',{required:true})+
 field('عدد الأفراد','guest_count','number','',{min:0})+field('نوع المناسبة','event_type','text','حفل زفاف')+
 field('سعر الحجز الأساسي','contract_total','number','',{required:true,min:0,step:'0.01'})+
 `<div class="field full-width"><div class="notice" id="hallPricePreview">اختار القاعة واكتب عدد الأفراد علشان يظهر سعر القاعة المناسب.</div></div>`+
 field('نوع الخصم','discount_mode','select','percent',{options:[{value:'percent',label:'نسبة مئوية %'},{value:'amount',label:'مبلغ بالجنيه'}]})+
 field('قيمة الخصم','discount_value','number','0',{min:0,step:'0.01'})+
 `<div class="field full-width"><div id="discountApprovalHint" class="notice">حد الخصم المسموح لك يظهر هنا تلقائيًا. أي خصم يتجاوز صلاحيتك يحتاج طلبًا وموافقة المدير العام.</div></div>`+
 `<div id="discountReasonWrap" class="field full-width" style="display:none">${field('سبب طلب الخصم للمدير العام','discount_request_reason','textarea','',{full:true})}</div>`+
 field('الحالة','status','select','مبدئي',{options:[{value:'مبدئي',label:'مبدئي'},{value:'مؤكد',label:'مؤكد'}]})+field('ملاحظات','notes','textarea','',{full:true});
 const optional=`<div class="booking-selectors">
 <details class="optional-section booking-multi-select" id="additionsDropdown"><summary><span><strong>الإضافات</strong> <em class="optional-tag">اختياري</em></span><small id="additionsSelectedCount">لم يتم اختيار إضافات</small><span class="dropdown-chevron">⌄</span></summary><p class="dropdown-help">اختار إضافة أو أكثر؛ سعر كل إضافة يضاف تلقائيًا لإجمالي الحجز.</p><div class="optional-list">${paraHtml}</div></details>
 <details class="optional-section booking-multi-select" id="menuDropdown"><summary><span><strong>مجموعات المنيو</strong> <em class="optional-tag">اختياري</em></span><small id="menuSelectedCount">لم يتم اختيار منيو</small><span class="dropdown-chevron">⌄</span></summary><p class="dropdown-help">اختار مجموعة أو أكثر؛ كل مجموعة بسعرها ومكوناتها.</p><div class="optional-list">${menuHtml}</div></details>
 <details class="optional-section booking-multi-select" id="contractorsDropdown"><summary><span><strong>المتعهدون والخدمات</strong> <em class="optional-tag">اختياري</em></span><small id="contractorsSelectedCount">لم يتم اختيار متعهدين</small><span class="dropdown-chevron">⌄</span></summary><p class="dropdown-help">اختار متعهدًا أو أكثر، ويمكن تعديل سعر الخدمة قبل حفظ الحجز.</p><div class="optional-list">${contractorHtml}</div></details>
 </div><div class="booking-total-preview"><span>إجمالي الإضافات + المنيو + المتعهدين</span><strong id="extrasPreview">${money(0)}</strong><small>يشمل سعر الإضافات والمنيو حسب عدد الأفراد وأسعار المتعهدين المحددين.</small></div>`;
 formModal('إنشاء حجز جديد',fields+`<div class="field-grid" style="margin-top:18px"><div class="field full-width">${optional}</div></div>`,'حفظ الحجز',async d=>{
   d.paragraph_ids=$$('input[name="paragraph_ids"]:checked').map(x=>Number(x.value));
   d.menu_group_ids=$$('input[name="menu_group_ids"]:checked').map(x=>Number(x.value));
   d.contractor_services=$$('input[name="booking_contractor_ids"]:checked').map(x=>({contractor_id:Number(x.value),price:Number($(`[data-contractor-price="${x.value}"]`)?.value||x.dataset.price||0),service_name:x.dataset.service||x.dataset.name||'خدمة متعهد'}));
   if(!d.customer_id){
     const phone=String(d.lookup_phone||'').trim(),name=String(d.new_customer_name||'').trim();
     if(!phone||!name)throw new Error('رقم الموبايل غير مسجل. اكتب اسم العميل لاستكمال تسجيله قبل الحجز.');
     const created=await api('/customers',{method:'POST',body:{name,phone,groom_name:d.new_customer_groom||'',bride_name:d.new_customer_bride||'',event_type:d.event_type||'حفل زفاف',venue:'',hall_id:d.hall_id||null,event_date:d.event_date||'',event_period:d.event_period||'',source:'حجز جديد',status:'initial',notes:d.notes||''}});
     d.customer_id=created.id;
   }
   delete d.lookup_phone;delete d.new_customer_name;delete d.new_customer_groom;delete d.new_customer_bride;
   const inviteWindow=d.status==='مؤكد'?window.open('about:blank','_blank'):null;
   const r=await api('/bookings',{method:'POST',body:d});toast(r.discount_pending?'تم حفظ الحجز مبدئيًا وإرسال طلب الخصم للمدير العام. ستظهر نتيجة القرار في الإشعارات.':'تم إنشاء الحجز رقم '+r.id+' مع الإضافات الاختيارية');
   if(r.discount_pending&&inviteWindow)inviteWindow.close();
   if(d.status==='مؤكد'&&!r.discount_pending) await showInvitationCard(r.id,inviteWindow);
 });
 const bookingSubmitButton=$('#dataForm button[type="submit"]');
 const sendDiscountRequestButton=document.createElement('button');
 sendDiscountRequestButton.type='button';sendDiscountRequestButton.className='btn warning';sendDiscountRequestButton.textContent='إرسال طلب للمدير العام';sendDiscountRequestButton.style.display='none';
 bookingSubmitButton?.parentElement?.insertBefore(sendDiscountRequestButton,bookingSubmitButton);
 sendDiscountRequestButton.addEventListener('click',()=>$('#dataForm')?.requestSubmit());
 const phoneLookup=$('#dataForm [name="lookup_phone"]'),customerSelectEl=$('#dataForm [name="customer_id"]'),lookupResult=$('#customerLookupResult'),newCustomerFields=$('#newCustomerInlineFields');
 const normalizePhone=value=>String(value||'').replace(/\\D/g,'').replace(/^0020/,'0').replace(/^20(?=1[0125])/,'0');
 const showCustomerDetails=c=>{
   if(!lookupResult)return;
   if(c){
     customerSelectEl.value=String(c.id);
     if(newCustomerFields)newCustomerFields.style.display='none';
     lookupResult.className='notice';
     lookupResult.innerHTML=`<strong>تم العثور على العميل المسجل ✓</strong><br>الاسم: ${escapeHtml(c.name)}<br>الموبايل: ${escapeHtml(c.phone)}<br>العريس: ${escapeHtml(c.groom_name||'—')} · العروسة: ${escapeHtml(c.bride_name||'—')}<br>نوع المناسبة: ${escapeHtml(c.event_type||'—')} · تاريخ المناسبة السابق: ${escapeHtml(c.event_date||'—')}<br>القاعة السابقة: ${escapeHtml(c.hall_name||c.venue||'—')}<br>ملاحظات: ${escapeHtml(c.notes||'—')}`;
   }else{
     customerSelectEl.value='';
     if(newCustomerFields)newCustomerFields.style.display='grid';
     lookupResult.className='notice discount-approval-required';
     lookupResult.innerHTML='<strong>الرقم غير مسجل لدينا.</strong><br>أكمل اسم العميل وبياناته في قسم «تسجيل عميل جديد» أدناه، وسيتم إنشاء ملف العميل تلقائيًا مع الحجز.';
   }
 };
 phoneLookup?.addEventListener('input',()=>{
   const phone=normalizePhone(phoneLookup.value);
   if(phone.length<8){
     customerSelectEl.value='';
     if(newCustomerFields)newCustomerFields.style.display='none';
     if(lookupResult){lookupResult.className='notice';lookupResult.textContent='اكتب رقم الموبايل لعرض بيانات العميل المسجل أو تسجيل عميل جديد.'}
     return;
   }
   const match=customers.find(c=>normalizePhone(c.phone)===phone);
   showCustomerDetails(match||null);
 });
 customerSelectEl?.addEventListener('change',()=>{
   const c=customers.find(x=>String(x.id)===customerSelectEl.value);
   if(c){phoneLookup.value=c.phone||'';showCustomerDetails(c)}
 });
 if(selectedCustomer)showCustomerDetails(selectedCustomer);
 const packageSelect=$('#dataForm [name="package_id"]'),hallSelect=$('#dataForm [name="hall_id"]'),basePriceInput=$('#dataForm [name="contract_total"]'),guestInput=$('#dataForm [name="guest_count"]'),pricePreview=$('#hallPricePreview');
 const packageCompositionPreview=$('#packageCompositionPreview'),packageCustomDescription=$('#packageCustomDescription');
 const updatePackagesForHall=(selectedId='')=>{
   if(!packageSelect)return;
   const hallId=Number(hallSelect?.value||0);
   const period=$('#dataForm [name="event_period"]')?.value||'نهاري';
   const hallPackages=packages.filter(p=>p.active&&(p.event_period||'مسائي')===period&&hallId&&(!p.hall_id||Number(p.hall_id)===hallId));
   packageSelect.innerHTML=`<option value="">${hallId?(hallPackages.length?'اختار باكدج القاعة':'لا توجد باكدجات مسجلة لهذه القاعة'):'اختار القاعة أولًا'}</option>`+
     hallPackages.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(money(p.price))}</option>`).join('');
   packageSelect.value=hallPackages.some(p=>String(p.id)===String(selectedId))?String(selectedId):'';
   if(!packageSelect.value)renderPackageComposition(null);
 };
 const renderPackageComposition=(pkg)=>{
   if(!packageCompositionPreview)return;
   if(!pkg){packageCompositionPreview.style.display='none';if(packageCustomDescription)packageCustomDescription.textContent='';return;}
   packageCompositionPreview.style.display='block';
   if(packageCustomDescription){
     const description=String(pkg.description||'').trim();
     const included=Number(pkg.included_guest_count||0)>0?`<div><strong>الأفراد المشمولون:</strong> ${Number(pkg.included_guest_count)} فرد</div><div><strong>الفرد الإضافي:</strong> ${money(pkg.extra_guest_price)} جنيه</div><div><strong>المشروبات/العناصر:</strong> ${escapeHtml(pkg.included_items||'—')}</div>`:'';packageCustomDescription.innerHTML=included+(description?`<div><strong>تفاصيل إضافية للباكدج:</strong> ${escapeHtml(description)}</div>`:'');
   }
 };
 const applyHallTier=()=>{
   const hallId=Number(hallSelect?.value||0),guests=Number(guestInput?.value||0);
   if(!hallId||!guests){if(pricePreview)pricePreview.textContent='اختار القاعة واكتب عدد الأفراد علشان يظهر سعر القاعة المناسب.';return}
   const period=$('#dataForm [name="event_period"]')?.value||'نهاري';
   const tiers=packages.filter(p=>p.active&&(p.event_period||'مسائي')===period&&(!p.hall_id||Number(p.hall_id)===hallId)&&(Number(p.included_guest_count)>0||Number(p.guest_count)>0)&&((Number(p.included_guest_count)>0)||Number(p.guest_count)>=guests)).sort((a,b)=>Number(a.guest_count)-Number(b.guest_count));
   const tier=tiers[0];
   if(!tier){
     if(packageSelect)packageSelect.value='';
     renderPackageComposition(null);
     if(basePriceInput)basePriceInput.value='';
     if(pricePreview)pricePreview.textContent='لا توجد شريحة سعر مسجلة لهذه القاعة تغطي '+guests+' فرد. أضف شريحة أكبر من قسم شرائح أسعار القاعات أو أدخل السعر يدويًا.';
     return;
   }
   if(packageSelect)packageSelect.value=String(tier.id);
   if(basePriceInput)basePriceInput.value=Number(tier.price||0);
   renderPackageComposition(tier);
   const included=Number(tier.included_guest_count||0),extra=Math.max(0,guests-included)*Number(tier.extra_guest_price||0);if(pricePreview)pricePreview.innerHTML=`السعر التلقائي: <strong>${escapeHtml(tier.name)}</strong> — ${included?`أول ${included} فرد مشمولون، والزيادة ${money(tier.extra_guest_price)} للفرد · إجمالي الزيادة ${money(extra)} · `:`حتى ${Number(tier.guest_count)} فرد — `}<strong>${money(Number(tier.price)+extra)}</strong>`;
 };
 const periodSelect=$('#dataForm [name="event_period"]');
 const refreshPeriodOptions=()=>{
  const period=periodSelect?.value||'نهاري';
  const filteredExtras=paraOptions.filter(x=>(x.event_period||'مسائي')===period);
  const filteredMenus=menuOptions.filter(x=>(x.event_period||'مسائي')===period);
  const extrasContainer=$$('.optional-section')[0]?.querySelector('.optional-list');
  const menusContainer=$$('.optional-section')[1]?.querySelector('.optional-list');
  if(extrasContainer)extrasContainer.innerHTML=filteredExtras.length?filteredExtras.map(p=>`<label class="optional-choice"><input type="checkbox" name="paragraph_ids" value="${p.id}" data-price="${p.price}"><span><strong>${escapeHtml(p.name)}</strong><small>إضافة ${period==='نهاري'?'نهارية':'ليلية'}</small></span><b>${money(p.price)}</b></label>`).join(''):'<p class="muted">لا توجد إضافات لهذا النوع من الفرح.</p>';
  if(menusContainer)menusContainer.innerHTML=filteredMenus.length?filteredMenus.map(g=>`<label class="optional-choice"><input type="checkbox" name="menu_group_ids" value="${g.id}" data-price="${g.price}" data-price-mode="${g.price_mode||'per_person'}"><span><strong>${escapeHtml(g.name)}</strong><small>${(g.items||[]).map(i=>escapeHtml(i.name)).join('، ')||'لا توجد أصناف'} · ${g.price_mode==='fixed'?'سعر ثابت للمجموعة':'سعر للفرد'}</small></span><b>${money(g.price)}${g.price_mode==='fixed'?'':' / فرد'}</b></label>`).join(''):'<p class="muted">لا توجد مجموعات منيو لهذا النوع من الفرح.</p>';
  updatePackagesForHall();applyHallTier();updateExtras();
 };
 if(periodSelect)periodSelect.addEventListener('change',refreshPeriodOptions);
 if(hallSelect)hallSelect.addEventListener('change',()=>{updatePackagesForHall();if(basePriceInput)basePriceInput.value='';applyHallTier()});
 if(guestInput)guestInput.addEventListener('input',applyHallTier);
 if(packageSelect)packageSelect.addEventListener('change',()=>{
   const p=packages.find(x=>String(x.id)===packageSelect.value);
   if(!p)renderPackageComposition(null);
   if(p){
     if(!hallSelect?.value||(p.hall_id&&Number(p.hall_id)!==Number(hallSelect.value))){toast('اختار القاعة أولًا وحدد باكدج تابع لنفس القاعة.',true);updatePackagesForHall();return}
     renderPackageComposition(p);
     if(basePriceInput)basePriceInput.value=p.price;
     if(guestInput&&Number(p.guest_count)>0&&!Number(guestInput.value))guestInput.value=p.guest_count;
     if(pricePreview)pricePreview.textContent=`السعر المختار: ${p.name} — ${Number(p.included_guest_count||0)?`أول ${p.included_guest_count} فرد مشمولون؛ الزيادة ${money(p.extra_guest_price)} للفرد — `:(p.guest_count?`حتى ${p.guest_count} فرد — `:'')}${money(Number(p.price)+Math.max(0,Number(guestInput?.value||0)-Number(p.included_guest_count||0))*Number(p.extra_guest_price||0))}`;
   }
 });
 const updateExtras=()=>{const guests=Number($('#dataForm [name="guest_count"]')?.value||0);const selectedAdditions=$$('input[name="paragraph_ids"]:checked'),selectedMenus=$$('input[name="menu_group_ids"]:checked'),selectedContractors=$$('input[name="booking_contractor_ids"]:checked');const paragraphsTotal=selectedAdditions.reduce((s,x)=>s+(Number(x.dataset.price)||0),0);const menuTotal=selectedMenus.reduce((s,x)=>s+(Number(x.dataset.price)||0)*(x.dataset.priceMode==='fixed'?1:guests),0);const contractorTotal=selectedContractors.reduce((s,x)=>s+Number($(`[data-contractor-price="${x.value}"]`)?.value||x.dataset.price||0),0);const node=$('#extrasPreview');if(node)node.textContent=money(paragraphsTotal+menuTotal+contractorTotal);const count=(id,n,one,many)=>{const el=$(id);if(el)el.textContent=n?`${n} ${n===1?one:many}`:'لم يتم الاختيار'};count('#additionsSelectedCount',selectedAdditions.length,'إضافة مختارة','إضافات مختارة');count('#menuSelectedCount',selectedMenus.length,'مجموعة منيو مختارة','مجموعات منيو مختارة');count('#contractorsSelectedCount',selectedContractors.length,'متعهد مختار','متعهدين مختارين')};
 $$('#dataForm input[name="paragraph_ids"], #dataForm input[name="menu_group_ids"]').forEach(x=>x.addEventListener('change',updateExtras));
 $$('input[name="booking_contractor_ids"]').forEach(x=>x.addEventListener('change',updateExtras));$$('.contractor-booking-price').forEach(x=>x.addEventListener('input',updateExtras));
 const guestsField=$('#dataForm [name="guest_count"]');if(guestsField)guestsField.addEventListener('input',updateExtras);
 updateExtras();
 // Apply event-period filtering immediately when the booking form opens, not only after the user changes the selector.
 refreshPeriodOptions();
 const discountField=$('#dataForm [name="discount_value"]'),discountModeField=$('#dataForm [name="discount_mode"]');
 const updateDiscountHint=()=>{
   if(!discountField||!discountModeField)return;
   const base=Number(basePriceInput?.value||0),value=Math.max(0,Number(discountField.value||0)),mode=discountModeField.value;
   const limitType=state.user.discount_limit_type==='amount'?'amount':'percent',limitValue=Math.max(0,Number(state.user.discount_limit_value??(state.user.role==='manager'?30:state.user.role==='reception'?20:100)));
   const allowed=limitType==='amount'?Math.min(base,limitValue):base*Math.min(limitValue,100)/100;
   const requested=mode==='percent'?base*value/100:value,exceeds=requested>allowed+0.001,hint=$('#discountApprovalHint');
   const reasonWrap=$('#discountReasonWrap'),reasonField=$('#dataForm [name="discount_request_reason"]');
   if(reasonWrap)reasonWrap.style.display=exceeds?'block':'none';
   if(reasonField)reasonField.required=exceeds;
   if(sendDiscountRequestButton)sendDiscountRequestButton.style.display=exceeds?'inline-flex':'none';
   if(bookingSubmitButton)bookingSubmitButton.textContent=exceeds?'إرسال الطلب وحفظ الحجز مبدئيًا':'حفظ الحجز';
   if(hint){
     hint.className=exceeds?'notice discount-approval-required':'notice';
     hint.innerHTML=exceeds
       ?`<strong>⚠️ يجب الحصول على موافقة المدير العام</strong><br>الخصم المطلوب: ${mode==='percent'?value+'%':''} (${money(requested)}). صلاحيتك الحالية: ${limitType==='percent'?limitValue+'%':money(limitValue)} (${money(allowed)}). عند حفظ الحجز سيتم إرسال طلب تلقائيًا بكل تفاصيل الحجز، وسيظل الحجز مبدئيًا لحين القرار.`
       :`<strong>حد الخصم المسموح لك:</strong> ${limitType==='percent'?limitValue+'%':money(limitValue)} من سعر الباكدج الأساسي (حد أقصى ${money(allowed)}). الخصم المطلوب حاليًا: ${mode==='percent'?value+'%':''} (${money(requested)}).`;
   }
 };
 if(discountField)discountField.addEventListener('input',updateDiscountHint);if(discountModeField)discountModeField.addEventListener('change',updateDiscountHint);if(basePriceInput)basePriceInput.addEventListener('input',updateDiscountHint);if(packageSelect)packageSelect.addEventListener('change',updateDiscountHint);updateDiscountHint();
}
async function openBooking(id){
 const b=await api('/bookings/'+id);
 const cashierMode=hasPermission('cashierView')&&state.user.role!=='admin';
 if(cashierMode){
  const additions=(b.paragraphs||[]).map(p=>`<tr><td>${escapeHtml(p.name_snapshot)}</td><td>${Number(p.duration_snapshot||0)} دقيقة</td><td>${escapeHtml(p.show_names_snapshot||'—')}</td><td>${money(p.price_snapshot)}</td></tr>`).join('');
  const menus=(b.menu_groups||[]).map(g=>`<tr><td>${escapeHtml(g.name_snapshot)}</td><td>${(g.items||[]).map(i=>escapeHtml(i.name)+' ('+escapeHtml(i.category)+')'+(i.quantity?' × '+escapeHtml(i.quantity):'')).join('، ')||'—'}</td><td>${g.price_mode_snapshot==='per_person'?money(g.unit_price_snapshot)+' × '+(g.guest_count_snapshot||b.guest_count)+' فرد':'سعر ثابت للمجموعة'}</td><td>${money(g.price_snapshot)}</td></tr>`).join('');
  modal('تفاصيل الحجز',`<div class="grid metrics" style="grid-template-columns:repeat(2,minmax(0,1fr))">${metric('الإجمالي النهائي',money(b.total_due),'شامل الخدمة')}${metric('المدفوع',money(b.paid_total),'المبالغ المسجلة')}${metric('المتبقي للتحصيل',money(b.remaining),'بعد خصم الدفعات السابقة','#e8485e')}</div>
  <div class="detail-row"><span>اسم العريس</span><strong>${escapeHtml(b.groom_name||'—')}</strong></div>
  <div class="detail-row"><span>اسم العروسة</span><strong>${escapeHtml(b.bride_name||'—')}</strong></div>
  <div class="detail-row"><span>رقم الموبايل</span><strong>${escapeHtml(b.phone||'—')}</strong></div>
  <div class="detail-row"><span>تاريخ الحجز / الحفل</span><strong>${dateFmt(b.event_date)} · ${escapeHtml(b.event_period||'')}</strong></div>
  <div class="detail-row"><span>اسم القاعة</span><strong>${escapeHtml(b.hall_name||'—')}</strong></div>
  <div class="detail-row"><span>الباكدج</span><strong>${escapeHtml(b.package_name_snapshot||'باكدج / سعر يدوي')}</strong></div>
  <h3>الإضافات المختارة</h3>${table(['الإضافة','المدة','أسماء الشو','السعر'],additions,'لا توجد إضافات')}
  <h3>المنيو والوجبات</h3>${table(['المجموعة','المكونات','طريقة الحساب','الإجمالي'],menus,'لا توجد مجموعات منيو')}
  <div class="section-heading"><h3>المتعهدون والخدمات</h3></div><div id="bookingContractors-${b.id}">جاري تحميل المتعهدين...</div>
  <div class="detail-row"><span>حالة الحجز</span><strong>${escapeHtml(b.status||'—')}</strong></div>
  <div class="detail-row"><span>إجمالي تكلفة الحفل</span><strong>${money(b.total_due)}</strong></div>
  <div class="form-actions" style="justify-content:center"><button class="btn green" style="min-width:240px;font-size:18px;padding:16px 24px" onclick="openCashCollectionMenu(${b.id},${Number(b.remaining||0)},'${b.status==='مؤكد'?'confirmed':'other'}')">تحصيل النقدية</button></div>`);
  renderBookingContractorsInline(b.id);
  return;
 }
 const payments=b.payments.map(p=>`<tr><td>${dateFmt(p.created_at.slice(0,10))}</td><td>${money(p.amount)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.paid_by_name)}</td><td>${hasPermission('finance')?`<button class="btn" onclick="printPaymentReceipt(${p.id})">إعادة طباعة الإيصال</button>`:'—'}</td></tr>`).join('');
 modal('ملف الحجز وبيان الحساب',`<div class="grid metrics" style="grid-template-columns:repeat(2,minmax(0,1fr))">${metric('سعر القاعة / العقد الأساسي',money(Number(b.base_contract_total ?? (b.contract_total-(b.extras_total||0)))),'قبل إضافة الإضافات والمنيو')}${metric('إجمالي الإضافات',money((b.paragraphs||[]).reduce((s,p)=>s+Number(p.price_snapshot||0),0)),'أسعار الإضافات المختارة')}${metric('إجمالي مجموعات المنيو',money((b.menu_groups||[]).reduce((s,g)=>s+Number(g.price_snapshot||0),0)),'أسعار المجموعات المختارة')}${metric('إجمالي العقد قبل الخصم',money(b.contract_total),'القاعة + الإضافات + المنيو')}${metric('الخصم',money(b.discount),'يُخصم من سعر الباكدج')}${metric('خدمة 15%',money(b.service_amount??Math.max(0,b.contract_total-b.discount)*0.15),'بعد الخصم والإضافات والمنيو')}${metric('الإجمالي النهائي',money(b.total_due??Math.max(0,b.contract_total-b.discount)*1.15),'الباكدج بعد الخصم + الإضافات + المنيو + المتعهدين + الخدمة')}${metric('إجمالي المدفوع',money(b.paid_total),'الدفعات المسجلة','#15945c')}${metric('المتبقي',money(b.remaining),'بعد الخدمة والمدفوع','#e8485e')}${metric('عدد الأفراد',b.guest_count||0,'سعة القاعة')}</div>
 <div class="detail-row"><span>العميل</span><strong>${escapeHtml(b.customer_name)} · ${escapeHtml(b.phone)}</strong></div><div class="detail-row"><span>أصحاب المناسبة</span><strong>${escapeHtml(b.groom_name||'—')} / ${escapeHtml(b.bride_name||'—')}</strong></div><div class="detail-row"><span>موظف الحجز</span><strong>${escapeHtml(b.booking_employee_name||'—')}</strong></div><div class="detail-row"><span>المكان والقاعة</span><strong>${escapeHtml(b.venue)} · ${escapeHtml(b.hall_name)}</strong></div><div class="detail-row"><span>الباكدج</span><strong>${escapeHtml(b.package_name_snapshot||'باكدج / سعر يدوي')}</strong></div><div class="detail-row"><span>الموعد</span><strong>${dateFmt(b.event_date)} · ${escapeHtml(b.event_period)}</strong></div>
 <div class="form-actions">${hasPermission('finance')?`<button class="btn green" onclick="openCashCollectionMenu(${b.id},${Number(b.remaining||0)},'${b.status==='مؤكد'?'confirmed':'other'}')">＋ تحصيل النقدية ▾</button>`:''}${hasPermission('bookings')?`<button class="btn" onclick="changeBookingStatus(${b.id})">تغيير الحالة</button>`:''}${b.status==='مؤكد'&&hasPermission('bookings')?`<button class="btn primary" onclick="showInvitationCard(${b.id})">✦ كارت الدعوة QR</button>`:''}<button class="btn" onclick="printBooking(${b.id})">طباعة بيان الحساب</button>${hasPermission('bookings')?`<button class="btn" onclick="banquetPrint(${b.id})">بيان البوفيه / المناسبة</button>`:''}</div>
 <h3>الإضافات المختارة</h3>${table(['اسم الفقرة','المدة','أسماء الشو','السعر'],(b.paragraphs||[]).map(p=>`<tr><td>${escapeHtml(p.name_snapshot)}</td><td>${p.duration_snapshot} دقيقة</td><td>${escapeHtml(p.show_names_snapshot||'—')}</td><td>${money(p.price_snapshot)}</td></tr>`).join(''),'لا توجد فقرات مضافة للحجز')}
 <h3>الوجبات ومجموعات المنيو المختارة</h3>${table(['المجموعة / الوجبة','المكونات','طريقة الحساب','الإجمالي'],(b.menu_groups||[]).map(g=>`<tr><td>${escapeHtml(g.name_snapshot)}</td><td>${(g.items||[]).map(i=>escapeHtml(i.name)+' ('+escapeHtml(i.category)+')'+(i.quantity?' × '+escapeHtml(i.quantity):'')).join('، ')||'—'}</td><td>${g.price_mode_snapshot==='per_person'?money(g.unit_price_snapshot)+' × '+(g.guest_count_snapshot||b.guest_count)+' فرد':'سعر ثابت للمجموعة'}</td><td>${money(g.price_snapshot)}</td></tr>`).join(''),'لا توجد وجبات أو مجموعات منيو مضافة للحجز')}
 <div class="section-heading"><h3>المتعهدون والخدمات</h3>${hasPermission('contractors')?`<button class="btn" onclick="addBookingContractor(${b.id})">＋ إضافة متعهد</button>`:''}</div><div id="bookingContractors-${b.id}">جاري تحميل الخدمات...</div><h3>سجل الدفعات</h3>${table(['التاريخ','المبلغ','الطريقة','الموظف','الإيصال'],payments)}`);
 renderBookingContractorsInline(b.id);
}
async function openCashCollectionMenu(id,remaining,status){
 try{
  const [b,insurances]=await Promise.all([api('/bookings/'+id),api('/bookings/'+id+'/insurance')]);
  const payments=Array.isArray(b.payments)?b.payments:[];
  const advance=payments.find(p=>p.payment_type==='مقدم حجز');
  const finalPayment=payments.find(p=>p.payment_type==='تحصيل باقي المبلغ');
  const insurance=Array.isArray(insurances)&&insurances.length?insurances[0]:null;
  const disabled=status!=='confirmed'?'disabled':'';
  const paymentDetail=p=>`<div class="muted" style="font-size:12px;margin-top:6px">تم التحصيل: ${dateFmt(String(p.created_at||'').slice(0,10))} · ${escapeHtml(String(p.created_at||'').slice(11,16)||'—')} · الإيصال PAY-${String(p.id).padStart(6,'0')} · بواسطة ${escapeHtml(p.paid_by_name||'—')} · ${money(p.amount)}</div><button class="btn" onclick="printPaymentReceipt(${p.id})">عرض / إعادة طباعة الإيصال</button>`;
  const insuranceDetail=i=>`<div class="muted" style="font-size:12px;margin-top:6px">إيصال التأمين INS-${String(i.id).padStart(6,'0')} · ${money(i.amount)} · ${escapeHtml(i.status)} · ${dateFmt(String(i.created_at||'').slice(0,10))} · بواسطة ${escapeHtml(i.received_by_name||'—')}</div><button class="btn" onclick="printInsuranceReceipt(${i.id})">عرض إيصال التأمين</button>`;
  modal('تحصيل النقدية',`<p class="muted">كل عملية تُسجل مرة واحدة حسب نوعها. العمليات المنفذة تظهر بيانات الإيصال ولا يمكن تنفيذها مرة أخرى.</p>
  <div class="form-actions" style="display:grid;grid-template-columns:1fr;gap:10px">
   <section class="card"><button class="btn warning" ${disabled||advance?'disabled':''} onclick="closeModal();addBookingAdvance(${id})">١. مقدم حجز — ${advance?'تم التحصيل بالفعل':'تسجيل المبلغ المدفوع'}</button>${advance?paymentDetail(advance):''}</section>
   <section class="card"><button class="btn" ${disabled||insurance?'disabled':''} onclick="closeModal();receiveBookingInsurance(${id})">٢. تأمين مسترد — ${insurance?'تم تسجيل التأمين بالفعل':'تسجيل مبلغ التأمين'}</button>${insurance?insuranceDetail(insurance):''}${insurance&&insurance.status==='محتفظ به'?`<button class="btn warning" onclick="closeModal();refundBookingInsurance(${insurance.id},${id})">رد التأمين المستلم</button>`:''}${insurance&&insurance.status==='مسترد'?'<div class="muted">تم استرداد هذا التأمين؛ لا يمكن صرفه مرة أخرى.</div>':''}</section>
   <section class="card"><button class="btn green" ${disabled||Number(b.remaining||0)<=0||finalPayment?'disabled':''} onclick="closeModal();collectRemainingBalance(${id},${Number(b.remaining||0)})">٣. تحصيل باقي المبلغ — ${money(b.remaining||0)}</button>${finalPayment?paymentDetail(finalPayment):''}${Number(b.remaining||0)<=0?'<div class="muted">لا يوجد رصيد متبقٍ على الحجز.</div>':''}</section>
   <section class="card"><button class="btn" onclick="closeModal();showBookingInsurance(${id})">٤. رد التأمين / سجل إيصالات التأمين</button></section>
  </div>`);
 }catch(e){toast(e.message||'تعذر تحميل سجل التحصيل',true)}
}
async function collectRemainingBalance(id,remaining){
 remaining=Number(remaining||0);
 if(remaining<=0){toast('تم سداد كامل قيمة الحجز');return}
  formModal('تحصيل باقي المبلغ',`<div class="detail-row"><span>المبلغ المتبقي بعد خصم الدفعات السابقة</span><strong>${money(remaining)}</strong></div><p class="muted">سيتم تحصيل الرصيد المتبقي بالكامل فقط. مقدم الحجز والدفعات السابقة محسوبة بالفعل ومخصومة من الإجمالي.</p>`+field('المبلغ المتبقي','amount','number',String(remaining.toFixed(2)),{required:true,min:0.01,max:remaining,step:'0.01'})+field('وسيلة التحصيل','method','select','كاش',{required:true,options:['كاش','إنستا باي','فيزا','محفظة إلكترونية'].map(x=>({value:x,label:x}))})+field('رقم مرجعي للعملية','reference','text',`BAL-${id}-${Date.now()}`)+field('ملاحظات','notes','textarea','تحصيل باقي قيمة الحجز بعد خصم مقدم الحجز',{full:true}),'تأكيد تحصيل باقي المبلغ وطباعة الإيصال',async d=>{
   const amount=Number(d.amount);
   if(!Number.isFinite(amount)||Math.abs(amount-remaining)>0.01){toast('يجب تحصيل قيمة المتبقي بالكامل كما هي ظاهرة بالحساب',true);return}
   try{const result=await api('/bookings/'+id+'/payments',{method:'POST',body:{...d,amount,payment_type:'تحصيل باقي المبلغ'}});toast('تم تحصيل باقي المبلغ بنجاح');const w=openReceiptTarget("إيصال تحصيل باقي المبلغ");if(w)await printPaymentReceipt(result.payment_id,w);await openBooking(id)}
   catch(err){if(w)w.close();throw err}
 });
}
async function addPayment(id,remaining){if(remaining<=0){toast('تم سداد كامل قيمة الحجز');return}
 formModal('تسجيل تحصيل جديد',field('نوع التحصيل','payment_type','select','دفعة',{options:[{value:'دفعة',label:'دفعة على حساب الحجز'},{value:'مقدم حجز',label:'مقدم حجز'}]})+field('المبلغ المستلم','amount','number','',{required:true,min:0.01,max:remaining,step:'0.01'})+field('وسيلة التحصيل','method','select','كاش',{required:true,options:['كاش','إنستا باي','فيزا','محفظة إلكترونية'].map(x=>({value:x,label:x}))})+field('رقم مرجعي للعملية','reference','text',`PAY-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${id}-${Date.now().toString().slice(-6)}`)+field('ملاحظات','notes','textarea','',{full:true}),'تأكيد التحصيل وطباعة الإيصال',async d=>{
   const receiptWindow=window.open('about:blank','_blank');
   try{const result=await api('/bookings/'+id+'/payments',{method:'POST',body:d});toast('تم تأكيد التحصيل بنجاح');if(receiptWindow)await printPaymentReceipt(result.payment_id,receiptWindow);await openBooking(id)}
   catch(err){if(receiptWindow)receiptWindow.close();throw err}
 })}


function createReceiptFrame(label='الإيصال'){
 const frame=document.createElement('iframe');
 frame.setAttribute('aria-hidden','true');
 frame.title=label;
 frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
 document.body.appendChild(frame);
 const w=frame.contentWindow;
 w.__receiptFrame=frame;
 return w;
}
function prepareReceiptWindow(w,label='الإيصال'){
 if(!w||w.closed)return;
 try{w.document.open();w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${escapeHtml(label)}</title><body style="font-family:Tahoma,Arial;text-align:center;padding:70px 20px;color:#14243a"><h2>${escapeHtml(label)}</h2><p>جاري تجهيز المستند للطباعة…</p></body></html>`);w.document.close()}catch(e){}
}
function openReceiptTarget(label='الإيصال'){return createReceiptFrame(label)}
function cleanupReceiptTarget(w){
 try{const f=w&&w.__receiptFrame;if(f)setTimeout(()=>f.remove(),1500)}catch(e){}
}
async function addBookingAdvance(id){
  formModal('تحصيل مقدم الحجز',field('المبلغ','amount','number','10000',{required:true,min:0.01,step:'0.01'})+field('وسيلة التحصيل','method','select','كاش',{options:['كاش','إنستا باي','فيزا','محفظة إلكترونية'].map(x=>({value:x,label:x}))})+field('رقم مرجعي للعملية','reference','text',`ADV-${id}-${Date.now()}`)+field('ملاحظات','notes','textarea','',{full:true}),'تأكيد وطباعة إيصال مقدم الحجز',async d=>{let inviteWindow=null;try{inviteWindow=window.open('about:blank','_blank');const r=await api('/bookings/'+id+'/payments',{method:'POST',body:{...d,payment_type:'مقدم حجز'}});toast('تم تسجيل مقدم الحجز');const receiptWindow=openReceiptTarget("إيصال مقدم الحجز");if(receiptWindow)await printPaymentReceipt(r.payment_id,receiptWindow);await openBooking(id);await showInvitationCard(id,inviteWindow)}catch(e){if(inviteWindow&&!inviteWindow.closed)inviteWindow.close();throw e}});
}
async function receiveBookingInsurance(id){
  formModal('استلام تأمين مسترد',field('مبلغ التأمين','amount','number','5000',{required:true,min:0.01,step:'0.01'})+field('وسيلة الاستلام','method','select','كاش',{options:['كاش','إنستا باي','فيزا','محفظة إلكترونية'].map(x=>({value:x,label:x}))})+field('رقم مرجعي','reference','text',`INS-${id}-${Date.now()}`)+field('ملاحظات','notes','textarea','تأمين مسترد لا يدخل في حساب تكلفة الحفل',{full:true}),'تأكيد وطباعة إيصال التأمين',async d=>{try{const r=await api('/bookings/'+id+'/insurance',{method:'POST',body:d});toast('تم تسجيل التأمين في حساب مستقل');const w=openReceiptTarget("إيصال التأمين");if(w)await printInsuranceReceipt(r.insurance_id,w);await openBooking(id)}catch(e){if(w)w.close();throw e}});
}
async function showBookingInsurance(id){
 const rows=await api('/bookings/'+id+'/insurance');
 const body=rows.map(i=>`<tr><td>${i.id}</td><td>${money(i.amount)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.created_at)}</td><td>${i.status==='محتفظ به'?`<button class="btn warning" onclick="refundBookingInsurance(${i.id},${id})">رد التأمين</button>`:'تم الاسترداد'}</td><td><button class="btn" onclick="printInsuranceReceipt(${i.id})">إيصال التأمين</button>${i.refunds?.length?` <button class="btn" onclick="printInsuranceRefundReceipt(${i.refunds[0].id})">إيصال الاسترداد</button>`:''}</td></tr>`).join('');
 modal('التأمينات والاستردادات',table(['رقم الإيصال','المبلغ','الحالة','التاريخ','إجراء','طباعة'],body,'لا يوجد تأمين مسجل لهذا الحجز'));
}
async function refundBookingInsurance(insuranceId,bookingId){
 let w=null;
 try{
  const original=await api('/insurance/'+insuranceId+'/receipt');
  const detail=`<div class="detail-row"><span>إيصال استلام التأمين الأصلي</span><strong>INS-${String(original.id).padStart(6,'0')}</strong></div><div class="detail-row"><span>العميل</span><strong>${escapeHtml(original.customer_name)}</strong></div><div class="detail-row"><span>المبلغ المستلم أصلًا</span><strong>${money(original.amount)}</strong></div><div class="detail-row"><span>تاريخ ووقت الاستلام</span><strong>${escapeHtml(original.created_at||'—')}</strong></div><div class="detail-row"><span>استلم النقدية</span><strong>${escapeHtml(original.cashier_name||'—')}</strong></div><div class="detail-row"><span>طريقة الاستلام / المرجع</span><strong>${escapeHtml(original.method||'—')} / ${escapeHtml(original.reference||'—')}</strong></div><p class="muted">راجع بيانات إيصال الاستلام الأصلي أعلاه قبل رد نفس مبلغ التأمين. سيظهر رقم الإيصال الأصلي أيضًا في إيصال الرد.</p>`;
  formModal('مراجعة إيصال التأمين ثم الاسترداد',detail+field('وسيلة رد التأمين','method','select','كاش',{options:['كاش','إنستا باي','فيزا','محفظة إلكترونية'].map(x=>({value:x,label:x}))})+field('رقم مرجعي لعملية الرد','reference','text',`REF-${insuranceId}-${Date.now()}`)+field('ملاحظات','notes','textarea','تمت مراجعة إيصال التأمين الأصلي واستلامه من العميل',{full:true}),'تأكيد رد التأمين وطباعة إيصال مرتبط بالأصل',async d=>{try{const r=await api('/insurance/'+insuranceId+'/refund',{method:'POST',body:d});toast('تم تسجيل رد التأمين، ولا يمكن صرفه مرة أخرى');w=openReceiptTarget('إيصال رد التأمين');if(w)await printInsuranceRefundReceipt(r.refund_id,w);await showBookingInsurance(bookingId)}catch(e){throw e}});
 }catch(e){toast(e.message||'تعذر تحميل إيصال التأمين الأصلي',true)}
}
const bookingInstructionsHtml=`<div class="rule"></div><div class="title">تعليمات الحجز</div><div class="small">1- مقدم الحجز 10,000 جنيه.<br>2- التأمين 5,000 جنيه مسترد.<br>3- يتم دفع قيمة الحفلة بالكامل قبل 30 يومًا وكتابة العقد.<br>4- الالتزام بتعليمات الأمن.<br>5- ممنوع دخول مأكولات أو مشروبات.<br>6- الالتزام بمواعيد الزفة.<br>7- مواعيد صرف التأمين اليوم التالي من الحفل بعد الساعة الخامسة من مكتب الحفلات.<br>8- في حالة إحضار كاميرا فيديو أو فوتوغرافي من الخارج يتم دفع رسوم.<br>9- لا يسمح بدخول فقرات فنية أو DJ خارجي إلا بتصريح من الشئون المعنوية.</div>`;
async function printInsuranceReceipt(id,targetWindow=null){
 const w=targetWindow||openReceiptTarget('إيصال التأمين');if(!w){toast('اسمح بالنوافذ المنبثقة للطباعة',true);return}
 try{const p=await api('/insurance/'+id+'/receipt');const esc=escapeHtml;
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إيصال تأمين ${p.id}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font:11pt/1.5 Tahoma,Arial;color:#111}.sheet{height:277mm;page-break-after:always;break-after:page;padding:4mm 3mm;overflow:hidden}.sheet:last-of-type{page-break-after:auto;break-after:auto}.center{text-align:center}.rule{border-top:1px dashed #222;margin:5mm 0}.row{display:flex;justify-content:space-between;gap:8mm;padding:2mm 0;border-bottom:1px dotted #ddd}.row strong{text-align:left}.title{font-size:16pt;font-weight:bold;text-align:center;margin:5mm 0}.small{font-size:9pt}.instructions{font-size:12pt;line-height:2}.back-title{text-align:center;font-size:20pt;font-weight:bold;margin:10mm 0}@media print{button{display:none}.sheet{height:277mm;overflow:hidden}}</style><body><section class="sheet front"><div class="center"><h2>${esc(p.company_name)}</h2>${esc(p.venue||'')}<div class="rule"></div><div class="title">إيصال استلام تأمين مسترد</div>رقم الإيصال: INS-${String(p.id).padStart(6,'0')}<br>${esc(p.created_at)}</div><div class="rule"></div><div class="row"><span>العميل</span><strong>${esc(p.customer_name)}</strong></div><div class="row"><span>العريس / العروسة</span><strong>${esc(p.groom_name||'—')} / ${esc(p.bride_name||'—')}</strong></div><div class="row"><span>القاعة</span><strong>${esc(p.hall_name)}</strong></div><div class="row"><span>تاريخ الحفل</span><strong>${esc(p.event_date)} · ${esc(p.event_period)}</strong></div><div class="rule"></div><div class="row"><span>التأمين خارج حساب تكلفة الحفل</span><strong>${money(p.amount)}</strong></div><div class="row"><span>وسيلة الاستلام</span><strong>${esc(p.method)}</strong></div><div class="row"><span>الحالة</span><strong>${esc(p.status)}</strong></div><div class="row"><span>رقم مرجعي</span><strong>${esc(p.reference||'—')}</strong></div><div class="rule"></div><p>يُحتفظ بهذا الإيصال لتسوية التأمين واسترداده وفق التعليمات.</p><div class="center">توقيع المستلم: ....................</div></section><section class="sheet back"><div class="back-title">تعليمات الحجز</div><div class="instructions">1- مقدم الحجز 10,000 جنيه.<br>2- التأمين 5,000 جنيه مسترد.<br>3- يتم دفع قيمة الحفلة بالكامل قبل 30 يومًا وكتابة العقد.<br>4- الالتزام بتعليمات الأمن.<br>5- ممنوع دخول مأكولات أو مشروبات.<br>6- الالتزام بمواعيد الزفة.<br>7- مواعيد صرف التأمين اليوم التالي من الحفل بعد الساعة الخامسة من مكتب الحفلات.<br>8- في حالة إحضار كاميرا فيديو أو فوتوغرافي من الخارج يتم دفع رسوم.<br>9- لا يسمح بدخول فقرات فنية أو DJ خارجي إلا بتصريح من الشئون المعنوية.</div><div class="center">إدارة القاعة</div></section><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
 w.document.open();w.document.write(html);w.document.close();cleanupReceiptTarget(w);
 }catch(e){if(w)cleanupReceiptTarget(w);toast(e.message||'تعذر طباعة إيصال التأمين',true)}
}
async function printInsuranceRefundReceipt(id,targetWindow=null){
 const w=targetWindow||openReceiptTarget('إيصال استرداد التأمين');if(!w){toast('اسمح بالنوافذ المنبثقة للطباعة',true);return}
 try{const p=await api('/insurance-refunds/'+id+'/receipt');const esc=escapeHtml;
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إيصال استرداد التأمين ${p.id}</title><style>@page{size:80mm auto;margin:3mm}body{width:74mm;margin:auto;font:12px/1.6 Tahoma,Arial;color:#111}.center{text-align:center}.rule{border-top:1px dashed #222;margin:8px 0}.row{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.row strong{text-align:left}.title{font-size:16px;font-weight:bold;text-align:center;margin:8px 0}@media print{button{display:none}}</style><body><div class="center"><h2>${esc(p.company_name)}</h2>${esc(p.venue||'')}<div class="rule"></div><div class="title">إيصال رد واسترداد تأمين</div>رقم إيصال الاسترداد: REF-${String(p.id).padStart(6,'0')}<br>مرجع إيصال استلام التأمين الأصلي: INS-${String(p.insurance_id).padStart(6,'0')}<br>رقم مرجع الاستلام: ${esc(p.original_reference||'—')}<br>استلام التأمين الأصلي: ${esc(p.insurance_received_at||'—')} · بواسطة ${esc(p.original_cashier_name||'—')}<br>تاريخ رد التأمين: ${esc(p.created_at)}</div><div class="rule"></div><div class="row"><span>العميل</span><strong>${esc(p.customer_name)}</strong></div><div class="row"><span>العريس / العروسة</span><strong>${esc(p.groom_name||'—')} / ${esc(p.bride_name||'—')}</strong></div><div class="row"><span>القاعة</span><strong>${esc(p.hall_name)}</strong></div><div class="row"><span>المبلغ المسترد</span><strong>${money(p.amount)}</strong></div><div class="row"><span>وسيلة الرد</span><strong>${esc(p.method)}</strong></div><div class="row"><span>رقم مرجعي</span><strong>${esc(p.reference||'—')}</strong></div><div class="rule"></div><p>أقر باستلام مبلغ التأمين الموضح أعلاه، وتم تسليم أصل إيصال التأمين.</p><div class="center">توقيع المستلم: ....................</div><button onclick="window.print()">طباعة</button><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
 w.document.open();w.document.write(html);w.document.close();cleanupReceiptTarget(w);
 }catch(e){if(w)cleanupReceiptTarget(w);toast(e.message||'تعذر طباعة إيصال الاسترداد',true)}
}

async function changeBookingStatus(id){formModal('تغيير حالة الحجز',field('الحالة','status','select','مؤكد',{options:['مبدئي','مؤكد','ملغي','مرفوض','تمت المناسبة'].map(x=>({value:x,label:x}))}),'حفظ الحالة',async d=>{const inviteWindow=d.status==='مؤكد'?window.open('about:blank','_blank'):null;await api('/bookings/'+id+'/status',{method:'PATCH',body:d});toast('تم تحديث الحالة');if(d.status==='مؤكد')await showInvitationCard(id,inviteWindow)})}
async function showInvitationCard(id, targetWindow=null){
 let w=targetWindow;
 if(!w||w.closed)w=window.open('about:blank','_blank');prepareReceiptWindow(w,'كارت الدعوة QR');
 if(!w){toast('اسمح بالنوافذ المنبثقة لعرض كارت الدعوة',true);return}
 try{
   const d=await api('/bookings/'+id+'/invitation');
   const groom=escapeHtml(d.groom_name||'العريس'),bride=escapeHtml(d.bride_name||'العروسة');
   const hall=escapeHtml(d.hall_name||''),venue=escapeHtml(d.venue||''),company=escapeHtml(d.company_name||state.company.name);
   const date=dateFmt(d.event_date),period=escapeHtml(d.event_period||'');
   w.document.open();w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دعوة زفاف ${groom} و${bride}</title><style>
   *{box-sizing:border-box}body{margin:0;padding:8px;background:#f3f0e9;color:#19283f;font-family:Tahoma,Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}.invite{width:min(100%,460px);max-height:calc(100vh - 16px);background:#fffdf8;border:2px solid #c7a45e;border-radius:16px;overflow:hidden;position:relative;box-shadow:0 12px 30px #17243b18}.invite:before,.invite:after{content:'✦';position:absolute;color:#c7a45e;font-size:20px;top:8px}.invite:before{right:12px}.invite:after{left:12px}.inner{margin:7px;border:1px solid #e5d5b3;border-radius:11px;padding:18px 16px 14px;text-align:center}.brand{font-size:11px;letter-spacing:1px;color:#8b6a2e}.orn{font-size:18px;color:#c7a45e;margin:7px 0}.eyebrow{font-size:12px;color:#7e6b4b;margin:0}.names{font-family:Georgia,serif;font-size:clamp(24px,4vw,32px);line-height:1.18;color:#182b49;margin:8px 0}.and{font-size:16px;color:#b28b45}.subtitle{font-size:11px;color:#6b7280}.details{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:12px auto}.pill{padding:7px 9px;border:1px solid #e7d7b5;border-radius:8px;min-width:110px;flex:1}.pill small{display:block;color:#9a814d;margin-bottom:3px;font-size:10px}.pill strong{font-size:11px}.qr{margin:9px auto 4px;width:108px;height:108px;display:block}.expiry{font-size:10px;color:#8b8b8b;line-height:1.5;margin:4px 0}.actions{text-align:center;margin-top:8px}.print{background:#182b49;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:bold;cursor:pointer}@media(max-height:650px){.inner{padding:10px}.orn{margin:4px 0}.names{font-size:24px;margin:5px 0}.details{margin:7px auto}.qr{width:82px;height:82px;margin:5px auto}.subtitle{margin:4px 0}}@media print{@page{size:A5 portrait;margin:5mm}body{padding:0;background:#fff;min-height:auto}.invite{box-shadow:none;width:100%;max-width:100%;max-height:none;border-radius:0}.inner{padding:12px;margin:0}.actions{display:none}.qr{width:100px;height:100px}} </style><main class="invite"><section class="inner"><div class="brand">${company}</div><div class="orn">✦ ❦ ✦</div><p class="eyebrow">بكل الحب والفرح، نتشرف بدعوتكم لحضور حفل زفاف</p><h1 class="names">${groom}<br><span class="and">&</span><br>${bride}</h1><p class="subtitle">وجودكم يكمّل فرحتنا ويزيدها بهجة</p><div class="details"><div class="pill"><small>المكان</small><strong>${venue?venue+' · ':''}${hall}</strong></div><div class="pill"><small>التاريخ</small><strong>${date}</strong></div><div class="pill"><small>الفترة</small><strong>${period}</strong></div></div><img class="qr" src="${d.qr_data_url}" alt="QR Code للدخول"><p class="expiry">الدعوة شخصية ولمرة واحدة فقط · صالحة حتى بداية اليوم التالي للمناسبة</p><div class="actions"><button class="print" onclick="window.print()">حفظ PDF / طباعة</button><p class="expiry">لحفظه PDF: اختار Save as PDF من نافذة الطباعة، وبعدها ابعته على واتساب.</p></div></section></main></html>`);w.document.close();
 }catch(e){
   const message=String(e?.message||'تعذر إنشاء كارت الدعوة');
   try{
     if(w&&!w.closed){
       w.document.open();
       w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تعذر إنشاء الدعوة</title><body style="font-family:Tahoma,Arial,sans-serif;background:#f4f6fa;padding:32px;text-align:center;color:#17243b"><h2>تعذر إنشاء كارت الدعوة</h2><p>${escapeHtml(message)}</p><p>تأكد من أن الحجز مؤكد ثم أعد المحاولة. إذا استمرت المشكلة، راجع رسالة الخطأ في نافذة السيرفر.</p><button onclick="location.reload()">إعادة المحاولة</button></body></html>`);
       w.document.close();
     }
   }catch{}
   toast(message,true);
 }
}
async function printPaymentReceipt(paymentId,targetWindow=null){
 const w=targetWindow||openReceiptTarget('إيصال التحصيل');
 if(!w){toast('اسمح بالنوافذ المنبثقة لطباعة الإيصال',true);return}
 try{
   const p=await api('/payments/'+paymentId+'/receipt');
   const esc=escapeHtml;
   const receiptNo=String(p.id).padStart(6,'0');
   const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إيصال تحصيل ${receiptNo}</title><style>
   @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Tahoma,Arial,sans-serif;font-size:11pt;line-height:1.45}.sheet{height:277mm;position:relative;page-break-after:always;break-after:page;padding:4mm 3mm;overflow:hidden}.sheet:last-of-type{page-break-after:auto;break-after:auto}.center{text-align:center}.brand{font-size:20pt;font-weight:bold}.subtitle{font-size:10pt}.rule{border-top:1px dashed #222;margin:5mm 0}.title{font-size:15pt;font-weight:bold;margin:4mm 0}.row{display:flex;justify-content:space-between;gap:8mm;padding:2mm 0;border-bottom:1px dotted #ddd}.row span{color:#333}.row strong{text-align:left;max-width:55%;overflow-wrap:anywhere}.amount{font-size:15pt;font-weight:bold}.small{font-size:9pt}.thanks{margin-top:8mm;text-align:center}.actions{margin:12px 0;text-align:center}.actions button{padding:8px 14px}.instructions{font-size:12pt;line-height:2}.back-title{text-align:center;font-size:20pt;font-weight:bold;margin:10mm 0}@media print{.actions{display:none}.sheet{height:277mm;overflow:hidden}}</style>
   <body><section class="sheet front"><header class="center"><div class="brand">${esc(p.company_name)}</div><div class="subtitle">${esc(p.venue||'')}</div><div class="rule"></div><div class="title">${esc(p.payment_type==='مقدم حجز'?'إيصال مقدم حجز':'إيصال تحصيل نقدية / دفعة')}</div><div>رقم الإيصال: ${receiptNo}</div><div>${esc(p.created_at||'')}</div></header>
   ${p.payment_type==='مقدم حجز'?`
   <div class="rule"></div>
   <div class="row"><span>العميل</span><strong>${esc(p.customer_name||'—')}</strong></div>
   <div class="row"><span>القاعة</span><strong>${esc(p.hall_name||'—')}</strong></div>
   <div class="row"><span>تاريخ الفرح</span><strong>${esc(p.event_date||'—')} · ${esc(p.event_period||'')}</strong></div>
   <div class="rule"></div>
   <div class="title center">إيصال مقدم حجز</div>
   <div class="row"><span>مبلغ مقدم الحجز المستلم</span><strong class="amount">${money(p.amount)}</strong></div>
   <div class="row"><span>إجمالي تكلفة الحفل شامل الخدمة</span><strong>${money(p.total_due)}</strong></div>
   <div class="row"><span>المتبقي من إجمالي الحفل</span><strong class="amount">${money(p.remaining)}</strong></div>
   <div class="row"><span>وسيلة التحصيل</span><strong>${esc(p.method||'—')}</strong></div>
   ${p.reference?`<div class="row"><span>الرقم المرجعي</span><strong>${esc(p.reference)}</strong></div>`:''}
   <div class="rule"></div>
   <div class="row"><span>موظف التحصيل</span><strong>${esc(p.cashier_name||'—')}</strong></div>
   <div class="thanks">تم استلام مقدم الحجز الموضح أعلاه<br>هذا الإيصال يثبت سداد المقدم فقط، ولا يُعد مخالصة نهائية.</div>
   `:`
   <div class="rule"></div><div class="row"><span>القاعة</span><strong>${esc(p.hall_name)}</strong></div><div class="row"><span>العريس</span><strong>${esc(p.groom_name||'—')}</strong></div><div class="row"><span>العروسة</span><strong>${esc(p.bride_name||'—')}</strong></div><div class="row"><span>تاريخ الفرح</span><strong>${esc(p.event_date)} · ${esc(p.event_period)}</strong></div><div class="row"><span>عدد الأفراد</span><strong>${esc(p.guest_count||0)}</strong></div><div class="row"><span>اسم العميل</span><strong>${esc(p.customer_name||'—')}</strong></div>
   <div class="rule"></div><div class="title">تفاصيل الأسعار</div>
   <div class="row"><span>الباكدج: ${esc(p.package_name_snapshot||'سعر يدوي')}</span><strong>${money(p.base_contract_total)}</strong></div>
   ${p.paragraphs?.length?`<div class="small"><strong>الإضافات والشو:</strong></div>${p.paragraphs.map(x=>`<div class="row"><span>${esc(x.name_snapshot)}${x.show_names_snapshot?' — '+esc(x.show_names_snapshot):''}</span><strong>${money(x.price_snapshot)}</strong></div>`).join('')}`:'<div class="row"><span>الإضافات والشو</span><strong>لا يوجد</strong></div>'}
   ${p.menu_groups?.length?`<div class="small"><strong>الوجبات ومجموعات المنيو:</strong></div>${p.menu_groups.map(x=>`<div class="row"><span>${esc(x.name_snapshot)}${x.items_snapshot?'<br><span class="small">'+JSON.parse(x.items_snapshot||'[]').map(i=>esc(i.name)+(i.quantity?' × '+esc(i.quantity):'')).join('، ')+'</span>':''}<br><span class="small">${x.price_mode_snapshot==='per_person'?money(x.unit_price_snapshot)+' للفرد × '+(x.guest_count_snapshot||p.guest_count)+' فرد':'سعر ثابت للمجموعة'}</span></span><strong>${money(x.price_snapshot)}</strong></div>`).join('')}`:'<div class="row"><span>مجموعات المنيو</span><strong>لا يوجد</strong></div>'}
   <div class="row"><span>إجمالي الإضافات</span><strong>${money(p.paragraph_total)}</strong></div><div class="row"><span>إجمالي المنيو</span><strong>${money(p.menu_total)}</strong></div><div class="row"><span>إجمالي العقد قبل الخصم</span><strong>${money(p.contract_total)}</strong></div><div class="row"><span>الخصم</span><strong>${money(p.discount)}</strong></div>
   <div class="rule"></div><div class="row"><span>إجمالي المستحق بعد الخصم والخدمة</span><strong>${money(p.total_due)}</strong></div><div class="row"><span>مقدم الحجز المدفوع سابقًا</span><strong>${money(p.advance_paid||0)}</strong></div><div class="row"><span>إجمالي المدفوع بعد العملية</span><strong>${money(p.paid_total)}</strong></div><div class="row"><span>المبلغ المستلم الآن</span><strong class="amount">${money(p.amount)}</strong></div><div class="row"><span>المتبقي على العميل</span><strong class="amount">${money(p.remaining)}</strong></div><div class="row"><span>نوع التحصيل</span><strong>${esc(p.payment_type||"دفعة")}</strong></div><div class="row"><span>تاريخ ووقت التحصيل</span><strong>${esc(p.created_at||"—")}</strong></div><div class="row"><span>وسيلة التحصيل</span><strong>${esc(p.method)}</strong></div>${p.reference?`<div class="row"><span>رقم مرجعي</span><strong>${esc(p.reference)}</strong></div>`:''}
   <div class="rule"></div><div class="row"><span>موظف الحجز</span><strong>${esc(p.booking_employee_name)}</strong></div><div class="row"><span>موظف التحصيل</span><strong>${esc(p.cashier_name)}</strong></div><div class="rule"></div><div class="thanks">شكرًا لتعاملكم معنا<br><span class="small">هذا الإيصال صادر من نظام إدارة القاعات</span></div>
   `}</section><section class="sheet back"><div class="back-title">تعليمات الحجز</div><div class="instructions">1- مقدم الحجز 10,000 جنيه.<br>2- التأمين 5,000 جنيه مسترد.<br>3- يتم دفع قيمة الحفلة بالكامل قبل 30 يومًا وكتابة العقد.<br>4- الالتزام بتعليمات الأمن.<br>5- ممنوع دخول مأكولات أو مشروبات.<br>6- الالتزام بمواعيد الزفة.<br>7- مواعيد صرف التأمين اليوم التالي من الحفل بعد الساعة الخامسة من مكتب الحفلات.<br>8- في حالة إحضار كاميرا فيديو أو فوتوغرافي من الخارج يتم دفع رسوم.<br>9- لا يسمح بدخول فقرات فنية أو DJ خارجي إلا بتصريح من الشئون المعنوية.</div><div class="thanks">إدارة القاعة</div></section><div class="actions"><button onclick="window.print()">طباعة الإيصال وجه وظهر</button></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`;
   w.document.open();w.document.write(html);w.document.close();cleanupReceiptTarget(w);
 }catch(e){cleanupReceiptTarget(w);toast(e.message||'تعذر تجهيز الإيصال',true)}
}
async function printBooking(id){
 const b=await api('/bookings/'+id);
 const base=Number(b.base_contract_total ?? (b.contract_total-(b.extras_total||0)));
 const paragraphRows=(b.paragraphs||[]).map(p=>`<tr><td>${escapeHtml(p.name_snapshot)}</td><td>${escapeHtml(p.show_names_snapshot||'—')}</td><td>${Number(p.duration_snapshot)||0} دقيقة</td><td>${money(p.price_snapshot)}</td></tr>`).join('');
 const menuRows=(b.menu_groups||[]).map(g=>`<tr><td>${escapeHtml(g.name_snapshot)}</td><td>${(g.items||[]).map(i=>`${escapeHtml(i.name)}${i.quantity?' × '+escapeHtml(i.quantity):''}${i.category?' ('+escapeHtml(i.category)+')':''}`).join('، ')||'—'}</td><td>${g.price_mode_snapshot==='per_person'?money(g.unit_price_snapshot)+' للفرد':'ثابت'}</td><td>${g.price_mode_snapshot==='per_person'?(g.guest_count_snapshot||b.guest_count)+' فرد':'1 مجموعة'}</td><td>${money(g.price_snapshot)}</td></tr>`).join('');
 const paragraphsTotal=(b.paragraphs||[]).reduce((s,p)=>s+Number(p.price_snapshot||0),0);
 const menuTotal=(b.menu_groups||[]).reduce((s,g)=>s+Number(g.price_snapshot||0),0);
 const w=window.open('','_blank');if(!w)return toast('اسمح بالنوافذ المنبثقة للطباعة',true);
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فاتورة تفصيلية للحجز ${b.id}</title><style>
 body{font-family:Tahoma,Arial,sans-serif;padding:28px;color:#172238}h1{color:#102640;margin-bottom:5px}.sub{color:#68758a;margin-top:0}.section{margin-top:22px}h3{background:#f2f5f8;padding:9px;border-right:4px solid #c9a454}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:10px;border:1px solid #d8dee8;text-align:right}th{background:#f7f8fa}.total{font-size:20px;font-weight:bold}.summary{width:55%;margin-right:auto}.summary td:first-child{width:60%}.sign{margin-top:35px;display:flex;justify-content:space-between}@media print{body{padding:8mm}}</style>
 <h1>${escapeHtml(state.company.name)}</h1><p class="sub">فاتورة تفصيلية للحجز رقم ${b.id}</p>
 <p>العميل: <strong>${escapeHtml(b.customer_name)}</strong> — الهاتف: ${escapeHtml(b.phone||'—')}</p>
 <p>العريس: <strong>${escapeHtml(b.groom_name||'—')}</strong> — العروسة: <strong>${escapeHtml(b.bride_name||'—')}</strong></p>
 <p>القاعة: <strong>${escapeHtml(b.hall_name)}</strong> — ${escapeHtml(b.venue||'')}</p><p>الباكدج: <strong>${escapeHtml(b.package_name_snapshot||'باكدج / سعر يدوي')}</strong></p><p>التاريخ والفترة: <strong>${dateFmt(b.event_date)} — ${escapeHtml(b.event_period)}</strong></p>
 <section class="section"><h3>1) سعر القاعة / العقد الأساسي</h3><table><tr><th>البند</th><th>السعر</th></tr><tr><td>العقد الأساسي قبل الإضافات والمنيو</td><td>${money(base)}</td></tr></table></section>
 <section class="section"><h3>2) الإضافات والشو المختارة</h3><table><tr><th>اسم الفقرة</th><th>أسماء الشو</th><th>المدة</th><th>السعر</th></tr>${paragraphRows||'<tr><td colspan="4">لا توجد فقرات أو شو مختارة</td></tr>'}<tr><th colspan="3">إجمالي الإضافات</th><th>${money(paragraphsTotal)}</th></tr></table></section>
 <section class="section"><h3>3) الوجبات ومجموعات المنيو — عدد الأفراد: ${b.guest_count||0}</h3><table><tr><th>الوجبة / المجموعة</th><th>المكونات</th><th>سعر الفرد / الوحدة</th><th>العدد</th><th>الإجمالي</th></tr>${menuRows||'<tr><td colspan="5">لا توجد وجبات أو مجموعات منيو مختارة</td></tr>'}<tr><th colspan="4">إجمالي الوجبات والمنيو</th><th>${money(menuTotal)}</th></tr></table></section>
 <section class="section"><h3>4) ملخص الحساب</h3><table class="summary"><tr><td>سعر الباكدج / القاعة</td><td>${money(base)}</td></tr>${Number(b.extra_guest_total||0)>0?`<tr><td>الأفراد الإضافيون — ${Math.max(0,Number(b.guest_count||0)-Number(b.included_guest_count_snapshot||0))} فرد (شامل الماية والعصير)</td><td>${money(b.extra_guest_total)}</td></tr>`:''}<tr><td>الخصم على الباكدج</td><td>− ${money(b.discount)}</td></tr><tr><td>الإضافات</td><td>${money(paragraphsTotal)}</td></tr><tr><td>المنيو</td><td>${money(menuTotal)}</td></tr>${(b.contractor_services||[]).length?`<tr><td>المتعهدون والخدمات</td><td>${money(b.contractor_services.reduce((s,x)=>s+Number(x.price||0),0))}</td></tr>`:''}<tr><td><strong>الإجمالي قبل خدمة 15%</strong></td><td><strong>${money(b.subtotal_after_discount??(b.contract_total-b.discount))}</strong></td></tr><tr><td>خدمة 15%</td><td>${money(b.service_amount??Math.max(0,b.contract_total-b.discount)*0.15)}</td></tr><tr><td><strong>الإجمالي النهائي شامل الخدمة</strong></td><td><strong>${money(b.total_due??Math.max(0,b.contract_total-b.discount)*1.15)}</strong></td></tr><tr><td>إجمالي المدفوع</td><td>${money(b.paid_total)}</td></tr><tr class="total"><td>المتبقي</td><td>${money(b.remaining)}</td></tr></table></section>
 <p>موظف الحجز: <strong>${escapeHtml(b.booking_employee_name||'—')}</strong></p><div class="sign"><span>توقيع العميل: ........................</span><span>توقيع المسؤول: ........................</span></div>
 <script>window.addEventListener('load',()=>window.print())</script></html>`;
 w.document.open();w.document.write(html);w.document.close();
}
async function banquetPrint(id){const b=await api('/bookings/'+id);const w=window.open('','_blank');if(!w)return toast('اسمح بالنوافذ المنبثقة للطباعة',true);w.document.write(`<html dir="rtl"><meta charset="utf-8"><title>بيان المناسبة</title><style>body{font-family:Arial;padding:40px}h1{color:#168652}p{font-size:20px;border-bottom:1px solid #ddd;padding:10px}</style><h1>بيان المناسبة 🍽️</h1><p>العميل: ${escapeHtml(b.customer_name)}</p><p>العريس: ${escapeHtml(b.groom_name||'—')} — العروسة: ${escapeHtml(b.bride_name||'—')}</p><p>المكان: ${escapeHtml(b.venue)} — القاعة: ${escapeHtml(b.hall_name)}</p><p>التاريخ: ${dateFmt(b.event_date)} — ${escapeHtml(b.event_period)}</p><p>عدد الأفراد: ${b.guest_count}</p><p>نوع المناسبة: ${escapeHtml(b.event_type)}</p><p>ملاحظات: ${escapeHtml(b.notes||'—')}</p><script>window.print()</script></html>`);w.document.close()}
async function renderHalls(){const halls=await getHalls();const rows=halls.map(h=>`<tr><td><button class="btn" onclick="editHall(${h.id})" title="اضغط لتعديل اسم القاعة أو حالتها"><strong>${escapeHtml(h.name)}</strong></button></td><td>${h.active?'<span class="status booked">نشطة</span>':'<span class="status">خارج الخدمة</span>'}</td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('إدارة القاعات','اسم القاعة وحالتها فقط',`<button class="btn primary" onclick="newHall()">＋ إضافة قاعة</button>`)+panel('القاعات المسجلة',table(['اسم القاعة','الحالة'],rows));}
function newHall(){formModal('إضافة قاعة جديدة',field('اسم القاعة','name','text','',{required:true})+field('الحالة','active','select',1,{options:[{value:1,label:'نشطة'},{value:0,label:'خارج الخدمة'}]}),'حفظ القاعة',async d=>{await api('/halls',{method:'POST',body:{name:d.name,active:Number(d.active)===0?0:1}});toast('تمت إضافة القاعة');await renderHalls()})}
async function editHall(id){const h=(await getHalls()).find(x=>x.id===id);if(!h)return;formModal('تعديل القاعة',field('اسم القاعة','name','text',h.name,{required:true})+field('الحالة','active','select',h.active?1:0,{options:[{value:1,label:'نشطة'},{value:0,label:'خارج الخدمة'}]}),'حفظ التعديلات',async d=>{await api('/halls/'+id,{method:'PUT',body:{name:d.name,active:Number(d.active)===0?0:1}});toast('تم تحديث بيانات القاعة');await renderHalls()})}
async function renderFollowups(){const data=await api('/followups');$('#followBadge').textContent=data.filter(x=>x.status==='pending').length;const rows=data.map(f=>`<tr><td>${escapeHtml(f.customer_name)}<br><small>${escapeHtml(f.phone)}</small></td><td>${escapeHtml(f.note)}</td><td>${dateFmt(f.due_at.slice(0,10))}</td><td>${badge(f.status==='done'?'مؤكد':'new')}</td><td>${f.status==='pending'?`<button class="btn green" onclick="completeFollowup(${f.id})">إتمام</button>`:'—'}</td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('المتابعات','مواعيد متابعة العملاء والمهام المستحقة',`<button class="btn primary" onclick="newFollowup()">＋ متابعة جديدة</button>`)+panel('قائمة المتابعات',table(['العميل','التفاصيل','موعد المتابعة','الحالة','إجراء'],rows));}
async function newFollowup(){const customers=await api('/customers');if(!customers.length){toast('أضف عميلًا أولًا',true);return newCustomer()}
 formModal('إضافة متابعة',field('العميل','customer_id','select','',{required:true,options:customers.map(c=>({value:c.id,label:c.name+' · '+c.phone}))})+field('التاريخ','due_at','date',new Date().toISOString().slice(0,10),{required:true})+field('تفاصيل المتابعة','note','textarea','',{required:true,full:true}),'حفظ المتابعة',async d=>{await api('/followups',{method:'POST',body:d});toast('تمت إضافة المتابعة')})}
async function completeFollowup(id){try{await api('/followups/'+id+'/complete',{method:'PATCH',body:{}});toast('تم إتمام المتابعة');await renderPage()}catch(e){toast(e.message,true)}}

async function renderPackages(){
 const [packages,halls]=await Promise.all([api('/packages'),getHalls()]);
 const rows=packages.map(p=>`<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${p.event_period==='نهاري'?'نهاري':'ليلي'}</td><td>${escapeHtml(p.hall_name||'كل القاعات')}</td><td>${p.guest_count||'—'}</td><td>${money(p.price)}</td><td>${p.included_guest_count?`${p.included_guest_count} فرد مشمول · الزيادة ${money(p.extra_guest_price)} للفرد<br>`:''}${escapeHtml(p.included_items||'')}${p.included_items&&p.description?'<br>':''}${escapeHtml(p.description||'—')}</td><td>${p.active?'نشط':'متوقف'}</td><td>${hasPermission('packages')?`<button class="btn" onclick="editPackage(${p.id})">تعديل</button>`:'—'}</td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('شرائح أسعار القاعات','كل سجل يمثل سعرًا لقاعة موجودة عند حد معين من الأفراد، وليس قاعة جديدة. اربط كل شريحة بالقاعة نفسها، وسيُختار السعر المناسب تلقائيًا في الحجز.',`<button class="btn primary" onclick="newPackage()">＋ إضافة شريحة سعر</button>`)+panel('الباكدجات والأسعار',table(['اسم الباكدج','نوع الفرح','القاعة','عدد الأفراد','السعر','الوصف','الحالة','إجراء'],rows));
}
async function newPackage(){
 const halls=await getHalls();
 formModal('إضافة شريحة سعر لقاعة',field('اسم الشريحة (مثال: الفيولا حتى 200 فرد)','name','text','',{required:true})+field('نوع الفرح','event_period','select','مسائي',{required:true,options:[{value:'نهاري',label:'فرح نهاري'},{value:'مسائي',label:'فرح ليلي'}]})+field('القاعة (اختياري)','hall_id','select','',{options:[{value:'',label:'كل القاعات'},...halls.map(h=>({value:h.id,label:h.name}))]})+field('عدد الأفراد المعتاد / حد الشريحة','guest_count','number','0',{min:0})+field('سعر الباكدج','price','number','',{required:true,min:0,step:'0.01'})+field('عدد الأفراد المشمولين في السعر','included_guest_count','number','0',{min:0})+field('سعر الفرد الإضافي','extra_guest_price','number','0',{min:0,step:'0.01'})+field('المشروبات / العناصر المشمولة','included_items','text','')+field('الوصف / المكونات','description','textarea','',{full:true}),'حفظ الباكدج',async d=>{if(!d.hall_id)delete d.hall_id;await api('/packages',{method:'POST',body:d});toast('تمت إضافة الباكدج')});
}
async function editPackage(id){
 const p=(await api('/packages')).find(x=>x.id===id);if(!p)return;const halls=await getHalls();
 formModal('تعديل شريحة السعر',field('اسم الشريحة (مثال: الفيولا حتى 200 فرد)','name','text',p.name,{required:true})+field('نوع الفرح','event_period','select',p.event_period||'مسائي',{required:true,options:[{value:'نهاري',label:'فرح نهاري'},{value:'مسائي',label:'فرح ليلي'}]})+field('القاعة (اختياري)','hall_id','select',p.hall_id||'',{options:[{value:'',label:'كل القاعات'},...halls.map(h=>({value:h.id,label:h.name}))]})+field('عدد الأفراد المعتاد / حد الشريحة','guest_count','number',p.guest_count,{min:0})+field('سعر الباكدج','price','number',p.price,{required:true,min:0,step:'0.01'})+field('عدد الأفراد المشمولين في السعر','included_guest_count','number',p.included_guest_count||0,{min:0})+field('سعر الفرد الإضافي','extra_guest_price','number',p.extra_guest_price||0,{min:0,step:'0.01'})+field('المشروبات / العناصر المشمولة','included_items','text',p.included_items||'')+field('الوصف / المكونات','description','textarea',p.description,{full:true})+field('الحالة','active','select',p.active?1:0,{options:[{value:1,label:'نشط'},{value:0,label:'متوقف'}]}),'حفظ التعديلات',async d=>{if(!d.hall_id)delete d.hall_id;await api('/packages/'+id,{method:'PUT',body:d});toast('تم تحديث الباكدج')});
}

async function renderParagraphs(){
 const data=await api('/paragraphs');
 const rows=data.map(p=>`<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${p.event_period==='نهاري'?'نهاري':'ليلي'}</td><td>${money(p.price)}</td><td>${p.active?'<span class="status booked">نشط</span>':'<span class="status">متوقف</span>'}</td><td><button class="btn" onclick="editParagraph(${p.id})">تعديل</button></td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('الإضافات','سجّل اسم كل إضافة وسعرها فقط، ثم اختر الإضافات المطلوبة أثناء الحجز.',`<button class="btn primary" onclick="newParagraph()">＋ إضافة جديدة</button>`)+panel('قائمة الإضافات',table(['اسم الإضافة','نوع الفرح','السعر','الحالة','إجراء'],rows));
}
function newParagraph(){formModal('إضافة جديدة',field('اسم الإضافة','name','text','',{required:true})+field('السعر','price','number','0',{required:true,min:0,step:'0.01'})+field('نوع الفرح','event_period','select','نهاري',{options:[{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'ليلي'}]}),'حفظ الإضافة',async d=>{await api('/paragraphs',{method:'POST',body:{name:d.name,price:d.price,event_period:d.event_period}});toast('تمت إضافة الإضافة')})}
async function editParagraph(id){const p=(await api('/paragraphs')).find(x=>x.id===id);if(!p)return;formModal('تعديل الإضافة',field('اسم الإضافة','name','text',p.name,{required:true})+field('السعر','price','number',p.price,{required:true,min:0,step:'0.01'})+field('نوع الفرح','event_period','select',p.event_period||'مسائي',{options:[{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'ليلي'}]})+field('الحالة','active','select',p.active?1:0,{options:[{value:1,label:'نشط'},{value:0,label:'متوقف'}]}),'حفظ التعديلات',async d=>{await api('/paragraphs/'+id,{method:'PUT',body:{name:d.name,price:d.price,event_period:d.event_period,active:Number(d.active)}});toast('تم تحديث الإضافة')})}
async function renderSavedDocuments(type){
 const isContract=type==='contract', title=isContract?'كتابة العقود':'التعليمات', plural=isContract?'العقود':'التعليمات';
 const docs=await api('/documents/'+type);
 const rows=docs.map(d=>`<tr><td><strong>${escapeHtml(d.title)}</strong></td><td>${escapeHtml((d.body||'').slice(0,180))}${(d.body||'').length>180?'…':''}</td><td>${escapeHtml(d.updated_at||d.created_at||'')}</td><td><button class="btn" onclick="editSavedDocument('${type}',${d.id})">فتح / تعديل</button> <button class="btn gold" onclick="printSavedDocument('${type}',${d.id})">طباعة</button> <button class="btn danger" onclick="deleteSavedDocument('${type}',${d.id})">حذف</button></td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead(title,isContract?'اكتب نصوص العقود واحفظها واطبعها عند الحاجة.':'اكتب تعليمات القاعة أو شروط الحجز واحفظها واطبعها عند الحاجة.',`<button class="btn primary" onclick="newSavedDocument('${type}')">＋ ${isContract?'عقد جديد':'تعليمات جديدة'}</button>`)+panel(plural+' المحفوظة',table(['العنوان','معاينة المحتوى','آخر تعديل','إجراءات'],rows));
}
async function renderInstructions(){return renderSavedDocuments('instruction')}
async function renderContracts(){return renderSavedDocuments('contract')}
function newSavedDocument(type){const isContract=type==='contract';formModal(isContract?'كتابة عقد جديد':'كتابة تعليمات جديدة',field('عنوان المستند','title','text','',{required:true,full:true})+field('النص الكامل','body','textarea','',{required:true,full:true}),'حفظ',async d=>{await api('/documents/'+type,{method:'POST',body:d});toast('تم الحفظ')})}
async function editSavedDocument(type,id){const d=(await api('/documents/'+type)).find(x=>Number(x.id)===Number(id));if(!d)return;formModal(type==='contract'?'تعديل العقد':'تعديل التعليمات',field('عنوان المستند','title','text',d.title,{required:true,full:true})+field('النص الكامل','body','textarea',d.body||'',{required:true,full:true}),'حفظ التعديلات',async values=>{await api('/documents/'+type+'/'+id,{method:'PUT',body:values});toast('تم حفظ التعديلات')})}
async function printSavedDocument(type,id){const d=(await api('/documents/'+type)).find(x=>Number(x.id)===Number(id));if(!d)return;const w=window.open('','_blank','width=900,height=700');if(!w){toast('اسمح بفتح النوافذ المنبثقة للطباعة',true);return}const safeTitle=escapeHtml(d.title),safeBody=escapeHtml(d.body||'');w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:Arial,sans-serif;margin:35px;color:#111;line-height:1.9}h1{border-bottom:2px solid #b59a5a;padding-bottom:12px}pre{font-family:inherit;white-space:pre-wrap;word-wrap:break-word;font-size:16px}.meta{color:#555;font-size:12px;margin-top:28px}</style></head><body><h1>${safeTitle}</h1><pre>${safeBody}</pre><div class="meta">${escapeHtml(state.company?.name||'')}</div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
async function deleteSavedDocument(type,id){if(!confirm('هل تريد حذف هذا المستند نهائيًا؟'))return;await api('/documents/'+type+'/'+id,{method:'DELETE'});toast('تم حذف المستند');await renderPage()}

async function renderMenus(){
 const groups=await api('/menu-groups');
 const rows=groups.map(g=>`<tr><td><strong>${escapeHtml(g.name)}</strong><br><small>${escapeHtml(g.description||'')}</small></td><td>${g.event_period==='نهاري'?'نهاري':'ليلي'}</td><td>${money(g.price)}<br><small>${g.price_mode==='fixed'?'سعر ثابت للمجموعة':'سعر الفرد'}</small></td><td>${(g.items||[]).length}</td><td>${(g.items||[]).map(i=>`<span class="ingredient-chip">${escapeHtml(i.name)} <small>(${escapeHtml(i.category)})</small></span>`).join(' ')||'—'}</td><td>${g.active?'<span class="status booked">نشطة</span>':'<span class="status">متوقفة</span>'}</td><td><button class="btn" onclick="editMenuGroup(${g.id})">تعديل المجموعة</button> <button class="btn primary" onclick="addMenuItem(${g.id})">＋ صنف</button></td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('مجموعات المنيو','كوّن مجموعة بسعر موحد وأضف داخلها أكلًا أو ساندوتشات أو جاتوه أو مشروبات',`<button class="btn primary" onclick="newMenuGroup()">＋ مجموعة منيو</button>`)+`<div class="notice">حدد هل السعر للفرد أم سعر ثابت للمجموعة. مثال: وجبة بـ 250 جنيه للفرد مع 120 فردًا = 30,000 جنيه. أما الباكدج الثابت فيُضاف مرة واحدة. تظهر المعادلة والمكونات في تفاصيل الحجز والإيصال.</div>`+panel('مجموعات المنيو ومكوناتها',table(['اسم المجموعة','نوع الفرح','سعر الفرد / المجموعة','عدد الأصناف','المكونات','الحالة','إجراءات'],rows));
}
function newMenuGroup(){formModal('إنشاء مجموعة منيو',field('اسم المجموعة','name','text','',{required:true})+field('نوع الفرح','event_period','select','نهاري',{options:[{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'ليلي'}]})+field('طريقة التسعير','price_mode','select','per_person',{options:[{value:'per_person',label:'سعر للفرد — يُضرب في عدد الأفراد'},{value:'fixed',label:'سعر ثابت للمجموعة'}]})+field('سعر الفرد / سعر المجموعة','price','number','0',{required:true,min:0,step:'0.01'})+field('وصف المجموعة','description','textarea','',{full:true}),'إنشاء المجموعة',async d=>{await api('/menu-groups',{method:'POST',body:d});toast('تم إنشاء المجموعة');await renderMenus()})}
async function editMenuGroup(id){const g=(await api('/menu-groups')).find(x=>x.id===id);if(!g)return;formModal('تعديل مجموعة المنيو',field('اسم المجموعة','name','text',g.name,{required:true})+field('نوع الفرح','event_period','select',g.event_period||'مسائي',{options:[{value:'نهاري',label:'نهاري'},{value:'مسائي',label:'ليلي'}]})+field('طريقة التسعير','price_mode','select',g.price_mode||'per_person',{options:[{value:'per_person',label:'سعر للفرد — يُضرب في عدد الأفراد'},{value:'fixed',label:'سعر ثابت للمجموعة'}]})+field('سعر الفرد / سعر المجموعة','price','number',g.price,{required:true,min:0,step:'0.01'})+field('وصف المجموعة','description','textarea',g.description,{full:true})+field('الحالة','active','select',g.active?1:0,{options:[{value:1,label:'نشطة'},{value:0,label:'متوقفة'}]}),'حفظ التعديلات',async d=>{await api('/menu-groups/'+id,{method:'PUT',body:d});toast('تم تحديث المجموعة')})}
async function addMenuItem(groupId){
 const cats=['أكل','ساندوتشات','جاتوه','بيبسي ومشروبات','حلويات','أخرى'];
 const options=cats.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
 const row=(id,n)=>`<section class="menu-item-entry" data-menu-item-row="${id}">
  <div class="menu-item-entry-head"><strong>الصنف ${n}</strong><div class="menu-item-entry-actions"><button type="button" class="btn primary menu-add-row" aria-label="إضافة صنف" title="إضافة صنف">＋</button><button type="button" class="btn menu-remove-row" aria-label="حذف الصنف" title="حذف الصنف" ${n===1?'disabled':''}>−</button></div></div>
  <div class="field-grid menu-item-entry-fields">
   <div class="field"><label>اسم الصنف</label><input name="item_name" type="text" required placeholder="مثال: فراخ مشوية"></div>
   <div class="field"><label>نوع الصنف</label><select name="item_category">${options}</select></div>
   <div class="field"><label>الكمية / العدد</label><input name="item_quantity" type="text" placeholder="مثال: 2 قطعة أو 1 زجاجة"></div>
   <div class="field full-width"><label>ملاحظات</label><textarea name="item_notes" rows="2"></textarea></div>
  </div>
 </section>`;
 modal('إضافة أصناف لمجموعة المنيو',`<form id="multiMenuItemsForm"><div class="menu-items-bulk-head"><span>أضف صنفًا أو أكثر داخل نفس المجموعة</span><button type="button" class="btn primary" id="addMenuItemRowTop">＋ إضافة صنف</button></div><div id="menuItemsEntryRows">${row(1,1)}</div><p class="muted">كل الأصناف هتتحفظ داخل مجموعة المنيو نفسها.</p><div class="form-actions"><button class="btn primary" type="submit">حفظ الأصناف</button><button class="btn" type="button" id="cancelMenuItems">إلغاء</button></div></form>`);
 let nextId=2;
 const host=$('#menuItemsEntryRows');
 const refresh=()=>{const rows=$$('#menuItemsEntryRows [data-menu-item-row]');rows.forEach((el,i)=>{el.querySelector('.menu-item-entry-head strong').textContent='الصنف '+(i+1);el.querySelector('.menu-remove-row').disabled=rows.length===1;});};
 const add=()=>{host.insertAdjacentHTML('beforeend',row(nextId,nextId));nextId++;refresh();host.lastElementChild?.querySelector('[name="item_name"]')?.focus();};
 $('#addMenuItemRowTop').onclick=add;
 host.addEventListener('click',e=>{if(e.target.closest('.menu-add-row')){add();return;}const remove=e.target.closest('.menu-remove-row');if(remove){remove.closest('[data-menu-item-row]')?.remove();refresh();}});
 $('#cancelMenuItems').onclick=closeModal;
 $('#multiMenuItemsForm').onsubmit=async e=>{e.preventDefault();const btn=$('button[type="submit"]',e.target);if(btn.disabled)return;const items=$$('#menuItemsEntryRows [data-menu-item-row]').map(el=>({name:el.querySelector('[name="item_name"]').value.trim(),category:el.querySelector('[name="item_category"]').value,quantity:el.querySelector('[name="item_quantity"]').value.trim(),notes:el.querySelector('[name="item_notes"]').value.trim()}));if(items.some(x=>!x.name)){toast('اكتب اسم كل صنف أو احذف الصف الفارغ.',true);return;}btn.disabled=true;try{await api('/menu-groups/'+groupId+'/items/bulk',{method:'POST',body:{items}});closeModal();toast('تم حفظ '+items.length+' أصناف داخل مجموعة المنيو');await renderMenus();}catch(err){toast(err.message,true);btn.disabled=false;}};
}
async function renderFinance(){
 const bookings=await api('/bookings?'+new URLSearchParams({status:state.user.role==='accountant'?'مؤكد':'all'}));
 if(state.user.role==='accountant'){
   const q=$('#accountSearch')?.value||'';
   const filtered=bookings.filter(b=>[b.customer_name,b.groom_name,b.bride_name,b.phone,b.hall_name].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())));
   const rows=filtered.map(b=>`<tr><td><strong>${escapeHtml(b.customer_name)}</strong><br><small>العريس: ${escapeHtml(b.groom_name||'—')} · العروسة: ${escapeHtml(b.bride_name||'—')}</small><br><small>${escapeHtml(b.phone||'')}</small></td><td>${escapeHtml(b.hall_name)}<br><small>${escapeHtml(b.venue||'')}</small></td><td>${dateFmt(b.event_date)} · ${escapeHtml(b.event_period)}</td><td>${money(b.total_due??((b.contract_total-b.discount)*1.15))}</td><td>${money(b.paid_total)}</td><td><strong>${money(b.remaining)}</strong></td><td><button class="btn primary" onclick="openBooking(${b.id})">فتح الحساب / تحصيل</button></td></tr>`).join('');
   $('#mainContent').innerHTML=pageHead('شاشة الحسابات والتحصيل','ابحث عن العميل، راجع بيانات الحجز وسجّل المبلغ المستلم',`<button class="btn" onclick="renderFinance()">تحديث القائمة</button>`)+
   `<section class="panel"><div class="toolbar"><input id="accountSearch" placeholder="ابحث باسم العميل أو العريس أو العروسة أو الموبايل" value="${escapeHtml(q)}"><button class="btn primary" id="accountSearchBtn">بحث</button></div>${table(['العميل وأصحاب المناسبة','القاعة','موعد الفرح','إجمالي المستحق','المدفوع سابقًا','المتبقي','إجراء'],rows,'لا توجد حجوزات مؤكدة مطابقة للبحث')}</section>`;
   $('#accountSearchBtn').onclick=renderFinance;$('#accountSearch').onkeydown=e=>{if(e.key==='Enter')renderFinance()};return;
 }
 const expenses=await api('/expenses');const income=bookings.reduce((s,b)=>s+Number(b.paid_total),0),expense=expenses.reduce((s,e)=>s+Number(e.amount),0);
 $('#mainContent').innerHTML=pageHead('الخزنة والتحصيل','متابعة المقبوضات والمصروفات',`<button class="btn primary" onclick="newExpense()">＋ تسجيل مصروف</button>`)+`<div class="grid metrics">${metric('إجمالي التحصيل المسجل',money(income),'من الحجوزات','#15945c')}${metric('المصروفات المسجلة',money(expense),'كل المصروفات','#e8485e')}${metric('صافي الحركة التقريبي',money(income-expense),'تحصيلات ناقص المصروفات')}</div>`+panel('الحجوزات والمبالغ المتبقية',table(['العميل','القاعة','تاريخ المناسبة','العقد','المدفوع','المتبقي','إجراء'],bookings.filter(b=>b.remaining>0).map(b=>`<tr><td>${escapeHtml(b.customer_name)}</td><td>${escapeHtml(b.hall_name)}</td><td>${dateFmt(b.event_date)}</td><td>${money(b.total_due??((b.contract_total-b.discount)*1.15))}</td><td>${money(b.paid_total)}</td><td><strong>${money(b.remaining)}</strong></td><td><button class="btn primary" onclick="openBooking(${b.id})">تحصيل</button></td></tr>`).join('')))+panel('آخر المصروفات',table(['التاريخ','البند','التصنيف','المبلغ','ملاحظات'],expenses.map(e=>`<tr><td>${dateFmt(e.expense_date)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.category)}</td><td>${money(e.amount)}</td><td>${escapeHtml(e.notes||'—')}</td></tr>`).join('')))}

function newExpense(){formModal('تسجيل مصروف',field('اسم المصروف','title','text','',{required:true})+field('المبلغ','amount','number','',{required:true,min:0.01,step:'0.01'})+field('التصنيف','category','select','عام',{options:['عام','تشغيل','صيانة','تسويق','رواتب','ضيافة','أخرى'].map(x=>({value:x,label:x}))})+field('التاريخ','expense_date','date',new Date().toISOString().slice(0,10),{required:true})+field('ملاحظات','notes','textarea','',{full:true}),'حفظ المصروف',async d=>{await api('/expenses',{method:'POST',body:d});toast('تم تسجيل المصروف')})}
async function renderReports(){const today=new Date().toISOString().slice(0,10),first=today.slice(0,7)+'-01';const d=await api('/reports/summary?from='+first+'&to='+today);
 $('#mainContent').innerHTML=pageHead('تقارير الإدارة','الإشغال والتحصيل والأداء، مع تصدير الحجوزات والتكاليف والخزنة والمتعهدين إلى Excel',`<a class="btn gold" href="#" onclick="downloadReport('bookings');return false">تصدير الحجوزات Excel</a><a class="btn" href="#" onclick="downloadReport('costs');return false">تصدير التكاليف</a><a class="btn" href="#" onclick="downloadReport('financial');return false">تصدير التقرير المالي</a><a class="btn" href="#" onclick="downloadReport('contractors');return false">تصدير المتعهدين</a><a class="btn" href="#" onclick="downloadReport('discounts');return false">تقرير الخصومات Excel</a><button class="btn" onclick="window.print()">طباعة / PDF</button>`)+`<section class="panel"><div class="field-grid">${field('من تاريخ','from','date',first)}${field('إلى تاريخ','to','date',today)}</div><div class="form-actions"><button class="btn primary" id="refreshReport">تحديث التقرير</button></div></section><div class="grid metrics">${metric('عدد الحجوزات',d.bookings.count,'خلال الفترة')}${metric('قيمة العقود',money(d.bookings.contracts),'بعد الخصومات')}${metric('التحصيل',money(d.bookings.collected),'المدفوعات المسجلة','#15945c')}${metric('المتبقي',money(d.bookings.remaining),'مبالغ قيد التحصيل','#e8485e')}</div><div class="grid two-col">${panel('أداء القاعات',table(['القاعة','الحجوزات','قيمة العقود','التحصيل'],d.byHall.map(h=>`<tr><td>${escapeHtml(h.hall_name)}</td><td>${h.bookings}</td><td>${money(h.contracts)}</td><td>${money(h.collected)}</td></tr>`).join('')))}${panel('مصادر العملاء',table(['المصدر','عدد العملاء'],d.bySource.map(s=>`<tr><td>${escapeHtml(s.source||'غير محدد')}</td><td>${s.count}</td></tr>`).join('')))}</div><div class="notice">صافي الحركة في الفترة لا يساوي بالضرورة صافي الربح المحاسبي؛ التقرير يخص التحصيلات والمصروفات المسجلة بالنظام.</div>`;
 $('#refreshReport').onclick=async()=>{const from=$('[name=from]').value,to=$('[name=to]').value;const r=await api('/reports/summary?from='+from+'&to='+to);toast('تم تحديث التقرير');await renderReports()};
}
const USER_PERMISSION_OPTIONS=[
 ['dashboard','لوحة التحكم'],['customers','العملاء والاستفسارات'],['followups','المتابعات'],['bookings','الحجوزات'],['cashierView','واجهة موظف التحصيل (تفاصيل الحجز والتحصيل فقط)'],['bookingDelete','حذف / أرشفة الحجوزات'],['calendar','تقويم الحجوزات'],
 ['halls','القاعات'],['packages','الباكدجات والأسعار'],['paragraphs','الإضافات'],['menus','المنيو والوجبات'],['instructions','التعليمات'],['contracts','كتابة العقود'],['finance','الحسابات والتحصيلات'],
 ['contractors','المتعهدون'],['costs','التكاليف'],['cashbox','الخزنة'],['discountRequests','طلبات الخصم والموافقات'],['reports','التقارير والتصدير'],
 ['users','إدارة المستخدمين والصلاحيات'],['logs','سجل العمليات Logs'],['settings','إعدادات الشركة والنسخ الاحتياطي']
];
function hasPermission(key){return state.user?.role==='admin'||(Array.isArray(state.user?.permissions)&&state.user.permissions.includes(key))}
function permissionFields(selected=[]){
 return `<div class="field full-width"><label>صلاحيات المستخدم — اختار الأقسام التي يقدر يدخل عليها</label><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:10px">${USER_PERMISSION_OPTIONS.map(([key,label])=>`<label style="display:flex;gap:9px;align-items:center;border:1px solid var(--border,#d9e2ef);padding:10px;border-radius:10px;background:var(--surface,#fff)"><input type="checkbox" name="perm_${key}" ${selected.includes(key)?'checked':''} style="width:18px;height:18px;flex-shrink:0"><span>${label}</span></label>`).join('')}</div><small class="muted">المستخدم لا يرى الأقسام غير المحددة، والخادم يتحقق من صلاحية الوصول أيضًا.</small></div>`;
}
function readPermissionsFromForm(d){d.permissions=USER_PERMISSION_OPTIONS.map(([key])=>key).filter(key=>d['perm_'+key]==='on');if(d.permissions.includes('cashierView'))d.permissions=['bookings','cashierView'];for(const [key] of USER_PERMISSION_OPTIONS)delete d['perm_'+key];return d}
async function renderUsers(){
 const users=await api('/admin/users');
 const rows=users.map(u=>{let p=[];try{p=JSON.parse(u.permissions_json||'[]')}catch(e){}return `<tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.job_title||'—')}</td><td><strong>${u.discount_limit_type==='amount'?money(u.discount_limit_value):Number(u.discount_limit_value||0)+'%'}</strong></td><td>${p.length} صلاحية</td><td>${u.active?'نشط':'متوقف'}</td><td>${dateFmt(String(u.created_at||'').slice(0,10))}</td><td><button class="btn primary" onclick="editUserDiscount(${u.id})">تعديل المستخدم والصلاحيات</button></td></tr>`}).join('');
 $('#mainContent').innerHTML=pageHead('المستخدمون والصلاحيات','اكتب المسمى الوظيفي كما يناسب شركتك، ثم حدد بنفسك الأقسام التي يستطيع الموظف الوصول إليها وحد الخصم الخاص به.',`<button class="btn primary" onclick="newUser()">＋ مستخدم جديد</button>`)+panel('حسابات المستخدمين والصلاحيات المخصصة',table(['اسم الموظف','اسم المستخدم','المسمى الوظيفي','حد الخصم','الصلاحيات','الحالة','تاريخ الإنشاء','الإجراء'],rows));
}
function discountPermissionFields(type='percent',value='20'){
 return field('نوع حد الخصم','discount_limit_type','select',type,{options:[{value:'percent',label:'نسبة مئوية من سعر الباكدج (%)'},{value:'amount',label:'مبلغ ثابت بالجنيه'}],required:true})+
 field('الحد المسموح','discount_limit_value','number',String(value),{required:true,min:0,step:'0.01'})+
 `<div class="field full-width"><div class="notice">إذا اختيرت النسبة، تُحسب من سعر الباكدج الأساسي. وإذا اختير مبلغ ثابت، فهو أقصى خصم بالجنيه. الخصم لا يتجاوز سعر الباكدج.</div></div>`;
}
function newUser(){
 const selected=['dashboard'];
 formModal('إضافة مستخدم',field('اسم الموظف','name','text','',{required:true})+field('اسم المستخدم','username','text','',{required:true})+field('كلمة المرور (10 أحرف على الأقل)','password','password','',{required:true})+field('المسمى الوظيفي — اكتب أي مسمى','job_title','text','',{required:true,placeholder:'مثال: مدير استقبال، محاسب تكاليف، مدير حسابات'})+permissionFields(selected)+discountPermissionFields('percent','0'),'إنشاء المستخدم',async raw=>{const d=readPermissionsFromForm(raw);await api('/admin/users',{method:'POST',body:d});toast('تم إنشاء المستخدم بالصلاحيات المحددة');await renderUsers()});
}
async function editUserDiscount(id){
 const u=(await api('/admin/users')).find(x=>Number(x.id)===Number(id));if(!u)return;
 let selected=[];try{selected=JSON.parse(u.permissions_json||'[]')}catch(e){}
 formModal('تعديل المستخدم: '+u.name,field('اسم الموظف','name','text',u.name,{required:true})+field('اسم المستخدم','username','text',u.username,{required:true})+field('المسمى الوظيفي — اكتب أي مسمى','job_title','text',u.job_title||'',{required:true})+permissionFields(selected)+discountPermissionFields(u.discount_limit_type||'percent',u.discount_limit_value??0),'حفظ المستخدم والصلاحيات',async raw=>{const d=readPermissionsFromForm(raw);await api('/admin/users/'+id,{method:'PUT',body:d});toast('تم تحديث المسمى الوظيفي والصلاحيات وحد الخصم');await renderUsers()});
}
async function renderLogs(){const data=await api('/logs');$('#mainContent').innerHTML=pageHead('سجل العمليات','مراجعة من نفذ كل عملية ومتى',`<button class="btn" onclick="renderLogs()">تحديث</button>`)+panel('آخر 500 عملية',table(['التاريخ','المستخدم','العملية','الكيان','رقم السجل','التفاصيل'],data.map(l=>`<tr><td>${escapeHtml(l.created_at)}</td><td>${escapeHtml(l.user_name)}</td><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.entity)}</td><td>${l.entity_id}</td><td>${escapeHtml(l.details)}</td></tr>`).join('')))}

function currentMonth(){return new Date().toISOString().slice(0,7)}
function monthBounds(month){const [y,m]=month.split('-').map(Number);return {from:`${month}-01`,to:`${month}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`}}
async function renderCalendar(){
 const month=$('#calendarMonth')?.value||currentMonth(),bounds=monthBounds(month);
 const bookings=await api('/calendar?'+new URLSearchParams(bounds));
 const [year,mon]=month.split('-').map(Number),first=new Date(year,mon-1,1),last=new Date(year,mon,0),offset=(first.getDay()+1)%7;
 const dayNames=['السبت','الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
 let cells='';
 for(let i=0;i<offset;i++)cells+='<div class="calendar-cell empty"></div>';
 for(let day=1;day<=last.getDate();day++){
   const date=`${month}-${String(day).padStart(2,'0')}`,items=bookings.filter(b=>b.event_date===date);
   const halls=new Set(items.map(b=>b.hall_id)).size;
   const dayItems=items.map(b=>`${b.hall_name} · ${b.event_period}`).join('، ');
   cells+=`<button class="calendar-cell ${items.length?'has-bookings':'free-day'}" onclick="openCalendarDay('${date}')"><span class="calendar-date">${day}</span><strong>${items.length?items.length+' حجز':'متاح'}</strong><small>${items.length?escapeHtml([...new Set(items.map(b=>b.event_period))].join(' / ')):'لا توجد حجوزات'}</small>${items.length?`<small>${halls} قاعة مشغولة</small>`:''}</button>`;
 }
 $('#mainContent').innerHTML=pageHead('تقويم الحجوزات','اعرف القاعات المشغولة والأيام المتاحة قبل تسجيل الحجز',`<button class="btn" onclick="renderCalendar()">تحديث</button>`)+
 `<section class="panel"><div class="toolbar"><label>الشهر <input id="calendarMonth" type="month" value="${month}"></label><span class="muted">كل يوم يوضح عدد الحجوزات والفترات النهارية والمسائية</span></div><div class="calendar-grid">${dayNames.map(x=>`<div class="calendar-weekday">${x}</div>`).join('')}${cells}</div></section>
 <section class="panel"><h3>ملخص الشهر</h3><div class="grid metrics">${metric('عدد الحجوزات',bookings.length,'خلال الشهر')}${metric('أيام بها حجوزات',new Set(bookings.map(b=>b.event_date)).size,'من أيام الشهر')}${metric('الأيام بدون حجوزات',last.getDate()-new Set(bookings.map(b=>b.event_date)).size,'قد تكون متاحة')}</div></section>`;
 $('#calendarMonth').onchange=renderCalendar;
}
async function openCalendarDay(date){
 const bookings=await api('/calendar?'+new URLSearchParams({from:date,to:date}));
 const rows=bookings.map(b=>`<tr><td>${escapeHtml(b.hall_name)}</td><td>${escapeHtml(b.event_period)}</td><td>${escapeHtml(b.groom_name||'—')} / ${escapeHtml(b.bride_name||'—')}</td><td>${escapeHtml(b.customer_name)}</td><td>${escapeHtml(b.status)}</td><td><button class="btn" onclick="openBooking(${b.id})">تفاصيل</button></td></tr>`).join('');
 modal('حجوزات يوم '+date,`<p>عدد الحجوزات: <strong>${bookings.length}</strong></p>${table(['القاعة','الفترة','العريس / العروسة','العميل','الحالة','فتح'],rows,'اليوم متاح ولا توجد حجوزات مسجلة')}`);
}
async function toggleMiniCalendar(){
 const panel=$('#miniCalendarPanel');if(!panel)return;
 if(!panel.classList.contains('hidden')){panel.classList.add('hidden');return}
 const today=new Date().toISOString().slice(0,10),items=await api('/calendar?'+new URLSearchParams({from:today,to:today}));
 panel.innerHTML=`<div class="mini-calendar-head"><strong>حجوزات اليوم · ${dateFmt(today)}</strong><button class="icon-btn" onclick="toggleMiniCalendar()">×</button></div><p>عدد الحجوزات: <strong>${items.length}</strong></p>${items.length?items.map(b=>`<button class="mini-calendar-item" onclick="openBooking(${b.id})"><strong>${escapeHtml(b.hall_name)}</strong><span>${escapeHtml(b.event_period)} · ${escapeHtml(b.groom_name||'—')} / ${escapeHtml(b.bride_name||'—')}</span></button>`).join(''):'<p class="muted">لا توجد حجوزات اليوم</p>'}<button class="btn primary full" onclick="go('calendar');$('#miniCalendarPanel').classList.add('hidden')">فتح التقويم الكامل</button>`;
 panel.classList.remove('hidden');
}

async function refreshNotifications(){
 try{
  const d=await api('/notifications');const b=$('#notificationBadge');
  if(b){b.textContent=d.unread||0;b.classList.toggle('hidden',!d.unread)}
  const newest=(d.items||[]).reduce((max,n)=>Math.max(max,Number(n.id)||0),0);
  if(!notificationsInitialized){lastNotificationId=newest;notificationsInitialized=true}
  else if(newest>lastNotificationId){
    const fresh=(d.items||[]).filter(n=>Number(n.id)>lastNotificationId).sort((a,b)=>Number(a.id)-Number(b.id));
    fresh.forEach(n=>toast(`${n.title}: ${n.message}` ,n.notification_type==='danger'));
    lastNotificationId=newest;
  }
  return d;
 }catch(e){return {unread:0,items:[]}}
}
async function openNotifications(){
 const d=await refreshNotifications();
 const body=(d.items||[]).map(n=>`<div style="padding:12px;border:1px solid var(--line);border-radius:12px;margin:8px 0;background:${n.is_read?'var(--panel)':'#fff8e8'}"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escapeHtml(n.title)}</strong><small>${escapeHtml(n.created_at||'')}</small></div><p style="margin:7px 0">${escapeHtml(n.message)}</p>${!n.is_read?`<button class="btn" onclick="markNotificationRead(${n.id})">تحديد كمقروء</button>`:''}${n.entity_type==='discount_request'&&hasPermission('discountRequests')?` <button class="btn primary" onclick="closeModal();go('discountRequests')">فتح طلبات الخصم</button>`:''}${n.entity_type==='discount_request'&&state.user.role!=='admin'?` <button class="btn primary" onclick="closeModal();go('bookings')">فتح الحجوزات لاستكمال التأكيد</button>`:''}</div>`).join('');
 modal('الإشعارات',`<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn" onclick="markAllNotificationsRead()">تحديد الكل كمقروء</button></div><div style="max-height:60vh;overflow:auto">${body||'<p class="muted">لا توجد إشعارات حتى الآن.</p>'}</div>`);
}
async function markNotificationRead(id){await api('/notifications/'+id+'/read',{method:'POST',body:{}});await openNotifications();await refreshNotifications()}
async function markAllNotificationsRead(){await api('/notifications/read-all',{method:'POST',body:{}});await openNotifications();await refreshNotifications()}

async function renderDiscountRequests(){
 const rows=await api('/discount-requests');$('#discountBadge').textContent=rows.filter(x=>x.status==='pending').length;
 const body=rows.map(r=>{
   const requested=r.requested_mode==='percent'?`${Number(r.requested_value||0)}% = ${money(r.requested_discount)}`:money(r.requested_discount);
   const status=r.status==='pending'?'بانتظار قرار المدير العام':r.status==='approved'?'تمت الموافقة':'تم الرفض';
   return `<tr><td><strong>#${r.booking_id} · ${escapeHtml(r.customer_name)}</strong><br><small>${escapeHtml(r.customer_phone||'')}</small><br>العريس: ${escapeHtml(r.groom_name||'—')}<br>العروسة: ${escapeHtml(r.bride_name||'—')}</td><td>${escapeHtml(r.hall_name)}<br>${dateFmt(r.event_date)} · ${escapeHtml(r.event_period)}<br>${Number(r.guest_count||0)} فرد</td><td>${money(r.base_contract_total)}</td><td><strong>${requested}</strong><br><small>المسموح: ${money(r.allowed_discount)} جنيه</small><br><small>المطبق حاليًا: ${money(r.discount)} جنيه</small></td><td>${escapeHtml(r.requested_by_name)}<br><small>سبب الطلب: ${escapeHtml(r.request_reason||'—')}</small></td><td><strong>${status}</strong>${r.reviewed_by_name?'<br><small>قرار بواسطة: '+escapeHtml(r.reviewed_by_name)+'</small>':''}${r.review_reason?'<br><small>سبب القرار: '+escapeHtml(r.review_reason)+'</small>':''}</td><td>${r.status==='pending'?`<button class="btn green" onclick="reviewDiscount(${r.id},'approved')">موافقة وتطبيق الخصم</button> <button class="btn danger" onclick="reviewDiscount(${r.id},'rejected')">رفض والإبقاء على المسموح</button>`:'—'}</td></tr>`;
 }).join('');
 $('#mainContent').innerHTML=pageHead('طلبات الخصم الاستثنائي','تظهر هنا تفاصيل الحجز والخصم المطلوب وحد الموظف. يجب تسجيل سبب القرار قبل الموافقة أو الرفض.',`<button class="btn" onclick="renderDiscountRequests()">تحديث</button>`)+panel('طلبات موافقة المدير العام',table(['تفاصيل العميل والحجز','القاعة والموعد','سعر الباكدج','الخصم المطلوب','طالب الطلب','القرار والسبب','الإجراء'],body,'لا توجد طلبات خصم'));
}
function refreshDiscountBadge(){api('/discount-requests').then(rows=>{$('#discountBadge').textContent=rows.filter(x=>x.status==='pending').length}).catch(()=>{})}
function reviewDiscount(id,decision){
 formModal(decision==='approved'?'الموافقة على طلب الخصم':'رفض طلب الخصم',field('سبب القرار (إجباري)','reason','textarea','',{required:true,full:true}),decision==='approved'?'تأكيد الموافقة':'تأكيد الرفض',async d=>{await api('/discount-requests/'+id+'/review',{method:'POST',body:{decision,reason:d.reason}});toast(decision==='approved'?'تمت الموافقة على الخصم وتطبيقه على الباكدج':'تم رفض طلب الخصم');await renderDiscountRequests()});
}
async function renderContractors(){
 const rows=await api('/contractors');
 const body=rows.map(c=>`<tr data-contractor-name="${escapeHtml((c.name||'').toLowerCase())}" data-contractor-phone="${escapeHtml(c.phone||'')}"><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.service_type||'—')}</td><td>${escapeHtml(c.phone||'—')}</td><td>${money(c.default_price)}</td><td>${money(c.total_due)}</td><td>${money(c.total_paid)}</td><td><strong>${money(c.remaining)}</strong></td><td><button class="btn" onclick="editContractor(${c.id})">تعديل</button> <button class="btn primary" onclick="contractorStatement(${c.id})">كشف حساب</button> <button class="btn green" onclick="payContractor(${c.id})">صرف</button></td></tr>`).join('');
 const filters=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><input id="contractorSearch" placeholder="ابحث باسم المتعهد أو الهاتف" style="min-width:240px"><label>من تاريخ <input type="date" id="contractorFrom"></label><label>إلى تاريخ <input type="date" id="contractorTo"></label><button class="btn" onclick="filterContractors()">تطبيق الفلتر</button><button class="btn" onclick="$('#contractorSearch').value='';$('#contractorFrom').value='';$('#contractorTo').value='';filterContractors()">مسح الفلتر</button></div><p class="muted">فلتر التاريخ يطبق على الخدمات داخل كشف حساب المتعهد بعد فتح كشف الحساب.</p>`;
 $('#mainContent').innerHTML=pageHead('المتعهدون والحسابات','ابحث باسم المتعهد أو الهاتف، واستخدم نطاق التاريخ عند مراجعة كشف الحساب',`<a class="btn gold" href="#" onclick="downloadReport('contractors');return false">تصدير حسابات المتعهدين Excel</a><button class="btn primary" onclick="newContractor()">＋ إضافة متعهد</button>`)+panel('بحث وفلترة المتعهدين',filters)+panel('المتعهدون',table(['اسم المتعهد','الخدمة','الهاتف','السعر الافتراضي','إجمالي المستحق','إجمالي المدفوع','المتبقي','إجراء'],body));
}
function filterContractors(){const q=($('#contractorSearch')?.value||'').trim().toLowerCase();$$('#mainContent tr[data-contractor-name]').forEach(r=>{r.style.display=(r.dataset.contractorName||'').includes(q)||(r.dataset.contractorPhone||'').includes(q)?'':'none'});}

function newContractor(){
 formModal('إضافة متعهد',field('اسم المتعهد','name','text','',{required:true})+field('نوع الخدمة','service_type','text','',{required:true})+field('رقم الهاتف','phone')+field('السعر الافتراضي','default_price','number','0',{min:0,step:'0.01'})+field('ملاحظات','notes','textarea','',{full:true}),'حفظ المتعهد',async d=>{await api('/contractors',{method:'POST',body:d});toast('تمت إضافة المتعهد')});
}
async function editContractor(id){
 const c=(await api('/contractors')).find(x=>x.id===id);if(!c)return;
 formModal('تعديل المتعهد',field('اسم المتعهد','name','text',c.name,{required:true})+field('نوع الخدمة','service_type','text',c.service_type)+field('رقم الهاتف','phone','text',c.phone)+field('السعر الافتراضي','default_price','number',c.default_price,{min:0,step:'0.01'})+field('ملاحظات','notes','textarea',c.notes,{full:true})+field('الحالة','active','select',c.active?1:0,{options:[{value:1,label:'نشط'},{value:0,label:'متوقف'}]}),'حفظ التعديلات',async d=>{await api('/contractors/'+id,{method:'PUT',body:d});toast('تم تحديث المتعهد')});
}
function filterContractorStatement(){const from=$('#contractorStatementFrom')?.value||'',to=$('#contractorStatementTo')?.value||'';$$('tr[data-contractor-service-date]').forEach(r=>{const d=r.dataset.contractorServiceDate||'';r.style.display=(!from||d>=from)&&(!to||d<=to)?'':'none'});}
async function contractorStatement(id){
 const s=await api('/contractors/'+id+'/statement'),svc=s.services.map(x=>`<tr data-contractor-service-date="${escapeHtml(x.event_date||'')}"><td>#${x.booking_id}</td><td>${dateFmt(x.event_date)}<br><small>${new Date(x.event_date+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long'})}</small></td><td>${escapeHtml(x.event_period||'—')}</td><td>${escapeHtml(x.hall_name)}</td><td>${escapeHtml(x.groom_name||'—')} / ${escapeHtml(x.bride_name||'—')}</td><td>${escapeHtml(x.service_name)}</td><td>${money(x.price)}</td></tr>`).join(''),pays=s.payments.map(x=>`<tr><td>${dateFmt(x.payment_date)}</td><td>${money(x.amount)}</td><td>${escapeHtml(x.method)}</td><td>${escapeHtml(x.paid_by_name)}</td><td><button class="btn" onclick="printContractorReceipt(${id},${x.id})">طباعة إيصال</button></td></tr>`).join('');
 modal('كشف حساب المتعهد: '+s.contractor.name,`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:end"><a class="btn gold" href="#" onclick="downloadReport('contractor-statement',\${id});return false">تصدير كشف الحساب Excel</a><button class="btn" onclick="window.print()">طباعة الكشف</button><label>من تاريخ <input type="date" id="contractorStatementFrom"></label><label>إلى تاريخ <input type="date" id="contractorStatementTo"></label><button class="btn primary" onclick="filterContractorStatement()">تطبيق</button><strong>المتعهد: ${escapeHtml(s.contractor.name)}</strong></div><div class="grid metrics">${metric('عدد الخدمات / الحفلات',s.services.length,'إجمالي التكليفات')}${metric('إجمالي المستحق',money(s.total_due),'قيمة كل الخدمات')}${metric('إجمالي ما تم صرفه',money(s.total_paid),'دفعات المتعهد')}${metric('المتبقي',money(s.remaining),'رصيد مستحق')}</div><h3>تفاصيل الحفلات والخدمات</h3>${table(['رقم الحجز','تاريخ الفرح / اليوم','الفترة','القاعة','العريس / العروسة','الخدمة','المستحق'],svc)}<h3>سجل الصرف</h3>${table(['التاريخ','المبلغ','الطريقة','الموظف','الإيصال'],pays)}`);
}
async function payContractor(id){
 const c=(await api('/contractors')).find(x=>x.id===id);if(!c)return;
 formModal('صرف مستحقات '+c.name,field('المبلغ المصروف','amount','number','',{required:true,min:0.01,step:'0.01',max:c.remaining})+field('طريقة الدفع','method','select','كاش',{options:['كاش','إنستا باي','فيزا','محفظة إلكترونية','تحويل بنكي'].map(x=>({value:x,label:x}))})+field('تاريخ الصرف','payment_date','date',new Date().toISOString().slice(0,10),{required:true})+field('ملاحظات','notes','textarea','',{full:true}),'تأكيد الصرف',async d=>{const receiptWindow=window.open('about:blank','_blank','width=420,height=700');const result=await api('/contractors/'+id+'/payments',{method:'POST',body:d});toast('تم تسجيل الصرف');await renderContractors();printContractorReceipt(id,result.id,receiptWindow)});
}

async function printContractorReceipt(contractorId,paymentId,receiptWindow=null){
 const d=await api(`/contractors/${contractorId}/payments/${paymentId}/receipt`);
 const w=receiptWindow||window.open('','_blank','width=420,height=700');if(!w){toast('اسمح بفتح نافذة الطباعة لإصدار الإيصال',true);return}
 const esc=escapeHtml;
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إيصال صرف متعهد</title><style>body{font-family:Tahoma,Arial,sans-serif;width:300px;margin:10px auto;color:#111;font-size:12px}h2,h3,p{text-align:center;margin:5px 0}.line{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #aaa;padding:7px 0}.total{font-size:16px;font-weight:bold}small{font-size:10px}@media print{@page{size:80mm auto;margin:4mm}}</style><h2>${esc(d.company?.name||'قاعة الأفراح')}</h2><h3>إيصال صرف مستحقات متعهد</h3><p>رقم الإيصال: ${d.payment.id}</p><p>${esc(d.payment.payment_date)}</p><hr><div class="line"><span>اسم المتعهد</span><b>${esc(d.contractor.name)}</b></div><div class="line"><span>الخدمة</span><b>${esc(d.contractor.service_type||'—')}</b></div><div class="line"><span>المبلغ المصروف</span><b>${money(d.payment.amount)}</b></div><div class="line"><span>طريقة الدفع</span><b>${esc(d.payment.method)}</b></div><div class="line"><span>إجمالي المستحق</span><b>${money(d.total_due)}</b></div><div class="line"><span>إجمالي المدفوع بعد الصرف</span><b>${money(d.total_paid)}</b></div><div class="line total"><span>المتبقي للمتعهد</span><b>${money(d.remaining)}</b></div><div class="line"><span>موظف الصرف</span><b>${esc(d.payment.paid_by_name)}</b></div><p>ملاحظات: ${esc(d.payment.notes||'—')}</p><hr><p>توقيع المستلم: __________</p><p><small>إيصال صادر من نظام إدارة القاعات</small></p><script>window.onload=()=>window.print()<\/script></html>`);
 w.document.close();
}

async function renderBookingContractorsInline(bookingId){
 try{const rows=await api('/bookings/'+bookingId+'/contractors');const el=$('#bookingContractors-'+bookingId);if(!el)return;
 el.innerHTML=table(['المتعهد','الخدمة','السعر','ملاحظات'],rows.map(x=>`<tr><td>${escapeHtml(x.contractor_name)}</td><td>${escapeHtml(x.service_name)}</td><td>${money(x.price)}</td><td>${escapeHtml(x.notes||'—')}</td></tr>`).join(''),'لم يتم إسناد خدمات لمتعهدين لهذا الحجز')}catch(e){}
}
async function addBookingContractor(bookingId){
 const contractors=(await api('/contractors')).filter(c=>c.active);
 if(!contractors.length){toast('أضف المتعهد أولًا من قسم المتعهدين',true);return}
 const options=contractors.map(c=>({value:c.id,label:c.name+' · '+c.service_type+' · '+money(c.default_price)}));
 formModal('إضافة متعهد إلى الحجز',field('المتعهد','contractor_id','select','',{required:true,options})+field('الخدمة','service_name','text','',{required:true})+field('سعر المتعهد لهذه الحفلة','price','number','0',{required:true,min:0,step:'0.01'})+field('ملاحظات','notes','textarea','',{full:true}),'حفظ الخدمة',async d=>{await api('/bookings/'+bookingId+'/contractors',{method:'POST',body:d});toast('تم ربط الخدمة بالمتعهد');await openBooking(bookingId)});
}
async function renderCosts(){
 const [costs,bookings]=await Promise.all([api('/costs'),api('/bookings')]);
 const total=costs.reduce((s,x)=>s+Number(x.amount),0);
 const rows=costs.map(x=>`<tr><td>${dateFmt(x.cost_date)}</td><td>${escapeHtml(x.title)}</td><td>${escapeHtml(x.category)}</td><td>${x.booking_id?'#'+x.booking_id:'عام'}</td><td>${money(x.amount)}</td><td>${escapeHtml(x.created_by_name)}</td><td>${escapeHtml(x.notes||'—')}</td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('التكاليف','تسجيل التكاليف التشغيلية أو المرتبطة بحفلة محددة',`<a class="btn gold" href="#" onclick="downloadReport('costs');return false">تصدير التكاليف Excel</a><button class="btn primary" onclick="newCost()">＋ إضافة تكلفة</button>`)+`<div class="grid metrics">${metric('إجمالي التكاليف المسجلة',money(total),'كل السجلات')}</div>`+panel('سجل التكاليف',table(['التاريخ','البيان','التصنيف','الحجز','المبلغ','الموظف','ملاحظات'],rows));
}
async function newCost(){
 const bookings=await api('/bookings');
 formModal('إضافة تكلفة',field('بيان التكلفة','title','text','',{required:true})+field('التصنيف','category','select','تشغيل',{options:['تشغيل','معدات','عمالة','صيانة','مرافق','تسويق','أخرى'].map(x=>({value:x,label:x}))})+field('ربط بحجز (اختياري)','booking_id','select','',{options:[{value:'',label:'تكلفة عامة'},...bookings.map(b=>({value:b.id,label:'#'+b.id+' · '+(b.groom_name||b.customer_name)+' · '+dateFmt(b.event_date)}))]})+field('المبلغ','amount','number','',{required:true,min:0.01,step:'0.01'})+field('التاريخ','cost_date','date',new Date().toISOString().slice(0,10),{required:true})+field('ملاحظات','notes','textarea','',{full:true}),'حفظ التكلفة',async d=>{if(!d.booking_id)delete d.booking_id;await api('/costs',{method:'POST',body:d});toast('تم تسجيل التكلفة');await renderCosts()});
}
async function renderCashbox(){
 const c=await api('/cashbox'),rows=c.transactions.map(x=>`<tr><td>${dateFmt(String(x.transaction_date).slice(0,10))}</td><td>${escapeHtml(x.kind)}</td><td>${escapeHtml(x.customer_name||'—')}</td><td>${escapeHtml(x.hall_name||'—')}</td><td>${x.booking_id?`<a href="#" onclick="openBooking(${Number(x.booking_id)});return false">حجز #${Number(x.booking_id)}</a>`:'—'}</td><td>${x.event_date?dateFmt(x.event_date):'—'}</td><td>${money(x.amount)}</td><td>${escapeHtml(x.method||'—')}</td><td>${escapeHtml(x.reference||'—')}</td><td>${escapeHtml(x.notes||'—')}</td></tr>`).join('');
 $('#mainContent').innerHTML=pageHead('الخزنة','كل حركة مرتبطة باسم العميل والقاعة والحجز عند توفرها، والتأمين ظاهر منفصلًا عن تكلفة الحفل',`<a class="btn gold" href="#" onclick="downloadReport('financial');return false">تصدير التقرير المالي Excel</a><button class="btn primary" onclick="newCashTransaction()">＋ حركة خزنة</button>`)+`<div class="grid metrics">${metric('تحصيلات الحجوزات',money(c.bookingIncome),'تُخصم من تكلفة الحفل')}${metric('تأمينات مستلمة',money(c.insuranceIncome||0),'مبالغ مستردة خارج تكلفة الحفل')}${metric('تأمينات مردودة',money(c.insuranceRefunds||0),'استردادات للعملاء')}${metric('صرف المتعهدين',money(c.contractorOut),'خارج الخزنة')}${metric('المصروفات',money(c.expenseOut),'المصروفات العامة')}${metric('التكاليف',money(c.costsOut),'التكاليف التشغيلية')}${metric('صافي حركة النقدية',money(c.net),'يشمل استلام ورد التأمين')}</div>`+panel('سجل حركة الخزنة',table(['التاريخ','البيان','العميل','القاعة','الحجز','تاريخ الحفل','المبلغ','الطريقة','مرجع','ملاحظات'],rows));
}
function newCashTransaction(){
 formModal('حركة خزنة جديدة',field('نوع الحركة','transaction_type','select','in',{options:[{value:'in',label:'إيراد / وارد'},{value:'out',label:'مصروف / صادر'}]})+field('البيان','category','text','',{required:true})+field('المبلغ','amount','number','',{required:true,min:0.01,step:'0.01'})+field('طريقة الدفع','method','select','كاش',{options:['كاش','إنستا باي','فيزا','محفظة إلكترونية','تحويل بنكي'].map(x=>({value:x,label:x}))})+field('التاريخ','transaction_date','date',new Date().toISOString().slice(0,10),{required:true})+field('رقم مرجعي','reference')+field('ملاحظات','notes','textarea','',{full:true}),'حفظ الحركة',async d=>{await api('/cashbox',{method:'POST',body:d});toast('تم تسجيل حركة الخزنة');await renderCashbox()});
}

async function renderSettings(){
 $('#mainContent').innerHTML=pageHead('إعدادات الشركة','تخصيص اسم الشركة والشعار، وإدارة النسخ الاحتياطية والاستعادة')+
 `<section class="panel"><form id="settingsForm"><div class="field-grid">${field('اسم الشركة','name','text',state.company.name,{required:true})}${field('رابط الشعار','logo_url','url',state.company.logo_url||'')}${field('العملة','currency','select',state.company.currency||'EGP',{options:[{value:'EGP',label:'جنيه مصري EGP'},{value:'SAR',label:'ريال سعودي SAR'},{value:'AED',label:'درهم إماراتي AED'}]})}</div><div class="form-actions"><button class="btn primary">حفظ الإعدادات</button></form></section>`+
 `<section class="panel"><h2>النسخ الاحتياطي والاستعادة</h2><p class="muted">نزّل نسخة احتياطية قبل التحديث أو قبل استعادة نسخة قديمة. عند الاستعادة، سيحتفظ النظام تلقائيًا بنسخة من قاعدة البيانات الحالية قبل استبدالها.</p><div class="form-actions"><a class="btn gold" href="/api/admin/backup">تنزيل نسخة احتياطية الآن</a></div><hr><form id="restoreForm"><div class="field-grid"><div class="field full-width"><label for="restoreFile">ملف النسخة الاحتياطية (.sqlite أو .db)</label><input id="restoreFile" type="file" accept=".sqlite,.db,application/octet-stream" required></div></div><div class="notice discount-approval-required"><strong>تنبيه مهم قبل الاستعادة</strong><br>سيتم استبدال البيانات الحالية بمحتوى النسخة المختارة. احرص على اختيار الملف الصحيح. سيتم إنشاء نسخة تلقائية من قاعدة البيانات الحالية قبل الاستعادة، ثم يحتاج السيرفر إلى إعادة تشغيل.</div><div class="form-actions"><button class="btn danger" id="restoreButton" type="submit">استعادة النسخة الاحتياطية</button></div></form><p id="restoreStatus" class="muted"></p></section>`+
 `<section class="panel"><h2>ملاحظات النشر الآمن</h2><p class="muted">غيّر JWT_SECRET، واستخدم HTTPS، واضبط نسخًا احتياطية دورية. بيانات النظام محفوظة في data/wedding-halls.sqlite.</p></section>`;
 $('#settingsForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());state.company=await api('/admin/company',{method:'PUT',body:d});showApp();toast('تم حفظ الإعدادات')};
 $('#restoreForm').onsubmit=async e=>{
   e.preventDefault();
   const file=$('#restoreFile').files[0];if(!file){toast('اختار ملف النسخة الاحتياطية أولًا',true);return}
   const yes=window.confirm(`تأكيد استعادة النسخة من الملف "${file.name}"؟ سيتم استبدال البيانات الحالية، مع حفظ نسخة تلقائية منها قبل الاستعادة.`);
   if(!yes)return;
   const btn=$('#restoreButton'),status=$('#restoreStatus');btn.disabled=true;btn.textContent='جارٍ فحص النسخة واستعادتها…';status.textContent='يتم التحقق من سلامة قاعدة البيانات. لا تغلق النافذة.';
   try{
     const response=await fetch('/api/admin/restore',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:file});
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||'فشلت الاستعادة');
     status.textContent=result.message;
     window.alert(result.message+'\\n\\nاضغط موافق، ثم شغّل START_WINDOWS.bat مرة أخرى.');
   }catch(err){
     status.textContent='لم تتم الاستعادة: '+err.message;
     toast(err.message,true);btn.disabled=false;btn.textContent='استعادة النسخة الاحتياطية';
   }
 };
}
function quickAdd(){modal('إضافة سريعة',`<div class="quick-links" style="flex-direction:column"><button class="btn primary" id="qaCustomer">＋ استفسار جديد</button><button class="btn green" id="qaVisit">＋ زيارة مباشرة</button><button class="btn gold" id="qaBooking">＋ حجز جديد</button><button class="btn" id="qaFollow">＋ متابعة جديدة</button></div>`);$('#qaCustomer').onclick=()=>newCustomer();$('#qaVisit').onclick=()=>newCustomer('visit');$('#qaBooking').onclick=()=>newBooking();$('#qaFollow').onclick=()=>newFollowup()}
window.go=go;window.renderPage=renderPage;window.toggleMiniCalendar=toggleMiniCalendar;window.openCalendarDay=openCalendarDay;window.reviewDiscount=reviewDiscount;window.newContractor=newContractor;window.editContractor=editContractor;window.contractorStatement=contractorStatement;window.payContractor=payContractor;window.addBookingContractor=addBookingContractor;window.newCost=newCost;window.newCashTransaction=newCashTransaction;window.quickAdd=quickAdd;window.newCustomer=newCustomer;window.editCustomer=editCustomer;window.newBooking=newBooking;window.openBooking=openBooking;window.addPayment=addPayment;window.printPaymentReceipt=printPaymentReceipt;window.changeBookingStatus=changeBookingStatus;window.printBooking=printBooking;window.banquetPrint=banquetPrint;window.newHall=newHall;window.editHall=editHall;window.newPackage=newPackage;window.editPackage=editPackage;window.newParagraph=newParagraph;window.editParagraph=editParagraph;window.newMenuGroup=newMenuGroup;window.editMenuGroup=editMenuGroup;window.addMenuItem=addMenuItem;window.newFollowup=newFollowup;window.completeFollowup=completeFollowup;window.newExpense=newExpense;window.newUser=newUser;window.$=$;
init();

window.openNotifications=openNotifications;window.markNotificationRead=markNotificationRead;window.markAllNotificationsRead=markAllNotificationsRead;

window.printContractorReceipt=printContractorReceipt;

setInterval(()=>{if(state.user)refreshNotifications()},5000);
