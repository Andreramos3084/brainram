/**
 * DFY-IA Sales Server — atende leads via WhatsApp Cloud API (Meta) + Evolution API
 *
 * Endpoints:
 *   GET  /health
 *   GET  /sales/webhook         - Verificação do webhook Meta (challenge)
 *   POST /sales/webhook         - Recebe mensagens do lead via Meta webhook
 *   POST /sales/webhook/evolution - Recebe mensagens do lead via Evolution webhook
 *   POST /mp/webhook            - Mercado Pago notifica eventos (auth/payment)
 *   POST /sales/dispatch        - chamada interna para disparar 1ª mensagem pro lead
 *
 * Fluxo do lead:
 *   1. Scraper salva lead em `leads` (score, mensagem_cold, city)
 *   2. /sales/dispatch envia: mensagem personalizada + vídeo demo-final.mp4
 *   3. Lead responde via WhatsApp → /sales/webhook (Meta) ou /sales/webhook/evolution
 *   4. Perplexity sonar decide: enviar checkout_link | agendar_call | continuar conversa | escalar
 *   5. Se enviou checkout_link e lead paga → /mp/webhook cria tenant + ativa trial
 *
 * Deploy:
 *   bun install; bun run sales-server.ts
 *   Env: PERPLEXITY_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *        WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN,
 *        EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE,
 *        MP_ACCESS_TOKEN, ADMIN_PHONE, DEMO_VIDEO_URL
 */
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { mountAdmin, runCampaignTick } from './admin.js';

const PPLX_KEY = process.env.PERPLEXITY_KEY!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MP_TOKEN = process.env.MP_ACCESS_TOKEN!;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5519998760212';
const DEMO_VIDEO_URL = process.env.DEMO_VIDEO_URL || '';

// Provedores: Meta Cloud API (oficial) + Evolution (legado)
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WA_VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || 'brainram-verify-2026';
const HAS_META = !!(WA_PHONE_ID && WA_TOKEN);

const EVO_URL = process.env.EVOLUTION_URL || '';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'outbound1';
const HAS_EVO = !!(EVO_URL && EVO_KEY);

// Provider default: meta, evolution, ou auto (tenta meta primeiro)
const DEFAULT_PROVIDER = (process.env.DEFAULT_WHATSAPP_PROVIDER as 'meta' | 'evolution' | 'auto') || 'auto';

for (const [k, v] of Object.entries({ PPLX_KEY, SUPA_URL, SUPA_KEY, MP_TOKEN })) {
  if (!v) throw new Error(`missing env: ${k}`);
}

const supabase = createClient(SUPA_URL, SUPA_KEY);

// Links de checkout criados no MP
const CHECKOUT_LINKS = {
  starter: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=1bb4b341c50c47eb95bd345414d36680',
  pro: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=5f5e825dbe0549b5b73e33a23f73f1dd',
  premium: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=63ab283b53164d98aa03d3c789e0d2a0',
};

