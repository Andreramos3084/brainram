/**
 * Dispatch cold email via Resend.
 * Uso: bun run 5-send-email.ts <scored-with-email.json> [--send]
 * Env: RESEND_API_KEY, FROM_EMAIL (opt, default onboarding@resend.dev)
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const KEY = process.env.RESEND_API_KEY!;
const FROM = process.env.FROM_EMAIL || 'BrainRam <onboarding@resend.dev>';
const REPLY_TO = process.env.REPLY_TO || 'contato@brainram.com.br';
const DRY = !process.argv.includes('--send');
const MAX = Number(process.env.MAX_SENDS || 10);
const SCORE_CUT = Number(process.env.SCORE_CUT || 70);
const LOG = 'data/email-log.jsonl';

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
  const file = process.argv[2];
  if (!file) throw new Error('uso: bun run 5-send-email.ts <scored-with-email.json> [--send]');
  const sent = new Set<string>();
  if (existsSync(LOG)) {
    for (const line of readFileSync(LOG, 'utf8').split('\n')) {
      if (line) try { const e = JSON.parse(line); if (e.ok) sent.add(e.email); } catch {}
    }
  }

  const leads = JSON.parse(readFileSync(file, 'utf-8'))
    .filter((l: any) => l.score >= SCORE_CUT && l.email && l.mensagem_cold && !sent.has(l.email))
    .slice(0, MAX);

  console.log(`📧 ${leads.length} emails (score>=${SCORE_CUT}, max ${MAX}) ${DRY ? '[DRY]' : '[LIVE]'} from=${FROM}`);

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    const subj = subject(l);
    console.log(`\n[${i+1}/${leads.length}] ${l.name} (${l.city}) [${l.score}]`);
    console.log(`  to: ${l.email}`);
    console.log(`  subj: ${subj}`);
    console.log(`  msg: ${l.mensagem_cold.slice(0, 120).replace(/\n/g, ' ')}...`);
    if (DRY) continue;
    const r = await sendOne(l.email, subj, body(l));
    ensureDir(LOG);
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), email: l.email, name: l.name, city: l.city, score: l.score, ok: r.ok, status: r.status, resp: r.body.slice(0, 200) }) + '\n');
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${r.body.slice(0, 120)}`);
    await new Promise(r => setTimeout(r, 15000 + Math.random() * 15000));
  }
  console.log('\n🏁 done');
}
main().catch(console.error);
