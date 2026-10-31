import { z } from "zod";

import { IaNoDisponible } from "../domain/errores";
import type { MensajeCuentas } from "../ports/cola";
import type { Db } from "../ports/db";
import type { NuevaCuenta } from "../ports/repositorios";
import { conTenant } from "./contexto-tenant";
import { MAX_CANDIDATAS } from "./cuentas";
import type { Servicios } from "./servicios";

/**
 * El trabajador de cuentas (spec 008 US2, Account Finder en segundo plano). Cada
 * mensaje es una búsqueda por región o una candidata:
 *
 *   - Región: candidatas de la fuente (OpenStreetMap), con caché de 24 h por tenant
 *     y región en `candidate_cache`; encola una por candidata que no esté ya en la
 *     campaña, como mucho 50.
 *   - Candidata: lee su web y la puntúa. Una web que no se puede leer queda
 *     `discarded` con el motivo, sin fit inventado.
 *
 * Idempotente: SQS puede entregar dos veces, y una cuenta que ya está en la campaña
 * (por dominio) no se vuelve a leer ni a insertar. La web y el modelo van fuera de
 * transacción: Aurora no queda bloqueada mientras se lee una web lenta.
 */

export const CACHE_CANDIDATAS_MS = 24 * 3_600_000;
/** Candidatas que se guardan por región: más de las 50 de una búsqueda, para la siguiente. */
export const MAX_REGION = 200;

const texto = z.string().trim().min(1);
export const MensajeCuentasSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("region"), tenantId: texto, campaignId: z.string().uuid(), jobId: z.string().uuid(), region: texto.max(80) }),
  z.object({
    tipo: z.literal("cuenta"),
    tenantId: texto,
    campaignId: z.string().uuid(),
    jobId: z.string().uuid(),
    empresa: z.object({ nombre: texto.max(200), dominio: texto.max(253), ciudad: z.string().nullable(), origen: texto.max(100) }),
  }),
]);

export type ResultadoMensaje =
  | { readonly tipo: "region"; readonly encoladas: number; readonly deCache: boolean }
  | { readonly tipo: "cuenta"; readonly resultado: "found" | "discarded" | "repetida" | "sin_campana" };

export function procesarMensaje(db: Db, s: Servicios, m: MensajeCuentas): Promise<ResultadoMensaje> {
  return conTenant(m.tenantId, () => (m.tipo === "region" ? buscarEnRegion(db, s, m) : analizarCuenta(db, s, m)));
}

const claveDeRegion = (region: string) => `region:${region.trim().toLowerCase()}`;

async function buscarEnRegion(db: Db, s: Servicios, m: Extract<MensajeCuentas, { tipo: "region" }>): Promise<ResultadoMensaje> {
  const clave = claveDeRegion(m.region);
  const desde = new Date(s.reloj.ahora().getTime() - CACHE_CANDIDATAS_MS);
  const previa = await db.enTenant(m.tenantId, async (uow) =>
    (await uow.campanas.obtener(m.campaignId))
      ? { cache: await uow.cuentas.candidatasEnCache(clave, desde), ya: await uow.cuentas.dominios(m.campaignId) }
      : null,
  );
  if (!previa) return { tipo: "region", encoladas: 0, deCache: false };

  let empresas = previa.cache;
  if (!empresas) {
    empresas = await s.empresas.buscar(m.region, MAX_REGION);
    const guardar = empresas;
    await db.enTenant(m.tenantId, (uow) => uow.cuentas.guardarCandidatas(clave, guardar, s.reloj.ahora()));
  }
  const nuevas = empresas.filter((e) => !previa.ya.has(e.dominio)).slice(0, MAX_CANDIDATAS);
  const { tenantId, campaignId, jobId } = m;
  await s.cola.encolar(nuevas.map((empresa) => ({ tipo: "cuenta" as const, tenantId, campaignId, jobId, empresa })));
  return { tipo: "region", encoladas: nuevas.length, deCache: !!previa.cache };
}

async function analizarCuenta(db: Db, s: Servicios, m: Extract<MensajeCuentas, { tipo: "cuenta" }>): Promise<ResultadoMensaje> {
  const { empresa } = m;
  const previa = await db.enTenant(m.tenantId, async (uow) => {
    const campana = await uow.campanas.obtener(m.campaignId);
    return campana ? { icp: campana.icp, repetida: (await uow.cuentas.dominios(m.campaignId)).has(empresa.dominio) } : null;
  });
  if (!previa) return { tipo: "cuenta", resultado: "sin_campana" };
  if (previa.repetida) return { tipo: "cuenta", resultado: "repetida" };

  const base = { campaignId: m.campaignId, name: empresa.nombre, domain: empresa.dominio, city: empresa.ciudad, source: empresa.origen };
  const descartada = (motivo: string): NuevaCuenta => ({
    ...base,
    fitScore: 0,
    fitReasoning: `Sin puntuar: ${motivo}`,
    fitEvidence: [],
    trigger: null,
    status: "discarded",
    discardReason: motivo,
  });

  let nueva: NuevaCuenta;
  const lectura = await s.web.leer(empresa.dominio);
  if (!lectura.ok) {
    nueva = descartada(lectura.motivo);
  } else {
    try {
      const p = await s.agentes.cuentas.puntuar({ icp: previa.icp, empresa, paginas: lectura.paginas });
      nueva = { ...base, fitScore: p.fitScore, fitReasoning: p.razonamiento, fitEvidence: p.evidencia, trigger: p.senal, status: "found", discardReason: null };
    } catch (e) {
      // Tope o salida inválida tras el reintento: la cuenta queda a la vista con el
      // motivo, para que una persona decida. Un fallo de Bedrock se reintenta (SQS).
      if (!(e instanceof IaNoDisponible) || e.motivo === "error") throw e;
      nueva = descartada(e.motivo === "tope_diario" ? "tope diario de llamadas a la IA alcanzado; revísala tú." : "la IA no devolvió una puntuación válida; revísala tú.");
    }
  }
  const cuenta = await db.enTenant(m.tenantId, (uow) => uow.cuentas.insertar(nueva));
  return { tipo: "cuenta", resultado: cuenta ? (cuenta.status === "discarded" ? "discarded" : "found") : "repetida" };
}
