/**
 * BrainRam Cloudflare Worker
 *
 * Funções leves que rodam na edge:
 * - Tracking pixel de email abertura
 * - Unsubscribe via GET
 * - Health check
 * - Proxy leve para API (rate limit / cache)
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // Health
    if (pathname === '/health') {
      return json({ ok: true, service: 'brainram-worker' }, cors);
    }

    // Tracking pixel (email open)
    if (pathname === '/track/open') {
      const leadId = url.searchParams.get('id');
      const campaignId = url.searchParams.get('c');
      if (leadId) {
        ctx.waitUntil(
          trackOpen(env, leadId, campaignId, request).catch(() => {})
        );
      }
      // Return 1x1 transparent GIF (43 bytes)
      const gif = new Uint8Array([71,73,70,56,57,97,1,0,1,0,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
      return new Response(gif, {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          ...cors,
        },
      });
    }

    // Unsubscribe
    if (pathname === '/unsubscribe') {
      const leadId = url.searchParams.get('id');
      if (!leadId) {
        return html(`<h1>BrainRam</h1><p>Link inválido.</p>`);
      }
      const ok = await unsubscribe(env, leadId);
      return html(`
        <html lang="pt-BR"><head><meta charset="utf-8"><title>BrainRam — Cancelamento</title>
        <style>body{font-family:system-ui;text-align:center;padding:60px 20px;color:#333}
        h1{color:#22c55e}.btn{background:#22c55e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:20px}</style></head>
        <body>
          <h1>${ok ? '✅ Cancelamento realizado' : '⚠️ Link inválido ou já cancelado'}</h1>
          <p>${ok ? 'Você não receberá mais emails da BrainRam.' : ''}</p>
          <a class="btn" href="https://wa.me/5519998760212">Falar no WhatsApp</a>
        </body></html>
      `);
    }

    return json({ error: 'not found' }, cors, 404);
  },
};

async function trackOpen(env: Env, leadId: string, campaignId: string | null, request: Request): Promise<void> {
  const ua = request.headers.get('user-agent') || '';
  const cf = (request as any).cf;
  const ip = cf?.colo || '';
  await fetch(`${env.SUPABASE_URL}/rest/v1/email_opens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      lead_id: leadId,
      campaign_id: campaignId,
      ua: ua.slice(0, 200),
      ip: ip.slice(0, 40),
    }),
  });
}

async function unsubscribe(env: Env, leadId: string): Promise<boolean> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ opted_out: true, opted_out_at: new Date().toISOString() }),
  });
  return res.ok;
}

function json(data: any, headers?: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
