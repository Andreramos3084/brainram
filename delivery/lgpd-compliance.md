# BrainRam — Framework de Compliance LGPD & Anti-Spam

## Status Legal

BrainRam atua como **controlador de dados** (LGPD, art. 5º, VI) na prospecção e **operador** (art. 5º, VII) no atendimento dos clientes. Este documento define as regras operacionais para manter a operação dentro da lei e reduzir risco de bloqueios em canais.

---

## 1. Base Legal para Prospecção (Art. 7º LGPD)

### Email (canal principal — recomendado)
- **Base:** Legítimo interesse (art. 7º, IX) + interesse legítimo do destinatário (art. 7º, IV).
- **Justificativa:** Empresas B2B divulgam emails comerciais publicamente (Google Maps, sites, CNPJ). O contato é sobre solução de negócio diretamente relacionada à atividade da clínica.
- **Requisito:** Sempre oferecer opt-out claro e imediato.

### WhatsApp (canal secundário — restrito)
- **Base:** Consentimento implícito restrito (art. 7º, IV) — APENAS quando o número está publicado como canal comercial (botão "Conversar" no Google Maps, WhatsApp no site).
- **Restrição:** Nunca enviar para números pessoais não publicados. Nunca usar números comprados em listas.
- **Requisito:** Primeira mensagem deve identificar origem, oferecer opt-out e ser relevante ao negócio.

---

## 2. Regras de Envio (Anti-Spam)

### Email Outbound
| Regra | Valor |
|-------|-------|
| Máx por domínio/dia | 50 (evita blacklist) |
| Máx por IP/dia | 300 |
| Intervalo mínimo | 30 segundos |
| Horário | 9h–18h seg–sex |
| Assunto | Nunca usar ALL CAPS, "URGENTE", "GRÁTIS" em excesso |
| De | Nome identificável (ex: "André Ramos — BrainRam") |
| Reply-To | Funcional, monitorado |

### WhatsApp Outbound (modo conservador)
| Regra | Valor |
|-------|-------|
| Máx por número/dia | 30 (warmup) → 100 (maduro) |
| Intervalo mínimo | 90 segundos |
| Horário | 9h–12h, 14h–18h seg–sex |
| Primeira msg | Sempre personalizada, nunca genérica |
| Se bloqueio/report | Pausar número imediatamente, aguardar 7 dias |

---

## 3. Opt-Out & Direitos do Titular

### Mecanismo de Unsubscribe (Email)
Cada email deve conter no rodapé:
```
---
BrainRam — Pirassununga/SP
Não quer mais receber? Responda "SAIR" ou acesse: https://brainram.com.br/unsubscribe?id=XXX
DPO: dpo@brainram.com.br
```

### Mecanismo de Opt-Out (WhatsApp)
Na primeira mensagem ou quando solicitado:
> "Se não quiser receber mais mensagens, responda SAIR."

### Processamento de SAIR/UNSUBSCRIBE
1. Recebe "SAIR", "REMOVER", "UNSUBSCRIBE", "OPT-OUT"
2. Marca lead como `opted_out = true` no Supabase
3. Nunca mais envia para esse contato (qualquer canal)
4. Responde confirmação: "Removido. Não enviaremos mais mensagens."
5. Notifica admin (log silencioso)

### Direitos do Titular (LGPD)
| Direito | Como atender |
|---------|-------------|
| Confirmação/acesso | Painel do cliente mostra todas as conversas |
| Correção | Cliente pode atualizar dados via formulário Tally |
| Anonimização/bloqueio | `opted_out = true` + `blocked = true` |
| Portabilidade | Exportar CSV de conversas em 30 dias |
| Eliminação | Deletar tenant + todas as conversas (edge function) |
| Informação | Este documento + política de privacidade na landing |

---

## 4. Dados Coletados & Retenção

### Prospecção (leads)
| Dado | Fonte | Retenção |
|------|-------|----------|
| Nome, endereço, telefone | Google Maps (público) | 2 anos ou até opt-out |
| Email | Site/Google Maps (público) | 2 anos ou até opt-out |
| Score, mensagem_cold | Gerado por IA | 2 anos ou até opt-out |
| Conversa WhatsApp | Enviada/recebida | 2 anos ou até opt-out |

### Clientes (tenants)
| Dado | Fonte | Retenção |
|------|-------|----------|
| Nome, CNPJ, endereço | Formulário onboarding | Duração do contrato + 5 anos |
| Conversas pacientes | WhatsApp do cliente | Duração do contrato + 1 ano |
| Dados de pagamento | Mercado Pago | Não armazenamos (tokenizado) |

### Exclusão Automática
- Leads `opted_out = true` → anonimizar após 90 dias (manter hash para dedupe)
- Tenants cancelados > 1 ano → anonimizar conversas, manter dados fiscais

---

## 5. Medidas de Segurança

1. **Criptografia:** Supabase SSL, Redis TLS, Evolution API SSL
2. **Acesso:** Admin panel com senha + cookie HttpOnly
3. **API Keys:** Nunca expostas no frontend, apenas server-to-server
4. **Logs:** `mp_events`, `campaign_runs` — sem dados sensíveis em texto puro
5. **Backups:** Supabase faz PITR (Point-in-Time Recovery)

---

## 6. Política de Privacidade (texto para landing)

```
Política de Privacidade — BrainRam

1. Quem somos
BrainRam (André Ramos, CPF XXX) é um serviço de atendimento automatizado via WhatsApp para clínicas e consultórios.

2. Dados que coletamos
• Dados públicos de empresas (nome, telefone comercial, email comercial) para prospecção B2B
• Dados fornecidos pelo cliente no onboarding (nome da clínica, serviços, preços)
• Conversas entre pacientes e o atendente de IA

3. Como usamos
• Prospecção comercial legítima B2B
• Prestação do serviço de atendimento automatizado
• Melhoria do produto

4. Seus direitos (LGPD)
Você pode acessar, corrigir, portar ou solicitar a exclusão dos seus dados a qualquer momento enviando email para dpo@brainram.com.br.

5. Opt-out
Para deixar de receber nossas mensagens, responda "SAIR".

6. Retenção
Mantemos os dados pelo tempo necessário para cumprir as finalidades acima ou por obrigação legal.
```

---

## 7. Checklist Pré-Disparo

- [ ] Lead não está em `opted_out = true`
- [ ] Horário comercial (9–18, seg–sex)
- [ ] Mensagem personalizada (não genérica)
- [ ] Opt-out visível (email) ou mencionado (WA)
- [ ] Delay adequado entre envios
- [ ] Cap diário não ultrapassado
- [ ] Domínio/email não em blacklist

---

## 8. Plano de Resposta a Incidentes

| Incidente | Ação |
|-----------|------|
| Número WA bloqueado | Pausar instância, migrar leads para email, aquecer novo número |
| Domínio email em blacklist | Trocar subdomínio, aquecer IP, reduzir volume |
| Reclamação LGPD ANPD | Pausar campanha, documentar base legal, responder em 15 dias |
| Vazamento de dados | Notificar ANPD em 72h, notificar titulares, investigar causa |
| Cliente pede exclusão | Executar em 30 dias, enviar comprovação |
