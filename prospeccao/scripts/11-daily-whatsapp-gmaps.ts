/**
 * Daily WhatsApp Dispatcher — Google Maps Leads (validados)
 * Envia 30 WhatsApps por dia, respeitando horário comercial e daily_cap.
 *
 * Uso: bun run 11-daily-whatsapp-gmaps.ts [--send]
 * Env: EVO_URL, EVO_API_KEY, EVO_INSTANCE
 * Cron: 0 11 * * 1-5 cd /path && bun run scripts/11-daily-whatsapp-gmaps.ts --send
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const EVO_URL = process.env.EVO_URL || 'https://cunninghagfish-evolution.cloudfy.live';
const EVO_KEY = process.env.EVO_API_KEY || 'DE6D1F647309-43F2-BF87-9392570B107C';
const INSTANCE = process.env.EVO_INSTANCE || 'brainram.com.br';
const DRY = !process.argv.includes('--send');
const DAILY_CAP = Number(process.env.DAILY_WHATSAPP_CAP || 30);
const LEADS_FILE = process.env.WHATSAPP_LEADS_FILE || '/tmp/gmaps-whatsapp-campanha.json';
const LOG = 'data/whatsapp-log.jsonl';
const SENT_LOG = 'data/whatsapp-sent.jsonl';

// Business hours check
function isBusinessHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
}

async function sendWhatsApp(phone: string, message: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  const r = await fetch(`${EVO_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: phone, text: message }),
  });
  const body = await r.text();
  return { ok: r.ok && body.includes('"status":"PENDING"'), status: r.status, body };
}

async function main() {
  if (!DRY && !isBusinessHours()) {
    console.log('⏸️ Fora do horário comercial (seg-sex, 9-18h). Use --send para forçar.');
    return;
  }

  if (!existsSync(LEADS_FILE)) {
    throw new Error(`Arquivo de leads não encontrado: ${LEADS_FILE}`);
  }

  // Load all leads
  const allLeads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));

  // Load sent phones
  const sent = new Set<string>();
  if (existsSync(SENT_LOG)) {
    for (const line of readFileSync(SENT_LOG, 'utf8').split('\n')) {
      if (line) try { const e = JSON.parse(line); if (e.ok) sent.add(e.phone); } catch {}
    }
  }

  // Filter unsent
  const unsent = allLeads.filter((l: any) => l.phone_clean && !sent.has(l.phone_clean));

  // Take daily cap
  const batch = unsent.slice(0, DAILY_CAP);

  console.log(`📱 WhatsApp Daily Dispatch — Google Maps Leads`);
  console.log(`   Total leads: ${allLeads.length}`);
  console.log(`   Já enviados: ${sent.size}`);
  console.log(`   Restantes: ${unsent.length}`);
  console.log(`   Lote de hoje: ${batch.length}`);
  console.log(`   ${DRY ? '[DRY RUN]' : '[LIVE]'}`);

  if (batch.length === 0) {
    console.log('\n✅ Todos os leads já foram contactados!');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const l = batch[i];
    console.log(`\n[${i + 1}/${batch.length}] ${l.name} (${l.city})`);
    console.log(`  → ${l.phone_clean}`);

    if (DRY) {
      console.log(`  [DRY] skipped`);
      continue;
    }

    const r = await sendWhatsApp(l.phone_clean, l.mensagem_cold);
    ensureDir(LOG);
    appendFileSync(LOG, JSON.stringify({
      ts: new Date().toISOString(),
      phone: l.phone_clean,
      name: l.name,
      city: l.city,
      niche: l.niche || 'Odontologia',
      source: 'gmaps',
      ok: r.ok,
      status: r.status,
      resp: r.body?.slice(0, 200),
    }) + '\n');

    if (r.ok) {
      console.log(`  ✅ enviado`);
      successCount++;
      ensureDir(SENT_LOG);
      appendFileSync(SENT_LOG, JSON.stringify({ ts: new Date().toISOString(), phone: l.phone_clean, ok: true }) + '\n');
    } else {
      console.log(`  ❌ erro: ${r.body?.slice(0, 120)}`);
      errorCount++;
    }

    // Delay 2-4 min entre envios
    if (i < batch.length - 1) {
      const delay = 120000 + Math.random() * 120000;
      console.log(`  ⏳ ${Math.round(delay / 1000)}s`);
      await new Promise(res => setTimeout(res, delay));
    }
  }

  console.log(`\n🏁 Done: ${successCount} enviados, ${errorCount} erros`);
  console.log(`   Faltam: ${unsent.length - batch.length} leads`);
  console.log(`   Dias restantes: ~${Math.ceil((unsent.length - batch.length) / DAILY_CAP)}`);
}

main().catch(console.error);
