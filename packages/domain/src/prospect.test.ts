import assert from "node:assert/strict";
import { test } from "node:test";

import { CandidateRequestSchema, fitLevelFromScore } from "./account";
import { DEFAULT_GUARDRAILS, GuardrailsSchema } from "./compliance";
import { PROSPECT_TRANSITIONS, ProspectStageSchema, canTransition } from "./prospect";

test("la máquina de estados cubre todas las etapas", () => {
  for (const stage of ProspectStageSchema.options) {
    assert.ok(stage in PROSPECT_TRANSITIONS, `falta ${stage} en PROSPECT_TRANSITIONS`);
  }
});

test("una reunión, una baja y un descarte son terminales", () => {
  assert.deepEqual(PROSPECT_TRANSITIONS.meeting, []);
  assert.deepEqual(PROSPECT_TRANSITIONS.opted_out, []);
  assert.deepEqual(PROSPECT_TRANSITIONS.discarded, []);
});

test("una respuesta detiene la secuencia: de replied no se vuelve a waiting", () => {
  assert.equal(canTransition("replied", "waiting"), false);
  assert.equal(canTransition("in_sequence", "replied"), true);
  assert.equal(canTransition("replied", "meeting"), true);
});

test("un contacto sin verificar no entra en secuencia", () => {
  assert.equal(canTransition("unverified", "in_sequence"), false);
  assert.equal(canTransition("unverified", "enriched"), true);
});

test("el fit se clasifica en tres niveles con umbrales cerrados", () => {
  assert.equal(fitLevelFromScore(92), "alto");
  assert.equal(fitLevelFromScore(75), "alto");
  assert.equal(fitLevelFromScore(74), "medio");
  assert.equal(fitLevelFromScore(50), "medio");
  assert.equal(fitLevelFromScore(49), "bajo");
});

test("una baja es inmediata también desde «ahora no»", () => {
  assert.equal(canTransition("not_now", "opted_out"), true);
});

test("candidatas: una región o de 1 a 25 dominios, normalizados", () => {
  assert.deepEqual(CandidateRequestSchema.parse({ region: "Comunitat Valenciana" }), { region: "Comunitat Valenciana" });
  assert.deepEqual(CandidateRequestSchema.parse({ domains: ["https://www.Viajes-Faro.example/quienes", "brisa.example"] }), {
    domains: ["viajes-faro.example", "brisa.example"],
  });
  assert.equal(CandidateRequestSchema.safeParse({ domains: [] }).success, false);
  assert.equal(CandidateRequestSchema.safeParse({ domains: Array.from({ length: 26 }, (_, i) => `a${i}.example`) }).success, false);
  assert.equal(CandidateRequestSchema.safeParse({ domains: ["no es un dominio"] }).success, false);
  assert.equal(CandidateRequestSchema.safeParse({ region: "Murcia", domains: ["a.example"] }).success, false);
});

test("los guardarraíles por defecto son los conservadores y validan", () => {
  const parsed = GuardrailsSchema.parse(DEFAULT_GUARDRAILS);
  assert.equal(parsed.autopilot, false);
  assert.equal(parsed.whatsappOnlyAfterReply, true);
  assert.equal(parsed.requireVerifiedEmail, true);
  assert.equal(parsed.stopSequenceOnReply, true);
});
