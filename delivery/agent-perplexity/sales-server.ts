/**
 * DFY-IA Sales Server — atende leads no número Clickmont (551151280116)
 *
 * Endpoints:
 *   GET  /health
 *   POST /sales/webhook    - Evolution Clickmont recebe mensagem do lead
 *   POST /mp/webhook       - Mercado Pago notifica eventos (auth/payment)
 *   POST /sales/dispatch   - chamada interna para disparar 1ª mensagem pro lead
 *
 * Fluxo do lead:
 *   1. Scraper salva lead em `leads` (score, mensagem_cold, city)
 *   2. /sales/dispatch envia: mensagem personalizada + vídeo demo-final.mp4
 *   3. Lead responde via WhatsApp → /sales/webhook
 *   4. Perplexity sonar decide: enviar checkout_link | agendar_call | continuar conversa | escalar
 *   5. Se enviou checkout_link e lead paga → /mp/webhook cria tenant + ativa trial
 *
 * Deploy:
 *   bun install; bun run sales-server.ts
 *   Env: PERPLEXITY_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *        EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE (=Clickmont),
 *        MP_ACCESS_TOKEN, ADMIN_PHONE, DEMO_VIDEO_URL
 */
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { mountAdmin, runCampaignTick } from './admin.js';

const PPLX_KEY = process.env.PERPLEXITY_KEY!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVO_URL = process.env.EVOLUTION_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Clickmont';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN!;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5519998760212';
const DEMO_VIDEO_URL = process.env.DEMO_VIDEO_URL || '';

for (const [k, v] of Object.entries({ PPLX_KEY, SUPA_URL, SUPA_KEY, EVO_URL, EVO_KEY, MP_TOKEN })) {
  if (!v) throw new Error(`missing env: ${k}`);
}

const supabase = createClient(SUPA_URL, SUPA_KEY);

// Links de checkout criados no MP
const CHECKOUT_LINKS = {
  starter: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=1bb4b341c50c47eb95bd345414d36680',
  pro: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=5f5e825dbe0549b5b73e33a23f73f1dd',
  premium: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=63ab283b53164d98aa03d3c789e0d2a0',
};

