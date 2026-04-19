/**
 * Upload conteúdo do dia para Supabase Storage (bucket público).
 * Facilita preview + compartilhar link de aprovação no WhatsApp admin.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const today = new Date().toISOString().split('T')[0];
  const dir = join(import.meta.dir, '..', 'output', today);

  let files: string[] = [];
  try { files = readdirSync(dir); } catch { console.log('sem conteúdo hoje'); return; }

  for (const f of files) {
    const path = join(dir, f);
    if (!statSync(path).isFile()) continue;
    const buf = readFileSync(path);
    const key = `content/${today}/${f}`;
    const { error } = await supabase.storage.from('marketing').upload(key, buf, { upsert: true });
    if (error) console.error(`❌ ${f}: ${error.message}`);
    else console.log(`✅ ${f} → ${key}`);
  }
}

main().catch(console.error);
