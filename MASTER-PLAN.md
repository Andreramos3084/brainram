# DFY-IA — Operação Atendente WhatsApp com IA

**Meta:** R$10k/mês recorrente em 90 dias.
**Modelo:** Done-For-You. Cliente não toca em nada.
**Diferencial:** Tudo que NÃO é conversa com o lead é feito por IA generativa.

---

## 1. PRODUTO

### Oferta única (primeira versão)
**"Atendente de IA no WhatsApp da sua empresa — responde 24/7, agenda, qualifica e vende."**

- Setup: **R$1.997** (pagamento à vista, PIX)
- Mensalidade: **R$397/mês** (hospedagem + otimização contínua + até 3 ajustes/mês)
- Trial: 7 dias grátis após setup, cancela se não gostar

### O que entrega
1. Número WhatsApp dedicado (Evolution API instância isolada)
2. Agente treinado no negócio do cliente (Perplexity + RAG dos dados dele)
3. Fluxos: atendimento, qualificação, agendamento, FAQ, orçamento
4. Integração com Google Calendar (agendamento direto)
5. Dashboard web do cliente (métricas, histórico, override humano)
6. Relatório mensal automático (PDF gerado por IA)

### Upsells (mês 2+)
- **Gerador de conteúdo** (posts/reels diários da marca): +R$297/mês
- **Prospecção ativa** (IA manda mensagem para leads novos): +R$497/mês
- **Multi-atendente** (2+ números): +R$197/número

### Meta de mix para R$10k/mês
- 20 clientes no básico (R$397) = R$7.940
- 5 clientes com upsell conteúdo (+R$297) = R$1.485
- 2 clientes com prospecção ativa (+R$497) = R$994
- **Total: R$10.419/mês**

---

## 2. ICP — POR ONDE COMEÇAR

Nichos que pagam, têm volume e são replicáveis:

| Nicho | Ticket médio cliente | Dor principal | Por que paga |
|-------|---------------------|---------------|--------------|
| **Clínicas odonto/estética** | Alto | Perde lead fora do horário | Converter R$500+ por paciente |
| **Imobiliárias pequenas** | Alto | Corretor sobrecarregado | 1 venda paga 12 meses |
| **Autoescolas** | Médio | Matrícula por WhatsApp | Volume alto de leads |
| **Oficinas mecânicas** | Médio | Agendamento caótico | Organização |
| **Salões/barbearias premium** | Médio | No-show e reagendamento | Automação de confirmação |
| **Advogados solo** | Alto | Filtrar lead ruim | Triagem vale caro |
| **Pet shops com banho/tosa** | Médio | Agendamento recorrente | Fidelização |

**Começar:** Clínicas odonto + imobiliárias (ticket alto = fácil justificar R$2k).
**Região foco:** Campinas + RMC (você já conhece, SEO programático reaproveitável).

---

## 3. ESTRUTURA DE AUTOMAÇÃO POR IA

Cada fase tem um "trabalhador de IA" específico. Você só orquestra.

### Fase 1 — Planejamento (IA = Perplexity)
- Gerar ICP detalhado por nicho
- Gerar ofertas adaptadas por dor
- Gerar árvore de decisão da conversa do agente

### Fase 2 — Produção (IA = Perplexity + template)
- Landing page: template React clonável por nicho (variáveis: nome, dor, CTA)
- Prompt do agente: template com slots (negócio, tom, FAQs, serviços, preços)
- Dashboard cliente: 1 código, multi-tenant por `client_id`

### Fase 3 — Marketing (IA = Perplexity + Remotion + Imagen)
- **Content Factory diário:** 3 posts Instagram/dia, 1 reel/dia, 1 carrossel/semana
- Perplexity pesquisa tendências do nicho
- Perplexity escreve copy
- Imagen gera imagem
- Remotion gera reel
- n8n publica no agendador

### Fase 4 — Prospecção (IA = scraper + Perplexity + Evolution)
**Pipeline:**
1. Scraper Google Maps → extrai 500 empresas do nicho/região/dia
2. Enriquecimento: Perplexity pega site + Instagram + avaliações
3. Perplexity analisa: "essa empresa tem dor que meu produto resolve?" → score 0-100
4. Para top 100 do dia: Perplexity escreve mensagem **personalizada** baseada em algo real do negócio dele
5. Evolution envia pelo WhatsApp (máx 50/dia por número, 3 números em rotação)
6. Respostas → Perplexity classifica: interessado / dúvida / não / ignora
7. Interessados → agenda call automática via Calendly link

**Meta:** 500 abordagens/dia → 2-5% resposta → 10-25 conversas → 2-3 fechamentos/semana.

### Fase 5 — Fechamento (humano mínimo — só você)
- Call de 15min (ou só WhatsApp mesmo)
- Pitch de 3 slides (gerado por IA)
- Link de pagamento Stripe/Mercado Pago
- Pagou → fluxo de onboarding dispara

