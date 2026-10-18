'use strict';
const crypto = require('crypto');
const TABLES = [
  'companies','users','halls','customers','bookings','packages','paragraphs','saved_documents',
  'menu_groups','menu_items','booking_paragraphs','booking_menu_groups','payments','expenses',
  'followups','discount_requests','notifications','contractors','booking_contractors',
  'contractor_payments','costs','cash_transactions','audit_logs','booking_insurance','insurance_refunds'
];
const ORDER = TABLES;
function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function makeSupabaseSync(db, supabase, options = {}) {
  const instanceId = process.env.APP_INSTANCE_ID || 'render-main';
  let running = false;
  async function syncOnce() {
    if (running) return { skipped: true };
    running = true;
    let synced = 0;
    try {
      const companies = db.prepare('SELECT id, slug FROM companies').all();
      const slugById = new Map(companies.map(c => [Number(c.id), c.slug]));
      for (const table of ORDER) {
        const rows = db.prepare(`SELECT * FROM "${table}"`).all();
        for (const row of rows) {
          const companyId = row.company_id == null ? null : Number(row.company_id);
          const companySlug = table === 'companies' ? row.slug : (slugById.get(companyId) || 'default');
          const recordId = Number(row.id);
          const payload = row;
          const { error } = await supabase.from('erp_sync_records').upsert({
            company_slug: companySlug,
            table_name: table,
            record_id: recordId,
            payload,
            row_hash: stableHash(payload),
            source_instance: instanceId,
            updated_at: new Date().toISOString(),
            deleted: false
          }, { onConflict: 'company_slug,table_name,record_id' });
          if (error) throw new Error(`Supabase sync ${table}#${recordId}: ${error.message}`);
          synced++;
        }
      }
      for (const company of companies) {
        const { error } = await supabase.from('erp_sync_instances').upsert({
          instance_id: instanceId,
          company_slug: company.slug,
          app_version: 'V42',
          last_seen_at: new Date().toISOString(),
          sync_status: 'ok',
          last_error: null
        }, { onConflict: 'instance_id' });
        if (error) throw new Error(`Supabase heartbeat: ${error.message}`);
      }
      return { ok: true, synced };
    } catch (error) {
      try {
        const companies = db.prepare('SELECT slug FROM companies').all();
        for (const company of companies) {
          await supabase.from('erp_sync_instances').upsert({
            instance_id: instanceId, company_slug: company.slug, app_version: 'V42',
            last_seen_at: new Date().toISOString(), sync_status: 'error',
            last_error: String(error.message || error).slice(0, 1000)
          }, { onConflict: 'instance_id' });
        }
      } catch (_) {}
      console.error('[Supabase sync]', error.message || error);
      return { ok: false, error: error.message || String(error) };
    } finally {
      running = false;
    }
  }
  return { syncOnce };
}
module.exports = { makeSupabaseSync };
