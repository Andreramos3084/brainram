/**
 * Templates de email outbound por nicho
 *
 * Regras:
 * - Máximo 120 palavras no corpo
 * - Assunto curto (< 60 chars), sem ALL CAPS
 * - Tom consultivo, nunca agressivo
 * - Sempre termina com pergunta ou CTA suave
 * - Variáveis: {name}, {city}, {niche}
 */

export const EMAIL_TEMPLATES = [
  // === ODONTO ===
  {
    id: 'odonto-01',
    name: 'Odonto — perde lead fora do horário',
    niche: 'clínica odontológica',
    subject: '{name} — pacientes que você perde no WhatsApp',
    body: `Notei que {name} atende pelo WhatsApp — isso é ótimo, mas deve ser cansativo responder fora do horário.

A BrainRam monta um atendente de IA no WhatsApp da clínica que responde pacientes 24/7, passa preço e agenda consulta direto no Google Calendar. O dentista só entra quando é realmente necessário.

Funciona com 7 dias de teste grátis. Te interessa ver um exemplo de como ficaria para {niche} em {city}?`,
    active: true,
  },
  {
    id: 'odonto-02',
    name: 'Odonto — recepção sobrecarregada',
    niche: 'clínica odontológica',
    subject: 'Uma mão para a recepção de {name}',
    body: `Recepção de clínica odonto costuma ficar no fio da meada entre atender presencial e responder WhatsApp.

A BrainRam é um atendente de IA que fica no WhatsApp da clínica, responde sobre preços, convênios e horários, e agenda automaticamente. A recepção foca no que importa.

Posso te mostrar como funciona em uma demonstração rápida de 5 min?`,
    active: true,
  },

  // === CARDIOLOGIA ===
  {
    id: 'cardio-01',
    name: 'Cardio — agendamento de consulta/exames',
    niche: 'consultório cardiológico',
    subject: '{name} — agendamento de eletro e holter no WhatsApp',
    body: `Pacientes de cardiologia costumam ligar ou mandar WhatsApp perguntando sobre eletrocardiograma, holter e MAPA. Muitas vezes fora do horário.

A BrainRam monta um atendente de IA no WhatsApp do consultório que tira dúvidas sobre exames, preparos, valores e agenda consulta ou exame direto. Funciona 24/7.

Funciona com 7 dias de teste grátis. Quer ver um exemplo de como responderia sobre holter?`,
    active: true,
  },
  {
    id: 'cardio-02',
    name: 'Cardio — pós-alta e retorno',
    niche: 'consultório cardiológico',
    subject: 'Retorno de pacientes cardíacos sem sobrecarregar a secretária',
    body: `Pacientes cardíacos têm muitas dúvidas pós-consulta: medicação, dieta, quando voltar. Isso lota o WhatsApp do consultório.

A BrainRam é um atendente de IA treinado nos protocolos do Dr./Dra. que responde dúvidas frequentes, lembra de retornos e agenda revisão. O médico só é acionado no que é realmente clínico.

Posso te mostrar como ficaria para {name}?`,
    active: true,
  },

  // === CLÍNICA DE IMAGEM (RAIO-X, TOMOGRAFIA, RESSONÂNCIA) ===
  {
    id: 'imagem-01',
    name: 'Imagem — agendamento de exames',
    niche: 'clínica de imagem',
    subject: '{name} — agendar tomografia e ressonância pelo WhatsApp',
    body: `Agendar exame de imagem por telefone ou WhatsApp é repetitivo: "precisa de jejum?", "quanto custa?", "tem horário amanhã?".

A BrainRam monta um atendente de IA no WhatsApp da clínica que responde sobre preparos, convênios, valores e agenda o exame direto no sistema. Funciona 24/7.

Funciona com 7 dias de teste grátis. Te mostro como ficaria para {name} em {city}?`,
    active: true,
  },
  {
    id: 'imagem-02',
    name: 'Imagem — laudos e entrega',
    niche: 'clínica de imagem',
    subject: 'Menos ligações sobre laudo na {name}',
    body: `Pacientes ligam o dia todo perguntando se o laudo saiu, como retirar, se precisam de acompanhante. Isso consome horas da secretária.

A BrainRam é um atendente de IA que responde automaticamente sobre status de laudo, horários de retirada, preparos e agenda novos exames. Liberando a equipe para o atendimento presencial.

Quer ver um exemplo de como responderia sobre entrega de laudo?`,
    active: true,
  },

  // === NUTRICIONISTA ===
  {
    id: 'nutri-01',
    name: 'Nutri — agendamento e plano alimentar',
    niche: 'consultório de nutrição',
    subject: '{name} — WhatsApp respondendo sobre plano alimentar 24/7',
    body: `Pacientes de nutrição mandam mensagem a toda hora: "posso trocar o almoço?", "quantas calorias tem isso?", "quando é a próxima consulta?".

A BrainRam monta um atendente de IA no WhatsApp do consultório que responde dúvidas dentro do plano alimentar cadastrado, lembra de consultas e agenda retorno. O nutricionista só entra nas exceções.

Funciona com 7 dias de teste grátis. Te mostro como ficaria para {name}?`,
    active: true,
  },
  {
    id: 'nutri-02',
    name: 'Nutri — venda de planos e pacotes',
    niche: 'consultório de nutrição',
    subject: 'Vender planos nutricionais enquanto você atende',
    body: `Vender pacote de 3, 6 ou 12 consultas por WhatsApp exige responder rápido — e muitas vezes você está com paciente na sala.

A BrainRam é um atendente de IA que apresenta os pacotes, tira dúvidas sobre valores e agendas a primeira consulta automaticamente. Você só recebe o paciente confirmado.

Posso te mostrar como ficaria a conversa de venda para {name}?`,
    active: true,
  },

  // === EXAMES LABORATORIAIS ===
  {
    id: 'lab-01',
    name: 'Lab — agendamento e preparos',
    niche: 'laboratório de exames',
    subject: '{name} — agendar coleta e tirar dúvidas de preparo',
    body: `"Precisa de jejum?", "posso tomar água?", "qual o endereço da unidade?" — são as mesmas perguntas o dia todo no WhatsApp do laboratório.

A BrainRam monta um atendente de IA que responde sobre preparos de exames, convênios, valores, unidades e agenda coleta. Funciona 24/7, mesmo quando o laboratório está fechado.

Funciona com 7 dias de teste grátis. Quer ver como ficaria para {name} em {city}?`,
    active: true,
  },
  {
    id: 'lab-02',
    name: 'Lab — resultados e retirada',
    niche: 'laboratório de exames',
    subject: 'Menos "o resultado saiu?" na {name}',
    body: `Pacientes ligam e mandam WhatsApp perguntando se o resultado saiu, como retirar, se precisam agendar. Isso consome a equipe de atendimento.

A BrainRam é um atendente de IA que informa status de resultado, orienta retirada, explica valores e agenda novas coletas. A equipe foca na coleta e logística.

Te mostro como ficaria para {name}?`,
    active: true,
  },

  // === FISIOTERAPIA ===
  {
    id: 'fisio-01',
    name: 'Fisio — agendamento e convênios',
    niche: 'clínica de fisioterapia',
    subject: '{name} — agendar sessão de fisioterapia pelo WhatsApp',
    body: `Agendar fisioterapia por WhatsApp envolve verificar convênio, horário do paciente, duração da sessão e se precisa de prescrição médica.

A BrainRam monta um atendente de IA que verifica convênios, explica valores particulares, agenda sessões e lembra o paciente do horário. Funciona 24/7.

Funciona com 7 dias de teste grátis. Te interessa ver como ficaria para {name}?`,
    active: true,
  },

  // === PSIQUIATRIA / PSICOLOGIA ===
  {
    id: 'psi-01',
    name: 'Psicologia — triagem e agendamento',
    niche: 'consultório de psicologia',
    subject: '{name} — triagem de pacientes no WhatsApp',
    body: `Muitas pessoas procuram psicólogo por WhatsApp com dúvidas sobre abordagem, valores, convênio e disponibilidade. Responder tudo manualmente toma tempo.

A BrainRam monta um atendente de IA que faz triagem suave (online ou presencial, convênio, horário preferido), apresenta a abordagem do profissional e agenda a primeira sessão.

Funciona com 7 dias de teste grátis. Posso te mostrar como ficaria para {name}?`,
    active: true,
  },
];

export function getTemplatesByNiche(niche: string) {
  return EMAIL_TEMPLATES.filter(t => t.niche.includes(niche) || niche.includes(t.niche));
}

export function getTemplate(id: string) {
  return EMAIL_TEMPLATES.find(t => t.id === id);
}
