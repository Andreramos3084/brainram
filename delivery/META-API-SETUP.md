# 🔵 Meta WhatsApp Cloud API — Setup

Guia para configurar a API oficial do WhatsApp (Meta) como redundância da Evolution API.

---

## 1. Criar App no Meta Developers

1. Acesse [developers.facebook.com](https://developers.facebook.com/)
2. Crie um app do tipo **Business**
3. Adicione o produto **WhatsApp**
4. Conecte uma conta business verificada (ou use sandbox para testes)

---

## 2. Pegar as Credenciais

No painel do app:
- **Phone Number ID**: `https://business.facebook.com/wa/manage/phone-numbers/`
- **Access Token**: Gere um token permanente (System User) ou use o token temporário de teste
- **Verify Token**: escolha qualquer string (ex: `brainram-verify-2026`)

---

## 3. Configurar Variáveis de Ambiente

Adicione no Supabase (Edge Functions → Secrets):
```
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAA...
WHATSAPP_VERIFY_TOKEN=brainram-verify-2026
DEFAULT_WHATSAPP_PROVIDER=auto
```

Ou no `.env` local para testes.

---

## 4. Configurar Webhook no Meta

1. No painel do app → WhatsApp → Configuration → Webhooks → Edit
2. **Callback URL**: `https://nlcmhqevxpdttuhamjsj.supabase.co/functions/v1/agent-handler-cached?tenant_id=<UUID_DO_TENANT>`
3. **Verify Token**: `brainram-verify-2026`
4. **Subscribe to**: `messages`

> ⚠️ **Atenção**: O Meta exige HTTPS com certificado válido. O domínio do Supabase já atende.

---

## 5. Testar

Envie uma mensagem para o número do WhatsApp Business configurado. A edge function deve:
1. Receber o webhook da Meta
2. Processar com Claude
3. Responder via Meta (ou Evolution se Meta falhar)

---

## 🔄 Como o Fallback Funciona

| Cenário | Comportamento |
|---------|--------------|
| Meta configurada + Evolution configurada + `DEFAULT_WHATSAPP_PROVIDER=auto` | Tenta Meta primeiro; se falhar, usa Evolution |
| Só Meta configurada | Sempre usa Meta |
| Só Evolution configurada | Sempre usa Evolution |
| Ambas configuradas + `DEFAULT_WHATSAPP_PROVIDER=evolution` | Tenta Evolution primeiro; se falhar, usa Meta |

O fallback acontece **automaticamente em tempo de execução** — se um provider retornar erro HTTP, a edge function tenta o outro imediatamente.

---

## 📋 URLs das Edge Functions (produção)

- `https://nlcmhqevxpdttuhamjsj.supabase.co/functions/v1/agent-handler-cached?tenant_id=...`
- `https://nlcmhqevxpdttuhamjsj.supabase.co/functions/v1/agent-handler?tenant_id=...`

Use a mesma URL para **ambos** os webhooks (Evolution e Meta). A edge function detecta o formato automaticamente.
