/**
 * BrainRam Email Outbound Engine
 *
 * Substitui WhatsApp como canal principal de prospecção fria.
 * Usa Resend (ou fallback SMTP) com domínio temporário até registro do brainram.com.br
 *
 * Features:
 * - Template engine com variáveis {name}, {city}, {niche}
 * - Rate limiting (30s entre envios, max 50/dia por domínio)
 * - Unsubscribe tracking (responder "SAIR" remove da base)
 * - Open/click tracking via pixel + link redirect
 * - Bounce handling
 * - LGPD compliance (opt-out no rodapé, dados mínimos)
 */

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL || 'André Ramos <onboarding@resend.dev>';
const REPLY_TO = process.env.REPLY_TO || 'andre@brainram.com.br';

const supabase = createClient(SUPA_URL, SUPA_KEY);

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  niche: string;
  active: boolean;
}

interface Lead {
  id: string;
  name: string;
  city?: string;
  email?: string;
  phone?: string;
  score?: number;
  mensagem_cold?: string;
  niche?: string;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function buildUnsubscribeUrl(leadId: string): string {
  const base = process.env.UNSUBSCRIBE_BASE_URL || 'https://brainram.com.br';
  return `${base}/unsubscribe?id=${encodeURIComponent(leadId)}`;
}

function buildFooter(leadId: string): string {
  const url = buildUnsubscribeUrl(leadId);
  return `
<br><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="color:#9ca3af;font-size:12px;line-height:1.5">
BrainRam — Atendente de IA para clínicas e consultórios<br>
Pirassununga/SP · suporte: <a href="https://wa.me/5519998760212">wa.me/5519998760212</a><br>
Não quer mais receber? <a href="${url}">Clique aqui para sair</a> ou responda "SAIR".<br>
DPO: <a href="mailto:dpo@brainram.com.br">dpo@brainram.com.br</a>
</p>`;
}

function buildTrackingPixel(leadId: string, campaignId?: string): string {
  const base = process.env.TRACKING_BASE_URL || 'https://brainram.com.br';
  const cid = campaignId ? `&c=${campaignId}` : '';
  return `<img src="${base}/track/open?id=${leadId}${cid}" width="1" height="1" alt="" style="display:block;width:1px;height:1px">`;
}

export async function sendEmailOutbound(
  lead: Lead,
  template: EmailTemplate,
  campaignId?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!lead.email) return { ok: false, error: 'no email' };

  // Check opted_out
  const { data: blocked } = await supabase
    .from('leads')
    .select('opted_out')
    .eq('id', lead.id)
    .maybeSingle();
  if (blocked?.opted_out) return { ok: false, error: 'opted_out' };

  // Rate limit: check sent in last 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', dayAgo);
  if ((sentToday || 0) >= 50) return { ok: false, error: 'daily_cap_reached' };

  // Rate limit: last sent timestamp
  const { data: lastLog } = await supabase
    .from('email_logs')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastLog?.created_at) {
    const elapsed = Date.now() - new Date(lastLog.created_at).getTime();
    if (elapsed < 30_000) {
      await new Promise(r => setTimeout(r, 30_000 - elapsed));
    }
  }

  const vars = {
    name: (lead.name || '').split(/[|•\-–]/)[0].trim(),
    city: lead.city || '',
    niche: lead.niche || template.niche || 'sua clínica',
  };

  const subject = renderTemplate(template.subject, vars);
  const bodyText = renderTemplate(template.body, vars);
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:600px">
<p>Olá, ${vars.name}.</p>
${bodyText.replace(/\n/g, '<br>')}
${buildFooter(lead.id)}
${buildTrackingPixel(lead.id, campaignId)}
</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: lead.email,
      subject,
      html,
      reply_to: REPLY_TO,
      tags: [{ name: 'campaign', value: campaignId || 'manual' }],
    }),
  });

  const resBody = await res.json().catch(() => ({}));

  await supabase.from('email_logs').insert({
    lead_id: lead.id,
    campaign_id: campaignId || null,
    email: lead.email,
    subject,
    status: res.ok ? 'sent' : 'failed',
    provider_id: resBody.id || null,
    error: res.ok ? null : `${res.status} ${JSON.stringify(resBody)}`,
  });

  if (res.ok) {
    await supabase.from('leads').update({ sent_at: new Date().toISOString() }).eq('id', lead.id);
  }

  return res.ok
    ? { ok: true, id: resBody.id }
    : { ok: false, error: `${res.status} ${JSON.stringify(resBody)}` };
}

/**
 * Processa resposta de email (bounce, reply, unsubscribe).
 * Chamado por webhook de email provider ou parsing manual.
 */
export async function handleEmailReply(leadId: string, text: string): Promise<void> {
  const lower = text.trim().toLowerCase();
  if (/^(sair|remover|unsubscribe|opt-out|n[ãa]o quero|parar|stop)\s*!?\.?$/.test(lower)) {
    await supabase.from('leads').update({ opted_out: true, opted_out_at: new Date().toISOString() }).eq('id', leadId);
    console.log(`[unsubscribe] ${leadId}`);
  } else {
    // Marca como respondeu
    await supabase.from('leads').update({ replied_at: new Date().toISOString() }).eq('id', leadId);
    // Notifica admin
    await supabase.from('conversations').insert({
      tenant_id: null, contact: leadId, role: 'user', content: `[email-reply] ${text.slice(0, 500)}`,
    });
  }
}

/**
 * Tracking pixel endpoint (Cloudflare Worker ou Hono route).
 * Registra abertura de email.
 */
export async function trackEmailOpen(leadId: string, campaignId?: string): Promise<void> {
  await supabase.from('email_opens').insert({
    lead_id: leadId,
    campaign_id: campaignId || null,
    ua: '', // preenchido pelo worker a partir do request
    ip: '',
  });
}
