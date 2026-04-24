/**
 * Importa leads scored pro Supabase (tabela `leads`).
 * Uso: bun run 6-import-to-supabase.ts <scored.json>
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('uso: bun run 6-import-to-supabase.ts <scored.json>');
  const leads = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`📥 importando ${leads.length} leads...`);

  const rows = leads.map((l: any) => ({
    name: l.name,
    phone: (l.phone || '').replace(/\D/g, ''),
    city: l.city,
    score: l.score || 0,
    mensagem_cold: l.mensagem_cold || null,
    source: 'google-maps-scrape',
    raw: { address: l.address, website: l.website, email: l.email, motivo: l.motivo },
  })).filter((r: any) => r.phone);

  const BATCH = 50;
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error, count } = await supa.from('leads').upsert(chunk, { onConflict: 'phone', ignoreDuplicates: false, count: 'exact' });
    if (error) { console.error('  erro batch', error.message); fail += chunk.length; }
    else { ok += chunk.length; console.log(`  ${i+chunk.length}/${rows.length}`); }
  }
  console.log(`\n✅ ${ok} inseridos/atualizados · ${fail} falhas`);
}
main().catch(console.error);
