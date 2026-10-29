import { getIdToken, signOutAndRedirect } from "@/lib/auth/session";
import { getApiBaseUrl, isMockMode } from "@/lib/config/env";

import { resolverDemo } from "@jano/demo";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message?: string,
  ) {
    super(message ?? `API ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

export type Method = "GET" | "POST" | "PUT" | "DELETE";

/**
 * apiFetch: el único punto por el que la app habla con la API.
 *
 *  - Modo mock: resuelve contra los datos de `@jano/demo` (GET y acciones).
 *  - Modo cognito: inyecta el ID token; ante un 401 fuerza refresh y
 *    reintenta una vez; si vuelve a fallar, cierra sesión.
 */
export async function apiFetch<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (isMockMode()) {
    return resolverDemo<T>(method, path, body);
  }

  const base = getApiBaseUrl();
  const doRequest = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
  };

  let token = await getIdToken(false);
  if (!token) {
    await signOutAndRedirect();
    throw new ApiError(401, "Unauthorized", "Sin sesión");
  }
  let response = await doRequest(token);
  if (response.status === 401) {
    token = await getIdToken(true);
    if (!token) {
      await signOutAndRedirect();
      throw new ApiError(401, "Unauthorized", "Sesión caducada");
    }
    response = await doRequest(token);
    if (response.status === 401) {
      await signOutAndRedirect();
      throw new ApiError(401, "Unauthorized", "Sesión caducada");
    }
  }
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const problem = (await response.json()) as { detail?: string; title?: string };
      detail = problem.detail ?? problem.title;
    } catch {
      detail = undefined;
    }
    throw new ApiError(response.status, response.statusText, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
