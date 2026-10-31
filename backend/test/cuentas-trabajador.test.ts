import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { RelojFijo } from "../src/adapters/deterministas/reloj";
import { DeterministicCompanySource } from "../src/adapters/deterministas/web";
import { procesarMensaje } from "../src/application/analizar-cuentas";
import { IaNoDisponible } from "../src/domain/errores";
import type { MensajeCuentas } from "../src/ports/cola";
import type { AccountScorer } from "../src/ports/ia";
import type { CompanySource } from "../src/ports/web";
import { type BaseDePruebas, baseDePruebas } from "./pg";
import { A, sembrarTenant } from "./semilla";
import { serviciosDePrueba } from "./servicios-prueba";

/**
 * El trabajador de cuentas contra Postgres (spec 008 US2): idempotente ante una
 * entrega doble de SQS, caché de 24 h por región y, si la IA no puede puntuar, la
 * cuenta queda a la vista con el motivo en lugar de perderse.
 */
let base: BaseDePruebas;
let campana = "";
const reloj = new RelojFijo(new Date("2026-10-29T09:00:00.000Z"));
const JOB = "33333333-3333-4333-8333-333333333333";

before(async () => {
  base = await baseDePruebas();
  await sembrarTenant(base.admin, A);
  campana = await base.db.enTenant(A.id, (uow) =>
    uow.campanas.crear({ name: "Agencias", prompt: "Agencias de viajes en Valencia", icp: icp(), meetingsGoal: 5 }),
  );
});
after(() => base.cerrar());

function icp() {
  return { sector: "Agencias de viajes", cnae: ["7911"], country: "ES" as const, regions: ["Comunitat Valenciana"], revenueMinEur: null, revenueMaxEur: null, employeesMin: null, signals: [], exclusions: [] };
}

const cuenta = (dominio: string): MensajeCuentas => ({
  tipo: "cuenta",
  tenantId: A.id,
  campaignId: campana,
  jobId: JOB,
  empresa: { nombre: `Agencia ${dominio}`, dominio, ciudad: "Valencia", origen: "osm:node/1" },
});

const cuentas = () => base.db.enTenant(A.id, (uow) => uow.cuentas.listar(campana, { status: null, limite: 200 }));

test("la misma candidata entregada dos veces (incluso a la vez) se analiza y se guarda una sola vez", async () => {
  const { servicios } = serviciosDePrueba({ reloj });
  const [r1, r2] = await Promise.all([procesarMensaje(base.db, servicios, cuenta("doble.example")), procesarMensaje(base.db, servicios, cuenta("doble.example"))]);
  assert.deepEqual([r1, r2].map((r) => (r.tipo === "cuenta" ? r.resultado : null)).sort(), ["found", "repetida"]);
  assert.deepEqual(await procesarMensaje(base.db, servicios, cuenta("doble.example")), { tipo: "cuenta", resultado: "repetida" });
  assert.equal((await cuentas()).filter((a) => a.domain === "doble.example").length, 1);
});

test("una región se busca una vez al día: la caché de 24 h evita volver a OpenStreetMap", async () => {
  let consultas = 0;
  const fuente = new DeterministicCompanySource();
  const empresas: CompanySource = {
    atribucion: "ODbL",
    admite: () => true,
    buscar: async (r, l) => {
      consultas++;
      return fuente.buscar(r, l);
    },
  };
  const { servicios, cola } = serviciosDePrueba({ reloj });
  const s = { ...servicios, empresas };
  const region: MensajeCuentas = { tipo: "region", tenantId: A.id, campaignId: campana, jobId: JOB, region: "Castellón" };

  const r = await procesarMensaje(base.db, s, region);
  assert.equal(consultas, 1);
  assert.ok(r.tipo === "region" && !r.deCache && r.encoladas >= 30);
  assert.ok(cola.pendientes.every((m) => m.tipo === "cuenta" && m.jobId === JOB));
  cola.pendientes.length = 0;

  reloj.avanzar(23 * 60);
  assert.deepEqual({ ...(await procesarMensaje(base.db, s, region)), encoladas: 0 }, { tipo: "region", encoladas: 0, deCache: true });
  assert.equal(consultas, 1);
  reloj.avanzar(2 * 60);
  await procesarMensaje(base.db, s, region);
  assert.equal(consultas, 2);
});

test("tope diario o salida inválida: la cuenta queda descartada con el motivo; un fallo de Bedrock se reintenta", async () => {
  const falla = (e: Error): AccountScorer => ({ puntuar: async () => Promise.reject(e) });
  const tope = serviciosDePrueba({ reloj, agentes: { cuentas: falla(new IaNoDisponible("tope_diario", "tope")) } }).servicios;
  assert.deepEqual(await procesarMensaje(base.db, tope, cuenta("tope.example")), { tipo: "cuenta", resultado: "discarded" });
  const invalida = serviciosDePrueba({ reloj, agentes: { cuentas: falla(new IaNoDisponible("salida_invalida", "json")) } }).servicios;
  await procesarMensaje(base.db, invalida, cuenta("invalida.example"));
  const todas = await cuentas();
  assert.match(todas.find((a) => a.domain === "tope.example")?.fitReasoning ?? "", /^Sin puntuar: tope diario de llamadas a la IA/);
  assert.match(todas.find((a) => a.domain === "invalida.example")?.fitReasoning ?? "", /^Sin puntuar: la IA no devolvió una puntuación válida/);

  const caida = serviciosDePrueba({ reloj, agentes: { cuentas: falla(new IaNoDisponible("error", "ThrottlingException")) } }).servicios;
  await assert.rejects(procesarMensaje(base.db, caida, cuenta("bedrock-fallido.example")), /ThrottlingException/);
  assert.equal((await cuentas()).some((a) => a.domain === "bedrock-fallido.example"), false);
});

test("una campaña que ya no existe (u otro tenant) no deja nada", async () => {
  const { servicios } = serviciosDePrueba({ reloj });
  const otra = { ...cuenta("huerfana.example"), campaignId: "44444444-4444-4444-8444-444444444444" };
  assert.deepEqual(await procesarMensaje(base.db, servicios, otra), { tipo: "cuenta", resultado: "sin_campana" });
  assert.deepEqual(await procesarMensaje(base.db, servicios, { ...cuenta("ajena.example"), tenantId: "tenant-otra" }), { tipo: "cuenta", resultado: "sin_campana" });
});
