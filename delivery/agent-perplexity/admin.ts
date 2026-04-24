/**
 * BrainRam Admin Panel — dashboard autônomo de prospecção.
 *
 * Surface HTTP (mount em /admin/*):
 *   GET  /admin              → painel HTML (SPA vanilla)
 *   POST /admin/login        → valida senha, seta cookie `brainram_admin`
 *   POST /admin/logout
 *   GET  /admin/me
 *
 *   GET  /admin/api/metrics
 *   GET  /admin/api/copy | POST | PATCH/:id | DELETE/:id
 *   GET  /admin/api/campaigns | POST | PATCH/:id | DELETE/:id
 *   GET  /admin/api/leads?city=&score_gte=&sent=
 *   POST /admin/api/prospect  { query, cities[], limit, campaign_id? } → enfileira jobs
 *   GET  /admin/api/jobs
 *   POST /admin/api/kill { paused: bool }
 *   POST /admin/api/worker/tick  → executa 1 ciclo imediato (usado por cron ou botão)
 *
 * Worker autônomo (chamado por cron /admin/api/worker/tick):
 *   - respeita system_flags.dispatch_paused
 *   - itera campanhas ativas → seleciona leads não enviados score>=cut, limit=daily_cap
 *   - envia WA e/ou email conforme channels[]
 *   - loga em campaign_runs
 *
 * Deps: Hono context passado pelo sales-server. Reutiliza supabase client, sendText e env.
 */
import type { Hono, Context } from 'hono';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Deps = {
  supabase: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  sendMedia: (to: string, url: string, caption: string) => Promise<void>;
  ADMIN_KEY: string;
  SCRAPER_URL: string;
  SCRAPER_KEY: string;
  RESEND_KEY?: string;
  FROM_EMAIL: string;
  REPLY_TO: string;
  ADMIN_PHONE: string;
  DEMO_VIDEO_URL?: string;
};

// ============ PRESETS NACIONAIS ============
export const PRESETS: Record<string, string[]> = {
  'sp-interior': ['Campinas','Limeira','Piracicaba','Pirassununga','Rio Claro','São Carlos','Americana','Sumaré','Hortolândia','Indaiatuba','Jundiaí','Ribeirão Preto','Sorocaba','Araraquara','Mogi Mirim'],
  'sp-capital-grande': ['São Paulo','Guarulhos','Osasco','Santo André','São Bernardo do Campo','São Caetano do Sul','Diadema','Mauá','Taboão da Serra','Barueri'],
  'rj': ['Rio de Janeiro','Niterói','Nova Iguaçu','São Gonçalo','Duque de Caxias','Petrópolis','Campos dos Goytacazes','Volta Redonda'],
  'mg': ['Belo Horizonte','Uberlândia','Contagem','Juiz de Fora','Betim','Montes Claros','Uberaba','Sete Lagoas','Divinópolis'],
  'sul': ['Curitiba','Londrina','Maringá','Cascavel','Porto Alegre','Caxias do Sul','Pelotas','Canoas','Florianópolis','Joinville','Blumenau','Chapecó'],
  'nordeste': ['Salvador','Feira de Santana','Vitória da Conquista','Recife','Olinda','Jaboatão dos Guararapes','Fortaleza','Caucaia','Natal','João Pessoa','Campina Grande','Maceió','Aracaju','Teresina','São Luís'],
  'norte-centro': ['Manaus','Belém','Ananindeua','Porto Velho','Rio Branco','Boa Vista','Macapá','Palmas','Cuiabá','Várzea Grande','Campo Grande','Dourados','Goiânia','Aparecida de Goiânia','Anápolis','Brasília','Taguatinga'],
  'es': ['Vitória','Vila Velha','Serra','Cariacica','Linhares','Cachoeiro de Itapemirim'],
};
export const NATIONAL = Array.from(new Set(Object.values(PRESETS).flat())).sort();

