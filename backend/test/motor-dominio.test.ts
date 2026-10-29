import assert from "node:assert/strict";
import { test } from "node:test";

import { PROSPECT_TRANSITIONS, ProspectStageSchema } from "@jano/domain";

import { proponerHuecos } from "../src/domain/motor/huecos";
import { crearListaBlanca } from "../src/domain/motor/lista-blanca";
import { escalar, menuDeAcciones, validarPropuesta } from "../src/domain/motor/orquestador";
import { type EntradaReglas, evaluarReglas, REGLA } from "../src/domain/motor/reglas";
import {
  aplicarCambioDeRama,
  type PasoExistente,
  pasoDeCambioDeRama,
  pendientes,
  PLANTILLAS,
  planificarSecuencia,
  siguientePaso,
} from "../src/domain/motor/secuencias";
import { enMadrid, inicioDelDiaEnMadrid, siguienteMedianocheEnMadrid } from "../src/domain/motor/tiempo";
import { comprobarTransicion } from "../src/domain/motor/transiciones";

/** Dominio del motor (spec 008 T013): puro, sin base de datos ni mocks. */

test("transiciones: las 100 parejas de etapas, permitidas exactamente las de PROSPECT_TRANSITIONS", () => {
  const etapas = ProspectStageSchema.options;
  let permitidas = 0;
  for (const desde of etapas) {
    for (const hacia of etapas) {
      const t = comprobarTransicion(desde, hacia);
      const esperada = PROSPECT_TRANSITIONS[desde].includes(hacia);
      assert.equal(t.ok, esperada, `${desde} → ${hacia}`);
      if (!t.ok) assert.match(t.motivo, /^No se puede pasar de «.+» a «.+»\.$/);
      if (t.ok) permitidas++;
    }
  }
  assert.equal(etapas.length ** 2, 100);
  assert.equal(permitidas, Object.values(PROSPECT_TRANSITIONS).flat().length);
});

const lista = crearListaBlanca("persona.prueba@gmail.example, otra@correo.example");

test("lista blanca: dirección exacta, alias con + y nada más", () => {
  assert.ok(lista.admite("persona.prueba@gmail.example"));
  assert.ok(lista.admite("Persona.Prueba+albufera@Gmail.example"));
  assert.ok(lista.admite("otra+x@correo.example"));
  assert.equal(lista.admite("persona.prueba@otro.example"), false);
  assert.equal(lista.admite("personaprueba@gmail.example"), false);
  assert.equal(lista.admite("no-es-email"), false);
  assert.equal(lista.aliasPara("Viajes Albufera.example"), "persona.prueba+viajes-albufera-example@gmail.example");
  assert.equal(crearListaBlanca("").aliasPara("x"), null);
  assert.equal(crearListaBlanca("").admite("persona.prueba@gmail.example"), false);
});

const entrada = (extra: Partial<EntradaReglas> = {}): EntradaReglas => ({
  destinatario: "persona.prueba+albufera@gmail.example",
  emailVerificado: false,
  suprimido: false,
  respondio: false,
  esContestacion: false,
  listaBlanca: lista,
  requiereVerificado: true,
  enviosHoy: 3,
  limiteDiario: 50,
  ahora: new Date("2026-10-29T10:00:00.000Z"),
  ...extra,
});

test("reglas: las cinco en orden y registradas aunque pasen", () => {
  const r = evaluarReglas(entrada());
  assert.deepEqual(r.comprobadas.map((c) => c.rule), [REGLA.supresion, REGLA.respuestaPrevia, REGLA.listaBlanca, REGLA.emailVerificado, REGLA.limiteDiario]);
  assert.ok(r.comprobadas.every((c) => c.passed));
  assert.deepEqual(r.veredicto, { tipo: "enviar" });
  assert.equal(r.comprobadas[4]?.detail, "3 de 50");
});

test("reglas: manda la primera que falla, y las demás también quedan registradas", () => {
  const r = evaluarReglas(entrada({ suprimido: true, respondio: true, enviosHoy: 50 }));
  assert.deepEqual(r.veredicto, { tipo: "bloquear", regla: REGLA.supresion, detalle: "Pidió la baja: no se le vuelve a escribir" });
  assert.deepEqual(r.comprobadas.map((c) => c.passed), [false, false, true, true, false]);

  assert.equal(evaluarReglas(entrada({ respondio: true })).veredicto.tipo, "bloquear");
  assert.equal(evaluarReglas(entrada({ respondio: true, esContestacion: true })).veredicto.tipo, "enviar");
});

