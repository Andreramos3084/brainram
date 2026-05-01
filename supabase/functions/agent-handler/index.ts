/**
 * Supabase Edge Function — agent-handler
 *
 * Recebe mensagem do WhatsApp via webhook Evolution,
 * processa com Claude, responde.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { getAvailability, bookAppointment } from '../_shared/google-calendar.ts';
import { parseWebhook, sendMessage } from '../_shared/whatsapp.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const WA_VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'brainram-verify-2026';

const TOOLS = [
  {
    name: 'consultar_disponibilidade',
    description: 'Consulta horários livres no Google Calendar',
    input_schema: { type: 'object', properties: { data_inicio: { type: 'string' } }, required: [] },
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function processTool(tenantId: string, name: string, args: any): Promise<string> {
  const { data: agentRow } = await supabase
    .from('agents')
    .select('google_calendar_id, google_service_account_json, working_hours_start, working_hours_end, slot_duration_minutes, working_days')
    .eq('tenant_id', tenantId)
    .single();

  const hasCalendar = agentRow?.google_calendar_id && agentRow?.google_service_account_json;

  if (name === 'consultar_disponibilidade') {
    const dataInicio = args.data_inicio || todayISO();
    const dataFim = addDaysISO(dataInicio, 6);

    if (!hasCalendar) {
      return `Livre: ${dataInicio === todayISO() ? 'hoje' : dataInicio} até ${dataFim} (sem calendário configurado — mostrando período genérico)`;
    }

    try {
      const result = await getAvailability(
        agentRow.google_calendar_id,
        agentRow.google_service_account_json,
        dataInicio,
        dataFim,
        {
          start: agentRow.working_hours_start || '09:00',
          end: agentRow.working_hours_end || '18:00',
          slotMinutes: agentRow.slot_duration_minutes || 60,
          days: agentRow.working_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        }
      );
      return result;
    } catch (err: any) {
      console.error('Calendar error:', err);
      return 'Desculpe, não consegui consultar a agenda agora. Posso tentar de novo em instantes?';
    }
  }

  if (name === 'agendar') {
    let googleEventId: string | null = null;
    let googleEventLink: string | null = null;

    if (hasCalendar) {
      try {
        const result = await bookAppointment(
          agentRow.google_calendar_id,
          agentRow.google_service_account_json,
          args,
          {
            start: agentRow.working_hours_start || '09:00',
            end: agentRow.working_hours_end || '18:00',
            slotMinutes: agentRow.slot_duration_minutes || 60,
            days: agentRow.working_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          }
        );
        if (result.success) {
          googleEventId = result.eventId;
          googleEventLink = result.link;
        } else {
          console.error('Failed to create calendar event:', result.error);
        }
      } catch (err: any) {
        console.error('Calendar book error:', err);
      }
    }

    await supabase.from('agendamentos').insert({
      tenant_id: tenantId,
      contact: args.telefone,
      nome_paciente: args.nome_paciente,
      servico: args.servico,
      data: args.data,
      hora: args.hora,
      google_event_id: googleEventId,
      google_event_link: googleEventLink,
      status: 'agendado',
    });

    if (googleEventLink) {
      return `Agendado: ${args.servico} em ${args.data} às ${args.hora}. Link: ${googleEventLink}`;
    }
    return `Agendado: ${args.servico} em ${args.data} às ${args.hora}`;
  }

  if (name === 'escalar') {
    await supabase.from('escalations').insert({ tenant_id: tenantId, ...args });
    return 'Escalado para humano';
  }

  return 'ok';
}

serve(async (req) => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  if (!tenantId) return new Response('missing tenant_id', { status: 400 });

  // Meta webhook verification (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === WA_VERIFY) {
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('verification failed', { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const parsed = parseWebhook(payload);
  if (!parsed) return Response.json({ ok: true });

  const from = parsed.from;
  const text = parsed.text;
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
      const toolResult = await processTool(tenantId, block.name, block.input);
      messages.push({ role: 'user', content: `[Resultado da ferramenta ${block.name}]: ${toolResult}` });
    }
  }

  // Se processou tool e não tem responseText, pede resposta final ao Claude
  const hadToolUse = res.content.some((b: any) => b.type === 'tool_use');
  if (hadToolUse && !responseText) {
    const followUp = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 500,
      system: agent.system_prompt,
      messages,
    });
    for (const block of followUp.content) {
      if (block.type === 'text') responseText += block.text;
    }
  }

  if (responseText) {
    const sendResult = await sendMessage(agent.evolution_instance, from, responseText);
    if (!sendResult.success) {
      console.error('Failed to send message:', sendResult.error);
    }
    await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'assistant', content: responseText });
  }

  return Response.json({ ok: true });
});