// ============ HELPERS ============
function parseCookie(c: Context, name: string): string | null {
  const h = c.req.header('cookie') || '';
  const m = h.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(c: Context, name: string, value: string, maxAge = 60 * 60 * 24 * 7) {
  c.header('set-cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`);
}
function requireAuth(deps: Deps) {
  return async (c: Context, next: () => Promise<void>) => {
    const cookie = parseCookie(c, 'brainram_admin');
    const header = c.req.header('x-admin-key');
    if (cookie !== deps.ADMIN_KEY && header !== deps.ADMIN_KEY) return c.json({ error: 'unauthorized' }, 401);
    await next();
  };
}

// ============ WA INSTANCE ROTATION ============
async function pickInstance(supabase: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  // reset counters diários
  await supabase.from('wa_instances').update({ daily_sent: 0, last_reset_at: today }).lt('last_reset_at', today);
  const { data } = await supabase.from('wa_instances').select('*').eq('active', true);
  if (!data?.length) return null;
  // pick instância com menor daily_sent abaixo do cap
  const eligible = data.filter((i: any) => i.daily_sent < i.daily_cap).sort((a: any, b: any) => a.daily_sent - b.daily_sent);
  return eligible[0] || null;
}
async function sendViaInstance(inst: any, to: string, text: string) {
  const r = await fetch(`${inst.api_url}/message/sendText/${inst.name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
    body: JSON.stringify({ number: to, text }),
  });
  return r.ok;
}
async function sendMediaViaInstance(inst: any, to: string, url: string, caption = '') {
  const r = await fetch(`${inst.api_url}/message/sendMedia/${inst.name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
    body: JSON.stringify({ number: to, mediatype: 'video', mimetype: 'video/mp4', media: url, caption, fileName: 'demo.mp4' }),
  });
  return r.ok;
}

// ============ WORKER ============
export async function runCampaignTick(deps: Deps): Promise<{ camps: number; wa: number; email: number; skipped?: string }> {
  const { supabase, sendText } = deps;
  const { data: flag } = await supabase.from('system_flags').select('value').eq('key', 'dispatch_paused').maybeSingle();
  if (flag?.value === true) return { camps: 0, wa: 0, email: 0, skipped: 'paused' };

  // Lock de concorrência: TTL 30min. Impede ticks sobrepostos.
  const now = Date.now();
  const lockTtl = 30 * 60 * 1000;
  const { data: lockRow } = await supabase.from('system_flags').select('value').eq('key', 'worker_lock').maybeSingle();
  const lockUntil = lockRow?.value ? Number(lockRow.value) : 0;
  if (lockUntil > now) return { camps: 0, wa: 0, email: 0, skipped: `locked until ${new Date(lockUntil).toISOString()}` };
  await supabase.from('system_flags').upsert({ key: 'worker_lock', value: now + lockTtl, updated_at: new Date().toISOString() });
  try {
    return await runCampaignTickInner(deps);
  } finally {
    await supabase.from('system_flags').upsert({ key: 'worker_lock', value: 0, updated_at: new Date().toISOString() });
  }
}

async function runCampaignTickInner(deps: Deps): Promise<{ camps: number; wa: number; email: number; skipped?: string }> {
  const { supabase, sendText } = deps;

  // horário comercial BRT (9-12, 14-18, seg-sex)
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  const dow = brt.getUTCDay(); // 0=dom
  const h = brt.getUTCHours();
  if (dow === 0 || dow === 6) return { camps: 0, wa: 0, email: 0, skipped: 'weekend' };
  if (!((h >= 9 && h < 12) || (h >= 14 && h < 18))) return { camps: 0, wa: 0, email: 0, skipped: 'off-hours' };

  const { data: camps } = await supabase.from('campaigns').select('*').eq('active', true);
  let totalWa = 0, totalEmail = 0;
  for (const camp of camps || []) {
    const { data: run } = await supabase.from('campaign_runs').insert({ campaign_id: camp.id, status: 'running' }).select().single();
    let waSent = 0, emailSent = 0;
    try {
      // fetch leads elegíveis
      const { data: leads } = await supabase.from('leads')
        .select('*')
        .gte('score', camp.score_cut)
        .is('sent_at', null)
        .in('city', camp.cities.length ? camp.cities : NATIONAL)
        .order('score', { ascending: false })
        .limit(camp.daily_cap);

      // pega templates
      const { data: copyWa } = camp.copy_wa_id ? await supabase.from('copy_templates').select('*').eq('id', camp.copy_wa_id).maybeSingle() : { data: null };
      const { data: copyEmail } = camp.copy_email_id ? await supabase.from('copy_templates').select('*').eq('id', camp.copy_email_id).maybeSingle() : { data: null };

      for (const lead of leads || []) {
        const vars = { name: (lead.name || '').split(/[|•\-–]/)[0].trim(), city: lead.city || '', niche: camp.niche };
        const render = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => (vars as any)[k] ?? '');

        if (camp.channels.includes('whatsapp') && lead.phone) {
          const body = copyWa?.body ? render(copyWa.body) : lead.mensagem_cold;
          if (body) {
            // MARCA sent_at ANTES (otimista) — só prossegue se update realmente pegou a linha ainda null.
            // Isso previne que um tick concorrente envie a mesma msg.
            const claimAt = new Date().toISOString();
            const { data: claimed } = await supabase.from('leads')
              .update({ sent_at: claimAt })
              .eq('id', lead.id)
              .is('sent_at', null)
              .select('id');
            if (!claimed || claimed.length === 0) {
              // outro tick já pegou esse lead — pula sem delay
              continue;
            }
            const phone = lead.phone.replace(/\D/g, '').replace(/^(?!55)/, '55');
            const inst = await pickInstance(supabase);
            let ok = false;
            try {
              if (inst) {
                ok = await sendViaInstance(inst, phone, body);
                if (ok) await supabase.from('wa_instances').update({ daily_sent: inst.daily_sent + 1 }).eq('id', inst.id);
                if (ok && deps.DEMO_VIDEO_URL) {
                  await new Promise(r => setTimeout(r, 3000));
                  await sendMediaViaInstance(inst, phone, deps.DEMO_VIDEO_URL);
                }
              } else {
                await sendText(phone, body);
                if (deps.DEMO_VIDEO_URL) {
                  await new Promise(r => setTimeout(r, 3000));
                  await deps.sendMedia(phone, deps.DEMO_VIDEO_URL, '');
                }
                ok = true;
              }
            } catch (e) {
              ok = false;
            }
            if (ok) {
              waSent++;
            } else {
              // reverte claim pra retry futuro
              await supabase.from('leads').update({ sent_at: null }).eq('id', lead.id);
            }
            await new Promise(r => setTimeout(r, 45000 + Math.random() * 75000)); // 45s-2min
          }
        }

        const leadEmail = lead.email || lead.raw?.email;
        if (camp.channels.includes('email') && leadEmail && deps.RESEND_KEY) {
          const subj = copyEmail?.subject ? render(copyEmail.subject) : `Ideia rápida pra ${vars.name}`;
          const html = `<p>${(copyEmail?.body ? render(copyEmail.body) : lead.mensagem_cold).replace(/\n/g, '<br>')}</p>
<p style="color:#888;font-size:12px;margin-top:24px">BrainRam — Pirassununga/SP · <a href="https://wa.me/5519998760212">wa.me/5519998760212</a> · responder "sair" pra não receber mais.</p>`;
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${deps.RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: deps.FROM_EMAIL, to: leadEmail, subject: subj, html, reply_to: deps.REPLY_TO }),
          });
          if (r.ok) emailSent++;
        }
      }
      await supabase.from('campaign_runs').update({
        status: 'done', finished_at: new Date().toISOString(),
        leads_sent_wa: waSent, leads_sent_email: emailSent,
      }).eq('id', run!.id);
    } catch (e: any) {
      await supabase.from('campaign_runs').update({
        status: 'error', finished_at: new Date().toISOString(), notes: String(e).slice(0, 500),
      }).eq('id', run!.id);
    }
    totalWa += waSent; totalEmail += emailSent;
  }
  return { camps: (camps || []).length, wa: totalWa, email: totalEmail };
}

