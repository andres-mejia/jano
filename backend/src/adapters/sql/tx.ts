/**
 * SQL de bajo nivel común a Data API (producción) y pg (tests). Los parámetros van
 * con nombre (`:nombre`), como los entiende Data API.
 */
export type Valor = string | number | boolean | null;
export type Parametros = Readonly<Record<string, Valor>>;

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: Parametros): Promise<T[]>;
}

/** Fija el tenant de la transacción para las políticas de RLS. Va siempre lo primero. */
export const FIJAR_TENANT = "select set_config('app.tenant_id', :tenant_id, true)";

export function esViolacionDeUnicidad(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === "23505" || (typeof message === "string" && message.includes("duplicate key value"));
}
