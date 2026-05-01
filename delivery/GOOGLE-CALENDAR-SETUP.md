# 🔗 Google Calendar — Setup do Service Account

Este guia configura a integração real do atendente IA com Google Calendar.

---

## 1. Criar Service Account no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto (ex: `dfy-ia-calendar`) ou use um existente
3. Ative a **Google Calendar API**:
   - APIs & Services → Library → "Google Calendar API" → Enable
4. Crie a Service Account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Nome: `dfy-ia-calendar-bot`
   - Role: não precisa de role específica (a autorização é via compartilhamento do calendário)
5. Gere uma chave JSON:
   - Entre na service account → Keys → Add Key → JSON
   - Baixe o arquivo `.json` (não o perca — é a única cópia)

---

## 2. Compartilhar o Calendário da Clínica

A service account **não acessa** o calendário pessoal automaticamente. Você precisa compartilhar:

1. No Google Calendar da clínica (conta do dono/dentista):
   - Clique nos 3 pontos do calendário → Settings and sharing
   - "Share with specific people" → Adicione o **client_email** da service account
   - Permissão: **Make changes to events**

2. Copie o **Calendar ID**:
   - Na mesma tela de settings, o ID está em "Integrate calendar"
   - Exemplo: `clinicaodonto@gmail.com` ou `abc123@group.calendar.google.com`

---

## 3. Configurar no Banco de Dados (Supabase)

Rode a migration primeiro:
```bash
# SQL Editor do Supabase
\i delivery/migration-google-calendar.sql
```

Depois, para cada tenant (clínica), atualize a tabela `agents`:

```sql
UPDATE agents
SET
  google_calendar_id = 'clinicaodonto@gmail.com',
  google_service_account_json = '{
    "type": "service_account",
    "project_id": "dfy-ia-calendar",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
    "client_email": "dfy-ia-calendar-bot@dfy-ia-calendar.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }'::jsonb,
  working_hours_start = '08:00',
  working_hours_end = '18:00',
  slot_duration_minutes = 60,
  working_days = array['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
WHERE tenant_id = '<uuid-do-tenant>';
```

> 💡 **Dica:** Você pode fazer um script de onboarding que já pede o JSON da service account e o Calendar ID no momento da venda.

---

## 4. Deploy da Edge Function

Como adicionamos `_shared/google-calendar.ts`, precisamos redeployar:

```bash
# Se estiver usando Supabase CLI
supabase functions deploy agent-handler-cached
supabase functions deploy agent-handler

# Ou manualmente via dashboard do Supabase (copiar/colar)
```

---

## 5. Testar

Envie uma mensagem de teste para o WhatsApp da instância:

```
"Quais horários disponíveis esta semana?"
```

O agente deve responder com horários reais do Google Calendar (excluindo eventos já marcados).

Depois teste o agendamento:

```
"Quero marcar limpeza amanhã às 10h, meu nome é João"
```

Verifique se:
1. O evento apareceu no Google Calendar da clínica
2. O link do evento foi salvo em `agendamentos.google_event_link`

---

## ⚠️ Segurança

- **NUNCA** commite o JSON da service account no Git
- Armazene no banco (como está sendo feito) ou em variável de ambiente segura
- O `.gitignore` já ignora `.env` — mantenha assim
- Se o `private_key` vazar, revogue imediatamente na Google Cloud Console

---

## 🔧 Troubleshooting

| Erro | Causa provável | Solução |
|------|---------------|---------|
| `401 Invalid Credentials` | Service account não compartilhada no calendário | Compartilhe o calendário com o `client_email` |
| `404 Not Found` | `google_calendar_id` incorreto | Verifique o ID em Settings do calendário |
| `403 Forbidden` | API não ativada | Ative Google Calendar API no projeto |
| `Agendamento sem link` | Service account JSON ausente/nulo | Verifique se o campo foi salvo corretamente |
| Horários não batem | Fuso horário | O código usa `America/Sao_Paulo` por padrão |
