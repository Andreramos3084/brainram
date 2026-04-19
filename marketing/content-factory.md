# Content Factory — Marketing 100% IA

Pilares do conteúdo da marca DFY-IA:
1. **Casos reais** (prints de conversa, vídeos before/after)
2. **Educação** (o que IA faz que humano não faz)
3. **Provas sociais** (depoimentos em vídeo gerados)
4. **Ofertas** (CTAs semanais)

## Cronograma semanal (automatizado)

| Dia | Formato | Ferramenta IA |
|-----|---------|---------------|
| Seg | Reel 30s: "A IA salvou esse cliente às 23h" | Claude roteiro + Remotion |
| Ter | Carrossel: "3 erros que custam R$5k/mês em leads" | Claude + Imagen |
| Qua | Post estático: métrica de cliente real | Imagen + dados Supabase |
| Qui | Reel: "Dentro do dashboard DFY-IA" | Screencast + Claude locução |
| Sex | Story enquete + caso | Manual (30min) |
| Sáb | Carrossel: depoimento cliente | Claude + Imagen |
| Dom | Off | - |

## Fluxo n8n

```
[Cron diário 7h]
      ↓
[Selecionar tipo de conteúdo do dia]
      ↓
[Perplexity: pega tendência/notícia do nicho]
      ↓
[Claude: escreve copy + roteiro]
      ↓
[Imagen/Remotion: gera mídia]
      ↓
[Upload Supabase Storage]
      ↓
[Post na fila do agendador (Postiz/Metricool)]
      ↓
[Publica automaticamente]
```

## Reaproveitamento
1 caso real = 6 conteúdos:
- Reel Instagram
- Post LinkedIn
- Thread Twitter
- Short YouTube
- Carrossel
- Story

Claude faz as 6 adaptações automaticamente a partir do caso bruto.

## Meta de alcance
Mês 1: 500 seguidores orgânicos (suficiente pra prova social)
Mês 2: 2k + primeiros leads inbound
Mês 3: 5k + inbound começa a fechar sem outbound