const SALES_SYSTEM = `Você é assistente comercial da BrainRam. Fala como humana — direta, curta (3-4 linhas), sem jargão vendedor, sem emoji excessivo. Nada de "entendo perfeitamente", "excelente escolha", "segue abaixo". Nunca se apresente como bot. Nunca cite o nome de nenhum sócio ou dono a não ser que o lead pergunte explicitamente quem é o responsável — e mesmo assim só "André Ramos" (sem sobrenome extra).

PRODUTO: BrainRam — atendente de IA no WhatsApp pra clínicas odonto (expandindo pra outros segmentos). Responde paciente, qualifica, passa preço, agenda, envia lembrete — 24/7. Integra com Google Calendar.

PLANOS (todos com 7 dias de teste grátis, cartão cadastrado no início, reembolso integral se solicitar dentro do prazo de 7 dias):
- Starter R$297/mês — 1 número, agendamentos básicos
- Pro R$397/mês — + Google Calendar + relatórios
- Premium R$497/mês — multi-atendente + integrações sob medida

LINGUAGEM OBRIGATÓRIA:
- NUNCA diga "você vai pagar", "cobrança", "fatura". Diga "você testa", "você experimenta", "você ativa a assinatura com 7 dias grátis".
- Trial: "são 7 dias grátis pra você experimentar — cadastra o cartão no começo pra ativar, testa o atendente na clínica. Se não gostar, solicita o reembolso dentro dos 7 dias e o valor volta integral. Se gostar, a assinatura segue normal."
- Call: NUNCA diga "agendar call com André". Diga: "vou te encaminhar pra atendimento pessoal — quando você pode conversar? Tenho essas janelas: [horários]". Só cite "André Ramos" se o lead perguntar quem é o responsável/dono.
- "Posso te mandar o link pra você testar?" (não "pra você comprar").

REGRAS DE DECISÃO:

1. **Perguntou preço OU demonstrou interesse concreto em testar** → action=checkout_link, plan=starter como default. Reply curta (1-2 linhas). O link é enviado logo em seguida pelo sistema.
   Ex reply: "Starter R$297/mês, 7 dias grátis pra você experimentar. Te mando o link aqui."

2. **Objeção complexa que você NÃO sabe responder com certeza** (contrato, garantia contratual, NF-e, LGPD específico, integração custom) → action=agendar_call. Na reply, encaminhe pro atendimento pessoal e PROPONHA 3 horários concretos.
   Ex reply: "Essa é conversa melhor no atendimento pessoal. Tenho essas janelas essa semana: quarta 10h, quinta 14h ou sexta 16h. Qual funciona pra você?"

3. **Pedido explícito de falar com humano / agendar call** → action=agendar_call + proponha 3 horários como em (2).

4. **Dúvida comum que você SABE responder** (o que é, como funciona, integração Google Calendar, diferenças entre planos, exemplo de uso) → action=null. Responde em 2-3 linhas e pergunta se quer testar.

5. **"Quero saber mais" / "Tenho dúvidas" SEM especificar** → action=null. Pergunta o que quer saber ("posso te contar sobre preço, integração com Google Calendar, exemplos pra clínica, ou como o teste funciona — qual interessa?"). NUNCA agende call só por "saber mais".

REGRAS DURAS:
- Nunca prometa resultado, ROI ou nº de clientes. Sem "você vai fechar X agendamentos".
- "É bot?": "sou a assistente virtual da BrainRam — mas tenho acompanhamento humano atrás."
- Desconto: "desconto rolo só em plano anual antecipado, isso é conversa do atendimento pessoal — te encaminho?"
- Sobre contrato: "sim, todo plano tem contrato de adesão com CNPJ, endereço fiscal e cláusulas LGPD — te mando o link junto com o do teste, ou prefere revisar antes?"
- Máximo 4 linhas por mensagem.

JSON:
{ "reply": "msg pro lead", "action": "checkout_link"|"agendar_call"|"escalar"|null, "args": {...} }
args checkout_link: { "plan": "starter"|"pro"|"premium" }
args agendar_call:  { "horarios_propostos": "quarta 10h, quinta 14h ou sexta 16h" }
args escalar:       { "motivo": "string" }
`;

const RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        action: { type: ['string', 'null'] },
        args: { type: 'object' },
      },
      required: ['reply'],
    },
  },
};

async function sendText(to: string, text: string) {
  const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, text }),
  });
  if (!r.ok) console.error('evolution sendText failed', r.status, await r.text().catch(() => ''));
}

