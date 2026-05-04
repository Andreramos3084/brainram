/**
 * Content Factory — geração diária 100% IA, 100% grátis de infra
 *
 * Roda no GitHub Actions (2000min/mês grátis).
 * Gera: copy do post + prompt de imagem + roteiro de reel.
 * Imagem/reel em si: usar skill local ai-imagegen / remotion depois.
 *
 * Custo por dia: ~$0.02 (Perplexity sonar + já pago)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PPLX_KEY = process.env.PERPLEXITY_KEY!;

const PILARES = [
  { dia: 0, tipo: 'reel', tema: 'Caso real: IA salvou lead de madrugada' },
  { dia: 1, tipo: 'carrossel', tema: '3 erros que custam R$5k/mês em leads perdidos' },
  { dia: 2, tipo: 'post', tema: 'Métrica de cliente: pacientes recuperados no mês' },
  { dia: 3, tipo: 'reel', tema: 'Dentro do dashboard BrainRam — bastidor' },
  { dia: 4, tipo: 'story', tema: 'Enquete + caso rápido' },
  { dia: 5, tipo: 'carrossel', tema: 'Depoimento cliente (quote formatada)' },
  { dia: 6, tipo: 'off', tema: '' },
];

async function callPerplexity(messages: Array<{ role: string; content: string }>, model = 'sonar') {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PPLX_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 2000 }),
  });
  if (!res.ok) throw new Error(`Perplexity error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function researchTrend(): Promise<string> {
  const content = await callPerplexity([{
    role: 'user',
    content: 'Me dê 1 tendência atual da última semana sobre automação com IA em clínicas odontológicas ou imobiliárias no Brasil. Máx 3 linhas.',
  }], 'sonar-pro');
  return content;
}

async function generateContent(pilar: typeof PILARES[0], trend: string) {
  const prompt = `Hoje é ${new Date().toLocaleDateString('pt-BR')}. Crie conteúdo para Instagram da marca BrainRam (atendente de IA no WhatsApp, B2B, alvo: clínicas odonto + imobiliárias).

Formato: ${pilar.tipo}
Tema do dia: ${pilar.tema}
Tendência da semana: ${trend}

Retorne JSON:
{
  "caption": "legenda final pro Instagram (2-4 parágrafos, tom consultivo, hashtag no final)",
  "hook": "primeira linha (gancho de 1 frase pra prender)",
  "cta": "chamada à ação final",
  "hashtags": ["#...","..."] (max 8),
  ${pilar.tipo === 'reel' ? '"roteiro_reel": [{"segundo": 0, "fala": "...", "visual": "..."}],' : ''}
  ${pilar.tipo === 'carrossel' ? '"slides": [{"titulo":"","corpo":""}] (5-7 slides),' : ''}
  "prompt_imagem": "prompt detalhado em inglês pra Imagen 3 gerar a imagem do post, estilo: moderno, cores primárias verde #22c55e e preto"
}

Só JSON, sem preamble.`;

  const content = await callPerplexity([{ role: 'user', content: prompt }], 'sonar');
  const match = content.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

async function main() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const pilar = PILARES[dayOfWeek];

  if (pilar.tipo === 'off') {
    console.log('🌴 Domingo off. Sem post hoje.');
    return;
  }

  console.log(`🎨 Gerando ${pilar.tipo}: "${pilar.tema}"`);
  const trend = await researchTrend();
  console.log(`📡 trend: ${trend.slice(0, 120)}...`);

  const content = await generateContent(pilar, trend);
  if (!content) { console.error('❌ falha na geração'); return; }

  const date = today.toISOString().split('T')[0];
  const outDir = join(import.meta.dir, '..', 'output', date);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'content.json'), JSON.stringify({ pilar, trend, ...content }, null, 2));
  writeFileSync(join(outDir, 'caption.txt'), `${content.caption}\n\n${(content.hashtags || []).join(' ')}`);
  writeFileSync(join(outDir, 'image-prompt.txt'), content.prompt_imagem);

  console.log(`✅ Salvo em marketing/output/${date}/`);
  console.log(`\n📝 Caption:\n${content.caption}\n`);
  console.log(`🎯 CTA: ${content.cta}`);
}

main().catch(console.error);