test("reglas: fuera de la lista blanca no sale; en producción no hay lista y cuenta la verificación", () => {
  const fuera = evaluarReglas(entrada({ destinatario: "alguien@empresa.example" }));
  assert.deepEqual(fuera.veredicto, { tipo: "bloquear", regla: REGLA.listaBlanca, detalle: "alguien@empresa.example no está en la lista blanca" });

  const prodSinVerificar = evaluarReglas(entrada({ listaBlanca: null, destinatario: "alguien@empresa.example" }));
  assert.equal(prodSinVerificar.veredicto.tipo, "bloquear");
  assert.equal(prodSinVerificar.veredicto.tipo === "bloquear" && prodSinVerificar.veredicto.regla, REGLA.emailVerificado);
  assert.equal(evaluarReglas(entrada({ listaBlanca: null, emailVerificado: true })).veredicto.tipo, "enviar");
  assert.equal(evaluarReglas(entrada({ listaBlanca: null, requiereVerificado: false })).veredicto.tipo, "enviar");
  assert.equal(evaluarReglas(entrada({ destinatario: null })).veredicto.tipo, "bloquear");
});

test("reglas: el límite diario aplaza a las 00:00 de Madrid, en horario de invierno y de verano", () => {
  const invierno = evaluarReglas(entrada({ enviosHoy: 50, ahora: new Date("2026-11-10T22:30:00.000Z") }));
  assert.deepEqual(invierno.veredicto, { tipo: "aplazar", regla: REGLA.limiteDiario, detalle: "50 de 50", hasta: new Date("2026-11-10T23:00:00.000Z") });
  const verano = evaluarReglas(entrada({ enviosHoy: 60, ahora: new Date("2026-07-01T21:59:00.000Z") }));
  assert.equal(verano.veredicto.tipo === "aplazar" && verano.veredicto.hasta.toISOString(), "2026-07-01T22:00:00.000Z");
});

