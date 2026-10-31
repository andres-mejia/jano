import type { Connection } from "@jano/domain";

import { tenantEnCurso } from "../application/contexto-tenant";
import { leerConfig, type Servicios } from "../application/servicios";
import { agentesBedrock } from "../adapters/bedrock/agentes";
import { BedrockConversador, ClienteModelo, MODELO_POR_DEFECTO, PRECIO_POR_DEFECTO, type Precio } from "../adapters/bedrock/modelo";
import { TopeEnPostgres } from "../adapters/bedrock/tope-postgres";
import { CorreoSinConfigurar } from "../adapters/correo-sin-configurar";
import { agentesDeterministas } from "../adapters/deterministas/ia";
import { relojDelSistema } from "../adapters/deterministas/reloj";
import { DeterministicCompanySource, DeterministicWebReader } from "../adapters/deterministas/web";
import { SqsColaDeCuentas } from "../adapters/sqs-cola";
import { SsmDespertador } from "../adapters/ssm-despertador";
import { LectorWeb } from "../adapters/web/lector";
import { ManualCompanySource, OsmCompanySource } from "../adapters/web/osm";
import { crearListaBlanca } from "../domain/motor/lista-blanca";
import type { Db } from "../ports/db";

/**
 * Servicios del motor para las Lambdas de la API, del motor y de cuentas.
 * `AGENTES` elige los agentes y sus fuentes (spec 008 fase B):
 *
 *   - `deterministas` (por defecto; tests, CI y entornos sin Bedrock): reglas de
 *     palabras clave, webs y candidatas inventadas en dominios `.example`.
 *   - `bedrock` (dev): Converse API con `BEDROCK_MODEL_ID`, webs reales con el
 *     LectorWeb y candidatas de OpenStreetMap; tope diario `IA_TOPE_DIARIO` (500).
 *
 * El correo sigue sin proveedor hasta la fase C (SES).
 */

type Modo = "deterministas" | "bedrock";

function conexiones(modo: Modo, modelo: string): Connection[] {
  const real = modo === "bedrock";
  return [
    { kind: "microsoft365", name: "Microsoft 365", detail: "Llega con la spec 005; la prueba de concepto enviará por SES", status: "not_configured", lastCheckedAt: null },
    real
      ? { kind: "company_data", name: "Datos de empresas", detail: "OpenStreetMap (ODbL) y webs públicas. Sin datos registrales", status: "connected", lastCheckedAt: null }
      : { kind: "company_data", name: "Datos de empresas", detail: "Candidatas de prueba. Sin datos registrales", status: "not_configured", lastCheckedAt: null },
    { kind: "email_verification", name: "Verificación de email", detail: "Sin proveedor: destinatarios de la lista blanca", status: "not_configured", lastCheckedAt: null },
    { kind: "calendar", name: "Calendario", detail: "Huecos de la disponibilidad por defecto; calendario real con la spec 005", status: "not_configured", lastCheckedAt: null },
    { kind: "crm", name: "CRM o Excel", detail: "Exportación de oportunidades a Excel (CSV)", status: "connected", lastCheckedAt: null },
    real
      ? { kind: "llm", name: "Modelo de IA", detail: `Amazon Bedrock (${modelo}) en la UE`, status: "connected", lastCheckedAt: null }
      : { kind: "llm", name: "Modelo de IA", detail: "Agentes deterministas, sin modelo", status: "not_configured", lastCheckedAt: null },
  ];
}

function requerida(env: Readonly<Record<string, string | undefined>>, nombre: string): string {
  const v = env[nombre];
  if (!v) throw new Error(`falta la variable de entorno ${nombre}`);
  return v;
}

function numero(env: Readonly<Record<string, string | undefined>>, nombre: string, porDefecto: number): number {
  const v = Number(env[nombre] ?? porDefecto);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${nombre} debe ser un número positivo`);
  return v;
}

export function modoAgentes(env: Readonly<Record<string, string | undefined>>): Modo {
  const modo = env["AGENTES"] ?? "deterministas";
  if (modo !== "deterministas" && modo !== "bedrock") throw new Error("AGENTES debe ser «bedrock» o «deterministas»");
  return modo;
}

/** El cliente del modelo con el tope en Postgres y el tenant de la operación en curso. */
export function clienteModelo(env: Readonly<Record<string, string | undefined>>, db: Db): ClienteModelo {
  const precio: Precio = {
    entrada: numero(env, "BEDROCK_PRECIO_ENTRADA_USD_MTOK", PRECIO_POR_DEFECTO.entrada),
    salida: numero(env, "BEDROCK_PRECIO_SALIDA_USD_MTOK", PRECIO_POR_DEFECTO.salida),
  };
  return new ClienteModelo({
    conversador: new BedrockConversador(env["BEDROCK_MODEL_ID"] || MODELO_POR_DEFECTO),
    tope: new TopeEnPostgres(db),
    tenant: tenantEnCurso,
    reloj: relojDelSistema,
    precio,
    topeDiario: Math.floor(numero(env, "IA_TOPE_DIARIO", 500)),
  });
}

export function serviciosDesdeEntorno(env: Readonly<Record<string, string | undefined>>, db: Db): Servicios {
  const modo = modoAgentes(env);
  const comunes = {
    correo: new CorreoSinConfigurar(),
    manual: new ManualCompanySource(),
    cola: new SqsColaDeCuentas(requerida(env, "CUENTAS_QUEUE_URL")),
    reloj: relojDelSistema,
    despertador: new SsmDespertador(requerida(env, "MOTOR_PARAMETER")),
  };
  if (modo === "bedrock") {
    const modelo = clienteModelo(env, db);
    const agentes = agentesBedrock(modelo);
    return {
      ...comunes,
      agentes,
      web: new LectorWeb({ reloj: relojDelSistema, enlaces: agentes.enlaces }),
      empresas: new OsmCompanySource(),
      config: leerConfig(env, crearListaBlanca, conexiones(modo, modelo.modelo)),
    };
  }
  return {
    ...comunes,
    agentes: agentesDeterministas(),
    web: new DeterministicWebReader(relojDelSistema),
    empresas: new DeterministicCompanySource(),
    config: leerConfig(env, crearListaBlanca, conexiones(modo, "")),
  };
}

export { requerida };
