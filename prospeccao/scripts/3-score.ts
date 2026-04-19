/**
 * STEP 3 — Scoring via Claude (Sonnet 4.7)
 *
 * Input:  leads-enriched-*.json
 * Output: leads-scored-*.json (adiciona score, motivo, gancho, mensagem personalizada)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SCORING_PROMPT = `Você é analista de vendas B2B. Recebe dados de uma clínica odontológica e avalia fit para um produto: atendente de IA no WhatsApp (R$1.997 setup + R$397/mês) que atende 24/7, qualifica e agenda.

FIT ALTO (70-100): clínica pequena/média, ativa no Instagram mas sem automação, ticket médio-alto, usa WhatsApp como canal, tem reviews recentes.
FIT MÉDIO (40-70): ativa mas pouco visível, sinais mistos.
FIT BAIXO (<40): inativa, grande demais (já tem sistema), sem WhatsApp, rating ruim.

Retorne APENAS JSON:
{
  "score": number,
  "motivo": "1 linha",
  "gancho_pessoal": "observação real e específica pra usar na abordagem — algo que mostra que você olhou de verdade",
  "mensagem_cold": "mensagem WhatsApp de 4-6 linhas, com o gancho, soando humana e consultiva, não robótica. Assinar só com primeiro nome, André. NUNCA prometer resultado. Terminar com pergunta curta."
}`;

async function scoreOne(lead: any) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-7',
    max_tokens: 700,
    system: SCORING_PROMPT,
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
  if (!inputFile) throw new Error('Uso: bun run 3-score.ts <leads-enriched-file.json>');

  const leads = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`🎯 Pontuando ${leads.length} leads com Claude...`);

  const scored = [];
  for (let i = 0; i < leads.length; i++) {
    console.log(`  [${i + 1}/${leads.length}] ${leads[i].name}`);
    const evaluation = await scoreOne(leads[i]);
    scored.push({ ...leads[i], ...evaluation });
    await new Promise((r) => setTimeout(r, 500));
  }

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));

  const output = inputFile.replace('leads-enriched-', 'leads-scored-');
  writeFileSync(output, JSON.stringify(scored, null, 2));
  console.log(`✅ top 10:`);
  scored.slice(0, 10).forEach((l, i) => console.log(`  ${i + 1}. [${l.score}] ${l.name}`));
  console.log(`\n💾 ${output}`);
}

main().catch(console.error);
