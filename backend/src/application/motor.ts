import type { Account, Contact, Prospect, ProspectEvent, ProspectStage, ReplyIntent, SequenceStep } from "@jano/domain";

import { IaNoDisponible, noEncontrado } from "../domain/errores";
import { escalar, menuDeAcciones, validarPropuesta } from "../domain/motor/orquestador";
import { type Evaluacion, evaluarReglas } from "../domain/motor/reglas";
import { pasoDeCambioDeRama, pasoDeSeguimiento, pendientes, planificarSecuencia, siguientePaso } from "../domain/motor/secuencias";
import { inicioDelDiaEnMadrid } from "../domain/motor/tiempo";
import { comprobarTransicion } from "../domain/motor/transiciones";
import type { UnidadDeTrabajo } from "../ports/db";
import type { BorradorPaso, PropuestaOrquestador, PuntoDeDecision, RevisionCampana } from "../ports/ia";
import type { NuevoEvento, PasoGuardado, ProspectGuardado } from "../ports/repositorios";
import type { Servicios } from "./servicios";

/**
 * El motor de ejecución (ADR-002, ADR-003): el único que cambia etapas, envía y
 * registra. Los agentes proponen a través de sus puertos; aquí se valida, se
 * comprueban las reglas fijas y se ejecuta, dejando cada paso en el registro.
 */

// ── Lectura ───────────────────────────────────────────────────────────────

const aPaso = (p: PasoGuardado): SequenceStep => ({
  id: p.id,
  day: p.day,
  channel: p.channel,
  title: p.title,
  intent: p.intent,
  status: p.status,
  scheduledFor: p.scheduledFor,
});

/** El prospect como lo ve la API: la secuencia son todos sus pasos, de las dos ramas. */
export function aProspect(g: ProspectGuardado, pasos: readonly PasoGuardado[]): Prospect {
  const planificados = pasos.filter((p) => p.status === "planned" && p.scheduledFor).map((p) => p.scheduledFor as string).sort();
  return {
    id: g.id,
    campaignId: g.campaignId,
    accountId: g.accountId,
    contactId: g.contactId,
    stage: g.stage,
    sequence:
      g.sequenceKind && g.sequenceId
        ? { id: g.sequenceId, kind: g.sequenceKind, steps: pasos.map(aPaso), switchedFrom: g.switchedFrom, switchedAt: g.switchedAt }
        : null,
    nextActionAt: planificados[0] ?? null,
    updatedAt: g.updatedAt,
  };
}

export async function cargarProspect(uow: UnidadDeTrabajo, id: string): Promise<ProspectGuardado> {
  const p = await uow.prospects.obtener(id);
  if (!p) throw noEncontrado();
  return p;
}

export async function prospectActual(uow: UnidadDeTrabajo, id: string): Promise<Prospect> {
  return aProspect(await cargarProspect(uow, id), await uow.prospects.pasos(id));
}

interface Contexto {
  readonly prospect: ProspectGuardado;
  readonly cuenta: Account;
  readonly contacto: Contact | null;
}

async function contexto(uow: UnidadDeTrabajo, prospect: ProspectGuardado): Promise<Contexto> {
  const cuenta = await uow.cuentas.obtener(prospect.accountId);
  if (!cuenta) throw new Error(`cuenta ${prospect.accountId} sin fila`);
  return { prospect, cuenta, contacto: prospect.contactId ? await uow.cuentas.contacto(prospect.contactId) : null };
}

const destinatario = (c: Contact | null) => ({ nombre: c?.name ?? "Sin contacto", cargo: c?.role ?? "Gerencia" });

// ── Máquina de estados ───────────────────────────────────────────────────

type EventoSinProspect = Omit<NuevoEvento, "prospectId" | "campaignId" | "stageAfter">;

export type ResultadoTransicion = { readonly ok: boolean; readonly evento: ProspectEvent; readonly prospect: ProspectGuardado };

/**
 * La única forma de cambiar de etapa (FR-002). Si PROSPECT_TRANSITIONS no lo
 * permite, no lanza: registra `rejected` con el motivo y devuelve `ok: false`, para
 * que el registro sobreviva a la respuesta 409.
 */
