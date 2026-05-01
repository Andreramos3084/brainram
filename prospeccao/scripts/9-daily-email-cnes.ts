/**
 * Daily Email Dispatcher — CNES Leads
 * Envia 100 emails por dia, respeitando horário comercial.
 *
 * Uso: bun run 9-daily-email-cnes.ts [--send]
 * Env: RESEND_API_KEY, FROM_EMAIL, REPLY_TO
 * Cron: 0 10 * * 1-5 cd /path && bun run scripts/9-daily-email-cnes.ts --send
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const KEY = process.env.RESEND_API_KEY!;
const FROM = process.env.FROM_EMAIL || 'BrainRam <contato@brainram.com.br>';
const REPLY_TO = process.env.REPLY_TO || 'contato@brainram.com.br';
const DRY = !process.argv.includes('--send');
const DAILY_CAP = Number(process.env.DAILY_CAP || 100);
const LEADS_FILE = process.env.LEADS_FILE || '/tmp/cnes-email-leads.json';
const LOG = 'data/email-log.jsonl';

// Business hours check
function isBusinessHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
}

function subject(lead: any) {
  const n = lead.name.split(/[|•\-–]/)[0].trim().slice(0, 60);
  return `Ideia rápida pra ${n}`;
}

function body(lead: any) {
  const msg = (lead.mensagem_cold || '').replace(/\n/g, '<br>');
  const videoUrl = 'https://nlcmhqevxpdttuhamjsj.supabase.co/storage/v1/object/public/public-assets/brainram-demo-2min.mp4';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#222;line-height:1.55">
<p>${msg}</p>
<p style="margin-top:20px"><a href="${videoUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">🎬 Assista o vídeo de 2 min</a></p>
<p style="margin-top:24px;font-size:14px;color:#555">Se preferir falar no WhatsApp, é só responder este email ou chamar em <a href="https://wa.me/5519998760212">wa.me/5519998760212</a>.</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#888">BrainRam — atendente IA WhatsApp pra clínicas · Pirassununga/SP<br>
Se não quiser mais receber, só responder "sair".</p>
</body></html>`;
}

async function sendOne(to: string, subj: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject: subj, html, reply_to: REPLY_TO }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
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

  // Load sent emails
  const sent = new Set<string>();
  if (existsSync(LOG)) {
    for (const line of readFileSync(LOG, 'utf8').split('\n')) {
      if (line) try { const e = JSON.parse(line); if (e.ok) sent.add(e.email); } catch {}
    }
  }

  // Filter unsent leads
  const unsent = allLeads.filter((l: any) => l.email && !sent.has(l.email));

  // Take daily cap
  const batch = unsent.slice(0, DAILY_CAP);

  console.log(`📧 CNES Daily Email Dispatch`);
  console.log(`   Total leads: ${allLeads.length}`);
  console.log(`   Já enviados: ${sent.size}`);
  console.log(`   Restantes: ${unsent.length}`);
  console.log(`   Lote de hoje: ${batch.length}`);
  console.log(`   ${DRY ? '[DRY RUN]' : '[LIVE]'}`);
  console.log(`   from=${FROM}`);

  if (batch.length === 0) {
    console.log('\n✅ Todos os leads já foram contactados!');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const l = batch[i];
    const subj = subject(l);
    console.log(`\n[${i + 1}/${batch.length}] ${l.name} (${l.city}) [${l.niche}]`);
    console.log(`  to: ${l.email}`);
    console.log(`  subj: ${subj}`);

    if (DRY) {
      console.log(`  [DRY] skipped`);
      continue;
    }

    const r = await sendOne(l.email, subj, body(l));
    ensureDir(LOG);
    appendFileSync(LOG, JSON.stringify({
      ts: new Date().toISOString(),
      email: l.email,
      name: l.name,
      city: l.city,
      niche: l.niche,
      source: 'cnes',
      ok: r.ok,
      status: r.status,
      resp: r.body.slice(0, 200),
    }) + '\n');

    if (r.ok) {
      console.log(`  ✅ ${r.status} ${r.body.slice(0, 120)}`);
      successCount++;
    } else {
      console.log(`  ❌ ${r.status} ${r.body.slice(0, 120)}`);
      errorCount++;
    }

    // Delay 15-30s between sends
    if (i < batch.length - 1) {
      const delay = 15000 + Math.random() * 15000;
      console.log(`  ⏳ ${Math.round(delay / 1000)}s`);
      await new Promise(res => setTimeout(res, delay));
    }
  }

  console.log(`\n🏁 Done: ${successCount} enviados, ${errorCount} erros`);
  console.log(`   Faltam: ${unsent.length - batch.length} leads`);
  console.log(`   Dias restantes: ~${Math.ceil((unsent.length - batch.length) / DAILY_CAP)}`);
}

main().catch(console.error);