test("tiempo: el día de Madrid empieza a su medianoche, también el del cambio de hora", () => {
  assert.equal(inicioDelDiaEnMadrid(new Date("2026-10-29T10:00:00Z")).toISOString(), "2026-10-28T23:00:00.000Z");
  // 23:30 del 28 en Madrid: sigue siendo el día 28.
  assert.equal(inicioDelDiaEnMadrid(new Date("2026-10-28T22:30:00Z")).toISOString(), "2026-10-27T23:00:00.000Z");
  assert.equal(inicioDelDiaEnMadrid(new Date("2026-10-28T23:00:00Z")).toISOString(), "2026-10-28T23:00:00.000Z");
  assert.equal(inicioDelDiaEnMadrid(new Date("2026-07-01T10:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z");
  // 25 de octubre de 2026: a las 3:00 vuelven a ser las 2:00.
  assert.equal(siguienteMedianocheEnMadrid(new Date("2026-10-25T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(siguienteMedianocheEnMadrid(new Date("2026-10-24T12:00:00Z")).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(enMadrid(new Date("2026-10-29T10:00:00Z")).diaSemana, 4);
});

const existentes = (pasos: ReturnType<typeof planificarSecuencia>, estados: PasoExistente["status"][] = []): PasoExistente[] =>
  pasos.map((p, i) => ({ id: `p${i}`, branch: p.branch, position: p.position, day: p.day, status: estados[i] ?? p.status, proposal: p.proposal }));

test("planificación: solo el primer paso lleva fecha y cada siguiente se fecha al enviar el anterior", () => {
  const inicio = new Date("2026-10-29T10:00:00.000Z");
  const pasos = planificarSecuencia("consultiva", inicio);
  assert.deepEqual(pasos.map((p) => p.day), PLANTILLAS.consultiva.map((p) => p.dia));
  assert.deepEqual(pasos.map((p) => p.scheduledFor), [inicio, null, null, null]);
  assert.ok(pasos.every((p) => p.status === "planned" && p.channel === "email"));

  const ex = existentes(pasos, ["sent"]);
  const enviado = ex[0];
  assert.ok(enviado);
  // Día 0 → día 3 con DEMO_DAY_MINUTES=5: 15 minutos después del envío.
  assert.deepEqual(siguientePaso(ex, enviado, new Date("2026-10-29T10:02:00.000Z"), 5), { id: "p1", scheduledFor: new Date("2026-10-29T10:17:00.000Z") });
  assert.deepEqual(siguientePaso(ex, enviado, inicio, 1440)?.scheduledFor, new Date("2026-11-01T10:00:00.000Z"));
  const ultimo = ex[3];
  assert.ok(ultimo);
  assert.equal(siguientePaso(ex, ultimo, inicio, 1440), null);
});

test("cambio de rama: propuesta pendiente y, al aprobarla, consultiva omitida y rama por señal planificada", () => {
  const ex = existentes(planificarSecuencia("consultiva", new Date()), ["sent", "awaiting_approval", "planned", "planned"]);
  const propuesta = pasoDeCambioDeRama(ex, "trigger", 3);
  assert.equal(propuesta.status, "awaiting_approval");
  assert.equal(propuesta.proposal, "cambio_de_rama");
  assert.equal(propuesta.position, 4);
  assert.equal(propuesta.day, 3);

  const conPropuesta = [...ex, { id: "prop", branch: propuesta.branch, position: propuesta.position, day: propuesta.day, status: propuesta.status, proposal: propuesta.proposal }];
  const prop = conPropuesta[4];
  assert.ok(prop);
  const { omitidos, nuevos } = aplicarCambioDeRama(conPropuesta, prop);
  assert.deepEqual(omitidos, ["p1", "p2", "p3"]);
  assert.deepEqual(nuevos.map((n) => [n.branch, n.position, n.day, n.status, n.scheduledFor]), [
    ["trigger", 5, 5, "planned", null],
    ["trigger", 6, 9, "planned", null],
  ]);
  assert.deepEqual(pendientes(conPropuesta), ["p1", "p2", "p3", "prop"]);
});

test("huecos: dos, laborables, en franja de Madrid, a partir de 48 h y en días distintos", () => {
  // Jueves 29 de octubre a las 11:00 en Madrid → desde el sábado 31: lunes 2 y martes 3 a las 9:00.
  const h = proponerHuecos(new Date("2026-10-29T10:00:00.000Z"));
  assert.deepEqual(h, [
    { start: "2026-11-02T08:00:00.000Z", end: "2026-11-02T08:30:00.000Z", held: false },
    { start: "2026-11-03T08:00:00.000Z", end: "2026-11-03T08:30:00.000Z", held: false },
  ]);
  // Lunes a las 13:00 en Madrid → el miércoles a partir de las 13:00: 13:00 y el jueves a las 9:00.
  const l = proponerHuecos(new Date("2026-11-02T12:00:00.000Z"));
  assert.equal(l[0]?.start, "2026-11-04T12:00:00.000Z");
  assert.equal(l[1]?.start, "2026-11-05T08:00:00.000Z");
});

test("orquestador: el menú sale de la etapa y del punto de decisión", () => {
  assert.deepEqual(menuDeAcciones("enriched", "cuenta_aprobada", false), ["planificar_secuencia", "descartar", "escalar_a_humano"]);
  assert.deepEqual(menuDeAcciones("in_sequence", "paso_vencido", true), ["cambiar_rama", "pedir_borrador", "esperar_hasta", "detener", "descartar", "escalar_a_humano"]);
  assert.deepEqual(menuDeAcciones("waiting", "senal_nueva", false), ["cambiar_rama", "esperar_hasta", "detener", "descartar", "escalar_a_humano"]);
  // De replied no se descarta (PROSPECT_TRANSITIONS); sí se puede volver a la secuencia más tarde.
  assert.deepEqual(menuDeAcciones("replied", "respuesta_clasificada", false), ["esperar_hasta", "escalar_a_humano"]);
  for (const etapa of ["meeting", "opted_out", "discarded"] as const) {
    assert.deepEqual(menuDeAcciones(etapa, "paso_vencido", true), ["escalar_a_humano"], etapa);
  }
});

test("orquestador: el motor valida la propuesta y rechaza lo que no está en el menú o no cuadra", () => {
  const ahora = new Date("2026-10-29T10:00:00.000Z");
  const c = { etapa: "in_sequence" as const, menu: menuDeAcciones("in_sequence", "paso_vencido", true), rama: "consultiva" as const, pasoId: "33333333-3333-4333-8333-333333333333", ahora };
  const p = (accion: unknown) => ({ accion, razonamiento: "porque sí", evidencia: [] });

  assert.ok(validarPropuesta(p({ tipo: "pedir_borrador", stepId: c.pasoId }), c).ok);
  assert.ok(validarPropuesta(p({ tipo: "cambiar_rama", to: "trigger" }), c).ok);
  const casos: [unknown, RegExp][] = [
    [{ tipo: "planificar_secuencia", kind: "trigger" }, /no está permitida con el prospect en secuencia/],
    [{ tipo: "pedir_borrador", stepId: "44444444-4444-4444-8444-444444444444" }, /no es el del paso que toca/],
    [{ tipo: "cambiar_rama", to: "consultiva" }, /Ya está en esa rama/],
    [{ tipo: "esperar_hasta", at: "2026-10-28T10:00:00.000Z" }, /en el futuro/],
    [{ tipo: "enviar_ya" }, /formato válido/],
    [{ tipo: "detener", motivo: "" }, /formato válido/],
  ];
  for (const [accion, motivo] of casos) {
    const v = validarPropuesta(p(accion), c);
    assert.ok(!v.ok && motivo.test(v.motivo), JSON.stringify(accion));
  }
  assert.equal(validarPropuesta({ accion: { tipo: "detener", motivo: "x" } }, c).ok, false);
  assert.deepEqual(escalar("x").accion, { tipo: "escalar_a_humano", motivo: "x" });
});
