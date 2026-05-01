/**
 * Supabase Edge Function — agent-handler
 *
 * Recebe mensagem do WhatsApp via webhook Evolution,
 * processa com Perplexity AI, responde.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAvailability, bookAppointment } from '../_shared/google-calendar.ts';
import { parseWebhook, sendMessage } from '../_shared/whatsapp.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY') || Deno.env.get('PERPLEXITY_KEY') || '';
const WA_VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'brainram-verify-2026';

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

// ─── Perplexity API call (OpenAI-compatible) ───

async function callPerplexity(systemPrompt: string, messages: any[], model: string = 'sonar-pro'): Promise<{ text: string; toolCalls: Array<{ name: string; args: any }> }> {
  if (!PERPLEXITY_KEY) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  // Build tool instructions appended to system prompt
  const toolInstructions = `

=== FERRAMENTAS DISPONÍVEIS ===
Você pode usar as seguintes ferramentas quando necessário. Para chamar uma ferramenta, responda APENAS com um JSON no formato:
{"tool": "NOME_DA_FERRAMENTA", "args": { ... }}

Ferramentas:
1. consultar_disponibilidade - Consulta horários livres no Google Calendar
   Args: { "data_inicio": "YYYY-MM-DD" } (opcional, padrão: hoje)

2. agendar - Cria evento no Google Calendar
   Args: { "servico": "string", "data": "YYYY-MM-DD", "hora": "HH:MM", "nome_paciente": "string", "telefone": "string" }

3. escalar - Escala para atendimento humano
   Args: { "motivo": "string", "prioridade": "string" }

Regras:
- Se o paciente quiser agendar, use a ferramenta "agendar" com os dados necessários.
- Se o paciente quiser saber horários livres, use "consultar_disponibilidade".
- Se for urgência ou caso complexo, use "escalar".
- Se não precisar de ferramenta, responda normalmente em português, como numa conversa de WhatsApp.
- Mensagens curtas: máximo 4 linhas. 1 emoji por mensagem.`;

  // Build messages ensuring user/assistant alternation (Perplexity requirement)
  const rawMessages = messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  // Merge consecutive messages with same role
  const mergedMessages: any[] = [];
  for (const msg of rawMessages) {
    if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
      mergedMessages[mergedMessages.length - 1].content += '\n\n' + msg.content;
    } else {
      mergedMessages.push({ ...msg });
    }
  }

  const openaiMessages = [
    { role: 'system', content: systemPrompt + toolInstructions },
    ...mergedMessages,
  ];

  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model === 'claude-3-5-sonnet-latest' ? 'sonar-pro' : model,
      messages: openaiMessages,
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Perplexity API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Try to parse tool call from JSON
  let toolCalls: Array<{ name: string; args: any }> = [];
  let text = content;

  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"tool"')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.tool) {
        toolCalls.push({ name: parsed.tool, args: parsed.args || {} });
        text = '';
      }
    }
  } catch {
    // Not a tool call, treat as regular text
  }

  return { text, toolCalls };
}

serve(async (req) => {
  try {
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

  // Call Perplexity
  const res = await callPerplexity(agent.system_prompt, messages, agent.model);

  // Handle tool calls
  let responseText = res.text;

  for (const tc of res.toolCalls) {
    const toolResult = await processTool(tenantId, tc.name, tc.args);
    messages.push({ role: 'assistant', content: JSON.stringify({ tool: tc.name, args: tc.args }) });
    messages.push({ role: 'user', content: `[Resultado da ferramenta ${tc.name}]: ${toolResult}` });
  }

  // If we had tool calls, ask Perplexity for final response
  if (res.toolCalls.length > 0 && !responseText) {
    const followUp = await callPerplexity(agent.system_prompt, messages, agent.model);
    responseText = followUp.text;
  }

  if (responseText) {
    const sendResult = await sendMessage(agent.evolution_instance, from, responseText);
    if (!sendResult.success) {
      console.error('Failed to send message:', sendResult.error);
    }
    await supabase.from('conversations').insert({ tenant_id: tenantId, contact: from, role: 'assistant', content: responseText });
  }

  return Response.json({ ok: true });
  } catch (err: any) {
    console.error('Edge function error:', err);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});
