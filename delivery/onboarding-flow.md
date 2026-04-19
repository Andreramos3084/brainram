# Onboarding Automático — 24-48h do pagamento à IA funcionando

## Fluxo

```
Cliente paga (Mercado Pago webhook)
        ↓
Email + WhatsApp automático com link do formulário Tally
        ↓
Cliente preenche (15-20min)
        ↓
Webhook Tally → Edge Function `onboard-client`
        ↓
[1] Cria tenant no Supabase
[2] Cria instância Evolution API dedicada
[3] Gera prompt do agente (Claude, a partir do template + respostas)
[4] Configura webhook Evolution → agent-handler
[5] Cria evento no Google Calendar (call semana 1)
[6] Gera landing de confirmação personalizada
[7] Manda credenciais e QR code do WhatsApp pro cliente
        ↓
Cliente escaneia QR → WhatsApp Business conectado
        ↓
Teste automático: manda 3 mensagens simulando cliente
        ↓
Agente ativo em produção
```

## Formulário Tally (seções)

### Seção 1 — Sobre o negócio
- Nome do negócio
- Segmento (dropdown: clínica odonto / imobiliária / autoescola / oficina / salão / outro)
- Endereço completo
- Horário de funcionamento
- Site (opcional)
- Instagram
- Google Maps URL

### Seção 2 — Serviços
- Lista de serviços + preços (tabela dinâmica até 30 linhas)
- Promoções vigentes
- Formas de pagamento aceitas

### Seção 3 — Atendimento
- Nome do atendente virtual (sugestões por nicho)
- Tom de voz (radio: formal / casual / acolhedor / jovem)
- O que o bot PODE responder sozinho (multi-select)
- O que SEMPRE precisa escalar pra humano
- FAQ: 10 perguntas mais comuns + respostas

### Seção 4 — Integrações
- Google Calendar (autorização OAuth)
- Número WhatsApp que receberá escalações
- Email para relatórios

### Seção 5 — Upload
- Logo (PNG/SVG)
- Cardápio/tabela de serviços em PDF (opcional, vai para RAG)

## Edge Function `onboard-client` (pseudocódigo)

```typescript
export async function onboardClient(tallyPayload) {
  const data = parseTally(tallyPayload);

  // 1. Tenant
  const tenant = await supabase.from('tenants').insert({
    name: data.nome_negocio,
    segmento: data.segmento,
    plan: 'basic',
    ...
  }).select().single();

  // 2. Evolution instance
  const evoInstance = await evolution.createInstance({
    instanceName: `client_${tenant.id}`,
    token: generateToken(),
  });

  // 3. Prompt
  const prompt = await claude.messages.create({
    model: 'claude-sonnet-4-7',
    system: 'Gere um system prompt de atendente WhatsApp baseado no template e nos dados.',
    messages: [{
      role: 'user',
      content: `Template: ${TEMPLATE}\n\nDados: ${JSON.stringify(data)}`
    }]
  });

  await supabase.from('agents').insert({
    tenant_id: tenant.id,
    system_prompt: prompt.content,
    model: 'claude-sonnet-4-7',
  });

  // 4. Webhook
  await evolution.setWebhook({
    instanceName: `client_${tenant.id}`,
    url: `${API_URL}/agent-handler?tenant=${tenant.id}`,
  });

  // 5. Calendar event
  await calendar.events.insert({
    calendarId: 'primary',
    resource: {
      summary: `Call semana 1 — ${data.nome_negocio}`,
      start: addDays(new Date(), 5),
      ...
    }
  });

  // 6. Landing
  await generateLanding(tenant);

  // 7. Send credentials
  await sendWhatsApp({
    to: data.whatsapp_admin,
    message: `✅ Seu atendente ${data.nome_agente} tá pronto!\n\nEscaneia o QR code: ${evoInstance.qrcode}\n\nDashboard: ${DASH_URL}/${tenant.slug}`
  });

  return { ok: true, tenant_id: tenant.id };
}
```

## Teste automático pós-setup
Script roda 3 mensagens de teste:
1. "Oi, quanto custa limpeza de pele?" → deve listar preço
2. "Quero marcar pra amanhã às 14h" → deve consultar agenda
3. "Minha conta tá com problema" → deve escalar

Se algum falhar → alerta você + congela ativação até ajuste.