export async function transicionar(uow: UnidadDeTrabajo, p: ProspectGuardado, hacia: ProspectStage, evento: EventoSinProspect): Promise<ResultadoTransicion> {
  const ids = { prospectId: p.id, campaignId: p.campaignId };
  if (p.stage === hacia) return { ok: true, prospect: p, evento: await uow.eventos.registrar({ ...ids, ...evento }) };
  const t = comprobarTransicion(p.stage, hacia);
  if (!t.ok) {
    const rechazo = await uow.eventos.registrar({
      ...ids,
      agent: evento.agent,
      actor: evento.actor ?? null,
      type: "rejected",
      summary: `Rechazado: ${t.motivo}`,
      reasoning: evento.summary,
      stepId: evento.stepId ?? null,
    });
    return { ok: false, prospect: p, evento: rechazo };
  }
  const hecho = await uow.eventos.registrar({ ...ids, ...evento, stageAfter: hacia });
  await uow.prospects.cambiarEtapa(p.id, hacia);
  return { ok: true, prospect: { ...p, stage: hacia }, evento: hecho };
}

const registrar = (uow: UnidadDeTrabajo, p: ProspectGuardado, e: EventoSinProspect) =>
  uow.eventos.registrar({ prospectId: p.id, campaignId: p.campaignId, ...e });

// ── Orquestador ───────────────────────────────────────────────────────────

/**
 * Punto de decisión: el Orquestador propone una acción del menú de la etapa; el
 * motor la valida y, si no vale (o el modelo falla), registra `rejected` y la
 * decisión pasa a una persona. La propuesta aún no se ha ejecutado.
 */
export async function decidir(
  uow: UnidadDeTrabajo,
  s: Servicios,
  c: Contexto,
  punto: PuntoDeDecision,
  extra: { paso?: PasoGuardado | null; intent?: ReplyIntent | null } = {},
): Promise<PropuestaOrquestador> {
  const { prospect: p, cuenta } = c;
  const paso = extra.paso ?? null;
  const menu = menuDeAcciones(p.stage, punto, !!paso);
  const ahora = s.reloj.ahora();
  let propuesta: unknown;
  try {
    propuesta = await s.agentes.orquestador.proponerSiguienteAccion({
      punto,
      ahora: ahora.toISOString(),
      minutosPorDia: s.config.minutosPorDia,
      etapa: p.stage,
      rama: p.sequenceKind,
      cambiadaDe: p.switchedFrom,
      cuenta,
      paso: paso && { id: paso.id, titulo: paso.title, dia: paso.day },
      enviados: await uow.eventos.enviados(p.id),
      intent: extra.intent ?? null,
      menu,
    });
  } catch (e) {
    propuesta = { error: e instanceof Error ? e.message : String(e) };
  }
  const v = validarPropuesta(propuesta, { etapa: p.stage, menu, rama: p.sequenceKind, pasoId: paso?.id ?? null, ahora });
  if (v.ok) return v.propuesta;
  const original = propuesta as Partial<PropuestaOrquestador>;
  await registrar(uow, p, {
    agent: "orchestrator",
    type: "rejected",
    summary: `Propuesta rechazada por el motor: ${v.motivo}`,
    reasoning: typeof original.razonamiento === "string" ? original.razonamiento : null,
    evidence: Array.isArray(original.evidencia) ? original.evidencia.filter((x): x is string => typeof x === "string") : [],
    stepId: paso?.id ?? null,
  });
  return escalar(v.motivo);
}

function resumenDe(propuesta: PropuestaOrquestador, paso: PasoGuardado | null): string {
  const a = propuesta.accion;
  switch (a.tipo) {
    case "planificar_secuencia":
      return `Planifica la secuencia ${a.kind === "trigger" ? "por señal de compra" : "consultiva"}`;
    case "cambiar_rama":
      return "Propone cambiar a la secuencia por señal de compra; espera tu OK";
    case "esperar_hasta":
      return `Espera hasta el ${a.at.slice(0, 10)} antes de seguir`;
    case "pedir_borrador":
      return `Toca el paso «${paso?.title ?? ""}»: pide el borrador a Outreach`;
    case "detener":
      return `Detiene la secuencia: ${a.motivo}`;
    case "escalar_a_humano":
      return `Lo deja en tus manos: ${a.motivo}`;
    case "descartar":
      return `Descarta el prospect: ${a.motivo}`;
  }
}

