# مصفوفة نقل واجهات API إلى Supabase

> هذه المصفوفة مرجع تنفيذ للفرع `feat/github-pages-supabase-only`. لا تعني أن المسارات نُقلت أو أن النظام جاهز للنشر. المصدر الأصلي هو `server.js` في `main`، ويظل محفوظًا.

## شرط قبول كل مسار
- مصادقة صحيحة، وصلاحية الدور، وعزل حسب `company_id`.
- تحقق من المدخلات ومعالجة الأخطاء.
- لا تُكشف مفاتيح الخدمة للمتصفح.
- اختبار القراءة والإنشاء والتعديل والحذف بحسب المسار.
- التأكد من أن التغييرات المالية والحجوزات ذرية ولا تسمح بتكرار الحجز أو تجاوز المبالغ.
- تحديث الواجهة فقط بعد اجتياز الاختبار.

## المسارات المطلوبة

### تسجيل الدخول والجلسة
- [ ] `POST /api/auth/login`
- [ ] `POST /api/auth/logout`
- [ ] `GET /api/auth/me`

### لوحة التحكم والقاعات والعملاء والمتابعات
- [ ] `GET /api/dashboard`
- [ ] `GET /api/halls`
- [ ] `POST /api/halls`
- [ ] `PUT /api/halls/:id`
- [ ] `DELETE /api/halls/:id`
- [ ] `GET /api/customers`
- [ ] `POST /api/customers`
- [ ] `PUT /api/customers/:id`
- [ ] `GET /api/followups`
- [ ] `POST /api/followups`
- [ ] `PATCH /api/followups/:id/complete`

### الحجوزات والعقود والتأمين والتحصيل
- [ ] `GET /api/bookings`
- [ ] `POST /api/bookings`
- [ ] `GET /api/bookings/:id`
- [ ] `GET /api/bookings/:id/invitation`
- [ ] `POST /api/bookings/:id/archive`
- [ ] `PATCH /api/bookings/:id/status`
- [ ] `POST /api/bookings/:id/payments`
- [ ] `POST /api/bookings/:id/insurance`
- [ ] `GET /api/bookings/:id/insurance`
- [ ] `POST /api/insurance/:id/refund`
- [ ] `GET /api/insurance/:id/receipt`
- [ ] `GET /api/insurance-refunds/:id/receipt`
- [ ] `GET /api/payments/:id/receipt`
- [ ] `GET /api/calendar`

### المصروفات والمقاولون والتكاليف والخزنة
- [ ] `GET /api/expenses`
- [ ] `POST /api/expenses`
- [ ] `GET /api/contractors`
- [ ] `POST /api/contractors`
- [ ] `PUT /api/contractors/:id`
- [ ] `GET /api/bookings/:id/contractors`
- [ ] `POST /api/bookings/:id/contractors`
- [ ] `GET /api/contractors/:id/statement`
- [ ] `POST /api/contractors/:id/payments`
- [ ] `GET /api/contractors/:id/payments/:paymentId/receipt`
- [ ] `GET /api/contractors/:id/statement.csv`
- [ ] `GET /api/reports/contractors.csv`
- [ ] `GET /api/reports/costs.csv`
- [ ] `GET /api/reports/financial.csv`
- [ ] `GET /api/costs`
- [ ] `POST /api/costs`
- [ ] `GET /api/cashbox`
- [ ] `POST /api/cashbox`

### التقارير والإدارة
- [ ] `GET /api/reports/summary`
- [ ] `GET /api/reports/discounts.csv`
- [ ] `GET /api/reports/bookings.csv`
- [ ] `GET /api/admin/users`
- [ ] `POST /api/admin/users`
- [ ] `PUT /api/admin/users/:id`
- [ ] `PUT /api/admin/company`
- [ ] `GET /api/discount-requests`
- [ ] `POST /api/discount-requests/:id/review`
- [ ] `GET /api/notifications`
- [ ] `POST /api/notifications/:id/read`
- [ ] `POST /api/notifications/read-all`
- [ ] `GET /api/logs`
- [ ] `GET /api/admin/backup`
- [ ] `POST /api/admin/restore`

### الباقات والمستندات والإضافات والمنيو
- [ ] `GET /api/packages`
- [ ] `POST /api/packages`
- [ ] `PUT /api/packages/:id`
- [ ] `GET /api/documents/:type`
- [ ] `POST /api/documents/:type`
- [ ] `PUT /api/documents/:type/:id`
- [ ] `DELETE /api/documents/:type/:id`
- [ ] `GET /api/paragraphs`
- [ ] `POST /api/paragraphs`
- [ ] `PUT /api/paragraphs/:id`
- [ ] `GET /api/menu-groups`
- [ ] `POST /api/menu-groups`
- [ ] `PUT /api/menu-groups/:id`
- [ ] `POST /api/menu-groups/:id/items/bulk`
- [ ] `POST /api/menu-groups/:id/items`
- [ ] `PUT /api/menu-items/:id`
- [ ] `DELETE /api/menu-items/:id`

### روابط الدخول العامة والفحص
- [ ] `GET /healthz`
- [ ] `GET /entry/:token`
- [ ] `POST /entry/:token/use`

## حالة النشر الحالية
- واجهة المستخدم ما زالت تستدعي `/api/*` على نفس الأصل، وتعتمد على جلسة خادم Express.
- GitHub Pages لا يشغّل `server.js` أو SQLite.
- توجد خدمة اختبار منفصلة على Supabase باسم `erp-health`، لكنها ليست API النظام.
- لا يتم تفعيل نشر GitHub Pages للواجهة الأصلية قبل تحويل تسجيل الدخول وجميع المسارات اللازمة واختبارها.
- يجب نقل سجل المراجعة التاريخي (107 سجلات من النسخة المحلية) في خطوة مستقلة مع مطابقة الأعداد، وعدم حذف المصدر المحلي.
