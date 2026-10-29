/**
 * Calendario de Europe/Madrid sin dependencias: el límite diario se reinicia a las
 * 00:00 de Madrid (FR-003) y los huecos de reunión son en hora de Madrid (FR-024).
 * Usa Intl, que es parte del lenguaje; los cambios de hora caen a las 2-3 de la
 * madrugada, lejos de las horas que se calculan aquí.
 */

const ZONA = "Europe/Madrid";
const PARTES = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

export interface FechaLocal {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  /** 1 = lunes … 7 = domingo. */
  readonly diaSemana: number;
}

const DIAS: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function enMadrid(t: Date): FechaLocal {
  const p = Object.fromEntries(PARTES.formatToParts(t).map((x) => [x.type, x.value]));
  return {
    anio: Number(p["year"]),
    mes: Number(p["month"]),
    dia: Number(p["day"]),
    hora: Number(p["hour"]),
    minuto: Number(p["minute"]),
    diaSemana: DIAS[p["weekday"] ?? ""] ?? 0,
  };
}

/** Diferencia en ms entre la hora de Madrid y UTC en ese instante. */
function desfase(t: Date): number {
  const l = enMadrid(t);
  return Date.UTC(l.anio, l.mes - 1, l.dia, l.hora, l.minuto) - Math.floor(t.getTime() / 60_000) * 60_000;
}

/** El instante de una hora local de Madrid. El mes y el día pueden desbordar (32 de octubre = 1 de noviembre). */
export function instanteEnMadrid(anio: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  const comoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto);
  const aprox = new Date(comoUtc - desfase(new Date(comoUtc)));
  return new Date(comoUtc - desfase(aprox));
}

export function inicioDelDiaEnMadrid(t: Date): Date {
  const l = enMadrid(t);
  return instanteEnMadrid(l.anio, l.mes, l.dia);
}

export function siguienteMedianocheEnMadrid(t: Date): Date {
  const l = enMadrid(t);
  return instanteEnMadrid(l.anio, l.mes, l.dia + 1);
}
