import type { Connection } from "@jano/domain";

import type { ListaBlanca } from "../domain/motor/lista-blanca";
import type { ColaDeCuentas } from "../ports/cola";
import type { MailSender } from "../ports/correo";
import type { Despertador } from "../ports/despertador";
import type { Agentes } from "../ports/ia";
import type { Reloj } from "../ports/reloj";
import type { CompanySource, FuenteManual, WebReader } from "../ports/web";

/** Lo que el motor necesita además de la base de datos. Lo montan los entrypoints. */
export interface Servicios {
  readonly agentes: Agentes;
  readonly correo: MailSender;
  readonly web: WebReader;
  readonly empresas: CompanySource;
  readonly manual: FuenteManual;
  /** Análisis de cuentas en segundo plano (trabajador `jano-<env>-cuentas`). */
  readonly cola: ColaDeCuentas;
  readonly reloj: Reloj;
  readonly despertador: Despertador;
  readonly config: ConfigMotor;
}

export interface ConfigMotor {
  /** `MAIL_ALLOWLIST`; `null` solo en producción (FR-021). */
  readonly listaBlanca: ListaBlanca | null;
  /** `DEMO_DAY_MINUTES` (1440 por defecto). */
  readonly minutosPorDia: number;
  /** Proveedores conectados, para `GET /connections`. */
  readonly conexiones: readonly Connection[];
}

/** Variables de entorno del motor, comunes a la API y a la Lambda del motor. */
export function leerConfig(
  env: Readonly<Record<string, string | undefined>>,
  crearLista: (texto: string) => ListaBlanca,
  conexiones: readonly Connection[],
): ConfigMotor {
  const produccion = env["JANO_ENV"] === "prod";
  const lista = crearLista(env["MAIL_ALLOWLIST"] ?? "");
  // Fuera de producción la lista blanca es obligatoria: vacía significa que no sale nada.
  const minutos = Number(env["DEMO_DAY_MINUTES"] ?? "1440");
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) throw new Error("DEMO_DAY_MINUTES debe ser un entero entre 1 y 1440");
  return { listaBlanca: produccion ? null : lista, minutosPorDia: minutos, conexiones };
}