const SALES_SYSTEM = `Você é o atendente comercial da BrainRam. Fala como humana experiente — direta, curta (2-4 linhas), sem jargão vendedor, sem emoji excessivo. Nada de "entendo perfeitamente", "excelente escolha", "segue abaixo", "fico feliz em ajudar". Nunca se apresente como bot, IA ou robô. Nunca cite o nome de nenhum sócio ou dono a não ser que o lead pergunte explicitamente quem é o responsável — e mesmo assim só "André Ramos" (sem sobrenome extra).

IDIOMA OBRIGATÓRIO: SEMPRE responda em PORTUGUÊS BRASILEIRO. NUNCA em inglês ou outro idioma. Se o lead escrever em inglês, responda em português mesmo assim.

=== PRODUTO: VOCÊ É O PRODUTO ===
BrainRam é o atendente no WhatsApp do negócio. O lead está conversando com você AGORA — e tudo o que ele está experimentando (rapidez, clareza, direcionamento) é exatamente o que os clientes do negócio vão sentir.

O que a BrainRam faz:
- Responde clientes 24/7 no WhatsApp (como estou fazendo com você agora)
- Qualifica leads (pergunta necessidade, urgência, segmento)
- Passa preços e tira dúvidas sobre serviços
- Agenda consultas/atendimentos direto no Google Calendar
- Envia lembretes automáticos e reduz faltas
- Escalada para humano quando necessário

Atendemos QUALQUER nicho: clínicas odontológicas, cardiologia, fisioterapia, nutrição, psicologia, imobiliárias, autoescolas, salões de beleza, academias, etc. Odonto foi só o primeiro exemplo.

=== PROVA SOCIAL ===
Já atendemos dezenas de negócios. O que mais ouvimos: "antes a secretária não dava conta das mensagens, agora ninguém é perdido".

=== PLANOS (todos com 7 dias de teste grátis) ===
- Starter R$297/mês — 1 número, agendamentos básicos
- Pro R$397/mês — + Google Calendar + relatórios semanais
- Premium R$497/mês — multi-atendente + integrações sob medida

No checkout você ativa o teste de 7 dias. Se não gostar, solicita reembolso dentro do prazo e o valor volta integral. Se gostar, a assinatura segue normal.

=== LINGUAGEM OBRIGATÓRIA ===
- NUNCA "você vai pagar", "cobrança", "fatura", "compra", "vender". SEMPRE "testa", "experimenta", "ativa".
- NUNCA "nosso sistema é o melhor", "tecnologia de ponta", "solução inovadora".
- SEMPRE terminar com pergunta ou próximo passo claro. Nunca terminar só com "qualquer dúvida me chama".
- Trial: "são 7 dias grátis pra você experimentar — cadastra o cartão no começo pra ativar. Se não gostar, solicita reembolso dentro dos 7 dias e o valor volta integral."
- Call: NUNCA "agendar call com André". Diga: "vou te encaminhar pro atendimento pessoal — quando você pode conversar? Tenho essas janelas: [horários]". Só cite "André Ramos" se o lead perguntar quem é o responsável/dono.
- Link: "Posso te mandar o link pra você testar?" (nunca "pra comprar").

=== REGRAS DE DECISÃO ===

1. **Perguntou preço OU demonstrou interesse concreto em testar**
→ action=checkout_link, plan=starter como default. Reply curta (1-2 linhas), direta, com confiança.
Ex: "Starter é R$297/mês, 7 dias grátis pra testar. Te mando o link aqui."
Ex ruim: "Ficamos felizes em informar que o plano starter custa..."

2. **Objeção complexa que você NÃO sabe responder com certeza**
(contrato detalhado, garantia contratual, NF-e, LGPD específico, integração custom, PABX, hardware)
→ action=agendar_call. Encaminhe pro atendimento pessoal e PROPONHA 3 horários concretos (nunca "qual horário você prefere?").
Ex: "Essa parte é melhor no atendimento pessoal. Tenho quarta 10h, quinta 14h ou sexta 16h. Qual pega?"

3. **Pedido explícito de falar com humano / agendar call**
→ action=agendar_call + proponha 3 horários como em (2).

4. **Dúvida comum que você SABE responder**
(o que é, como funciona, Google Calendar, diferenças de planos, exemplos de uso)
→ action=null. Responde em 2-3 linhas e PERGUNTA se quer testar. Nunca terminar sem próximo passo.
Ex: "A secretária conecta o Google Calendar da clínica em 2 min. Depois eu (o atendente) marco consultas sozinho direto na agenda. Quer testar por 7 dias?"

5. **"Quero saber mais" / "Tenho dúvidas" SEM especificar**
→ action=null. Pergunta o que quer saber — NUNCA agende call só por "saber mais".
Ex: "Posso te contar sobre preço, como funciona o Google Calendar, exemplos de clínica, ou como é o teste. Qual interessa?"

6. **"É bot?" / "É robô?" / "Você é humano?"**
→ action=null. Responde com honestidade e vire vantagem.
Ex: "Sou o atendente virtual da BrainRam — e é exatamente isso que seus pacientes vão usar na sua clínica. Tenho acompanhamento humano quando precisar. Quer ver como funciona na prática?"

7. **Objeção "está caro" / "não tenho dinheiro"**
→ action=null. Nunca desconte sem autorização. Reframe o valor.
Ex: "Entendo. Só pra contextualizar: R$297 é menos que 1 consulta por mês, e a ideia é que eu capture os pacientes que hoje desistem no WhatsApp. Quer testar 7 dias grátis pra ver se compensa?"

8. **Objeção "já tenho secretária"**
→ action=null. Nunca subestime a secretária. Posicione como complemento.
Ex: "Perfeito — secretária é essencial. Eu atuo no horário que ela não está (noite, fim de semana, almoço) e filtro os leads quentes pra ela não perder tempo com "quanto custa?". Quer testar?"

9. **Objeção "não tenho tempo pra implementar"**
→ action=null. DFY = Done For You.
Ex: "A gente configura tudo em 24-48h. Você só escaneia um QR code do WhatsApp e pronto. Não precisa instalar nada. Quer que eu te mando o link do teste?"

10. **Objeção "vou pensar" / "depois eu vejo"**
→ action=null. Leve urgência natural, sem pressão.
Ex: "Tranquilo. Só lembro que todo dia sem atendente 24h é paciente perdido no WhatsApp. O teste é 7 dias grátis — se não rolar, cancela sem pagar nada. Te mando o link?"

=== REGRAS DURAS ===
- NUNCA prometa resultado, ROI ou nº de clientes. Sem "você vai fechar X agendamentos".
- NUNCA critique a concorrência.
- NUNCA dê diagnóstico médico, odontológico ou técnico.
- NUNCA diga "IA", "inteligência artificial", "bot", "robô" ao descrever o produto ou nas respostas normais. Mesmo que o lead use essas palavras, VOCÊ NUNCA as repete. Use sempre "atendente no WhatsApp", "atendente" ou "assistente". Só pode mencionar "atendente virtual" se o lead perguntar explicitamente "você é bot?" / "você é robô?" / "você é humano?".
- Exemplo: lead pergunta "o que é atendente IA?" → você responde "É um atendente no WhatsApp que responde seus clientes 24/7, marca consultas e qualifica leads. Quer testar 7 dias grátis?" — NUNCA repete "IA" na resposta.
- SEMPRE responda em PORTUGUÊS BRASILEIRO. NUNCA em inglês. Se o lead mandar em inglês, responda em português.
- Desconto: "desconto rolo só em plano anual antecipado, isso é conversa do atendimento pessoal — te encaminho?"
- Contrato: "sim, todo plano tem contrato de adesão com CNPJ, endereço fiscal e cláusulas LGPD — te mando o link junto com o do teste, ou prefere revisar antes?"
- Máximo 4 linhas por mensagem.
- SEMPRE terminar com pergunta ou próximo passo.

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

const WA_GRAPH_URL = HAS_META ? `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages` : '';

async function sendTextMeta(to: string, text: string) {
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
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('whatsapp sendText failed', r.status, await r.text().catch(() => ''));
}

async function sendMediaMeta(to: string, url: string, caption: string, mediaType = 'video') {
  if (!HAS_META) throw new Error('Meta provider not configured');
  const typeKey = mediaType as 'video' | 'image' | 'document' | 'audio';
  const body: any = {
    messaging_product: 'whatsapp',
    to: to.replace(/\D/g, ''),
    type: typeKey,
  };
  if (typeKey === 'video') body.video = { link: url, caption };
  else if (typeKey === 'image') body.image = { link: url, caption };
  else if (typeKey === 'document') body.document = { link: url, caption, filename: 'arquivo.pdf' };
  else body[typeKey] = { link: url };
  const r = await fetch(WA_GRAPH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('whatsapp sendMedia failed', r.status, await r.text().catch(() => ''));
}

async function sendTextEvolution(to: string, text: string) {
  if (!HAS_EVO) throw new Error('Evolution provider not configured');
  const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, text }),
  });
  if (!r.ok) console.error('evolution sendText failed', r.status, await r.text().catch(() => ''));
}

async function sendMediaEvolution(to: string, url: string, caption: string, mediaType = 'video') {
  if (!HAS_EVO) throw new Error('Evolution provider not configured');
  const r = await fetch(`${EVO_URL}/message/sendMedia/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: to, mediatype: mediaType, mimetype: 'video/mp4', media: url, caption }),
  });
  if (!r.ok) console.error('evolution sendMedia failed', r.status, await r.text().catch(() => ''));
}

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

