import { AsyncLocalStorage } from "node:async_hooks";

/**
 * El tenant de la operación en curso, para lo que no recibe la unidad de trabajo
 * pero tiene que saber a quién cargarlo: el tope diario y el registro de coste de
 * las llamadas al modelo (spec 008 FR-016). Lo fijan los puntos de entrada (la API
 * con el claim del JWT, el motor por tenant, el trabajador de cuentas con su
 * mensaje); fuera de ellos no hay tenant y una llamada al modelo falla.
 */
const actual = new AsyncLocalStorage<string>();

export function conTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return actual.run(tenantId, fn);
}

export function tenantEnCurso(): string | null {
  return actual.getStore() ?? null;
}
