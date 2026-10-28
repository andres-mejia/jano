/**
 * Configuración de entorno: punto único de verdad.
 *
 * Next inlinea `process.env.NEXT_PUBLIC_*` en build-time solo cuando el
 * acceso es literal, por eso RAW enumera cada variable a mano.
 *
 * Dos modos declarados, nunca deducidos:
 *   - `mock`: sin Cognito ni API; datos de ejemplo. Es el modo de desarrollo
 *     local y de CI.
 *   - `cognito`: estricto; faltar una variable crítica revienta el build
 *     (`assertEnvValido()` se llama desde next.config.ts).
 */

import { z } from "zod";

const RAW = {
  NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
  NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  NEXT_PUBLIC_COGNITO_DOMAIN: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  NEXT_PUBLIC_AWS_REGION: process.env.NEXT_PUBLIC_AWS_REGION,
} as const;

export type ModoAuth = "cognito" | "mock";
export type Entorno = "dev" | "staging" | "prod";

const RE_USER_POOL_ID = /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/;

function limpia(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

const EnvSchema = z
  .object({
    authMode: z.enum(["cognito", "mock"]).default("mock"),
    entorno: z.enum(["dev", "staging", "prod"]).default("dev"),
    apiBaseUrl: z.string().url().optional(),
    cognito: z.object({
      userPoolId: z.string().regex(RE_USER_POOL_ID).optional(),
      clientId: z.string().min(1).optional(),
      domain: z.string().min(1).optional(),
      region: z.string().default("eu-west-1"),
    }),
  })
  .superRefine((env, ctx) => {
    if (env.authMode !== "cognito") return;
    const faltan: string[] = [];
    if (!env.cognito.userPoolId) faltan.push("NEXT_PUBLIC_COGNITO_USER_POOL_ID");
    if (!env.cognito.clientId) faltan.push("NEXT_PUBLIC_COGNITO_CLIENT_ID");
    if (!env.apiBaseUrl) faltan.push("NEXT_PUBLIC_API_BASE_URL");
    if (faltan.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `NEXT_PUBLIC_AUTH_MODE=cognito exige: ${faltan.join(", ")}`,
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function parsearEnv(): Env {
  const resultado = EnvSchema.safeParse({
    authMode: limpia(RAW.NEXT_PUBLIC_AUTH_MODE),
    entorno: limpia(RAW.NEXT_PUBLIC_ENVIRONMENT),
    apiBaseUrl: limpia(RAW.NEXT_PUBLIC_API_BASE_URL),
    cognito: {
      userPoolId: limpia(RAW.NEXT_PUBLIC_COGNITO_USER_POOL_ID),
      clientId: limpia(RAW.NEXT_PUBLIC_COGNITO_CLIENT_ID),
      domain: limpia(RAW.NEXT_PUBLIC_COGNITO_DOMAIN),
      region: limpia(RAW.NEXT_PUBLIC_AWS_REGION),
    },
  });
  if (!resultado.success) {
    const detalle = resultado.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }
  return resultado.data;
}

export const ENV: Env = parsearEnv();

export function isMockMode(): boolean {
  return ENV.authMode === "mock";
}

/** Llamado desde next.config.ts: evaluar el módulo ya valida. */
export function assertEnvValido(): void {
  if (ENV.authMode === "cognito" && !ENV.apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL es obligatoria en modo cognito");
  }
}

export function getApiBaseUrl(): string {
  return ENV.apiBaseUrl ?? "http://localhost:8080/v1";
}
