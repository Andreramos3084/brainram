/**
 * Script de teste do agente comercial BrainRam
 * Simula conversas com a Perplexity API usando o SALES_SYSTEM atual
 *
 * Uso:
 *   export PERPLEXITY_KEY=sk-...
 *   bun test-agent.ts
 */

const PPLX_KEY = process.env.PERPLEXITY_KEY || '';
if (!PPLX_KEY) {
  console.error('❌ Defina PERPLEXITY_KEY no ambiente');
  process.exit(1);
}

// ======== SALES_SYSTEM (deve ser idêntico ao sales-server.ts) ========
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

// ======== CENÁRIOS DE TESTE ========
interface Cenario {
  nome: string;
  historico: Array<{ role: 'user' | 'assistant'; content: string }>;
  mensagem: string;
}

const cenarios: Cenario[] = [
  {
    nome: '1. Interesse inicial — "o que é?"',
    historico: [],
    mensagem: 'Oi, recebi uma mensagem sobre atendente IA. O que é isso?',
  },
  {
    nome: '2. Pergunta de preço',
    historico: [
      { role: 'user', content: 'Oi, recebi uma mensagem sobre atendente IA. O que é isso?' },
      { role: 'assistant', content: 'BrainRam é o atendente de IA no WhatsApp que responde pacientes 24/7, qualifica leads e agenda consultas. Você está conversando com ele agora — é exatamente isso que seus pacientes vão sentir. Quer saber sobre preço ou como funciona na prática?' },
    ],
    mensagem: 'Quanto custa?',
  },
  {
    nome: '3. Objeção "é caro"',
    historico: [],
    mensagem: 'R$297 é muito caro pra mim',
  },
  {
    nome: '4. Objeção "já tenho secretária"',
    historico: [],
    mensagem: 'Mas eu já tenho secretária, não preciso disso',
  },
  {
    nome: '5. Objeção "vou pensar"',
    historico: [
      { role: 'user', content: 'Quanto custa?' },
      { role: 'assistant', content: 'Starter é R$297/mês, 7 dias grátis pra testar. Te mando o link aqui.' },
    ],
    mensagem: 'Vou pensar e depois te falo',
  },
  {
    nome: '6. "É bot?"',
    historico: [],
    mensagem: 'Você é um robô?',
  },
  {
    nome: '7. Dúvida sobre Google Calendar',
    historico: [],
    mensagem: 'Como funciona a integração com o Google Calendar?',
  },
  {
    nome: '8. Objeção "não tenho tempo"',
    historico: [],
    mensagem: 'Não tenho tempo pra configurar isso agora',
  },
  {
    nome: '9. Pedido de call',
    historico: [
      { role: 'user', content: 'Oi, recebi uma mensagem sobre atendente IA. O que é isso?' },
      { role: 'assistant', content: 'BrainRam é o atendente de IA no WhatsApp que responde pacientes 24/7, qualifica leads e agenda consultas. Você está conversando com ele agora — é exatamente isso que seus pacientes vão sentir. Quer saber sobre preço ou como funciona na prática?' },
    ],
    mensagem: 'Quero falar com uma pessoa',
  },
  {
    nome: '10. Dúvida vaga — "quero saber mais"',
    historico: [],
    mensagem: 'Quero saber mais',
  },
  {
    nome: '11. Interesse em testar (up-sell pro)',
    historico: [
      { role: 'user', content: 'Quanto custa?' },
      { role: 'assistant', content: 'Starter é R$297/mês, 7 dias grátis pra testar. Te mando o link aqui.' },
    ],
    mensagem: 'Tem algum plano com mais recursos?',
  },
  {
    nome: '12. Objeção LGPD/contrato',
    historico: [],
    mensagem: 'Isso é seguro em termos de LGPD? Como funciona o contrato?',
  },
  {
    nome: '13. Lead escreve em inglês (valida idioma)',
    historico: [],
    mensagem: 'How much does it cost?',
  },
];

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
    const txt = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content ?? '';
  try { return JSON.parse(txt); } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { reply: txt || 'erro no parse', action: null, args: {} };
  }
}

// ======== RODAR TESTES ========
async function run() {
  console.log('🧪 Testando agente comercial BrainRam\n');
  console.log('=' .repeat(60));

  const results: Array<{ nome: string; ok: boolean; result: any; error?: string }> = [];

  for (const c of cenarios) {
    console.log(`\n📌 ${c.nome}`);
    console.log(`👤 Lead: "${c.mensagem}"`);
    try {
      const result = await callPerplexity(c.historico, c.mensagem);
      console.log(`🤖 Resposta: "${result.reply}"`);
      console.log(`⚡ Action: ${result.action || 'null'} | Args: ${JSON.stringify(result.args || {})}`);

      // Validações básicas
      const checks: string[] = [];
      if (!result.reply) checks.push('❌ reply vazio');
      if (result.reply && result.reply.length > 600) checks.push('⚠️ reply muito longo');
      if (result.reply && /entendo perfeitamente|excelente escolha|segue abaixo|fico feliz em ajudar/i.test(result.reply))
        checks.push('⚠️ linguagem proibida detectada');
      if (result.reply && /você vai pagar|cobrança|fatura|compra|vender/i.test(result.reply))
        checks.push('⚠️ linguagem de "pagar/comprar" detectada');
      // Só valida "IA/bot" se NÃO for o cenário específico de "É bot?"
      const isBotQuestion = c.nome === '6. "É bot?"';
      if (!isBotQuestion && result.reply && /\b(ia|inteligência artificial|bot|robô)\b/i.test(result.reply))
        checks.push('⚠️ mencionou ser bot/IA sem necessidade');

      if (checks.length) {
        console.log(`🔍 Validação: ${checks.join(' | ')}`);
      } else {
        console.log('✅ Validação: OK');
      }

      results.push({ nome: c.nome, ok: checks.length === 0, result });
    } catch (e: any) {
      console.log(`💥 Erro: ${e.message}`);
      results.push({ nome: c.nome, ok: false, result: null, error: e.message });
    }
    console.log('-'.repeat(60));
  }

  // Resumo
  console.log('\n📊 RESUMO');
  console.log('='.repeat(60));
  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`✅ Passaram: ${okCount}/${results.length}`);
  console.log(`❌ Falharam: ${failCount}/${results.length}`);

  if (failCount > 0) {
    console.log('\nCenários com problemas:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  • ${r.nome}${r.error ? ` — ${r.error}` : ''}`);
    }
  }
}

run().catch(console.error);
