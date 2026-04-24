/**
 * STEP 3 — Scoring via Perplexity sonar (com web context nativo)
 *
 * Perplexity sonar consegue, além de pontuar, pesquisar sinais extras
 * na web sobre o lead (Instagram atual, Google, reviews recentes)
 * sem precisar de step separado de enrichment.
 *
 * Custo:
 *   sonar: ~$1/M input, $1/M output → ~$0.002 por lead
 *   sonar-pro: ~$3/M input, $15/M output → reservado pra agente WhatsApp
 *
 * 1000 leads ≈ ~$2 total (vs ~$6-12 em Claude)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PPLX_KEY = process.env.PERPLEXITY_KEY!;
if (!PPLX_KEY) throw new Error('PERPLEXITY_KEY ausente');

const SYSTEM = `Você é analista de vendas B2B para DFY-IA: atendente IA no WhatsApp pra clínicas odonto. Planos R$297 / R$397 / R$497 por mês. Primeira experiência: 7 dias grátis pra testar, mas o cliente já cadastra o cartão no início; se gostar, não faz nada e vira cobrança automática; se não gostar, cancela antes do 7º dia e não paga nada.

Avalie o lead e pontue 0-100:
- FIT ALTO (70-100): clínica ativa, WhatsApp como canal principal, pequena/média (1-5 dentistas), ticket alto, sinais de demanda reprimida (reviews mencionando espera, horário difícil).
- FIT MÉDIO (40-70): sinais mistos.
- FIT BAIXO (<40): grande demais, sem presença digital, sem WhatsApp.

Use sua busca web pra validar sinais (Instagram, reviews, site).

Retorne APENAS JSON válido, sem markdown, sem preamble:
{
  "score": 0-100,
  "motivo": "1 linha",
  "gancho_pessoal": "observação específica real do negócio da fonte que você encontrou",
  "mensagem_cold": "WhatsApp pro dono da clínica, 5-7 linhas, humana, consultiva. Estrutura:\\n1) Saudação + gancho específico (concreto, não genérico — nada de 'IA pro WhatsApp', fala o problema real que você viu).\\n2) Problema/observação curta relevante pra ele.\\n3) Oferta: 7 dias de teste grátis no nosso atendente de IA. Explicar com clareza e honestidade que ele cadastra o cartão no começo, testa, e se cancelar antes de 7 dias não paga nada. Sem letra miúda.\\n4) Pergunta curta que convida a conversa (não 'quer testar?' fechada — algo como 'faz sentido eu te mandar um vídeo de 2 min mostrando?').\\n5) Assinar 'André'.\\nProibido: 'revolucionário', 'garantido', 'resultado X', prometer clientes ou faturamento, emoji excessivo, dizer que é grátis sem mencionar cartão. Tom: colega que entende do problema, não vendedor."
}`;

async function scoreOne(lead: any): Promise<any> {
  const body = {
    model: 'sonar',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `LEAD:\n${JSON.stringify(lead, null, 2)}` },
    ],
    max_tokens: 800,
    temperature: 0.2,
  };

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PPLX_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ❌ ${lead.name}: ${res.status} ${err.slice(0, 200)}`);
    return { score: 0, motivo: 'api error', gancho_pessoal: '', mensagem_cold: '' };
  }

  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content ?? '';
  const match = txt.match(/\{[\s\S]*\}/);
  try {
    return match
      ? JSON.parse(match[0])
      : { score: 0, motivo: 'parse fail', gancho_pessoal: '', mensagem_cold: '', raw: txt };
  } catch {
    return { score: 0, motivo: 'json fail', gancho_pessoal: '', mensagem_cold: '', raw: txt };
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error('Uso: bun run 3-score-perplexity.ts <leads.json>');

  const leads = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`🎯 Pontuando ${leads.length} leads com Perplexity sonar (com web context)...`);

  const scored: any[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const chunk = leads.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(scoreOne));
    chunk.forEach((lead: any, idx: number) => {
      const r = results[idx];
      console.log(`  [${i + idx + 1}/${leads.length}] ${lead.name} → ${r.score}`);
      scored.push({ ...lead, ...r });
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  const output = inputFile.replace(/leads-.*\.json$/, `leads-scored-${Date.now()}.json`);
  writeFileSync(output, JSON.stringify(scored, null, 2));
  console.log(`\n✅ Top 10:`);
  scored.slice(0, 10).forEach((l, i) => console.log(`  ${i + 1}. [${l.score}] ${l.name} — ${l.phone ?? '-'}`));
  const qualified = scored.filter((l) => l.score >= 60).length;
  console.log(`\n💾 ${output}`);
  console.log(`🎯 ${qualified} leads acima do threshold (60)`);
}

main().catch(console.error);