/** La decisión del Orquestador queda en el registro, con su razonamiento y su evidencia. */
function eventoDecision(propuesta: PropuestaOrquestador, paso: PasoGuardado | null): EventoSinProspect {
  return {
    agent: "orchestrator",
    type: "decision",
    summary: resumenDe(propuesta, paso),
    reasoning: propuesta.razonamiento,
    evidence: propuesta.evidencia,
    stepId: paso?.id ?? null,
  };
}

/** Detener o descartar: los pasos pendientes se cancelan y el prospect pasa a `discarded`. */
async function detenerSecuencia(uow: UnidadDeTrabajo, p: ProspectGuardado, evento: EventoSinProspect): Promise<ResultadoTransicion> {
  const r = await transicionar(uow, p, "discarded", evento);
  if (r.ok) await uow.prospects.marcarPasos(pendientes(await uow.prospects.pasos(p.id)), "cancelled");
  return r;
}

// ── Alta del prospect al aprobar una cuenta ──────────────────────────────

/**
 * Contact Finder propone un cargo; en la prueba de concepto el destinatario es un
 * alias de la lista blanca, uno por cuenta (FR-015). Sin destinatario, el prospect
 * queda `unverified` y no entra en secuencia. Con él, decide el Orquestador.
 */
export async function prepararProspect(uow: UnidadDeTrabajo, s: Servicios, cuenta: Account): Promise<ProspectGuardado> {
  const propuesta = await s.agentes.contactos.proponer({ cuenta });
  const email = s.config.listaBlanca?.aliasPara(cuenta.domain) ?? null;
  const contacto = email
    ? await uow.cuentas.insertarContacto({
        accountId: cuenta.id,
        name: `${propuesta.cargo} (prueba)`,
        role: propuesta.cargo,
        email,
        emailSource: "proveedor",
        emailVerified: false,
        verificationProvider: "Lista blanca de la prueba de concepto",
        reasoning: propuesta.motivo,
      })
    : null;
  let p = await uow.prospects.crear({ campaignId: cuenta.campaignId, accountId: cuenta.id, contactId: contacto?.id ?? null, stage: "found" });
  const r = await transicionar(uow, p, contacto ? "enriched" : "unverified", {
    agent: "contact_finder",
    type: "decision",
    summary: contacto ? `Propone escribir a ${propuesta.cargo}; destinatario de prueba de la lista blanca` : "Sin destinatario verificable: no entra en secuencia",
    reasoning: propuesta.motivo,
    evidence: propuesta.evidencia,
    rulesChecked: [{ rule: "Origen registrado para cada dato de contacto", passed: !!contacto, detail: contacto ? "Lista blanca de la prueba de concepto" : null }],
  });
  p = r.prospect;
  if (!contacto) return p;

  const c = await contexto(uow, p);
  const decision = await decidir(uow, s, c, "cuenta_aprobada");
  const a = decision.accion;
  if (a.tipo === "planificar_secuencia") {
    const ahora = s.reloj.ahora();
    const t = await transicionar(uow, p, "in_sequence", eventoDecision(decision, null));
    if (t.ok) {
      await uow.prospects.insertarPasos(p.id, planificarSecuencia(a.kind, ahora));
      await uow.prospects.fijarSecuencia(p.id, { kind: a.kind, switchedFrom: null, switchedAt: null });
      uow.alConfirmar(() => s.despertador.adelantar(ahora));
    }
    return t.prospect;
  }
  if (a.tipo === "descartar") return (await transicionar(uow, p, "discarded", eventoDecision(decision, null))).prospect;
  await registrar(uow, p, eventoDecision(decision, null));
  return p;
}

// ── Envío ────────────────────────────────────────────────────────────────

export type ResultadoEnvio = { readonly tipo: "enviado" | "bloqueado" | "aplazado"; readonly evento: ProspectEvent };

