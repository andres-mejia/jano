import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

import type { Ejecutor } from "./migraciones";

/**
 * Configuración de los scripts operativos: salidas de Terraform del entorno
 * (`infra/environments/<env>`, ya inicializado). Credenciales del perfil SSO en
 * local (`AWS_PROFILE=fintrack-dev`) o de OIDC en CI.
 */
export interface Entorno {
  readonly clusterArn: string;
  readonly masterSecretArn: string;
  readonly apiSecretArn: string;
  readonly database: string;
  readonly userPoolId: string;
}

export function entorno(env = process.env["JANO_ENV"] ?? "dev"): Entorno {
  process.env["AWS_REGION"] ??= "eu-west-1";
  const dir = new URL(`../../../infra/environments/${env}`, import.meta.url).pathname;
  const salidas = JSON.parse(execFileSync("terraform", [`-chdir=${dir}`, "output", "-json"], { encoding: "utf8" })) as Record<
    string,
    { value: unknown }
  >;
  const s = (k: string): string => {
    const v = salidas[k]?.value;
    if (typeof v !== "string" || !v) throw new Error(`falta la salida de Terraform ${k}`);
    return v;
  };
  return {
    clusterArn: s("aurora_cluster_arn"),
    masterSecretArn: s("aurora_secret_arn"),
    apiSecretArn: s("aurora_api_secret_arn"),
    database: s("aurora_database_name"),
    userPoolId: s("cognito_user_pool_id"),
  };
}

/** Ejecutor de migraciones por Data API con el usuario maestro, una transacción por migración. */
export function ejecutorDataApi(e: Entorno, cliente = new RDSDataClient({})): Ejecutor {
  const base = { resourceArn: e.clusterArn, secretArn: e.masterSecretArn };
  return {
    async transaccion(fn) {
      const { transactionId } = await reintentar(() => cliente.send(new BeginTransactionCommand({ ...base, database: e.database })));
      try {
        await fn(async (sql) => {
          const out = await cliente.send(
            new ExecuteStatementCommand({ ...base, database: e.database, transactionId, sql, formatRecordsAs: "JSON" }),
          );
          return out.formattedRecords ? (JSON.parse(out.formattedRecords) as Record<string, unknown>[]) : [];
        });
        await cliente.send(new CommitTransactionCommand({ ...base, transactionId }));
      } catch (err) {
        await cliente.send(new RollbackTransactionCommand({ ...base, transactionId })).catch(() => {});
        throw err;
      }
    },
  };
}

/** Aurora en pausa tarda 15-30 s en despertar: los scripts pueden esperar. */
async function reintentar<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err as { name?: string }).name !== "DatabaseResumingException" || i >= 12) throw err;
      console.error("Aurora está despertando; reintento en 5 s…");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function argumentos<const T extends Record<string, { type: "string" | "boolean" }>>(opciones: T) {
  return parseArgs({ options: opciones, strict: true, allowPositionals: false }).values;
}

export function obligatorio(v: string | boolean | undefined, nombre: string): string {
  if (typeof v !== "string" || !v) {
    console.error(`falta --${nombre}`);
    process.exit(2);
  }
  return v;
}