async function sendText(to: string, text: string, provider?: 'meta' | 'evolution') {
  const p = resolveProvider(provider);
  if (p === 'meta') return sendTextMeta(to, text);
  return sendTextEvolution(to, text);
}

async function sendMedia(to: string, url: string, caption: string, mediaType = 'video', provider?: 'meta' | 'evolution') {
  const p = resolveProvider(provider);
  if (p === 'meta') return sendMediaMeta(to, url, caption, mediaType);
  return sendMediaEvolution(to, url, caption, mediaType);
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

async function executeAction(contact: string, action: string | null, args: any, provider?: 'meta' | 'evolution') {
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
      `Plano ${plan.toUpperCase()} — R$${price}/mês.\n7 dias de teste grátis — se não gostar, pede reembolso dentro dos 7 dias e o valor volta integral.\n\n✅ Ativar teste: ${linkWithRef}\n📄 Contrato de adesão: ${contractMap[plan]}\n\nImportante: no 6º dia do teste te pergunto se você quer continuar. Se não responder CONTINUAR até o fim do 7º dia, a assinatura é cancelada automaticamente — sem cobrança.`,
      provider
    );
    return;
  }
  if (action === 'agendar_call') {
    await sendText(ADMIN_PHONE, `📞 Lead quer atendimento pessoal\n\nContato: ${contact}\nHorários propostos: ${args?.horarios_propostos || '-'}\n\nwa.me/${contact.replace(/\D/g, '')}`, provider);
    return;
  }
  if (action === 'enviar_contato') {
    await sendText(contact, `Meu contato direto é (19) 99876-0212 — pode me chamar no WhatsApp que eu te ajudo.`, provider);
    await sendText(ADMIN_PHONE, `📞 Lead pediu contato direto\n\nContato: ${contact}\n\nwa.me/${contact.replace(/\D/g, '')}`, provider);
    return;
  }
  if (action === 'escalar') {
    await sendText(ADMIN_PHONE, `⚠️ Escalada\n\nContato: ${contact}\nMotivo: ${args?.motivo || '-'}\n\nwa.me/${contact.replace(/\D/g, '')}`, provider);
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

// Detecta se o lead demonstrou interesse em ver o produto/vídeo
function detectInterest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\b(sim|quero|manda|ok|show|boa|interessado|interessante|top|vale a pena|pode mandar|pode enviar|quero testar|quero ver|manda o vídeo|manda o video|pode mandar o vídeo|pode mandar o video|manda o link|quero o link|sim, manda|sim manda|claro|com certeza|vamos|bora|faz sentido|manda ai)\b/i.test(t);
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

app.get('/health', (c) => c.json({
  ok: true,
  service: 'dfy-ia-sales',
  providers: {
    meta: HAS_META ? 'configured' : 'not_configured',
    evolution: HAS_EVO ? 'configured' : 'not_configured',
  },
  default: DEFAULT_PROVIDER,
}));

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

// === Meta WhatsApp Cloud API webhook ===
// GET: verificação do webhook
app.get('/sales/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  if (mode === 'subscribe' && token === WA_VERIFY) {
    return c.text(challenge || '');
  }
  return c.json({ error: 'verification failed' }, 403);
});

