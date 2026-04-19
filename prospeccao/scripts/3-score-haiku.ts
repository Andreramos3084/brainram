/**
 * STEP 3 OTIMIZADO — Scoring via Claude HAIKU 3.5 (10x mais barato)
 *
 * Decisão: scoring e geração de mensagem cold são tarefas onde Haiku
 * performa 95% do que Sonnet faz, por 1/10 do preço.
 *
 * Custo:
 *   Sonnet 4.7: $3/M input, $15/M output
 *   Haiku 3.5:  $0.80/M input, $4/M output  (~5x mais barato)
 *
 * 1000 leads ≈ 500k tokens processados
 *   Sonnet: ~$6
 *   Haiku:  ~$1.20
 *
 * Reservamos Sonnet 4.7 apenas para as conversas REAIS com paciente
 * (agent-handler), onde qualidade paga.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `Você é analista de vendas B2B. Avalie se este lead é fit para um produto de atendente WhatsApp IA (R$1.997 setup + R$397/mês).

FIT ALTO (70-100): clínica pequena/média, ativa em Instagram mas sem automação, ticket médio-alto, usa WhatsApp como canal.
FIT MÉDIO (40-70): sinais mistos.
FIT BAIXO (<40): inativa, grande demais, sem WhatsApp.

Retorne APENAS JSON (sem markdown, sem preamble):
{
  "score": 0-100,
  "motivo": "1 linha",
  "gancho_pessoal": "observação específica real do negócio para usar na abordagem",
  "mensagem_cold": "mensagem WhatsApp 4-6 linhas, humana, consultiva, com o gancho. Assinar com 'André'. Nunca prometer resultado. Terminar com pergunta curta."
}`;

async function scoreOne(lead: any) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: 'user', content: `DADOS:\n${JSON.stringify(lead, null, 2)}` }],
  });
  const txt = (res.content[0] as any).text;
  const match = txt.match(/\{[\s\S]*\}/);
  try {
    return match ? JSON.parse(match[0]) : { score: 0, motivo: 'parse fail', gancho_pessoal: '', mensagem_cold: '' };
  } catch {
    return { score: 0, motivo: 'json fail', gancho_pessoal: '', mensagem_cold: '' };
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error('Uso: bun run 3-score-haiku.ts <leads-enriched-file.json>');

  const leads = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`🎯 Pontuando ${leads.length} leads com Haiku (econômico)...`);

  const scored = [];
  const BATCH = 5;
  for (let i = 0; i < leads.length; i += BATCH) {
    const chunk = leads.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(scoreOne));
    chunk.forEach((lead: any, idx: number) => {
      console.log(`  [${i + idx + 1}/${leads.length}] ${lead.name} → score ${results[idx].score}`);
      scored.push({ ...lead, ...results[idx] });
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  scored.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

  const output = inputFile.replace('leads-enriched-', 'leads-scored-');
  writeFileSync(output, JSON.stringify(scored, null, 2));
  console.log(`\n✅ top 10 leads:`);
  scored.slice(0, 10).forEach((l: any, i: number) => console.log(`  ${i + 1}. [${l.score}] ${l.name}`));
  console.log(`\n💾 ${output}`);

  const qualified = scored.filter((l: any) => l.score >= 60).length;
  console.log(`🎯 ${qualified} leads acima do threshold de envio (60)`);
}

main().catch(console.error);
