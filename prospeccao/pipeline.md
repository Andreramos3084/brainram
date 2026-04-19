# Pipeline de Prospecção Automatizada

## Arquitetura

```
[Google Maps Scraper]
        ↓
[Enriquecimento: Perplexity + Instagram scraper]
        ↓
[Scoring: Claude classifica fit 0-100]
        ↓
[Geração de mensagem personalizada: Claude]
        ↓
[Fila de envio: n8n + rate limit]
        ↓
[Evolution API: 3 números WhatsApp em rotação]
        ↓
[Classificador de resposta: Claude]
        ↓
[Roteamento: agenda call / follow-up / arquivar]
```

## Detalhes por etapa

### 1. Scraping (Apify ou scraper próprio)
- Ferramenta: Apify "Google Maps Scraper" (US$ 30/mês cobre volume)
- Input: query + cidade + raio
- Output: nome, telefone, endereço, site, rating, número de reviews, categoria
- Meta: 100 empresas/dia/nicho

### 2. Enriquecimento
Para cada lead:
- **Perplexity:** "Me fale sobre [empresa X] em [cidade]. Eles têm Instagram? Quantos posts por mês? Anunciam no Google? Têm sistema de agendamento online?"
- Scraper Instagram público: último post, engajamento, bio
- Resultado: dossiê de 300 tokens por lead

### 3. Scoring (Claude)
Prompt:
```
Analise esse lead e dê score 0-100 de fit para atendente WhatsApp IA.

Fit alto (>70):
- Pequena/média empresa
- Usa WhatsApp como canal
- Ativa no Instagram mas sem automação
- Nicho com ticket alto
- Reviews recentes (negócio ativo)

Fit baixo (<40):
- Muito grande (já tem CRM)
- Inativa >3 meses
- Nicho com ticket baixo demais

Dados: {dossie}

Responda JSON: {score: N, motivo: "...", gancho_pessoal: "algo real pra usar na abordagem"}
```

### 4. Geração de mensagem
Claude usa `gancho_pessoal` do scoring para personalizar mensagem base.

**Exemplo real:**
- Gancho: "Clínica postou sobre clareamento há 3 dias com 127 likes"
- Mensagem: "Oi Dra. Ana, vi o post do clareamento de terça — bombou. Aposto que chegou um monte de WhatsApp perguntando preço e você respondeu todo mundo manualmente né? 😅 Tô ajudando 3 clínicas em Campinas com uma IA que responde isso em 3s e agenda direto. Te interessa um vídeo de 2min mostrando?"

### 5. Envio
- n8n com rate limit: 1 msg a cada 2-4min (random) por número
- Máx 50/dia/número
- 3 números = 150/dia
- Janela: 9h-18h dias úteis, 10h-14h sábado

### 6. Classificação de resposta (Claude)
```
Categorize a resposta em uma categoria:
- INTERESSADO: quer saber mais
- DUVIDA: pergunta técnica/preço
- OBJECAO: tem receio específico
- NAO: recusa clara
- FORA_HORARIO: pede pra falar depois
- SPAM_REPORT: ameaça ou xinga

Resposta: {texto}
```

### 7. Roteamento
- INTERESSADO → manda vídeo de 2min + pergunta "quando você tem 15min?"
- DUVIDA → Claude responde automaticamente (FAQ)
- OBJECAO → Claude tenta 1 rebater, se insistir escala pra você
- NAO → arquiva, não reabordar por 90 dias
- FORA_HORARIO → agenda re-envio no horário pedido
- SPAM_REPORT → remove número da base, alerta você

## Custo estimado
- Apify: US$ 30/mês
- Claude API (Sonnet 4.7): ~US$ 40/mês para 3k leads processados
- Perplexity: já paga
- Evolution API: já paga
- n8n: self-hosted (grátis)

**Total: ~R$ 350/mês de stack de prospecção.**

## ROI
Se fecha 4 clientes/mês a R$1.997 setup + R$397 recorrente:
- Receita mês 1: R$7.988 + R$1.588 = R$9.576
- CAC: R$87/cliente
- Margem bruta: >95%
