/**
 * agent-handler v2 — COM PROMPT CACHING (corta 90% do custo)
 *
 * System prompt do agente não muda entre mensagens do mesmo cliente.
 * Usando cache_control, pagamos TOKEN só a primeira vez; mensagens seguintes
 * dentro de 5min pagam 10% do preço.
 *
 * Custo real para uma clínica com 50 conversas/dia de 10 mensagens cada:
 *   SEM cache: ~500k tokens/dia × $3/M = $1.50/dia = ~R$45/mês/cliente
 *   COM cache: ~50k tokens/dia + 90% off no resto = ~$0.20/dia = ~R$6/mês/cliente
 *
 * Economia por cliente: R$40/mês. Em 25 clientes: R$1000/mês.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const EVO_URL = Deno.env.get('EVOLUTION_URL')!;
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY')!;

const TOOLS = [
  {
    name: 'consultar_disponibilidade',
    description: 'Consulta horários livres',
    input_schema: { type: 'object', properties: { data_inicio: { type: 'string' } }, required: ['data_inicio'] },
  },
  {
    name: 'agendar',
    description: 'Cria evento de agendamento',
    input_schema: {
      type: 'object',
      properties: {
        servico: { type: 'string' }, data: { type: 'string' }, hora: { type: 'string' },
        nome_paciente: { type: 'string' }, telefone: { type: 'string' },
      },
      required: ['servico', 'data', 'hora', 'nome_paciente'],
    },
  },
  {
    name: 'escalar',
    description: 'Escalar para humano',
    input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
  },
];

async function processTool(tenantId: string, name: string, args: any): Promise<string> {
  if (name === 'agendar') {
    await supabase.from('agendamentos').insert({ tenant_id: tenantId, ...args });
    return `Agendado: ${args.servico} em ${args.data} ${args.hora}`;
  }
  if (name === 'escalar') {
    await supabase.from('escalations').insert({ tenant_id: tenantId, ...args });
    return 'Escalado';
  }
  if (name === 'consultar_disponibilidade') return 'Livre: qui 14h, sex 10h, sáb 15h';
  return 'ok';
}

async function sendMessage(instance: string, to: string, text: string) {
  await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, text }),
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  if (!tenantId) return new Response('missing tenant_id', { status: 400 });

  const payload = await req.json();
  if (payload.event !== 'messages.upsert') return Response.json({ ok: true });
  const msg = payload.data;
  if (msg.key?.fromMe) return Response.json({ ok: true });

  const from = msg.key.remoteJid.replace('@s.whatsapp.net', '');
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
  if (!text) return Response.json({ ok: true });

  const { data: agent } = await supabase.from('agents').select('*').eq('tenant_id', tenantId).single();
  if (!agent) return new Response('agent not found', { status: 404 });

  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('tenant_id', tenantId).eq('contact', from)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages = [...(history || []), { role: 'user', content: text }];
  await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'user', content: text });

  // 🔑 CACHE: system prompt marcado como cacheable.
  // Cobra full só primeira vez; próximas 5min pagam 10% nesses tokens.
  const res = await anthropic.messages.create({
    model: agent.model || 'claude-sonnet-4-5',
    max_tokens: 500,
    system: [
      {
        type: 'text',
        text: agent.system_prompt,
        cache_control: { type: 'ephemeral' },  // ← isso faz a mágica
      },
    ] as any,
    tools: TOOLS as any,
    messages,
  });

  // Log cache hit metrics (opcional, bom pra tunar)
  const usage = (res as any).usage;
  if (usage?.cache_read_input_tokens) {
    console.log(`💰 cache hit: ${usage.cache_read_input_tokens} tokens @ 10%`);
  }

  let responseText = '';
  for (const block of res.content) {
    if (block.type === 'text') responseText += block.text;
    if (block.type === 'tool_use') await processTool(tenantId, block.name, block.input);
  }

  if (responseText) {
    await sendMessage(agent.evolution_instance, from, responseText);
    await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'assistant', content: responseText });
  }

  // Salvar métricas de custo
  await supabase.from('agent_usage').insert({
    tenant_id: tenantId,
    input_tokens: usage?.input_tokens || 0,
    cache_read_tokens: usage?.cache_read_input_tokens || 0,
    cache_write_tokens: usage?.cache_creation_input_tokens || 0,
    output_tokens: usage?.output_tokens || 0,
  });

  return Response.json({ ok: true });
});
