/**
 * Dispatch via sales-server /sales/dispatch.
 * Safety: max N por run, delay 2-4min entre envios, só horário comercial.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  try { mkdirSync(dirname(filePath), { recursive: true }); } catch {}
}

const SALES_URL = process.env.SALES_URL || 'https://numbers-birthday-empirical-banana.trycloudflare.com';
const DRY = !process.argv.includes('--send');
const MAX = Number(process.env.MAX_SENDS || 20);
const SCORE_CUT = Number(process.env.SCORE_CUT || 70);

function isBiz() {
  const d = new Date(), day = d.getDay(), h = d.getHours();
  if (day === 0 || day === 6) return false;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

function norm(p: string) {
  const d = p.replace(/\D/g, '');
  return d.startsWith('55') ? d : '55' + d;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('uso: bun run ... <scored.json> [--send]');
  const leads = JSON.parse(readFileSync(file, 'utf-8'))
    .filter((l: any) => l.score >= SCORE_CUT && l.phone && l.mensagem_cold)
    .slice(0, MAX);
  console.log(`📤 ${leads.length} leads (score>=${SCORE_CUT}, max ${MAX}) ${DRY ? '[DRY]' : '[LIVE]'}`);

  for (let i = 0; i < leads.length; i++) {
    if (!DRY && !isBiz()) { console.log('⏰ fora do expediente, abortando'); break; }
    const l = leads[i];
    const phone = norm(l.phone);
    console.log(`\n[${i+1}/${leads.length}] ${l.name} (${l.city}) [${l.score}] → ${phone}`);
    console.log(`  msg: ${l.mensagem_cold.slice(0, 120).replace(/\n/g, ' ')}...`);
    if (DRY) continue;
    try {
      const r = await fetch(`${SALES_URL}/sales/dispatch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: l.mensagem_cold, video: false }),
      });
      const ok = r.ok;
      appendFileSync('data/dispatch-log.jsonl', JSON.stringify({ ts: new Date().toISOString(), phone, name: l.name, city: l.city, score: l.score, ok, status: r.status }) + '\n');
      console.log(`  ${ok ? '✅' : '❌'} status ${r.status}`);
    } catch (e: any) {
      console.log(`  ❌ ${e.message}`);
      appendFileSync('data/dispatch-log.jsonl', JSON.stringify({ ts: new Date().toISOString(), phone, name: l.name, error: e.message }) + '\n');
    }
    const delay = 120000 + Math.random() * 120000;
    console.log(`  ⏳ ${Math.round(delay/1000)}s`);
    await new Promise(r => setTimeout(r, delay));
  }
  console.log('\n🏁 done');
}
main().catch(console.error);