/**
 * Reglas y envío de un paso con su borrador (FR-003, FR-005). Primero las reglas y
 * el envío; solo si sale se escriben sus efectos. Si una regla lo bloquea o el
 * proveedor falla, el paso queda `blocked` con el motivo y no se toca nada más.
 */
/** Las reglas de FR-003 para enviar a este contacto ahora. */
async function comprobarReglas(uow: UnidadDeTrabajo, s: Servicios, c: Contexto, desde: Date, esContestacion: boolean): Promise<Evaluacion> {
  const ahora = s.reloj.ahora();
  const guardarrailes = await uow.cumplimiento.guardarrailes();
  const email = c.contacto?.email ?? null;
  return evaluarReglas({
    destinatario: email,
    emailVerificado: c.contacto?.emailVerified ?? false,
    suprimido: email ? await uow.cumplimiento.suprimido(email) : false,
    respondio: await uow.eventos.respondioDespuesDe(c.prospect.id, desde),
    esContestacion,
    listaBlanca: s.config.listaBlanca,
    requiereVerificado: guardarrailes.requireVerifiedEmail,
    enviosHoy: await uow.eventos.enviosDesde(inicioDelDiaEnMadrid(ahora)),
    limiteDiario: guardarrailes.maxSendsPerMailboxPerDay,
    ahora,
  });
}

export { comprobarReglas };

/** Una regla impide enviar el paso: queda `blocked`, o aplazado a las 00:00 si es el límite. */
async function noEnviar(uow: UnidadDeTrabajo, s: Servicios, c: Contexto, paso: PasoGuardado, ev: Evaluacion): Promise<ResultadoEnvio | null> {
  const p = c.prospect;
  const v = ev.veredicto;
  if (v.tipo === "bloquear") {
    await uow.prospects.actualizarPaso(paso.id, { status: "blocked", error: v.detalle });
    const evento = await registrar(uow, p, {
      agent: "guardrail",
      type: "blocked",
      summary: `No se envía «${paso.title}»: ${v.detalle}`,
      rulesChecked: ev.comprobadas,
      ruleApplied: v.regla,
      stepId: paso.id,
    });
    return { tipo: "bloqueado", evento };
  }
  if (v.tipo === "aplazar") {
    await uow.prospects.actualizarPaso(paso.id, { status: "planned", scheduledFor: v.hasta });
    const datos: EventoSinProspect = {
      agent: "guardrail",
      type: "deferred",
      summary: `Envío aplazado, buzón al límite (${v.detalle}): sale a las 00:00`,
      rulesChecked: ev.comprobadas,
      ruleApplied: v.regla,
      stepId: paso.id,
    };
    const evento = p.stage === "in_sequence" ? (await transicionar(uow, p, "waiting", datos)).evento : await registrar(uow, p, datos);
    uow.alConfirmar(() => s.despertador.adelantar(v.hasta));
    return { tipo: "aplazado", evento };
  }
  return null;
}

export async function enviarPaso(
  uow: UnidadDeTrabajo,
  s: Servicios,
  c: Contexto,
  paso: PasoGuardado,
  opciones: { readonly planificarSiguiente: boolean } = { planificarSiguiente: true },
): Promise<ResultadoEnvio> {
  const { prospect: p, contacto } = c;
  const ahora = s.reloj.ahora();
  const email = contacto?.email ?? null;
  const ev = await comprobarReglas(uow, s, c, new Date(paso.createdAt), false);
  const parado = await noEnviar(uow, s, c, paso, ev);
  if (parado) return parado;

  const asunto = paso.subject ?? paso.title;
  const cuerpo = paso.body ?? paso.intent;
  let messageId: string;
  try {
    ({ messageId } = await s.correo.enviar({ para: email ?? "", asunto, cuerpo, token: p.token, idempotencia: paso.id, enRespuestaA: null, reunion: null }));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await uow.prospects.actualizarPaso(paso.id, { status: "blocked", error: `Error al enviar: ${error}` });
    const evento = await registrar(uow, p, {
      agent: "guardrail",
      type: "blocked",
      summary: `El envío de «${paso.title}» ha fallado; no se ha aplicado nada más`,
      reasoning: error,
      rulesChecked: ev.comprobadas,
      stepId: paso.id,
    });
    return { tipo: "bloqueado", evento };
  }

  await uow.prospects.actualizarPaso(paso.id, { status: "sent", messageId, sentAt: ahora, error: null });
  const datos: EventoSinProspect = {
    agent: "outreach",
    type: "sent",
    summary: `Email del día ${paso.day} enviado: ${paso.title.toLowerCase()}`,
    rulesChecked: ev.comprobadas,
    message: { channel: paso.channel, subject: asunto, body: cuerpo },
    stepId: paso.id,
  };
  const evento = p.stage === "waiting" ? (await transicionar(uow, p, "in_sequence", datos)).evento : await registrar(uow, p, datos);
  await uow.cuentas.cambiarEstado(p.campaignId, [p.accountId], ["approved", "enriching"], "contacted");
  if (opciones.planificarSiguiente) await planificarSiguiente(uow, s, p.id, paso, ahora);
  return { tipo: "enviado", evento };
}

