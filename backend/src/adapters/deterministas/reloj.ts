import type { Despertador, EstadoDespertador } from "../../ports/despertador";
import type { Reloj } from "../../ports/reloj";

export const relojDelSistema: Reloj = { ahora: () => new Date() };

/** Reloj que solo avanza cuando se le pide. */
export class RelojFijo implements Reloj {
  constructor(private instante: Date) {}

  ahora(): Date {
    return new Date(this.instante);
  }

  avanzar(minutos: number): void {
    this.instante = new Date(this.instante.getTime() + minutos * 60_000);
  }
}

/** Despertador en memoria (tests y local): misma semántica que el de SSM. */
export class DespertadorEnMemoria implements Despertador {
  estado: EstadoDespertador | null = null;

  async leer() {
    return this.estado;
  }

  async fijar(estado: EstadoDespertador) {
    this.estado = estado;
  }

  async adelantar(cuando: Date) {
    const proximo = this.estado?.proximo;
    if (!this.estado || !proximo || cuando < proximo) {
      this.estado = { proximo: cuando, revisadoEn: this.estado?.revisadoEn ?? new Date(0) };
    }
  }
}