async function sendMedia(to: string, url: string, caption: string, mediatype = 'video', mimetype = 'video/mp4', fileName = 'demo.mp4') {
  const r = await fetch(`${EVO_URL}/message/sendMedia/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, mediatype, mimetype, media: url, caption, fileName }),
  });
  if (!r.ok) console.error('evolution sendMedia failed', r.status, await r.text().catch(() => ''));
}

async function callPerplexity(history: Array<{ role: string; content: string }>, userText: string) {
  const merged: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SALES_SYSTEM },
  ];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = merged[merged.length - 1];
    if (last.role === role) last.content += '\n' + m.content;
    else merged.push({ role, content: m.content });
  }
  const last = merged[merged.length - 1];
  if (last.role === 'user') last.content += '\n' + userText;
  else merged.push({ role: 'user', content: userText });

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PPLX_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: merged,
      max_tokens: 500,
      temperature: 0.3,
      response_format: RESPONSE_SCHEMA,
    }),
  });
  if (!res.ok) {
    console.error('perplexity error', res.status, (await res.text()).slice(0, 300));
    return { reply: 'Deu um problema técnico aqui, já te respondo.', action: 'escalar', args: { motivo: 'pplx error' } };
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content ?? '';
  try { return JSON.parse(txt); } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { reply: txt || 'oi! me manda de novo pfv', action: null, args: {} };
  }
}

async function executeAction(contact: string, action: string | null, args: any) {
  if (!action) return;
  if (action === 'checkout_link') {
    const plan = args?.plan || 'starter';
    const link = (CHECKOUT_LINKS as any)[plan] || CHECKOUT_LINKS.starter;
    const price = plan === 'starter' ? 297 : plan === 'pro' ? 397 : 497;
    const contractMap: Record<string, string> = {
      starter: 'https://nlcmhqevxpdttuhamjsj.supabase.co/storage/v1/object/public/public-assets/contrato-starter.pdf',
      pro: 'https://nlcmhqevxpdttuhamjsj.supabase.co/storage/v1/object/public/public-assets/contrato-pro.pdf',
      premium: 'https://nlcmhqevxpdttuhamjsj.supabase.co/storage/v1/object/public/public-assets/contrato-premium.pdf',
    };
    // external_reference = phone do lead → MP devolve isso na preapproval, usamos pra linkar tenant ↔ telefone
    const ext = encodeURIComponent(contact);
    const linkWithRef = `${link}&external_reference=${ext}`;
    await sendText(contact,
      `Plano ${plan.toUpperCase()} — R$${price}/mês.\n7 dias de teste grátis — se não gostar, pede reembolso dentro dos 7 dias e o valor volta integral.\n\n✅ Ativar teste: ${linkWithRef}\n📄 Contrato de adesão: ${contractMap[plan]}\n\nImportante: no 6º dia do teste te pergunto se você quer continuar. Se não responder CONTINUAR até o fim do 7º dia, a assinatura é cancelada automaticamente — sem cobrança.`
    );
    return;
  }
  if (action === 'agendar_call') {
    await sendText(ADMIN_PHONE, `📞 Lead quer atendimento pessoal\n\nContato: ${contact}\nHorários propostos: ${args?.horarios_propostos || '-'}\n\nwa.me/${contact.replace(/\D/g, '')}`);
    return;
  }
  if (action === 'escalar') {
    await sendText(ADMIN_PHONE, `⚠️ Escalada\n\nContato: ${contact}\nMotivo: ${args?.motivo || '-'}\n\nwa.me/${contact.replace(/\D/g, '')}`);
    return;
  }
}

// ====== Trial lifecycle: auto-cancel se cliente não confirmar ======

async function cancelPreapproval(mpId: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.mercadopago.com/preapproval/${mpId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (!r.ok) {
      console.error('MP cancel failed', mpId, r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('MP cancel exception', mpId, e);
    return false;
  }
}

// Detecta intenção de confirmar/cancelar assinatura em mensagens do cliente durante trial
function detectTrialIntent(text: string): 'confirm' | 'cancel' | null {
  const t = text.trim().toLowerCase();
  if (/^(continuar|confirmar|sim,?\s*(quero|continuar|confirmar)|quero continuar|quero manter|manter assinatura)\s*!?\.?$/i.test(t)) return 'confirm';
  if (/^(sair|cancelar|cancela|n[ãa]o quero|parar assinatura|nao continuar|não continuar)\s*!?\.?$/i.test(t)) return 'cancel';
  return null;
}

// Se o contato tem tenant em trial, aplica confirm/cancel. Retorna true se tratou a intenção.
async function handleTrialIntentForContact(contact: string, intent: 'confirm' | 'cancel'): Promise<boolean> {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, mp_preapproval_id, plan, status, trial_ends_at')
    .eq('lead_phone', contact)
    .eq('status', 'trial')
    .limit(1);
  const tenant = tenants?.[0];
  if (!tenant) return false;
  if (intent === 'confirm') {
    await supabase.from('tenants').update({ trial_confirmed: true }).eq('id', tenant.id);
    await sendText(contact, `Perfeito — assinatura confirmada. O teste segue até ${new Date(tenant.trial_ends_at).toLocaleDateString('pt-BR')} e depois a mensalidade entra normal. Qualquer coisa me chama.`);
    await sendText(ADMIN_PHONE, `✅ Cliente CONFIRMOU assinatura\nPlano: ${tenant.plan}\nTel: ${contact}\nTrial até: ${new Date(tenant.trial_ends_at).toLocaleDateString('pt-BR')}`);
    return true;
  }
  // cancel
  const ok = tenant.mp_preapproval_id ? await cancelPreapproval(tenant.mp_preapproval_id) : true;
  await supabase.from('tenants').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', tenant.id);
  await sendText(contact, `Feito — assinatura cancelada. Nenhum valor foi cobrado. Se mudar de ideia, é só me avisar.`);
  await sendText(ADMIN_PHONE, `🛑 Cliente CANCELOU antes do fim do teste\nPlano: ${tenant.plan}\nTel: ${contact}\nMP cancel: ${ok ? 'ok' : 'FALHOU'}`);
  return true;
}

// Job horário: (1) avisa 24h antes do fim do trial; (2) cancela automático se passou do trial_ends_at e não confirmou.
async function runTrialCheck(): Promise<{ prompted: number; cancelled: number }> {
  const now = Date.now();
  const in24h = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  // 1) Prompt 24h antes
  const { data: toPrompt } = await supabase
    .from('tenants')
    .select('id, plan, lead_phone, trial_ends_at')
    .eq('status', 'trial')
    .eq('trial_confirmed', false)
    .is('trial_prompt_sent_at', null)
    .lte('trial_ends_at', in24h)
    .gt('trial_ends_at', new Date(now).toISOString());

  let prompted = 0;
  for (const t of toPrompt || []) {
    if (t.lead_phone) {
      await sendText(t.lead_phone,
        `Aqui é a BrainRam — seu teste de 7 dias termina em ${new Date(t.trial_ends_at).toLocaleDateString('pt-BR')}.\n\nPra continuar com a assinatura (plano ${t.plan}), responde *CONTINUAR*.\nPra cancelar sem pagar nada, responde *SAIR*.\n\nSe não responder, cancelo automático — sem cobrança.`);
    }
    await supabase.from('tenants').update({ trial_prompt_sent_at: new Date().toISOString() }).eq('id', t.id);
    prompted++;
  }

  // 2) Cancelar quem já passou do trial e não confirmou
  const { data: toCancel } = await supabase
    .from('tenants')
    .select('id, plan, lead_phone, mp_preapproval_id')
    .eq('status', 'trial')
    .eq('trial_confirmed', false)
    .lte('trial_ends_at', new Date(now).toISOString());

  let cancelled = 0;
  for (const t of toCancel || []) {
    const ok = t.mp_preapproval_id ? await cancelPreapproval(t.mp_preapproval_id) : true;
    await supabase.from('tenants').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', t.id);
    if (t.lead_phone) {
      await sendText(t.lead_phone, `Seu teste de 7 dias da BrainRam terminou e como você não confirmou, cancelei a assinatura — nenhum valor foi cobrado. Se quiser voltar, é só me avisar.`);
    }
    await sendText(ADMIN_PHONE, `⏰ AUTO-CANCEL (trial expirado sem confirmação)\nPlano: ${t.plan}\nTel: ${t.lead_phone || '-'}\nMP cancel: ${ok ? 'ok' : 'FALHOU'}`);
    cancelled++;
  }

  return { prompted, cancelled };
}

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'dfy-ia-sales' }));

// Endpoint manual pra disparar trial-check (pra cron externo OU validação)
app.post('/admin/trial-check', async (c) => {
  const key = c.req.header('x-admin-key');
  if (key !== (process.env.ADMIN_KEY || 'brainram-admin')) return c.json({ error: 'unauthorized' }, 401);
  const out = await runTrialCheck();
  return c.json({ ok: true, ...out });
});

// Relatório diário — chamado por cron, manda resumo pro admin via WhatsApp
async function runDailyReport(): Promise<string> {
  const now = new Date();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: sentCount }, { count: repliedCount }, { count: totalLeads }] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('sent_at', dayAgo),
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('replied_at', dayAgo),
    supabase.from('leads').select('*', { count: 'exact', head: true }),
  ]);

  const { data: tenants } = await supabase.from('tenants').select('plan, status, trial_confirmed, created_at');
  const trialActive = tenants?.filter(t => t.status === 'trial').length || 0;
  const confirmed = tenants?.filter(t => t.trial_confirmed && t.status === 'trial').length || 0;
  const cancelled = tenants?.filter(t => t.status === 'cancelled').length || 0;
  const newToday = tenants?.filter(t => t.created_at >= dayAgo).length || 0;

  const byPlan = { starter: 0, pro: 0, premium: 0 } as Record<string, number>;
  for (const t of tenants || []) if (t.plan && t.status === 'trial') byPlan[t.plan] = (byPlan[t.plan] || 0) + 1;
  const mrr = (byPlan.starter || 0) * 297 + (byPlan.pro || 0) * 397 + (byPlan.premium || 0) * 497;

  const dateStr = now.toLocaleDateString('pt-BR');
  const msg = `📊 *BrainRam — relatório ${dateStr}*\n\n` +
    `*Prospecção (24h)*\n• Mensagens disparadas: ${sentCount || 0}\n• Respostas recebidas: ${repliedCount || 0}\n• Taxa: ${sentCount ? ((repliedCount || 0) / sentCount * 100).toFixed(1) : '0'}%\n• Base total: ${totalLeads || 0} leads\n\n` +
    `*Clientes*\n• Novos (24h): ${newToday}\n• Em trial: ${trialActive} (${confirmed} já confirmaram)\n• Cancelados: ${cancelled}\n\n` +
    `*MRR projetado*: R$ ${mrr.toLocaleString('pt-BR')}\n• Starter: ${byPlan.starter} · Pro: ${byPlan.pro} · Premium: ${byPlan.premium}`;

  await sendText(ADMIN_PHONE, msg);
  return msg;
}

app.post('/admin/daily-report', async (c) => {
  const key = c.req.header('x-admin-key');
  if (key !== (process.env.ADMIN_KEY || 'brainram-admin')) return c.json({ error: 'unauthorized' }, 401);
  const report = await runDailyReport();
  return c.json({ ok: true, report });
});

// === Dashboard cliente: métricas por tenant ===
// Acesso via token (tenant.id como slug simples; em prod, trocar por JWT/token dedicado)
app.get('/dashboard/:slug/api', async (c) => {
  const slug = c.req.param('slug');
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, plan, status, trial_ends_at, trial_confirmed, cancelled_at, created_at')
    .eq('slug', slug).maybeSingle();
  if (!tenant) return c.json({ error: 'not found' }, 404);

  const dayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();

  const [{ count: conv24 }, { count: conv7d }, { count: totalConv }] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', dayAgo),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', weekAgo),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
  ]);

  const { data: contacts } = await supabase
    .from('conversations')
    .select('contact').eq('tenant_id', tenant.id).gte('created_at', weekAgo);
  const uniqueContacts7d = new Set((contacts || []).map(r => r.contact)).size;

  const trialDaysLeft = tenant.status === 'trial' && tenant.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (24*3600*1000)))
    : null;

  const [{ count: agend7d }, { count: agendTotal }, { count: escala7d }] = await Promise.all([
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', weekAgo),
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    supabase.from('escalations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', weekAgo),
  ]);

  return c.json({
    tenant: {
      name: tenant.name, plan: tenant.plan, status: tenant.status,
      created_at: tenant.created_at, trial_ends_at: tenant.trial_ends_at,
      trial_confirmed: tenant.trial_confirmed, trial_days_left: trialDaysLeft,
    },
    metrics: {
      conversations_24h: conv24 || 0,
      conversations_7d: conv7d || 0,
      conversations_total: totalConv || 0,
      unique_contacts_7d: uniqueContacts7d,
      agendamentos_7d: agend7d || 0,
      agendamentos_total: agendTotal || 0,
      escalacoes_7d: escala7d || 0,
    },
  });
});

app.get('/dashboard/:slug/api/conversations', async (c) => {
  const slug = c.req.param('slug');
  const limit = Number(c.req.query('limit') || 100);
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
  if (!tenant) return c.json({ error: 'not found' }, 404);

  const { data: items } = await supabase
    .from('conversations')
    .select('id, contact, role, content, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return c.json({ items: items || [] });
});

app.get('/dashboard/:slug', (c) => {
  const slug = c.req.param('slug');
  // Redireciona para o dashboard React (deployado separadamente)
  // Em produção, o nginx serve o React em /dashboard/ e este endpoint não é usado diretamente
  return c.html(`<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>BrainRam Dashboard</title>
<meta name=viewport content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1419;color:#e6e6e6;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:16px}
.loader{width:40px;height:40px;border:3px solid #2a3140;border-top-color:#22c55e;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
a{color:#22c55e;text-decoration:none}
</style></head><body>
<div class=loader></div>
<p>Redirecionando para o painel...</p>
<script>setTimeout(()=>location.href='https://dashboard.brainram.com.br/dashboard/${slug}',1500)</script>
</body></html>`);
});

// === Evolution webhook: mensagem do lead chega aqui ===
app.post('/sales/webhook', async (c) => {
  const payload: any = await c.req.json().catch(() => ({}));
  if (payload.event !== 'messages.upsert') return c.json({ ok: true });
  const msg = payload.data;
  if (msg?.key?.fromMe) return c.json({ ok: true });
  const from = (msg?.key?.remoteJid || '').replace('@s.whatsapp.net', '');
  const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
  if (!from || !text) return c.json({ ok: true });

  // marca lead como respondeu
  await supabase.from('leads').update({ replied_at: new Date().toISOString() }).eq('phone', from);

  // Short-circuit: se cliente em trial respondeu CONTINUAR/SAIR, trata aqui e não chama Perplexity
  const intent = detectTrialIntent(text);
  if (intent) {
    await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'user', content: text });
    const handled = await handleTrialIntentForContact(from, intent);
    if (handled) return c.json({ ok: true, trial_intent: intent });
  }

  // histórico da conversa (usa tenant_id especial null = conversas sales)
  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .is('tenant_id', null).eq('contact', from)
    .order('created_at', { ascending: true }).limit(20);

  await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'user', content: text });

  const result = await callPerplexity(history || [], text);
  if (result.reply) {
    await sendText(from, result.reply);
    await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'assistant', content: result.reply });
  }
  await executeAction(from, result.action || null, result.args || {});
  return c.json({ ok: true });
});

// === Mercado Pago webhook ===
// MP chama com ?type=preapproval&data.id=XXX ou ?type=payment&data.id=YYY
app.post('/mp/webhook', async (c) => {
  const body: any = await c.req.json().catch(() => ({}));
  const type = c.req.query('type') || body.type;
  const id = c.req.query('data.id') || body?.data?.id;

  await supabase.from('mp_events').insert({ event_type: type, resource_id: id, payload: body });

  if (type === 'preapproval' && id) {
    // busca detalhes da preapproval
    const r = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (r.ok) {
      const pa = await r.json();
      const planId = pa.preapproval_plan_id;
      const plan = planId === '1bb4b341c50c47eb95bd345414d36680' ? 'starter'
                 : planId === '5f5e825dbe0549b5b73e33a23f73f1dd' ? 'pro'
                 : planId === '63ab283b53164d98aa03d3c789e0d2a0' ? 'premium' : null;
      const statusMap: Record<string, string> = { authorized: 'trial', paused: 'past_due', cancelled: 'cancelled' };
      const tenantStatus = statusMap[pa.status] || 'trial';

      const leadPhone: string | null = (pa.external_reference || '').replace(/\D/g, '') || null;

      await supabase.from('subscriptions').upsert({
        mp_preapproval_id: pa.id,
        mp_plan_id: planId,
        plan,
        status: pa.status,
        payer_email: pa.payer_email,
        next_payment_date: pa.next_payment_date,
        raw: pa,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mp_preapproval_id' });

      // cria/atualiza tenant
      const { data: existing } = await supabase.from('tenants').select('id').eq('mp_preapproval_id', pa.id).maybeSingle();
      if (!existing) {
        const slug = `cliente-${pa.id.slice(0, 8)}`;
        const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('tenants').insert({
          slug, name: pa.payer_email?.split('@')[0] || slug,
          plan, status: tenantStatus, trial_ends_at: trialEnds,
          mp_preapproval_id: pa.id, mp_payer_email: pa.payer_email,
          lead_phone: leadPhone,
        });
      } else {
        await supabase.from('tenants').update({ status: tenantStatus, plan, lead_phone: leadPhone }).eq('id', existing.id);
      }

      // notifica André
      await sendText(ADMIN_PHONE, `🎉 NOVO CLIENTE BrainRam\n\nPlano: ${plan}\nEmail: ${pa.payer_email}\nStatus MP: ${pa.status}\nTeste grátis até: ${new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString('pt-BR')}\n\nBora configurar.`);
    }
  }
  return c.json({ ok: true });
});

// === Dispatch: envia mensagem + vídeo pro lead ===
app.post('/sales/dispatch', async (c) => {
  const body = await c.req.json() as { phone: string; message: string; video?: boolean };
  const { phone, message, video = true } = body;
  await sendText(phone, message);
  if (video && DEMO_VIDEO_URL) {
    await new Promise(r => setTimeout(r, 3000));
    await sendMedia(phone, DEMO_VIDEO_URL, '', 'video', 'video/mp4', 'demo-dfy-ia.mp4');
  }
  await supabase.from('leads').update({ sent_at: new Date().toISOString() }).eq('phone', phone);
  return c.json({ ok: true });
});

// === Mount admin panel ===
mountAdmin(app, {
  supabase,
  sendText,
  sendMedia: (to: string, url: string, caption: string) => sendMedia(to, url, caption),
  ADMIN_KEY: process.env.ADMIN_KEY || 'brainram-admin',
  SCRAPER_URL: process.env.SCRAPER_URL || 'https://api.dfy-ia.com.br',
  SCRAPER_KEY: process.env.SCRAPER_API_KEY || '',
  RESEND_KEY: process.env.RESEND_API_KEY,
  FROM_EMAIL: process.env.FROM_EMAIL || 'BrainRam <onboarding@resend.dev>',
  REPLY_TO: process.env.REPLY_TO || 'contato@brainram.com.br',
  ADMIN_PHONE,
  DEMO_VIDEO_URL,
});

// Endpoint público pra cron disparar worker (usa x-admin-key)
app.post('/cron/campaign-tick', async (c) => {
  if (c.req.header('x-admin-key') !== (process.env.ADMIN_KEY || 'brainram-admin')) return c.json({ error: 'unauthorized' }, 401);
  const r = await runCampaignTick({
    supabase, sendText, sendMedia: async () => {},
    ADMIN_KEY: process.env.ADMIN_KEY || 'brainram-admin',
    SCRAPER_URL: process.env.SCRAPER_URL || '', SCRAPER_KEY: process.env.SCRAPER_API_KEY || '',
    RESEND_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL || 'BrainRam <onboarding@resend.dev>',
    REPLY_TO: process.env.REPLY_TO || 'contato@brainram.com.br',
    ADMIN_PHONE, DEMO_VIDEO_URL,
  });
  return c.json({ ok: true, ...r });
});

const port = Number(process.env.PORT || 8080);
console.log(`🤖 dfy-ia sales server :${port} (admin: /admin)`);
export default { port, fetch: app.fetch };