// ============ PROSPECT JOB RUNNER ============
async function processProspectJobs(deps: Deps) {
  const { supabase } = deps;
  const { data: jobs } = await supabase.from('prospect_jobs').select('*').eq('status', 'pending').limit(5);
  for (const job of jobs || []) {
    await supabase.from('prospect_jobs').update({ status: 'running' }).eq('id', job.id);
    try {
      const r = await fetch(`${deps.SCRAPER_URL}/v1/scrape/google-maps`, {
        method: 'POST',
        headers: { 'x-api-key': deps.SCRAPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: job.query, city: job.city, limit: job.limit_n }),
      });
      if (!r.ok) throw new Error(`scraper ${r.status}`);
      // fire and forget - scraper persiste em leads direto
      await supabase.from('prospect_jobs').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', job.id);
    } catch (e: any) {
      await supabase.from('prospect_jobs').update({ status: 'error', error: String(e).slice(0, 300), finished_at: new Date().toISOString() }).eq('id', job.id);
    }
  }
}

// ============ ROUTES ============
export function mountAdmin(app: Hono, deps: Deps) {
  const auth = requireAuth(deps);

  // === HTML ===
  app.get('/admin', (c) => c.html(PANEL_HTML));
  app.get('/admin/login', (c) => c.html(LOGIN_HTML));

  // === Auth ===
  app.post('/admin/login', async (c) => {
    const body = await c.req.json().catch(() => ({} as any));
    if (body.key !== deps.ADMIN_KEY) return c.json({ error: 'wrong key' }, 401);
    setCookie(c, 'brainram_admin', deps.ADMIN_KEY);
    return c.json({ ok: true });
  });
  app.post('/admin/logout', (c) => { setCookie(c, 'brainram_admin', '', 0); return c.json({ ok: true }); });
  app.get('/admin/me', async (c) => {
    const cookie = parseCookie(c, 'brainram_admin');
    return c.json({ authed: cookie === deps.ADMIN_KEY });
  });

  // === Metrics ===
  app.get('/admin/api/metrics', auth, async (c) => {
    const { supabase } = deps;
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const [{ count: totalLeads }, { count: sent24 }, { count: replied24 }, { count: withEmail }] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('sent_at', dayAgo),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('replied_at', dayAgo),
      supabase.from('leads').select('*', { count: 'exact', head: true }).not('email', 'is', null),
    ]);
    const { data: tenants } = await supabase.from('tenants').select('plan, status, trial_confirmed');
    const trial = tenants?.filter(t => t.status === 'trial').length || 0;
    const active = tenants?.filter(t => ['active','authorized'].includes(t.status)).length || 0;
    const cancelled = tenants?.filter(t => t.status === 'cancelled').length || 0;
    const byPlan = { starter: 0, pro: 0, premium: 0 } as any;
    for (const t of tenants || []) if (t.plan && t.status === 'trial') byPlan[t.plan] = (byPlan[t.plan]||0) + 1;
    const mrr = byPlan.starter*297 + byPlan.pro*397 + byPlan.premium*497;
    const { data: flag } = await supabase.from('system_flags').select('value').eq('key','dispatch_paused').maybeSingle();
    return c.json({
      leads: { total: totalLeads || 0, sent_24h: sent24 || 0, replied_24h: replied24 || 0, with_email: withEmail || 0 },
      tenants: { trial, active, cancelled, byPlan, mrr },
      dispatch_paused: flag?.value === true,
    });
  });

  // === Copy templates CRUD ===
  app.get('/admin/api/copy', auth, async (c) => {
    const { data } = await deps.supabase.from('copy_templates').select('*').order('created_at', { ascending: false });
    return c.json({ items: data || [] });
  });
  app.post('/admin/api/copy', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('copy_templates').insert(b).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.patch('/admin/api/copy/:id', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('copy_templates').update(b).eq('id', c.req.param('id')).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.delete('/admin/api/copy/:id', auth, async (c) => {
    await deps.supabase.from('copy_templates').delete().eq('id', c.req.param('id'));
    return c.json({ ok: true });
  });

  // === Campaigns CRUD ===
  app.get('/admin/api/campaigns', auth, async (c) => {
    const { data } = await deps.supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    return c.json({ items: data || [] });
  });
  app.post('/admin/api/campaigns', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('campaigns').insert(b).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.patch('/admin/api/campaigns/:id', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('campaigns').update(b).eq('id', c.req.param('id')).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.delete('/admin/api/campaigns/:id', auth, async (c) => {
    await deps.supabase.from('campaigns').delete().eq('id', c.req.param('id'));
    return c.json({ ok: true });
  });

  // === Leads view ===
  app.get('/admin/api/leads', auth, async (c) => {
    const q = c.req.query();
    let qb = deps.supabase.from('leads').select('id, name, city, phone, email, score, sent_at, replied_at, mensagem_cold').order('score', { ascending: false }).limit(Number(q.limit || 200));
    if (q.city) qb = qb.eq('city', q.city);
    if (q.score_gte) qb = qb.gte('score', Number(q.score_gte));
    if (q.sent === 'true') qb = qb.not('sent_at','is', null);
    if (q.sent === 'false') qb = qb.is('sent_at', null);
    const { data } = await qb;
    return c.json({ items: data || [] });
  });

  // === Prospect (enfileira jobs) ===
  app.get('/admin/api/presets', auth, (c) => c.json({ presets: PRESETS, national: NATIONAL }));
  app.post('/admin/api/prospect', auth, async (c) => {
    const b = await c.req.json() as { query: string; cities: string[]; limit?: number; campaign_id?: string };
    const rows = b.cities.map(city => ({ query: b.query, city, limit_n: b.limit || 60, campaign_id: b.campaign_id || null }));
    const { data, error } = await deps.supabase.from('prospect_jobs').insert(rows).select();
    if (error) return c.json({ error: error.message }, 400);
    // dispara processamento assíncrono
    processProspectJobs(deps).catch(e => console.error('prospect bg', e));
    return c.json({ queued: data?.length || 0 });
  });
  app.get('/admin/api/jobs', auth, async (c) => {
    const { data } = await deps.supabase.from('prospect_jobs').select('*').order('created_at', { ascending: false }).limit(100);
    return c.json({ items: data || [] });
  });
  app.post('/admin/api/jobs/run', auth, async (c) => { processProspectJobs(deps).catch(()=>{}); return c.json({ ok: true }); });

  // === Kill switch ===
  app.post('/admin/api/kill', auth, async (c) => {
    const b = await c.req.json() as { paused: boolean };
    await deps.supabase.from('system_flags').upsert({ key: 'dispatch_paused', value: b.paused, updated_at: new Date().toISOString() });
    return c.json({ ok: true, paused: b.paused });
  });

  // === Worker tick (manual ou cron) ===
  app.post('/admin/api/worker/tick', auth, async (c) => {
    const r = await runCampaignTick(deps);
    return c.json(r);
  });

  // === WA instances (multi-número) ===
  app.get('/admin/api/instances', auth, async (c) => {
    const { data } = await deps.supabase.from('wa_instances').select('*').order('name');
    return c.json({ items: data || [] });
  });
  app.post('/admin/api/instances', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('wa_instances').insert(b).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.patch('/admin/api/instances/:id', auth, async (c) => {
    const b = await c.req.json();
    const { data, error } = await deps.supabase.from('wa_instances').update(b).eq('id', c.req.param('id')).select().single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ item: data });
  });
  app.delete('/admin/api/instances/:id', auth, async (c) => {
    await deps.supabase.from('wa_instances').delete().eq('id', c.req.param('id'));
    return c.json({ ok: true });
  });

  // === Runs history ===
  app.get('/admin/api/runs', auth, async (c) => {
    const { data } = await deps.supabase.from('campaign_runs').select('*, campaigns(name)').order('started_at', { ascending: false }).limit(50);
    return c.json({ items: data || [] });
  });
}

// ============ PANEL HTML (SPA vanilla) ============
const LOGIN_HTML = `<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>BrainRam Admin</title>
<style>body{font-family:system-ui;background:#0f1419;color:#e6e6e6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
form{background:#1a2029;padding:32px;border-radius:12px;width:320px;border:1px solid #2a3140}
h1{margin:0 0 24px;font-size:20px}input{width:100%;padding:12px;background:#0f1419;border:1px solid #2a3140;border-radius:6px;color:#fff;box-sizing:border-box;margin-bottom:16px}
button{width:100%;padding:12px;background:#3b82f6;border:0;border-radius:6px;color:#fff;font-weight:600;cursor:pointer}
.err{color:#ff8a8a;font-size:13px;margin-top:8px}</style></head><body>
<form id=f><h1>🧠 BrainRam Admin</h1><input type=password id=k placeholder="ADMIN_KEY" autofocus><button>Entrar</button><div class=err id=e></div></form>
<script>
f.onsubmit=async e=>{e.preventDefault();const r=await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k.value})});
if(r.ok)location.href='/admin';else document.getElementById('e').textContent='chave inválida';};
</script></body></html>`;

const PANEL_HTML = `<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>BrainRam Admin</title>
<meta name=viewport content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1419;color:#e6e6e6;margin:0}
nav{background:#1a2029;border-bottom:1px solid #2a3140;padding:12px 24px;display:flex;gap:16px;align-items:center;position:sticky;top:0;z-index:10}
nav b{color:#fff;font-size:16px;margin-right:16px}nav a{color:#8b95a7;text-decoration:none;font-size:14px;cursor:pointer;padding:6px 12px;border-radius:6px}
nav a.on{background:#2a3140;color:#fff}nav .sp{flex:1}nav .kill{background:#3e1a1a;color:#ff8a8a;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;border:0}
nav .kill.on{background:#ff8a8a;color:#3e1a1a}
main{max-width:1200px;margin:0 auto;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.card{background:#1a2029;border:1px solid #2a3140;border-radius:10px;padding:16px}
.card .v{font-size:24px;font-weight:600;color:#fff}.card .l{font-size:11px;color:#8b95a7;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
h2{font-size:16px;margin:24px 0 12px;color:#fff}
button,.btn{background:#3b82f6;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px}
button.sec{background:#2a3140}button.danger{background:#ff8a8a;color:#3e1a1a}
input,textarea,select{background:#0f1419;border:1px solid #2a3140;color:#fff;padding:8px 10px;border-radius:6px;font-family:inherit;font-size:13px}
input,select{width:100%}textarea{width:100%;min-height:80px;resize:vertical}
label{font-size:12px;color:#8b95a7;display:block;margin:12px 0 4px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px;text-align:left;border-bottom:1px solid #2a3140}
th{color:#8b95a7;font-weight:500;font-size:11px;text-transform:uppercase}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}
.pill{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px}
.pill.on{background:#1a3e2e;color:#6fd4a0}.pill.off{background:#2a3140;color:#8b95a7}.pill.wa{background:#1a3e2e;color:#6fd4a0}.pill.em{background:#1e3a5f;color:#7ab8ff}
.modal{position:fixed;inset:0;background:#000c;display:none;align-items:center;justify-content:center;z-index:100;padding:24px}
.modal.open{display:flex}.modal .box{background:#1a2029;border:1px solid #2a3140;border-radius:10px;padding:24px;max-width:600px;width:100%;max-height:90vh;overflow:auto}
.modal h3{margin:0 0 16px;color:#fff}.chip{display:inline-block;background:#2a3140;padding:4px 10px;border-radius:4px;margin:2px;font-size:12px;cursor:pointer}
.chip.on{background:#3b82f6;color:#fff}.muted{color:#8b95a7;font-size:12px}
</style></head><body>
<nav>
  <b>🧠 BrainRam</b>
  <a data-tab=dash class=on>Dashboard</a>
  <a data-tab=prospect>Prospecção</a>
  <a data-tab=leads>Leads</a>
  <a data-tab=camps>Campanhas</a>
  <a data-tab=copy>Copy</a>
  <a data-tab=nums>Números WA</a>
  <a data-tab=runs>Execuções</a>
  <span class=sp></span>
  <button class=kill id=kill>● ativo</button>
  <a onclick="fetch('/admin/logout',{method:'POST'}).then(()=>location.href='/admin/login')" class=sec>sair</a>
</nav>
<main><div id=app>carregando…</div></main>
<div class=modal id=modal><div class=box id=modalbox></div></div>

<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const api=(p,opt={})=>fetch('/admin/api'+p,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}).then(r=>r.json());
let state={tab:'dash'};
const openModal=html=>{$('#modalbox').innerHTML=html;$('#modal').classList.add('open')};
const closeModal=()=>$('#modal').classList.remove('open');
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

$$('nav a[data-tab]').forEach(a=>a.onclick=()=>{state.tab=a.dataset.tab;$$('nav a[data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab===state.tab));render()});

async function render(){
  const el=$('#app');el.innerHTML='carregando…';
  if(state.tab==='dash')renderDash();
  else if(state.tab==='prospect')renderProspect();
  else if(state.tab==='leads')renderLeads();
  else if(state.tab==='camps')renderCamps();
  else if(state.tab==='copy')renderCopy();
  else if(state.tab==='nums')renderNums();
  else if(state.tab==='runs')renderRuns();
}
async function renderDash(){
  const m=await api('/metrics');
  $('#kill').classList.toggle('on',m.dispatch_paused);
  $('#kill').textContent=m.dispatch_paused?'⏸ pausado':'● ativo';
  $('#app').innerHTML=
   '<h2>Visão geral</h2><div class=grid>'+
   card('Leads totais',m.leads.total)+card('Enviados 24h',m.leads.sent_24h)+card('Respostas 24h',m.leads.replied_24h)+card('Com email',m.leads.with_email)+
   '</div><h2>Clientes</h2><div class=grid>'+
   card('Em trial',m.tenants.trial)+card('Ativos',m.tenants.active)+card('Cancelados',m.tenants.cancelled)+card('MRR projetado','R$ '+m.tenants.mrr.toLocaleString('pt-BR'))+
   '</div><h2>Ações rápidas</h2>'+
   '<div class=row><button onclick="tick()">Executar tick agora</button><button class=sec onclick="state.tab=\\'prospect\\';render()">Nova prospecção</button></div>';
}
window.tick=async()=>{const r=await api('/worker/tick',{method:'POST'});alert('tick: '+JSON.stringify(r));render()};
const card=(l,v)=>'<div class=card><div class=l>'+l+'</div><div class=v>'+v+'</div></div>';

async function renderProspect(){
  const p=await api('/presets');
  $('#app').innerHTML=
   '<h2>Nova prospecção</h2>'+
   '<label>Nicho / query</label><input id=q value="clínica odontológica">'+
   '<label>Limit por cidade</label><input id=lim type=number value=60>'+
   '<label>Presets</label><div id=presets></div>'+
   '<label>Cidades selecionadas <span class=muted>(clique pra remover)</span></label><div id=chosen></div>'+
   '<label>Adicionar cidade custom</label><div class=row><input id=city placeholder="São Paulo"><button class=sec onclick="addCity()">+</button></div>'+
   '<div style="margin-top:20px"><button onclick="runProspect()">Enfileirar scrape</button></div>'+
   '<h2>Jobs recentes</h2><div id=jobs></div>';
  const chosen=new Set();window.chosen=chosen;
  const ps=$('#presets');ps.innerHTML=Object.entries(p.presets).map(([k,v])=>'<span class=chip onclick="addPreset(\\''+k+'\\')">+ '+k+' ('+v.length+')</span>').join('')+'<span class=chip onclick="addAll()">+ NACIONAL ('+p.national.length+')</span>';
  window._presets=p.presets;window._national=p.national;
  window.addPreset=k=>{window._presets[k].forEach(c=>chosen.add(c));drawChosen()};
  window.addAll=()=>{window._national.forEach(c=>chosen.add(c));drawChosen()};
  window.addCity=()=>{const v=$('#city').value.trim();if(v){chosen.add(v);$('#city').value='';drawChosen()}};
  window.drawChosen=()=>{$('#chosen').innerHTML=[...chosen].map(c=>'<span class="chip on" onclick="chosen.delete(\\''+c+'\\');drawChosen()">'+c+' ×</span>').join('')||'<span class=muted>nenhuma</span>'};
  drawChosen();
  const jobs=await api('/jobs');
  $('#jobs').innerHTML='<table><tr><th>Query</th><th>Cidade</th><th>Status</th><th>Quando</th></tr>'+
    jobs.items.slice(0,20).map(j=>'<tr><td>'+j.query+'</td><td>'+j.city+'</td><td>'+j.status+'</td><td>'+new Date(j.created_at).toLocaleString('pt-BR')+'</td></tr>').join('')+'</table>';
  window.runProspect=async()=>{
    const cities=[...chosen];if(!cities.length){alert('selecione cidades');return}
    const r=await api('/prospect',{method:'POST',body:JSON.stringify({query:$('#q').value,cities,limit:Number($('#lim').value)})});
    alert('enfileirado: '+r.queued+' jobs');render();
  };
}

async function renderLeads(){
  $('#app').innerHTML='<h2>Leads</h2>'+
   '<div class=row style="margin-bottom:12px"><input id=fcity placeholder="cidade"><input id=fscore type=number placeholder="score >=" value=60><select id=fsent><option value="">todos</option><option value=false>não enviados</option><option value=true>enviados</option></select><button onclick="loadLeads()">filtrar</button></div>'+
   '<div id=ltable>carregando…</div>';
  window.loadLeads=async()=>{
    const q=new URLSearchParams();if($('#fcity').value)q.set('city',$('#fcity').value);if($('#fscore').value)q.set('score_gte',$('#fscore').value);if($('#fsent').value)q.set('sent',$('#fsent').value);
    const d=await api('/leads?'+q);
    $('#ltable').innerHTML='<table><tr><th>Score</th><th>Nome</th><th>Cidade</th><th>Phone</th><th>Email</th><th>Enviado</th></tr>'+
      d.items.map(l=>'<tr><td>'+(l.score||0)+'</td><td>'+l.name+'</td><td>'+(l.city||'')+'</td><td>'+l.phone+'</td><td>'+(l.email||'—')+'</td><td>'+(l.sent_at?'✓':'')+'</td></tr>').join('')+'</table>';
  };loadLeads();
}

async function renderCamps(){
  const [c,t]=await Promise.all([api('/campaigns'),api('/copy')]);
  window._copy=t.items;
  $('#app').innerHTML='<h2>Campanhas autônomas <button onclick="newCamp()" style="float:right">+ nova</button></h2>'+
   (c.items.length?'<table><tr><th>Nome</th><th>Cidades</th><th>Canais</th><th>Score</th><th>Cap/dia</th><th>Ativa</th><th></th></tr>'+
   c.items.map(x=>'<tr><td>'+x.name+'</td><td>'+(x.cities?.length||0)+'</td><td>'+(x.channels||[]).map(ch=>'<span class="pill '+ch.slice(0,2)+'">'+ch+'</span>').join(' ')+'</td><td>'+x.score_cut+'</td><td>'+x.daily_cap+'</td><td><span class="pill '+(x.active?'on':'off')+'">'+(x.active?'ativa':'off')+'</span></td><td><button class=sec onclick="editCamp(\\''+x.id+'\\')">edit</button> <button class=sec onclick="toggleCamp(\\''+x.id+'\\','+!x.active+')">'+(x.active?'pausar':'ativar')+'</button> <button class=danger onclick="delCamp(\\''+x.id+'\\')">×</button></td></tr>').join('')+'</table>':'<p class=muted>nenhuma campanha ainda.</p>');
  window._camps=c.items;
  window.editCamp=(id)=>{
    const x=window._camps.find(y=>y.id===id);if(!x)return;
    openModal('<h3>Editar campanha</h3>'+
     '<label>Nome</label><input id=cn value="'+x.name.replace(/"/g,'&quot;')+'">'+
     '<label>Nicho</label><input id=cnic value="'+(x.niche||'')+'">'+
     '<label>Cidades (vírgula, vazio = NACIONAL)</label><textarea id=ccities>'+(x.cities||[]).join(', ')+'</textarea>'+
     '<label>Canais</label><div><label style="display:inline"><input type=checkbox id=cwa '+(x.channels?.includes("whatsapp")?"checked":"")+'> WhatsApp</label> &nbsp; <label style="display:inline"><input type=checkbox id=cem '+(x.channels?.includes("email")?"checked":"")+'> Email</label></div>'+
     '<label>Copy WA</label><select id=ccwa><option value="">—</option>'+window._copy.filter(y=>y.channel==='whatsapp').map(y=>'<option value="'+y.id+'" '+(y.id===x.copy_wa_id?"selected":"")+'>'+y.name+'</option>').join('')+'</select>'+
     '<label>Copy Email</label><select id=ccem><option value="">—</option>'+window._copy.filter(y=>y.channel==='email').map(y=>'<option value="'+y.id+'" '+(y.id===x.copy_email_id?"selected":"")+'>'+y.name+'</option>').join('')+'</select>'+
     '<div class=row><div><label>Score mín</label><input id=ccut type=number value='+x.score_cut+'></div><div><label>Cap/dia</label><input id=ccap type=number value='+x.daily_cap+'></div></div>'+
     '<div style="margin-top:20px"><button onclick="updateCamp(\\''+x.id+'\\')">Salvar</button> <button class=sec onclick="closeModal()">cancelar</button></div>');
  };
  window.updateCamp=async(id)=>{
    const channels=[];if($('#cwa').checked)channels.push('whatsapp');if($('#cem').checked)channels.push('email');
    const body={name:$('#cn').value,niche:$('#cnic').value,cities:$('#ccities').value.split(',').map(s=>s.trim()).filter(Boolean),channels,copy_wa_id:$('#ccwa').value||null,copy_email_id:$('#ccem').value||null,score_cut:Number($('#ccut').value),daily_cap:Number($('#ccap').value)};
    await api('/campaigns/'+id,{method:'PATCH',body:JSON.stringify(body)});closeModal();render();
  };
  window.toggleCamp=async(id,v)=>{await api('/campaigns/'+id,{method:'PATCH',body:JSON.stringify({active:v})});render()};
  window.delCamp=async(id)=>{if(confirm('deletar?')){await api('/campaigns/'+id,{method:'DELETE'});render()}};
  window.newCamp=()=>{
    openModal('<h3>Nova campanha</h3>'+
     '<label>Nome</label><input id=cn placeholder="Odonto SP interior WA">'+
     '<label>Nicho</label><input id=cnic value="clínica odontológica">'+
     '<label>Cidades (vírgula)</label><textarea id=ccities placeholder="Campinas, Limeira, ..."></textarea>'+
     '<label>Canais</label><div><label style="display:inline"><input type=checkbox id=cwa checked> WhatsApp</label> &nbsp; <label style="display:inline"><input type=checkbox id=cem> Email</label></div>'+
     '<label>Copy WA</label><select id=ccwa><option value="">—</option>'+window._copy.filter(x=>x.channel==='whatsapp').map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('')+'</select>'+
     '<label>Copy Email</label><select id=ccem><option value="">—</option>'+window._copy.filter(x=>x.channel==='email').map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('')+'</select>'+
     '<div class=row><div><label>Score mín</label><input id=ccut type=number value=80></div><div><label>Cap/dia</label><input id=ccap type=number value=20></div></div>'+
     '<div style="margin-top:20px"><button onclick="saveCamp()">Criar</button> <button class=sec onclick="closeModal()">cancelar</button></div>');
  };
  window.saveCamp=async()=>{
    const channels=[];if($('#cwa').checked)channels.push('whatsapp');if($('#cem').checked)channels.push('email');
    const body={name:$('#cn').value,niche:$('#cnic').value,cities:$('#ccities').value.split(',').map(s=>s.trim()).filter(Boolean),channels,copy_wa_id:$('#ccwa').value||null,copy_email_id:$('#ccem').value||null,score_cut:Number($('#ccut').value),daily_cap:Number($('#ccap').value),active:false};
    await api('/campaigns',{method:'POST',body:JSON.stringify(body)});closeModal();render();
  };
}

async function renderCopy(){
  const d=await api('/copy');
  $('#app').innerHTML='<h2>Templates de copy <button onclick="newCopy()" style="float:right">+ novo</button></h2>'+
   '<p class=muted>Variáveis: <code>{name}</code>, <code>{city}</code>, <code>{niche}</code></p>'+
   (d.items.length?d.items.map(x=>'<div class=card style="margin-bottom:12px"><div class=row><b>'+x.name+'</b> <span class="pill '+x.channel.slice(0,2)+'">'+x.channel+'</span> <span class="pill '+(x.active?'on':'off')+'">'+(x.active?'ativo':'off')+'</span></div>'+(x.subject?'<div class=muted style="margin-top:6px">assunto: '+x.subject+'</div>':'')+'<pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0;font-size:13px">'+x.body+'</pre><button class=sec onclick="editCopy(\\''+x.id+'\\')">editar</button> <button class=sec onclick="toggleCopy(\\''+x.id+'\\','+!x.active+')">'+(x.active?'desativar':'ativar')+'</button> <button class=danger onclick="delCopy(\\''+x.id+'\\')">×</button></div>').join(''):'<p class=muted>nada ainda.</p>');
  window.toggleCopy=async(id,v)=>{await api('/copy/'+id,{method:'PATCH',body:JSON.stringify({active:v})});render()};
  window.delCopy=async(id)=>{if(confirm('deletar?')){await api('/copy/'+id,{method:'DELETE'});render()}};
  window.newCopy=()=>openCopyModal(null);
  window.editCopy=(id)=>openCopyModal(d.items.find(x=>x.id===id));
  window.openCopyModal=(x)=>{
    openModal('<h3>'+(x?'Editar':'Novo')+' template</h3>'+
     '<label>Nome</label><input id=tn value="'+(x?.name||'')+'">'+
     '<label>Canal</label><select id=tch><option value=whatsapp '+(x?.channel==='whatsapp'?'selected':'')+'>WhatsApp</option><option value=email '+(x?.channel==='email'?'selected':'')+'>Email</option></select>'+
     '<label>Assunto (só email)</label><input id=ts value="'+(x?.subject||'')+'">'+
     '<label>Corpo</label><textarea id=tb style="min-height:180px">'+(x?.body||'')+'</textarea>'+
     '<div style="margin-top:20px"><button onclick="saveCopy(\\''+(x?.id||'')+'\\')">Salvar</button> <button class=sec onclick="closeModal()">cancelar</button></div>');
  };
  window.saveCopy=async(id)=>{
    const body={name:$('#tn').value,channel:$('#tch').value,subject:$('#ts').value||null,body:$('#tb').value,active:true};
    if(id)await api('/copy/'+id,{method:'PATCH',body:JSON.stringify(body)});
    else await api('/copy',{method:'POST',body:JSON.stringify(body)});
    closeModal();render();
  };
}

async function renderNums(){
  const d=await api('/instances');
  $('#app').innerHTML='<h2>Números WhatsApp (Evolution) <button onclick="newInst()" style="float:right">+ novo</button></h2>'+
   '<p class=muted>Worker rotaciona entre instâncias ativas, escolhendo a menos usada. Stage 1=novo (até 30/d), 2=meio (60/d), 3=maduro (100-150/d).</p>'+
   (d.items.length?'<table><tr><th>Nome</th><th>Telefone</th><th>Cap/d</th><th>Enviados hoje</th><th>Stage</th><th>Status</th><th></th></tr>'+
   d.items.map(x=>'<tr><td>'+x.name+'</td><td>'+(x.phone||'—')+'</td><td>'+x.daily_cap+'</td><td>'+x.daily_sent+'</td><td>warmup '+x.warmup_stage+'</td><td><span class="pill '+(x.active?'on':'off')+'">'+(x.active?'ativo':'off')+'</span></td><td><button class=sec onclick="editInst(\\''+x.id+'\\')">edit</button> <button class=sec onclick="toggleInst(\\''+x.id+'\\','+!x.active+')">'+(x.active?'desativar':'ativar')+'</button> <button class=danger onclick="delInst(\\''+x.id+'\\')">×</button></td></tr>').join('')+'</table>':'<p class=muted>nenhuma instância cadastrada.</p>');
  window._insts=d.items;
  window.toggleInst=async(id,v)=>{await api('/instances/'+id,{method:'PATCH',body:JSON.stringify({active:v})});render()};
  window.delInst=async(id)=>{if(confirm('deletar?')){await api('/instances/'+id,{method:'DELETE'});render()}};
  window.newInst=()=>openInstModal(null);
  window.editInst=(id)=>openInstModal(window._insts.find(x=>x.id===id));
  window.openInstModal=(x)=>{
    openModal('<h3>'+(x?'Editar':'Nova')+' instância</h3>'+
     '<label>Nome (= nome da instância na Evolution API)</label><input id=in value="'+(x?.name||'')+'">'+
     '<label>API URL</label><input id=iu value="'+(x?.api_url||'')+'" placeholder="https://evolution.exemplo.com">'+
     '<label>API Key</label><input id=ik value="'+(x?.api_key||'')+'">'+
     '<label>Telefone (info)</label><input id=ip value="'+(x?.phone||'')+'" placeholder="5519999999999">'+
     '<div class=row><div><label>Cap/dia</label><input id=idc type=number value="'+(x?.daily_cap||30)+'"></div><div><label>Warmup stage</label><select id=iws><option value=1 '+(x?.warmup_stage==1?"selected":"")+'>1 - novo</option><option value=2 '+(x?.warmup_stage==2?"selected":"")+'>2 - meio</option><option value=3 '+(x?.warmup_stage==3?"selected":"")+'>3 - maduro</option></select></div></div>'+
     '<div style="margin-top:20px"><button onclick="saveInst(\\''+(x?.id||'')+'\\')">Salvar</button> <button class=sec onclick="closeModal()">cancelar</button></div>');
  };
  window.saveInst=async(id)=>{
    const body={name:$('#in').value,api_url:$('#iu').value,api_key:$('#ik').value,phone:$('#ip').value||null,daily_cap:Number($('#idc').value),warmup_stage:Number($('#iws').value),active:true};
    if(id)await api('/instances/'+id,{method:'PATCH',body:JSON.stringify(body)});
    else await api('/instances',{method:'POST',body:JSON.stringify(body)});
    closeModal();render();
  };
}

async function renderRuns(){
  const d=await api('/runs');
  $('#app').innerHTML='<h2>Execuções autônomas</h2>'+
   '<table><tr><th>Quando</th><th>Campanha</th><th>WA</th><th>Email</th><th>Status</th></tr>'+
   d.items.map(r=>'<tr><td>'+new Date(r.started_at).toLocaleString('pt-BR')+'</td><td>'+(r.campaigns?.name||'—')+'</td><td>'+(r.leads_sent_wa||0)+'</td><td>'+(r.leads_sent_email||0)+'</td><td>'+r.status+(r.notes?' · '+r.notes:'')+'</td></tr>').join('')+'</table>';
}

$('#kill').onclick=async()=>{
  const m=await api('/metrics');
  if(confirm(m.dispatch_paused?'Retomar disparos?':'PAUSAR todos os disparos?')){
    await api('/kill',{method:'POST',body:JSON.stringify({paused:!m.dispatch_paused})});render();
  }
};

// bootstrap
api('/metrics').then(m=>{if(m.error){location.href='/admin/login'}else render()}).catch(()=>location.href='/admin/login');
</script></body></html>`;
