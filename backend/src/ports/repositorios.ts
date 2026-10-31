import type {
  Account,
  AccountStatus,
  Agent,
  AuditEntry,
  Campaign,
  CampaignStatus,
  Channel,
  Contact,
  DataSource,
  Draft,
  EventType,
  Evidence,
  Guardrails,
  Icp,
  IcpTurn,
  InboxItem,
  Opportunity,
  ProspectEvent,
  ProspectStage,
  ReplyIntent,
  RuleCheck,
  SequenceKind,
  StepStatus,
  Trigger,
  ApprovalEffect,
  DraftStatus,
} from "@jano/domain";

import type { PasoNuevo } from "../domain/motor/secuencias";
import type { RevisionCampana } from "./ia";
import type { EmpresaCandidata } from "./web";

/**
 * Persistencia del motor (spec 008). Igual que el equipo: todo dentro de la
 * transacción de un tenant, con RLS como segunda barrera. Las vistas (`Proyecciones`)
 * se calculan con SQL sobre `prospect_events` (FR-006): no hay contadores.
 */

export interface RepositorioCampanas {
  crear(c: { name: string; prompt: string; icp: Icp; meetingsGoal: number }): Promise<string>;
  obtener(id: string): Promise<Campaign | null>;
  listar(): Promise<Campaign[]>;
  /** La activa más reciente o, si no hay, la última tocada. */
  principal(): Promise<Campaign | null>;
  cambiarIcp(id: string, icp: Icp): Promise<void>;
  cambiarEstado(id: string, status: CampaignStatus): Promise<void>;
  turnos(id: string): Promise<IcpTurn[]>;
  anadirTurno(id: string, t: { role: IcpTurn["role"]; text: string; icp: Icp | null; suggestions: readonly string[] }): Promise<IcpTurn>;
  guardarRevision(id: string, r: RevisionCampana): Promise<void>;
  ultimaRevision(id: string): Promise<(RevisionCampana & { readonly at: string }) | null>;
}

export interface NuevaCuenta {
  readonly campaignId: string;
  readonly name: string;
  readonly domain: string;
  readonly city: string | null;
  readonly fitScore: number;
  readonly fitReasoning: string;
  readonly fitEvidence: readonly Evidence[];
  readonly trigger: Trigger | null;
  readonly status: AccountStatus;
  readonly source: string;
  readonly discardReason: string | null;
}

export interface NuevoContacto {
  readonly accountId: string;
  readonly name: string;
  readonly role: string;
  readonly email: string;
  readonly emailSource: DataSource;
  readonly emailVerified: boolean;
  readonly verificationProvider: string | null;
  readonly reasoning: string;
}

export interface RepositorioCuentas {
  dominios(campaignId: string): Promise<Set<string>>;
  /** `null` si el dominio ya estaba en la campaña: analizar dos veces la misma candidata no la duplica. */
  insertar(c: NuevaCuenta): Promise<Account | null>;
  /** Candidatas de una búsqueda guardadas después de `desde` (caché de 24 h de FR-013b). */
  candidatasEnCache(clave: string, desde: Date): Promise<EmpresaCandidata[] | null>;
  guardarCandidatas(clave: string, empresas: readonly EmpresaCandidata[], en: Date): Promise<void>;
  obtener(id: string): Promise<Account | null>;
  listar(campaignId: string, filtro: { status: AccountStatus | null; limite: number }): Promise<Account[]>;
  /** Cambia las que están en `desde`; devuelve los ids cambiados. */
  cambiarEstado(campaignId: string, ids: readonly string[], desde: readonly AccountStatus[], hacia: AccountStatus): Promise<string[]>;
  insertarContacto(c: NuevoContacto): Promise<Contact>;
  contacto(id: string): Promise<Contact | null>;
}

export interface ProspectGuardado {
  readonly id: string;
  readonly campaignId: string;
  readonly accountId: string;
  readonly contactId: string | null;
  readonly stage: ProspectStage;
  readonly sequenceId: string | null;
  readonly sequenceKind: SequenceKind | null;
  readonly switchedFrom: SequenceKind | null;
  readonly switchedAt: string | null;
  readonly token: string;
  readonly updatedAt: string;
}

export interface PasoGuardado {
  readonly id: string;
  readonly prospectId: string;
  readonly branch: SequenceKind;
  readonly position: number;
  readonly day: number;
  readonly channel: Channel;
  readonly title: string;
  readonly intent: string;
  readonly status: StepStatus;
  readonly scheduledFor: string | null;
  readonly proposal: "cambio_de_rama" | null;
  readonly subject: string | null;
  readonly body: string | null;
  readonly approvedAt: string | null;
  readonly error: string | null;
  readonly messageId: string | null;
  readonly createdAt: string;
}

export interface CambiosPaso {
  readonly status?: StepStatus;
  readonly scheduledFor?: Date | null;
  readonly subject?: string;
  readonly body?: string;
  readonly draftReasoning?: string;
  readonly approvedAt?: Date;
  readonly approvedBy?: string;
  readonly error?: string | null;
  readonly messageId?: string;
  readonly sentAt?: Date;
}

