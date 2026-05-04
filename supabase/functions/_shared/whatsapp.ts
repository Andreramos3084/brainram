/**
 * WhatsApp Dual Provider — Meta Cloud API + Evolution API
 *
 * - parseWebhook(payload): detecta formato Meta ou Evolution e extrai mensagem
 * - sendMessage(...): envia com fallback automático entre providers
 */

// ─── Config ───
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const WA_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
const EVO_URL = Deno.env.get('EVOLUTION_URL') || '';
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

const HAS_META = !!(WA_PHONE_ID && WA_TOKEN);
const HAS_EVO = !!(EVO_URL && EVO_KEY);
const DEFAULT_PROVIDER = (Deno.env.get('DEFAULT_WHATSAPP_PROVIDER') as 'meta' | 'evolution' | 'auto') || 'auto';

const WA_GRAPH_URL = HAS_META
  ? `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`
  : '';

// ─── Types ───
export interface ParsedMessage {
  from: string; // número limpo, ex: 5519999999999
  text: string;
  fromMe: boolean;
  provider: 'meta' | 'evolution';
  raw: any;
}

export interface SendResult {
  success: boolean;
  provider: string;
  error?: string;
}

// ─── Parsing ───

export function parseWebhook(payload: any): ParsedMessage | null {
  // Evolution format
  if (payload?.event?.toLowerCase?.() === 'messages.upsert' && payload.data) {
    const msg = payload.data;
    if (msg.key?.fromMe) return null;
    const from = String(msg.key?.remoteJid || '').replace(/@s\.whatsapp\.net|@g\.us/g, '');
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';
    if (!from || !text) return null;
    return { from, text, fromMe: false, provider: 'evolution', raw: msg };
  }

  // Meta Cloud API format
  if (payload?.object === 'whatsapp_business_account') {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;
    // Ignora status updates (delivered, read, etc.)
    if (msg.type === 'request_welcome' || value?.statuses) return null;
    const from = String(msg.from || '').replace(/\D/g, '');
    let text = '';
    if (msg.text?.body) text = msg.text.body;
    else if (msg.image?.caption) text = msg.image.caption;
    else if (msg.button?.text) text = msg.button.text;
    else if (msg.interactive?.button_reply?.title) text = msg.interactive.button_reply.title;
    else if (msg.interactive?.list_reply?.title) text = msg.interactive.list_reply.title;
    if (!from) return null;
    return { from, text, fromMe: false, provider: 'meta', raw: msg };
  }

  return null;
}

// ─── Provider resolution ───

function resolveProvider(preferred?: 'meta' | 'evolution'): 'meta' | 'evolution' {
  if (preferred) return preferred;
  if (DEFAULT_PROVIDER === 'meta' && HAS_META) return 'meta';
  if (DEFAULT_PROVIDER === 'evolution' && HAS_EVO) return 'evolution';
  if (DEFAULT_PROVIDER === 'auto') {
    if (HAS_META) return 'meta';
    if (HAS_EVO) return 'evolution';
  }
  throw new Error('No WhatsApp provider available');
}

// ─── Send via Meta ───

async function sendTextMeta(to: string, text: string): Promise<void> {
  if (!HAS_META) throw new Error('Meta provider not configured');
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'text',
    text: { body: text },
  };
  const r = await fetch(WA_GRAPH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Meta send failed ${r.status}: ${err}`);
  }
}

// ─── Send via Evolution ───

async function sendTextEvolution(instance: string, to: string, text: string): Promise<void> {
  if (!HAS_EVO) throw new Error('Evolution provider not configured');
  const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to.replace(/\D/g, ''), text }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Evolution send failed ${r.status}: ${err}`);
  }
}

// ─── Unified send with fallback ───

export async function sendMessage(
  instance: string,
  to: string,
  text: string,
  preferred?: 'meta' | 'evolution' | 'auto'
): Promise<SendResult> {
  let primary: 'meta' | 'evolution';
  try {
    primary = resolveProvider(preferred === 'auto' || !preferred ? undefined : preferred);
  } catch (e: any) {
    return { success: false, provider: 'none', error: e.message };
  }

  const fallback: 'meta' | 'evolution' = primary === 'meta' ? 'evolution' : 'meta';

  // Try primary
  try {
    if (primary === 'meta') {
      await sendTextMeta(to, text);
      return { success: true, provider: 'meta' };
    }
    await sendTextEvolution(instance, to, text);
    return { success: true, provider: 'evolution' };
  } catch (err: any) {
    console.error(`[${primary}] send failed:`, err.message);

    // Try fallback
    const canFallback = fallback === 'meta' ? HAS_META : HAS_EVO;
    if (!canFallback) {
      return { success: false, provider: primary, error: err.message };
    }

    try {
      if (fallback === 'meta') {
        await sendTextMeta(to, text);
        return { success: true, provider: 'meta (fallback)' };
      }
      await sendTextEvolution(instance, to, text);
      return { success: true, provider: 'evolution (fallback)' };
    } catch (err2: any) {
      console.error(`[${fallback}] fallback also failed:`, err2.message);
      return { success: false, provider: 'both', error: `${primary}: ${err.message}; ${fallback}: ${err2.message}` };
    }
  }
}

// ─── Helpers for edge functions ───

export function hasMeta(): boolean {
  return HAS_META;
}

export function hasEvolution(): boolean {
  return HAS_EVO;
}
