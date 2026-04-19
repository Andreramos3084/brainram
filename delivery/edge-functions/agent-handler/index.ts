/**
 * Supabase Edge Function — agent-handler
 *
 * Recebe mensagem do WhatsApp via webhook Evolution,
 * processa com Claude, responde.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';

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
    description: 'Consulta horários livres no Google Calendar',
    input_schema: { type: 'object', properties: { data_inicio: { type: 'string' }, data_fim: { type: 'string' } }, required: ['data_inicio'] },
  },
  {
    name: 'agendar',
    description: 'Cria evento no Google Calendar',
    input_schema: {
      type: 'object',
      properties: {
        servico: { type: 'string' },
        data: { type: 'string' },
        hora: { type: 'string' },
        nome_paciente: { type: 'string' },
        telefone: { type: 'string' },
      },
      required: ['servico', 'data', 'hora', 'nome_paciente'],
    },
  },
  {
    name: 'escalar',
    description: 'Escala para humano',
    input_schema: { type: 'object', properties: { motivo: { type: 'string' }, prioridade: { type: 'string' } }, required: ['motivo'] },
  },
];

async function processTool(tenantId: string, name: string, args: any): Promise<string> {
  if (name === 'agendar') {
    await supabase.from('agendamentos').insert({ tenant_id: tenantId, ...args });
    return `Agendado: ${args.servico} em ${args.data} ${args.hora}`;
  }
  if (name === 'escalar') {
    await supabase.from('escalations').insert({ tenant_id: tenantId, ...args });
    return 'Escalado para humano';
  }
  if (name === 'consultar_disponibilidade') {
    return 'Horários disponíveis: qui 14h, sex 10h, sáb 15h';
  }
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

  // Load agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();
  if (!agent) return new Response('agent not found', { status: 404 });

  // Load history (last 20)
  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('tenant_id', tenantId)
    .eq('contact', from)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages = [...(history || []), { role: 'user', content: text }];

  // Save user message
  await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'user', content: text });

  // Call Claude
  const res = await anthropic.messages.create({
    model: agent.model,
    max_tokens: 500,
    system: agent.system_prompt,
    tools: TOOLS,
    messages,
  });

  // Handle tool_use
  let responseText = '';
  for (const block of res.content) {
    if (block.type === 'text') responseText += block.text;
    if (block.type === 'tool_use') {
      await processTool(tenantId, block.name, block.input);
    }
  }

  if (responseText) {
    await sendMessage(agent.evolution_instance, from, responseText);
    await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'assistant', content: responseText });
  }

  return Response.json({ ok: true });
});
