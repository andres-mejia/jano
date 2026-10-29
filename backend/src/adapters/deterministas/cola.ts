import type { ColaDeCuentas, MensajeCuentas } from "../../ports/cola";

/**
 * Cola en memoria (tests y local): guarda los mensajes y los entrega cuando se le
 * pide, como haría SQS con el trabajador. `vaciar` sigue hasta que no queda nada,
 * así que una búsqueda por región y las cuentas que encola se procesan juntas.
 */
export class ColaEnMemoria implements ColaDeCuentas {
  readonly pendientes: MensajeCuentas[] = [];
  readonly entregados: MensajeCuentas[] = [];

  async encolar(mensajes: readonly MensajeCuentas[]): Promise<void> {
    this.pendientes.push(...mensajes);
  }

  async vaciar(procesar: (m: MensajeCuentas) => Promise<void>): Promise<number> {
    let n = 0;
    for (let m = this.pendientes.shift(); m; m = this.pendientes.shift()) {
      this.entregados.push(m);
      await procesar(m);
      n++;
    }
    return n;
  }
}
