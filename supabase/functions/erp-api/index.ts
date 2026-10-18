import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

const allowedTables = new Set(["halls", "customers", "bookings", "payments", "followups"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    return reply(200, { ok: true, service: "wedding-halls-erp-api", version: "0.1.0" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(500, { error: "Server configuration is incomplete" });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply(401, { error: "يلزم تسجيل الدخول" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: "جلسة الدخول غير صالحة" });

  // company_id and role must be assigned by a trusted administrator in app_metadata.
  const companyId = Number(authData.user.app_metadata?.company_id);
  const role = String(authData.user.app_metadata?.role ?? "employee");
  if (!Number.isSafeInteger(companyId) || companyId < 1) {
    return reply(403, { error: "الحساب غير مرتبط بشركة. يلزم إعداد company_id في بيانات الحساب الإدارية." });
  }

  const pathname = new URL(req.url).pathname.replace(/^.*\/erp-api\/?/, "").replace(/^\/+|\/+$/g, "");
  const parts = pathname.split("/").filter(Boolean);
  const resource = parts[0] ?? "";
  if (!allowedTables.has(resource)) return reply(404, { error: "المسار غير موجود" });

  const readableRoles = new Set(["admin", "manager", "reception", "accounts", "employee"]);
  if (!readableRoles.has(role)) return reply(403, { error: "ليس لديك صلاحية" });

  try {
    if (req.method === "GET" && parts.length === 1) {
      let query = admin.from(resource).select("*").eq("company_id", companyId).limit(500);
      if (resource === "bookings") query = query.order("event_date", { ascending: true });
      else query = query.order("id", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return reply(200, { data: data ?? [] });
    }

    if (req.method === "POST" && resource === "customers") {
      if (!["admin", "manager", "reception"].includes(role)) return reply(403, { error: "لا تملك صلاحية إضافة العملاء" });
      const input = await req.json();
      const name = String(input.name ?? "").trim();
      const phone = String(input.phone ?? "").trim();
      if (!name || !phone) return reply(400, { error: "اسم العميل ورقم الهاتف مطلوبان" });
      const { data, error } = await admin.from("customers").insert({
        company_id: companyId,
        name,
        phone,
        groom_name: String(input.groom_name ?? ""),
        bride_name: String(input.bride_name ?? ""),
        event_type: String(input.event_type ?? "حفل زفاف"),
        venue: String(input.venue ?? ""),
        hall_id: input.hall_id ? Number(input.hall_id) : null,
        event_date: String(input.event_date ?? ""),
        event_period: String(input.event_period ?? ""),
        source: String(input.source ?? ""),
        status: "new",
        budget: Math.max(0, Number(input.budget ?? 0)),
        notes: String(input.notes ?? ""),
        created_by: Number(authData.user.app_metadata?.legacy_user_id ?? 0) || null,
      }).select("*").single();
      if (error) throw error;
      return reply(201, { data });
    }

    if (req.method === "POST" && resource === "bookings") {
      if (!["admin", "manager", "reception"].includes(role)) return reply(403, { error: "لا تملك صلاحية إنشاء الحجوزات" });
      const input = await req.json();
      const customerId = Number(input.customer_id);
      const hallId = Number(input.hall_id);
      const eventDate = String(input.event_date ?? "");
      const eventPeriod = String(input.event_period ?? "");
      if (!Number.isSafeInteger(customerId) || customerId < 1 || !Number.isSafeInteger(hallId) || hallId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !["نهاري", "مسائي"].includes(eventPeriod)) {
        return reply(400, { error: "بيانات الحجز الأساسية غير مكتملة أو غير صحيحة" });
      }
      const [{ data: customer, error: customerError }, { data: hall, error: hallError }] = await Promise.all([
        admin.from("customers").select("id").eq("id", customerId).eq("company_id", companyId).maybeSingle(),
        admin.from("halls").select("id,capacity").eq("id", hallId).eq("company_id", companyId).eq("active", 1).maybeSingle(),
      ]);
      if (customerError) throw customerError;
      if (hallError) throw hallError;
      if (!customer || !hall) return reply(400, { error: "العميل أو القاعة غير موجودين ضمن الشركة" });
      const guestCount = Math.max(0, Number(input.guest_count ?? 0));
      if (Number(hall.capacity ?? 0) > 0 && guestCount > Number(hall.capacity)) return reply(400, { error: `سعة القاعة ${hall.capacity} فرد فقط` });
      const { data: conflicts, error: conflictError } = await admin.from("bookings").select("id")
        .eq("company_id", companyId).eq("hall_id", hallId).eq("event_date", eventDate)
        .eq("event_period", eventPeriod).not("status", "in", '("ملغي","مرفوض")').or("deleted_at.is.null,deleted_at.eq.").limit(1);
      if (conflictError) throw conflictError;
      if (conflicts?.length) return reply(409, { error: "القاعة محجوزة بالفعل في نفس التاريخ والفترة" });
      const { data, error } = await admin.from("bookings").insert({
        company_id: companyId, customer_id: customerId, hall_id: hallId,
        event_date: eventDate, event_period: eventPeriod,
        guest_count: guestCount,
        event_type: String(input.event_type ?? "حفل زفاف"),
        contract_total: Math.max(0, Number(input.contract_total ?? 0)),
        base_contract_total: Math.max(0, Number(input.contract_total ?? 0)),
        discount: Math.max(0, Number(input.discount ?? 0)),
        paid_total: 0, status: "مبدئي", notes: String(input.notes ?? ""),
        created_by: Number(authData.user.app_metadata?.legacy_user_id ?? 0) || null,
      }).select("*").single();
      if (error) throw error;
      return reply(201, { data });
    }

    return reply(405, { error: "العملية غير مدعومة في هذه النسخة المرحلية" });
  } catch (error) {
    console.error("erp-api request failed", { resource, message: error instanceof Error ? error.message : "unknown" });
    return reply(500, { error: "تعذر إتمام الطلب. راجع إعدادات قاعدة البيانات وسجلات الوظيفة." });
  }
});