export async function planificarSiguiente(uow: UnidadDeTrabajo, s: Servicios, prospectId: string, enviado: PasoGuardado, enviadoEn: Date) {
  const sig = siguientePaso(await uow.prospects.pasos(prospectId), enviado, enviadoEn, s.config.minutosPorDia);
  if (!sig) return;
  await uow.prospects.actualizarPaso(sig.id, { scheduledFor: sig.scheduledFor });
  uow.alConfirmar(() => s.despertador.adelantar(sig.scheduledFor));
}

// ── Paso vencido (lo llama el motor cada minuto) ─────────────────────────

const EN_SECUENCIA: ReadonlySet<ProspectStage> = new Set(["in_sequence", "waiting"]);

/**
 * Un paso cuya hora ha llegado. Si una persona ya lo aprobó (aplazado por el
 * límite), sale. Si no, decide el Orquestador: lo normal es pedir el borrador a
 * Outreach, comprobar las reglas y dejarlo esperando tu OK (o enviarlo, con piloto
 * automático). Cada rama deja el paso fuera de `planned` o con otra fecha: así una
 * segunda invocación no lo repite.
 */
export async function procesarPaso(uow: UnidadDeTrabajo, s: Servicios, paso: PasoGuardado): Promise<void> {
  let p = await cargarProspect(uow, paso.prospectId);

  if (p.stage === "not_now") {
    p = (await transicionar(uow, p, "in_sequence", { agent: "outreach", type: "decision", summary: "Retoma el contacto tras «ahora no»", stepId: paso.id })).prospect;
  }
  if (!EN_SECUENCIA.has(p.stage)) {
    await uow.prospects.marcarPasos([paso.id], "cancelled");
    await registrar(uow, p, { agent: "guardrail", type: "stopped", summary: `Paso «${paso.title}» cancelado: el prospect ya no está en secuencia`, stepId: paso.id });
    return;
  }
  let c = await contexto(uow, p);
  if (paso.approvedAt) {
    await enviarPaso(uow, s, c, paso);
    return;
  }

  const decision = await decidir(uow, s, c, "paso_vencido", { paso });
  const a = decision.accion;
  switch (a.tipo) {
    case "cambiar_rama":
      await registrar(uow, p, eventoDecision(decision, paso));
      // El paso consultivo queda en pausa hasta que decidas: aprobar el cambio lo omite.
      // Sin borrador para el cambio, queda bloqueado: no se vuelve a decidir cada minuto.
      await uow.prospects.actualizarPaso(
        paso.id,
        (await proponerCambioDeRama(uow, s, c, paso.day)) ? { scheduledFor: null } : { status: "blocked", error: "Sin borrador para el cambio de rama" },
      );
      return;
    case "esperar_hasta":
      await registrar(uow, p, eventoDecision(decision, paso));
      await uow.prospects.actualizarPaso(paso.id, { scheduledFor: new Date(a.at) });
      uow.alConfirmar(() => s.despertador.adelantar(new Date(a.at)));
      return;
    case "detener":
    case "descartar":
      await detenerSecuencia(uow, p, { ...eventoDecision(decision, paso), type: a.tipo === "detener" ? "stopped" : "decision" });
      return;
    case "pedir_borrador":
    case "escalar_a_humano":
    case "planificar_secuencia":
      break;
  }
  await registrar(uow, p, eventoDecision(decision, paso));

  // Reglas antes de redactar: no se pide un borrador que no podría salir.
  const previas = await comprobarReglas(uow, s, c, new Date(paso.createdAt), false);
  if (await noEnviar(uow, s, c, paso, previas)) return;
  const guardarrailes = await uow.cumplimiento.guardarrailes();
  let borrador: BorradorPaso;
  try {
    borrador = await s.agentes.redactor.redactarPaso({
      cuenta: c.cuenta,
      contacto: destinatario(c.contacto),
      paso: { titulo: paso.title, intencion: paso.intent, dia: paso.day, rama: paso.branch },
    });
  } catch (e) {
    // Sin borrador válido (tope diario, salida inválida, Bedrock caído): el paso queda
    // bloqueado con el motivo y la decisión pasa a una persona. Nada sale sin borrador.
    if (!(e instanceof IaNoDisponible)) throw e;
    await uow.prospects.actualizarPaso(paso.id, { status: "blocked", error: e.message });
    await registrar(uow, p, {
      agent: "outreach",
      type: "blocked",
      summary: `No hay borrador de «${paso.title}»: queda en tus manos`,
      reasoning: e.message,
      rulesChecked: previas.comprobadas,
      stepId: paso.id,
    });
    return;
  }
  const conBorrador: PasoGuardado = { ...paso, subject: borrador.asunto, body: borrador.cuerpo };
  await uow.prospects.actualizarPaso(paso.id, { subject: borrador.asunto, body: borrador.cuerpo, draftReasoning: borrador.razonamiento });

  if (guardarrailes.autopilot && a.tipo === "pedir_borrador") {
    await uow.prospects.actualizarPaso(paso.id, { approvedAt: s.reloj.ahora(), approvedBy: "autopilot" });
    c = { ...c, prospect: await cargarProspect(uow, p.id) };
    await enviarPaso(uow, s, c, conBorrador);
    return;
  }
  await uow.prospects.actualizarPaso(paso.id, { status: "awaiting_approval" });
  await registrar(uow, p, {
    agent: "outreach",
    type: "decision",
    summary: `Borrador de «${paso.title}» listo; espera tu OK`,
    reasoning: borrador.razonamiento,
    rulesChecked: previas.comprobadas,
    message: { channel: paso.channel, subject: borrador.asunto, body: borrador.cuerpo },
    stepId: paso.id,
  });
}

