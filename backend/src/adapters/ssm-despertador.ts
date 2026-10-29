import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import type { Despertador, EstadoDespertador } from "../ports/despertador";

/**
 * El contador barato de ADR-003 en un parámetro estándar de SSM (gratis, fuera de
 * Aurora). Lo crea Terraform con `{}` y no vuelve a tocar su valor. Contenido:
 * `{"proximo": ISO | null, "revisadoEn": ISO}`. Un valor ilegible cuenta como «no
 * revisado» y el motor consulta la base de datos: equivocarse hacia ahí es seguro.
 */
export class SsmDespertador implements Despertador {
  constructor(
    private readonly nombre: string,
    private readonly cliente = new SSMClient({}),
  ) {}

  async leer(): Promise<EstadoDespertador | null> {
    const out = await this.cliente.send(new GetParameterCommand({ Name: this.nombre }));
    try {
      const v = JSON.parse(out.Parameter?.Value ?? "{}") as { proximo?: unknown; revisadoEn?: unknown };
      if (typeof v.revisadoEn !== "string") return null;
      const revisadoEn = new Date(v.revisadoEn);
      const proximo = typeof v.proximo === "string" ? new Date(v.proximo) : null;
      if (Number.isNaN(revisadoEn.getTime()) || (proximo && Number.isNaN(proximo.getTime()))) return null;
      return { proximo, revisadoEn };
    } catch {
      return null;
    }
  }

  async fijar(estado: EstadoDespertador): Promise<void> {
    await this.escribir({ proximo: estado.proximo?.toISOString() ?? null, revisadoEn: estado.revisadoEn.toISOString() });
  }

  async adelantar(cuando: Date): Promise<void> {
    const actual = await this.leer();
    if (actual?.proximo && actual.proximo <= cuando) return;
    // Sin revisión previa se deja «revisadoEn» en el pasado: el motor mirará la base de datos.
    await this.escribir({ proximo: cuando.toISOString(), revisadoEn: (actual?.revisadoEn ?? new Date(0)).toISOString() });
  }

  private async escribir(valor: { proximo: string | null; revisadoEn: string }): Promise<void> {
    await this.cliente.send(new PutParameterCommand({ Name: this.nombre, Value: JSON.stringify(valor), Type: "String", Overwrite: true }));
  }
}