### Fase 6 — Onboarding (100% IA)
Cliente paga → recebe formulário (Typeform/Tally) com:
- Nome do negócio, serviços, preços, horário, endereço
- FAQ (upload PDF ou 10 perguntas top)
- Tom de voz (formal/casual)
- Regras: o que o bot PODE e NÃO PODE responder

Form submetido → edge function:
1. Cria instância Evolution API
2. Gera prompt do agente com os dados
3. Cria tenant no Supabase
4. Gera landing de confirmação
5. Manda credenciais pro cliente
6. Agenda call de 30min na semana 1

**Tempo de onboarding:** 24-48h automatizado.

### Fase 7 — Retenção (IA)
- Relatório mensal PDF: métricas + insights + sugestões (Perplexity gera)
- Alerta automático se uso cair (risco de churn)
- Upsell trigger: se cliente usa >80% da capacidade → oferecer upgrade

---

## 4. STACK TÉCNICA (TUDO QUE VOCÊ JÁ TEM)

| Camada | Ferramenta | Status |
|--------|-----------|--------|
| WhatsApp | Evolution API | ✅ Já tem |
| Backend | Supabase (edge functions + db) | ✅ Já tem |
| IA conversa | Perplexity API (sonar-pro) | ✅ Tem API key |
| IA pesquisa | Perplexity sonar-pro | ✅ Já tem |
| IA imagens | Gemini Imagen 3 (skill ai-imagegen) | ✅ |
| Vídeos | Remotion (skill remotion-video-creator) | ✅ |
| Landing | React + Vite + Vercel | ✅ Stack ClickMont |
| Orquestração | n8n | ✅ Tem skill |
| Pagamento | Mercado Pago + Stripe | ⏳ Criar conta |
| Scraping | Apify / scraper próprio | ⏳ Definir |
| Deploy | Vercel CLI + token | ✅ Já tem |

**Nada novo para aprender. Só conectar.**

---

## 5. CRONOGRAMA DE 30 DIAS

### Semana 1 — Máquina base
- [ ] Dia 1-2: Landing oferta única + página de vendas
- [ ] Dia 3: Template de prompt do agente (nicho clínica odonto)
- [ ] Dia 4: Fluxo onboarding automático (Tally → edge function → Evolution)
- [ ] Dia 5: Scraper Google Maps (clínicas Campinas) + enrichment
- [ ] Dia 6: Template mensagem cold outbound + teste com 20 leads
- [ ] Dia 7: Ajustar baseado em resposta → escalar para 100/dia

### Semana 2 — Primeiros fechamentos
- [ ] Escalar prospecção para 300/dia
- [ ] Meta: 3 calls agendadas, 1-2 fechamentos
- [ ] Refinar pitch com base em objeções reais
- [ ] Começar content factory (provas sociais dos primeiros casos)

### Semana 3 — Segundo nicho
- [ ] Clonar tudo para imobiliárias
- [ ] Rodar prospecção paralela em 2 nichos
- [ ] Meta acumulada: 4-6 clientes fechados

### Semana 4 — Polimento e escala
- [ ] Dashboard cliente v1
- [ ] Relatório mensal automático
- [ ] Adicionar 3º nicho (autoescolas OU estética)
- [ ] Meta fim do mês: 8-10 clientes = R$3.2-4k recorrente + R$16-20k setup

---

## 6. MÉTRICAS-CHAVE (SÓ ESSAS IMPORTAM)

Dashboard semanal (gerar automático):
- **Abordagens enviadas** (meta: 2.500/semana nos 3 nichos)
- **Taxa de resposta** (meta: >2%)
- **Calls agendadas** (meta: 10/semana)
- **Taxa de fechamento** (meta: >25%)
- **CAC** (meta: <R$300)
- **Churn mensal** (meta: <10%)
- **MRR** (meta mês 1: R$4k, mês 2: R$7k, mês 3: R$10k+)

---

## 7. O QUE VOCÊ FAZ vs O QUE A IA FAZ

### Você (30-60min/dia)
1. Call de fechamento (só as que a IA qualificou)
2. Aprovar lotes de mensagens cold (1 clique)
3. Revisar 1 caso difícil/dia do agente
4. Decidir próximo nicho a abrir

### IA (24/7)
- Tudo o resto

---

## 8. PRÓXIMOS 3 PASSOS IMEDIATOS

1. **Criar landing da oferta** (`/dfy-ia/produto/landing/`) — template React clonável
2. **Escrever prompt-mãe do agente clínica odonto** (`/dfy-ia/produto/agentes/clinica-odonto.md`)
3. **Setup do scraper + 1ª leva de 50 leads reais de clínicas odonto em Campinas** para testar cold outbound na sexta-feira

Quando você disser "vai", começo pelo 1.