/**
 * El primer paso de la rama por señal, redactado y esperando tu aprobación (US4b).
 * `false` si no se pudo redactar: no hay nada que aprobar.
 */
async function proponerCambioDeRama(uow: UnidadDeTrabajo, s: Servicios, c: Contexto, diaActual: number): Promise<boolean> {
  const pasos = await uow.prospects.pasos(c.prospect.id);
  if (pasos.some((x) => x.proposal === "cambio_de_rama" && x.status === "awaiting_approval")) return true;
  const nuevo = pasoDeCambioDeRama(pasos, "trigger", diaActual);
  let b: BorradorPaso;
  try {
    b = await s.agentes.redactor.redactarPaso({
      cuenta: c.cuenta,
      contacto: destinatario(c.contacto),
      paso: { titulo: nuevo.title, intencion: nuevo.intent, dia: nuevo.day, rama: "trigger" },
    });
  } catch (e) {
    if (!(e instanceof IaNoDisponible)) throw e;
    await registrar(uow, c.prospect, {
      agent: "outreach",
      type: "rejected",
      summary: "No hay borrador para el cambio de rama: la decisión queda en tus manos",
      reasoning: e.message,
    });
    return false;
  }
  const [guardado] = await uow.prospects.insertarPasos(c.prospect.id, [nuevo]);
  if (!guardado) return false;
  await uow.prospects.actualizarPaso(guardado.id, { subject: b.asunto, body: b.cuerpo, draftReasoning: b.razonamiento });
  await registrar(uow, c.prospect, {
    agent: "outreach",
    type: "decision",
    summary: `Borrador de «${nuevo.title}» listo: aprobarlo cambia la secuencia`,
    reasoning: b.razonamiento,
    message: { channel: "email", subject: b.asunto, body: b.cuerpo },
    stepId: guardado.id,
  });
  return true;
}

