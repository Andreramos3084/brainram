/**
 * agent-handler (Perplexity) — servidor standalone pra rodar no VPS.
 *
 * Substitui o edge function Anthropic por Perplexity sonar (input ~$1/M, output ~$1/M).
 * Como o MCP não alcança o projeto Supabase `nlcmhqevxpdttuhamjsj`, rodamos aqui
 * num container ao lado da Evolution.
 *
 * Custo estimado — clínica com 50 conversas/dia de 10 mensagens, ~500k tokens/dia:
 *   sonar: ~$0.50/dia = ~R$15/mês por cliente (cabe em R$297).
 *
 * Fluxo:
 *   Evolution webhook → POST /webhook?tenant_id=xxx
 *   → busca agent.system_prompt + histórico conversations
 *   → chama Perplexity com response_format JSON { reply, action?, args? }
 *   → executa action (agendar/escalar/consultar) → envia reply via Evolution.
 *
 * Env:
 *   PERPLEXITY_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_URL, EVOLUTION_API_KEY
 *   PORT (default 8080)
 */

import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';

const PPLX_KEY = process.env.PERPLEXITY_KEY!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVO_URL = process.env.EVOLUTION_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
if (!PPLX_KEY || !SUPA_URL || !SUPA_KEY || !EVO_URL || !EVO_KEY) {
  throw new Error('missing env: PERPLEXITY_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_URL, EVOLUTION_API_KEY');
}

const supabase = createClient(SUPA_URL, SUPA_KEY);

const TOOLS_HINT = `
Você pode executar UMA ação por mensagem quando fizer sentido. Devolva no JSON:
- action: "agendar" | "consultar_disponibilidade" | "escalar" | null
- args: objeto com os campos da ação (ver abaixo) ou {}

agendar: { servico, data (YYYY-MM-DD), hora (HH:mm), nome_paciente, telefone? }
consultar_disponibilidade: { data_inicio (YYYY-MM-DD), data_fim? }
escalar: { motivo }

Se só precisa responder (sem ação), action=null.
Nunca invente horários — use consultar_disponibilidade antes de agendar, a não ser que o paciente já tenha visto a lista.
`;

const RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'mensagem pro paciente (WhatsApp, tom humano, PT-BR)' },
        action: { type: ['string', 'null'], enum: ['agendar', 'consultar_disponibilidade', 'escalar', null] },
        args: { type: 'object' },
      },
      required: ['reply'],
    },
  },
};

async function processAction(tenantId: string, contact: string, action: string | null, args: any): Promise<string | null> {
  if (!action) return null;
  if (action === 'agendar') {
    await supabase.from('agendamentos').insert({ tenant_id: tenantId, contact, ...args });
    return `✅ agendado: ${args.servico} ${args.data} ${args.hora}`;
  }
  if (action === 'escalar') {
    await supabase.from('escalations').insert({ tenant_id: tenantId, contact, motivo: args.motivo || '' });
    return null;
  }
  if (action === 'consultar_disponibilidade') {
    // TODO: integrar Google Calendar real por tenant. Stub mock por enquanto.
    return 'disponibilidade consultada (stub)';
  }
  return null;
}

async function sendWhatsApp(instance: string, to: string, text: string) {
  const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, text }),
  });
  if (!r.ok) console.error('evolution send failed', r.status, await r.text().catch(() => ''));
}

async function callPerplexity(systemPrompt: string, history: Array<{ role: string; content: string }>, userText: string) {
  // Perplexity rejeita mensagens consecutivas do mesmo role — compacta
  const merged: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt + '\n\n' + TOOLS_HINT },
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
      max_tokens: 600,
      temperature: 0.4,
      response_format: RESPONSE_SCHEMA,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('perplexity error', res.status, err.slice(0, 300));
    return { reply: 'Deu um errinho técnico aqui, me dá 1 min e eu volto.', action: 'escalar', args: { motivo: `api error ${res.status}` } };
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage || {};
  console.log(`💬 tokens: in=${usage.prompt_tokens} out=${usage.completion_tokens}`);
  try {
    return JSON.parse(txt);
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { reply: txt || 'oi! me manda de novo, pfv.', action: null, args: {} };
  }
}

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, agent: 'perplexity' }));

app.post('/webhook', async (c) => {
  const tenantId = c.req.query('tenant_id');
  if (!tenantId) return c.text('missing tenant_id', 400);

  const payload = await c.req.json().catch(() => ({} as any));
  if (payload.event !== 'messages.upsert') return c.json({ ok: true });
  const msg = payload.data;
  if (msg?.key?.fromMe) return c.json({ ok: true });

  const from = (msg?.key?.remoteJid || '').replace('@s.whatsapp.net', '');
  const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
  if (!from || !text) return c.json({ ok: true });

  const { data: agent } = await supabase.from('agents').select('*').eq('tenant_id', tenantId).single();
  if (!agent) return c.text('agent not found', 404);

  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('tenant_id', tenantId).eq('contact', from)
    .order('created_at', { ascending: true })
    .limit(20);

  await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'user', content: text });

  const result = await callPerplexity(agent.system_prompt, history || [], text);

  await processAction(tenantId, from, result.action || null, result.args || {});

  if (result.reply) {
    await sendWhatsApp(agent.evolution_instance, from, result.reply);
    await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'assistant', content: result.reply });
  }

  return c.json({ ok: true });
});

const port = Number(process.env.PORT || 8080);
console.log(`🤖 agent-perplexity ouvindo em :${port}`);
export default { port, fetch: app.fetch };