// POST: mensagens do lead via Meta
app.post('/sales/webhook', async (c) => {
  const payload: any = await c.req.json().catch(() => ({}));
  // Ignora se não for evento de mensagens
  if (payload.object !== 'whatsapp_business_account') return c.json({ ok: true });
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const msg = value?.messages?.[0];
  if (!msg) return c.json({ ok: true });
  // Ignora mensagens enviadas por nós
  if (msg.fromMe) return c.json({ ok: true });
  const from = msg.from;
  const text = msg.text?.body || msg.image?.caption || '';
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

  // Se lead demonstrou interesse, envia vídeo demo automaticamente
  if (DEMO_VIDEO_URL && detectInterest(text)) {
    await sendMedia(from, DEMO_VIDEO_URL, 'Aqui um vídeo de 2 min mostrando como funciona na prática 👇', 'video', 'meta');
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
    await sendText(from, result.reply, 'meta');
    await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'assistant', content: result.reply });
  }
  await executeAction(from, result.action || null, result.args || {}, 'meta');
  return c.json({ ok: true });
});

// === Evolution API webhook ===
app.post('/sales/webhook/evolution', async (c) => {
  const payload: any = await c.req.json().catch(() => ({}));
  // Evolution usa event como string ou array
  const event = payload.event;
  if (event !== 'messages.upsert' && !(Array.isArray(event) && event.includes('messages.upsert'))) {
    return c.json({ ok: true });
  }
  const msg = payload.data?.message;
  if (!msg) return c.json({ ok: true });
  // Ignora mensagens enviadas por nós
  if (msg.fromMe) return c.json({ ok: true });
  const from = msg.key?.remoteJid?.replace(/@s\.whatsapp\.net/, '') || msg.from;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
  if (!from || !text) return c.json({ ok: true });

  // marca lead como respondeu
  await supabase.from('leads').update({ replied_at: new Date().toISOString() }).eq('phone', from);

  // Short-circuit: trial intent
  const intent = detectTrialIntent(text);
  if (intent) {
    await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'user', content: text });
    const handled = await handleTrialIntentForContact(from, intent);
    if (handled) return c.json({ ok: true, trial_intent: intent });
  }

  // Se lead demonstrou interesse, envia vídeo demo automaticamente
  if (DEMO_VIDEO_URL && detectInterest(text)) {
    await sendMedia(from, DEMO_VIDEO_URL, 'Aqui um vídeo de 2 min mostrando como funciona na prática 👇', 'video', 'evolution');
  }

  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .is('tenant_id', null).eq('contact', from)
    .order('created_at', { ascending: true }).limit(20);

  await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'user', content: text });

  const result = await callPerplexity(history || [], text);
  if (result.reply) {
    await sendText(from, result.reply, 'evolution');
    await supabase.from('conversations').insert({ tenant_id: null, contact: from, role: 'assistant', content: result.reply });
  }
  await executeAction(from, result.action || null, result.args || {}, 'evolution');
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
// Body opcional: { provider: 'meta' | 'evolution' } — se omitido, usa DEFAULT_PROVIDER
app.post('/sales/dispatch', async (c) => {
  const key = c.req.header('x-admin-key');
  if (key !== (process.env.ADMIN_KEY || 'brainram-admin')) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json() as { phone: string; message: string; video?: boolean; provider?: 'meta' | 'evolution' };
  const { phone, message, video = true, provider } = body;
  await sendText(phone, message, provider);
  if (video && DEMO_VIDEO_URL) {
    await new Promise(r => setTimeout(r, 3000));
    await sendMedia(phone, DEMO_VIDEO_URL, '', 'video', provider);
  }
  await supabase.from('leads').update({ sent_at: new Date().toISOString() }).eq('phone', phone);
  return c.json({ ok: true });
});

// === Mount admin panel ===
mountAdmin(app, {
  supabase,
  sendText,
  sendMedia: (to: string, url: string, caption: string, mediaType?: string, provider?: 'meta' | 'evolution') => sendMedia(to, url, caption, mediaType || 'video', provider),
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
