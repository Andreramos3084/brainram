/**
 * Google Calendar API client para Deno/Supabase Edge Functions
 * Usa Service Account JWT (RS256) + REST API.
 * Zero dependências externas — apenas Web Crypto (nativo no Deno).
 */

// ─── JWT helpers ───

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '')
    .trim();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function base64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createSignedJWT(serviceAccount: Record<string, unknown>): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${header}.${claim}`;
  const key = await importRsaPrivateKey(serviceAccount.private_key as string);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64Url(signature)}`;
}

// ─── Google OAuth2 ───

let _tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(serviceAccount: Record<string, unknown>): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.exp - 60_000) return _tokenCache.token;

  const jwt = await createSignedJWT(serviceAccount);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
  _tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// ─── Calendar REST helpers ───

const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

async function calendarFetch(
  path: string,
  serviceAccount: Record<string, unknown>,
  opts: RequestInit = {}
): Promise<any> {
  const token = await getAccessToken(serviceAccount);
  const res = await fetch(`${API_BASE}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ─── Public API ───

export interface WorkingConfig {
  start: string;          // "09:00"
  end: string;            // "18:00"
  slotMinutes: number;    // 60
  days: string[];         // ["Mon","Tue","Wed","Thu","Fri"]
  timezone?: string;      // "America/Sao_Paulo"
}

const TZ = 'America/Sao_Paulo';
const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parseLocalDate(dateStr: string): Date {
  // dateStr = "2026-04-28"
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 03:00 UTC ≈ 00:00 BRT
}

function toISOLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Lista eventos existentes num range de datas (inclusive) */
export async function listEvents(
  calendarId: string,
  serviceAccount: Record<string, unknown>,
  dateFrom: string,
  dateTo: string
): Promise<Array<{ start: string; end: string; summary?: string }>> {
  const timeMin = `${dateFrom}T00:00:00-03:00`;
  const timeMax = `${dateTo}T23:59:59-03:00`;
  const encodedCal = encodeURIComponent(calendarId);
  const data = await calendarFetch(
    `${encodedCal}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    serviceAccount
  );
  return (data.items || []).map((it: any) => ({
    start: it.start?.dateTime || it.start?.date,
    end: it.end?.dateTime || it.end?.date,
    summary: it.summary,
  }));
}

/** Cria evento no Google Calendar */
export async function createEvent(
  calendarId: string,
  serviceAccount: Record<string, unknown>,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }
): Promise<{ htmlLink: string; id: string }> {
  const encodedCal = encodeURIComponent(calendarId);
  return calendarFetch(`${encodedCal}/events`, serviceAccount, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

/** Calcula slots livres entre dateFrom e dateTo */
export async function getAvailability(
  calendarId: string,
  serviceAccount: Record<string, unknown>,
  dateFrom: string,
  dateTo: string,
  config: WorkingConfig
): Promise<string> {
  const tz = config.timezone || TZ;
  const events = await listEvents(calendarId, serviceAccount, dateFrom, dateTo);

  // Parse busy intervals to minutes-from-midnight (local)
  const busyByDay: Record<string, Array<{ start: number; end: number }>> = {};
  for (const ev of events) {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    const key = toISOLocal(s);
    if (!busyByDay[key]) busyByDay[key] = [];
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = e.getHours() * 60 + e.getMinutes();
    busyByDay[key].push({ start: startMin, end: endMin });
  }

  const allowedDays = new Set(config.days.map((d) => DAY_MAP[d]).filter((v) => v !== undefined));
  const workStart = timeToMinutes(config.start);
  const workEnd = timeToMinutes(config.end);
  const slot = config.slotMinutes;

  let from = parseLocalDate(dateFrom);
  const to = parseLocalDate(dateTo);
  const slots: string[] = [];

  while (from <= to) {
    const dayNum = from.getDay();
    const dateKey = toISOLocal(from);
    if (allowedDays.has(dayNum)) {
      const busy = busyByDay[dateKey] || [];
      busy.sort((a, b) => a.start - b.start);

      for (let t = workStart; t + slot <= workEnd; t += slot) {
        const isBusy = busy.some((b) => t < b.end && t + slot > b.start);
        if (!isBusy) {
          const hh = String(Math.floor(t / 60)).padStart(2, '0');
          const mm = String(t % 60).padStart(2, '0');
          slots.push(`${dateKey} ${hh}:${mm}`);
        }
      }
    }
    from = addDays(from, 1);
  }

  if (slots.length === 0) return 'Não há horários disponíveis nesse período. Posso verificar outra semana?';

  // Formata em português amigável pro agente
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const formatado = slots.slice(0, 8).map((s) => {
    const [d, t] = s.split(' ');
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    return `${diasSemana[dt.getDay()]} ${day}/${m} às ${t}`;
  });
  return `Horários livres: ${formatado.join(', ')}`;
}

/** Cria agendamento no Google Calendar a partir dos args da tool */
export async function bookAppointment(
  calendarId: string,
  serviceAccount: Record<string, unknown>,
  args: {
    servico: string;
    data: string;      // "2026-04-28"
    hora: string;      // "14:00"
    nome_paciente: string;
    telefone?: string;
  },
  config?: Partial<WorkingConfig>
): Promise<{ success: true; link: string; eventId: string } | { success: false; error: string }> {
  try {
    const [h, min] = args.hora.split(':').map(Number);
    const [y, m, d] = args.data.split('-').map(Number);
    const startDate = new Date(y, m - 1, d, h, min, 0);
    const slotMinutes = config?.slotMinutes || 60;
    const endDate = new Date(startDate.getTime() + slotMinutes * 60_000);

    const tz = config?.timezone || TZ;
    const toISO = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:00`;

    const event = await createEvent(calendarId, serviceAccount, {
      summary: `${args.servico} — ${args.nome_paciente}`,
      description: `Paciente: ${args.nome_paciente}\nTel: ${args.telefone || 'N/A'}\nServiço: ${args.servico}`,
      start: { dateTime: toISO(startDate), timeZone: tz },
      end: { dateTime: toISO(endDate), timeZone: tz },
    });

    return { success: true, link: event.htmlLink, eventId: event.id };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}