export interface RepositorioProspects {
  crear(p: { campaignId: string; accountId: string; contactId: string | null; stage: ProspectStage }): Promise<ProspectGuardado>;
  /** Bloquea la fila hasta el final de la transacción: dos acciones sobre el mismo prospect no se cruzan. */
  obtener(id: string): Promise<ProspectGuardado | null>;
  cambiarEtapa(id: string, stage: ProspectStage): Promise<void>;
  fijarSecuencia(id: string, s: { kind: SequenceKind; switchedFrom: SequenceKind | null; switchedAt: Date | null }): Promise<void>;
  pasos(prospectId: string): Promise<PasoGuardado[]>;
  paso(id: string): Promise<PasoGuardado | null>;
  insertarPasos(prospectId: string, pasos: readonly PasoNuevo[]): Promise<PasoGuardado[]>;
  actualizarPaso(id: string, cambios: CambiosPaso): Promise<void>;
  marcarPasos(ids: readonly string[], status: StepStatus): Promise<void>;
  /** `FOR UPDATE SKIP LOCKED`: dos motores a la vez nunca toman el mismo paso. */
  reclamarVencidos(ahora: Date, limite: number): Promise<PasoGuardado[]>;
  proximoVencimiento(): Promise<Date | null>;
}

export interface NuevoEvento {
  readonly prospectId: string;
  readonly campaignId: string;
  readonly agent: Agent;
  readonly type: EventType;
  readonly summary: string;
  readonly reasoning?: string | null;
  readonly evidence?: readonly string[];
  readonly rulesChecked?: readonly RuleCheck[];
  readonly message?: ProspectEvent["message"];
  readonly stepId?: string | null;
  readonly ruleApplied?: string | null;
  /** Etapa a la que lleva el evento, si cambia (la proyección del flujo la lee de aquí). */
  readonly stageAfter?: ProspectStage | null;
  readonly actor?: string | null;
}

export interface RegistroDeEventos {
  registrar(e: NuevoEvento): Promise<ProspectEvent>;
  deProspect(prospectId: string): Promise<ProspectEvent[]>;
  /** ¿Hay una respuesta del contacto posterior a `desde`? */
  respondioDespuesDe(prospectId: string, desde: Date): Promise<boolean>;
  enviados(prospectId: string): Promise<number>;
  /** Envíos del buzón del tenant desde un instante (límite diario). */
  enviosDesde(desde: Date): Promise<number>;
}

export interface ElementoGuardado extends InboxItem {
  readonly messageId: string | null;
}

export interface RepositorioBandeja {
  insertar(e: {
    prospectId: string;
    receivedAt: Date;
    channel: Channel;
    text: string;
    intent: ReplyIntent;
    intentReasoning: string;
    draft: Draft | null;
    effects: readonly ApprovalEffect[];
    messageId: string | null;
  }): Promise<string>;
  obtener(id: string): Promise<ElementoGuardado | null>;
  listar(filtro: { intent: ReplyIntent | null; status: DraftStatus | null }): Promise<InboxItem[]>;
  cambiarBorrador(id: string, draft: Draft): Promise<void>;
  crearOportunidad(o: { prospectId: string; campaignId: string; inboxItemId: string; meetingStart: string | null; meetingEnd: string | null }): Promise<void>;
  oportunidades(): Promise<Opportunity[]>;
}

export interface RepositorioCumplimiento {
  guardarrailes(): Promise<Guardrails>;
  guardarGuardarrailes(g: Guardrails, actor: string): Promise<Guardrails>;
  suprimido(email: string): Promise<boolean>;
  suprimir(email: string, source: "enlace_baja" | "respuesta" | "manual", prospectId: string | null): Promise<void>;
  contactos(): Promise<{ total: number; conOrigen: number; baseValidada: number }>;
  bajas(): Promise<{ total: number; atendidas: number }>;
}

/** Uso del modelo por tenant y día (spec 008 FR-016). `dia` es la fecha en Europe/Madrid (AAAA-MM-DD). */
export interface RepositorioConsumo {
  /** Suma una llamada si el día no ha llegado a `tope`; `false` si ya llegó y no hay que llamar. */
  reservarLlamada(dia: string, tope: number): Promise<boolean>;
  anotar(dia: string, uso: { readonly tokensEntrada: number; readonly tokensSalida: number; readonly costeUsd: number }): Promise<void>;
}

export interface Proyecciones {
  /** Prospects que están ahora en cada etapa (último `stage_after` de cada uno). */
  actuales(campaignId: string): Promise<Partial<Record<ProspectStage, number>>>;
  /** Prospects que alguna vez llegaron a cada etapa. */
  alcanzadas(campaignId: string): Promise<Partial<Record<ProspectStage, number>>>;
  cuentas(campaignId: string): Promise<{ total: number; fitAlto: number; descartadas: number; porRevisar: number }>;
  embudo(campaignId: string): Promise<{ contactados: number; respondieron: number; reuniones: number }>;
  /** Cuatro series acumuladas de los últimos 6 días. */
  tendencias(campaignId: string, ahora: Date): Promise<{ cuentas: number[]; contactos: number[]; conversaciones: number[]; reuniones: number[] }>;
  eventosEnEtapa(campaignId: string, stage: ProspectStage, limite: number): Promise<ProspectEvent[]>;
  auditoria(limite: number): Promise<AuditEntry[]>;
  ultimaActividad(campaignId: string): Promise<{ agent: Agent; summary: string; at: string }[]>;
  pendientes(): Promise<{ borradores: { id: string; accountName: string; intent: ReplyIntent }[]; pasos: { prospectId: string; stepId: string; accountName: string; title: string }[] }>;
  reunionesPorSemana(ahora: Date, semanas: number): Promise<{ week: string; count: number }[]>;
  proximasReuniones(ahora: Date): Promise<{ id: string; accountName: string; contactName: string; start: string }[]>;
  aplazadosDesde(desde: Date): Promise<number>;
}