/**
 * Señal nueva a mitad de secuencia (relectura de la web o añadida a mano): el
 * Orquestador decide si propone cambiar de rama.
 */
export async function senalNueva(uow: UnidadDeTrabajo, s: Servicios, prospectId: string): Promise<PropuestaOrquestador> {
  const p = await cargarProspect(uow, prospectId);
  const c = await contexto(uow, p);
  const decision = await decidir(uow, s, c, "senal_nueva");
  await registrar(uow, p, eventoDecision(decision, null));
  if (decision.accion.tipo === "cambiar_rama") {
    const ultimo = (await uow.prospects.pasos(p.id)).filter((x) => x.status === "sent").pop();
    await proponerCambioDeRama(uow, s, c, ultimo?.day ?? 0);
  }
  return decision;
}

/** Lote del motor para un tenant: reclama hasta `limite` pasos vencidos y los procesa. */
export async function procesarVencidos(uow: UnidadDeTrabajo, s: Servicios, limite: number): Promise<{ procesados: number; proximo: Date | null }> {
  const pasos = await uow.prospects.reclamarVencidos(s.reloj.ahora(), limite);
  for (const paso of pasos) await procesarPaso(uow, s, paso);
  if (pasos.length) await revisarCampanas(uow, s, [...new Set(await campanasDe(uow, pasos))]);
  return { procesados: pasos.length, proximo: await uow.prospects.proximoVencimiento() };
}

async function campanasDe(uow: UnidadDeTrabajo, pasos: readonly PasoGuardado[]): Promise<string[]> {
  const ids: string[] = [];
  for (const id of new Set(pasos.map((p) => p.prospectId))) {
    const p = await uow.prospects.obtener(id);
    if (p) ids.push(p.campaignId);
  }
  return ids;
}

/**
 * La «Lectura de Jano» (FR-017): una vez al día por campaña con actividad, el
 * Orquestador lee el flujo y deja su lectura guardada para el centro de mando. No
 * ejecuta nada.
 */
export async function revisarCampanas(uow: UnidadDeTrabajo, s: Servicios, campaignIds: readonly string[]): Promise<void> {
  const desde = inicioDelDiaEnMadrid(s.reloj.ahora());
  for (const id of campaignIds) {
    const campana = await uow.campanas.obtener(id);
    const previa = await uow.campanas.ultimaRevision(id);
    if (!campana || (previa && Date.parse(previa.at) >= desde.getTime())) continue;
    let revision: RevisionCampana;
    try {
      revision = await s.agentes.orquestador.revisarCampana({
        campaignName: campana.name,
        actuales: await uow.vistas.actuales(id),
        cuentasEncontradas: campana.stats.accountsFound,
        aplazadosHoy: await uow.vistas.aplazadosDesde(desde),
      });
    } catch (e) {
      // Sin lectura hoy: se intentará en la próxima pasada con actividad.
      if (!(e instanceof IaNoDisponible)) throw e;
      console.warn(JSON.stringify({ msg: "revision_sin_lectura", campaign_id: id, motivo: e.motivo }));
      continue;
    }
    await uow.campanas.guardarRevision(id, revision);
  }
}

// ── Respuestas y bajas ───────────────────────────────────────────────────

export { contexto as contextoDe, destinatario, detenerSecuencia, eventoDecision, registrar };

/** Seguimiento suelto tras una respuesta (ausencia): vuelve a la secuencia en `cuando`. */
export async function planificarSeguimiento(uow: UnidadDeTrabajo, s: Servicios, p: ProspectGuardado, cuando: Date, titulo: string, intencion: string) {
  const pasos = await uow.prospects.pasos(p.id);
  await uow.prospects.insertarPasos(p.id, [pasoDeSeguimiento(pasos, p.sequenceKind ?? "consultiva", cuando, titulo, intencion)]);
  if (!p.sequenceKind) await uow.prospects.fijarSecuencia(p.id, { kind: "consultiva", switchedFrom: null, switchedAt: null });
  uow.alConfirmar(() => s.despertador.adelantar(cuando));
}
