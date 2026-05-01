/**
 * Supabase Edge Function — onboard-client
 *
 * Webhook do Tally chega aqui após cliente preencher formulário.
 * Cria tenant, instância Evolution, prompt do agente, dashboard.
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

interface TallyPayload {
  eventId: string;
  data: {
    fields: Array<{ key: string; label: string; type: string; value: any }>;
  };
}

function fieldMap(fields: TallyPayload['data']['fields']): Record<string, any> {
  const map: Record<string, any> = {};
  for (const f of fields) map[f.label.toLowerCase().replace(/\W+/g, '_')] = f.value;
  return map;
}

async function createEvolutionInstance(name: string) {
  const res = await fetch(`${EVO_URL}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ instanceName: name, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  });
  if (!res.ok) throw new Error(`evolution create failed: ${await res.text()}`);
  return res.json();
}

async function setEvolutionWebhook(instance: string, url: string) {
  await fetch(`${EVO_URL}/webhook/set/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({
      url,
      webhook_by_events: true,
      events: ['MESSAGES_UPSERT'],
    }),
  });
}

async function generateAgentPrompt(data: Record<string, any>): Promise<string> {
  const template = await fetch(
    'https://raw.githubusercontent.com/user/dfy-ia/main/produto/agentes/clinica-odonto-full.md',
  ).then((r) => r.text()).catch(() => '');

  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 4000,
    system:
      'Você preenche o template do agente WhatsApp com os dados do cliente. Retorne APENAS o prompt final, pronto para uso, com todos os {{slots}} substituídos.',
    messages: [{ role: 'user', content: `TEMPLATE:\n${template}\n\nDADOS DO CLIENTE:\n${JSON.stringify(data, null, 2)}` }],
  });

  return (res.content[0] as any).text;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const payload = (await req.json()) as TallyPayload;
  const data = fieldMap(payload.data.fields);

  const tenantName = data.nome_do_negocio || data.nome_da_clinica || 'cliente';
  const slug = tenantName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '-');

  // 1. Tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .insert({ name: tenantName, slug, segmento: data.segmento || 'odonto', plan: 'basic', onboarding_data: data })
    .select().single();
  if (tErr) return new Response(`tenant: ${tErr.message}`, { status: 500 });

  // 2. Evolution
  const instName = `tenant_${tenant.id}`;
  const evo = await createEvolutionInstance(instName);

  // 3. Webhook
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-handler?tenant_id=${tenant.id}`;
  await setEvolutionWebhook(instName, webhookUrl);

  // 4. Prompt
  const systemPrompt = await generateAgentPrompt(data);

  await supabase.from('agents').insert({
    tenant_id: tenant.id,
    system_prompt: systemPrompt,
    model: 'claude-3-5-sonnet-latest',
    evolution_instance: instName,
  });

  // 5. Notifica cliente
  const adminPhone = data.whatsapp_admin || data.telefone;
  if (adminPhone) {
    await fetch(`${EVO_URL}/message/sendText/outbound1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({
        number: adminPhone.replace(/\D/g, ''),
        text: `✅ Seu atendente de IA tá sendo ativado!\n\nEm instantes você recebe o QR code pra escanear.\nDashboard: https://app.dfy-ia.com/${slug}\n\nQualquer dúvida, responda aqui.`,
      }),
    });
  }

  return Response.json({ ok: true, tenant_id: tenant.id, qrcode: evo.qrcode?.base64 });
});
