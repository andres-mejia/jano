const EUR = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/** 4200000 → "4,2 M€"; 850000 → "850 k€". Cifras registrales, no aritmética financiera. */
export function formatRevenue(eur: number | null): string {
  if (eur === null) return "—";
  if (eur >= 1_000_000) return `${EUR.format(eur / 1_000_000)} M€`;
  if (eur >= 1_000) return `${EUR.format(Math.round(eur / 1_000))} k€`;
  return `${EUR.format(eur)} €`;
}

const SHORT_DATE = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const TIME = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const LONG_DATE = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso)).replace(".", "");
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  const s = LONG_DATE.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export const AGENT_LABEL: Record<string, string> = {
  orchestrator: "Orquestador",
  account_finder: "Account Finder",
  contact_finder: "Contact Finder",
  outreach: "Outreach",
  response: "Response",
  guardrail: "Guardarraíl",
  human: "Tú",
};

export const INTENT_LABEL: Record<string, string> = {
  interest: "Interés",
  objection: "Objeción",
  not_now: "Ahora no",
  out_of_office: "Fuera de oficina",
  opt_out: "Baja",
  wrong_person: "No es la persona",
  other: "Otro",
};

export const STAGE_LABEL: Record<string, string> = {
  found: "Encontrado",
  enriched: "Con contacto",
  unverified: "Sin verificar",
  in_sequence: "En secuencia",
  waiting: "En espera",
  replied: "Ha respondido",
  meeting: "Reunión",
  not_now: "Ahora no",
  opted_out: "Baja",
  discarded: "Descartado",
};
