import type { MeetingSlot } from "@jano/domain";

import { enMadrid, instanteEnMadrid } from "./tiempo";

/**
 * Huecos de reunión (spec 008 FR-024) de la disponibilidad por defecto del tenant:
 * laborables de 9 a 14 y de 16 a 18 en Madrid, de 30 minutos, a partir de 48 h.
 * Sin calendario real hasta la spec 005. Propone dos: el primero libre y el
 * primero del siguiente día laborable, para dar opción.
 */

const FRANJAS: readonly (readonly [desde: number, hasta: number])[] = [
  [9, 14],
  [16, 18],
];
const DURACION_MIN = 30;

export function proponerHuecos(ahora: Date, cuantos = 2): MeetingSlot[] {
  const desde = ahora.getTime() + 48 * 3_600_000;
  const hoy = enMadrid(ahora);
  const huecos: MeetingSlot[] = [];
  let ultimoDia = -1;
  for (let d = 0; d < 21 && huecos.length < cuantos; d++) {
    const dia = enMadrid(instanteEnMadrid(hoy.anio, hoy.mes, hoy.dia + d, 12));
    if (dia.diaSemana > 5 || dia.dia === ultimoDia) continue;
    buscar: for (const [h0, h1] of FRANJAS) {
      for (let m = h0 * 60; m + DURACION_MIN <= h1 * 60; m += DURACION_MIN) {
        const inicio = instanteEnMadrid(dia.anio, dia.mes, dia.dia, Math.floor(m / 60), m % 60);
        if (inicio.getTime() < desde) continue;
        huecos.push({ start: inicio.toISOString(), end: new Date(inicio.getTime() + DURACION_MIN * 60_000).toISOString(), held: false });
        ultimoDia = dia.dia;
        break buscar;
      }
    }
  }
  return huecos;
}
