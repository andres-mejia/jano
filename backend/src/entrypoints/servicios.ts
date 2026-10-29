import type { Connection } from "@jano/domain";

import { leerConfig, type Servicios } from "../application/servicios";
import { CorreoSinConfigurar } from "../adapters/correo-sin-configurar";
import { agentesDeterministas } from "../adapters/deterministas/ia";
import { relojDelSistema } from "../adapters/deterministas/reloj";
import { DeterministicCompanySource, DeterministicWebReader } from "../adapters/deterministas/web";
import { SqsColaDeCuentas } from "../adapters/sqs-cola";
import { SsmDespertador } from "../adapters/ssm-despertador";
import { ManualCompanySource } from "../adapters/web/osm";
import { crearListaBlanca } from "../domain/motor/lista-blanca";

/**
 * Servicios del motor para las Lambdas de la API y del motor. Fase A de la spec
 * 008: agentes, web y candidatas deterministas, y sin correo saliente; Bedrock,
 * OpenStreetMap y SES sustituyen a cada uno en las fases B y C sin tocar el motor.
 */

const CONEXIONES: readonly Connection[] = [
  { kind: "microsoft365", name: "Microsoft 365", detail: "Llega con la spec 005; la prueba de concepto enviará por SES", status: "not_configured", lastCheckedAt: null },
  { kind: "company_data", name: "Datos de empresas", detail: "Candidatas de prueba; OpenStreetMap llega en la fase B. Sin datos registrales", status: "not_configured", lastCheckedAt: null },
  { kind: "email_verification", name: "Verificación de email", detail: "Sin proveedor: destinatarios de la lista blanca", status: "not_configured", lastCheckedAt: null },
  { kind: "calendar", name: "Calendario", detail: "Huecos de la disponibilidad por defecto; calendario real con la spec 005", status: "not_configured", lastCheckedAt: null },
  { kind: "crm", name: "CRM o Excel", detail: "Exportación de oportunidades a Excel (CSV)", status: "connected", lastCheckedAt: null },
  { kind: "llm", name: "Modelo de IA", detail: "Agentes deterministas; Amazon Bedrock llega en la fase B", status: "not_configured", lastCheckedAt: null },
];

function requerida(env: Readonly<Record<string, string | undefined>>, nombre: string): string {
  const v = env[nombre];
  if (!v) throw new Error(`falta la variable de entorno ${nombre}`);
  return v;
}

export function serviciosDesdeEntorno(env: Readonly<Record<string, string | undefined>> = process.env): Servicios {
  return {
    agentes: agentesDeterministas(),
    correo: new CorreoSinConfigurar(),
    web: new DeterministicWebReader(relojDelSistema),
    empresas: new DeterministicCompanySource(),
    manual: new ManualCompanySource(),
    cola: new SqsColaDeCuentas(requerida(env, "CUENTAS_QUEUE_URL")),
    reloj: relojDelSistema,
    despertador: new SsmDespertador(requerida(env, "MOTOR_PARAMETER")),
    config: leerConfig(env, crearListaBlanca, CONEXIONES),
  };
}

export { requerida };
