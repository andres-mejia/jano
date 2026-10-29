import type {
  Account,
  Evidence,
  Icp,
  MeetingSlot,
  ProspectStage,
  RegenerateDraft,
  ReplyIntent,
  SequenceKind,
  Trigger,
} from "@jano/domain";

import type { EmpresaCandidata, EnlaceInterno, PaginaLeida } from "./web";

/**
 * Los agentes (ADR-002, spec 008 FR-010, FR-012): proponen con razonamiento y
 * evidencia; no envían, no reservan, no escriben. Lo que devuelven lo valida y lo
 * ejecuta el motor. Dos adaptadores: `Bedrock*` (fase B) y `Deterministic*`
 * (tests, CI y entornos sin Bedrock).
 */

/** Orquestador: de una frase a un ICP, y una corrección por turno. */
export interface PropuestaIcp {
  readonly icp: Icp;
  /** Respuesta del turno, para la persona. */
  readonly texto: string;
  readonly sugerencias: readonly string[];
}

export interface IcpStructurer {
  estructurar(frase: string): Promise<PropuestaIcp & { readonly nombre: string }>;
  /** Cambia solo lo que pide la instrucción. */
  afinar(actual: Icp, instruccion: string): Promise<PropuestaIcp>;
}

/** Account Finder: encaje 0-100 con razonamiento y la evidencia leída. */
export interface Puntuacion {
  readonly fitScore: number;
  readonly razonamiento: string;
  readonly evidencia: readonly Evidence[];
  /** Señal de compra solo si la web la muestra con fecha. */
  readonly senal: Trigger | null;
}

export interface AccountScorer {
  puntuar(entrada: { icp: Icp; empresa: EmpresaCandidata; paginas: readonly PaginaLeida[] }): Promise<Puntuacion>;
}

/**
 * Account Finder, antes de puntuar: de los enlaces de la portada, qué páginas
 * internas leer (empleo, noticias, quiénes somos, oficinas) para juzgar el encaje
 * y ver señales de compra. Solo elige entre los enlaces que recibe; el lector
 * descarta cualquier otra URL.
 */
export interface SelectorDeEnlaces {
  elegir(entrada: {
    dominio: string;
    portada: { readonly titulo: string | null; readonly texto: string };
    enlaces: readonly EnlaceInterno[];
    maximo: number;
  }): Promise<readonly string[]>;
}

/** Contact Finder: un cargo y por qué; nunca el nombre ni el email de una persona real (FR-015). */
export interface PropuestaContacto {
  readonly cargo: string;
  readonly motivo: string;
  readonly evidencia: readonly string[];
}

export interface ContactResolver {
  proponer(entrada: { cuenta: Account }): Promise<PropuestaContacto>;
}

export interface BorradorPaso {
  readonly asunto: string;
  readonly cuerpo: string;
  readonly razonamiento: string;
}

export interface BorradorRespuesta {
  readonly asunto: string;
  readonly cuerpo: string;
  readonly confianza: "alta" | "media" | "baja";
}

export interface Destinatario {
  readonly nombre: string;
  readonly cargo: string;
}

/**
 * Outreach y la redacción de Response: redacta pasos y contestaciones. Qué rama y
 * cuándo lo propone el Orquestador; este puerto solo escribe.
 */
export interface DraftWriter {
  redactarPaso(entrada: {
    cuenta: Account;
    contacto: Destinatario;
    paso: { readonly titulo: string; readonly intencion: string; readonly dia: number; readonly rama: SequenceKind };
  }): Promise<BorradorPaso>;
  redactarRespuesta(entrada: {
    cuenta: Account;
    contacto: Destinatario;
    respuesta: string;
    intent: ReplyIntent;
    huecos: readonly MeetingSlot[];
    tono: RegenerateDraft["tone"] | null;
  }): Promise<BorradorRespuesta>;
}

/** Response: intención de una respuesta entrante. */
export interface ReplyClassifier {
  clasificar(entrada: { texto: string }): Promise<{ readonly intent: ReplyIntent; readonly razonamiento: string }>;
}

/**
 * Orquestador como planificador: en cada punto de decisión propone UNA acción de
 * un menú cerrado, derivado de la etapa del prospect y de PROSPECT_TRANSITIONS
 * (`domain/motor/orquestador.ts`). El motor valida la propuesta, aplica las reglas
 * fijas y ejecuta; el modelo nunca ejecuta (ADR-002).
 */
export type PuntoDeDecision = "cuenta_aprobada" | "paso_vencido" | "respuesta_clasificada" | "senal_nueva";

export type AccionOrquestador =
  | { readonly tipo: "planificar_secuencia"; readonly kind: SequenceKind }
  | { readonly tipo: "cambiar_rama"; readonly to: SequenceKind }
  | { readonly tipo: "esperar_hasta"; readonly at: string }
  | { readonly tipo: "pedir_borrador"; readonly stepId: string }
  | { readonly tipo: "detener"; readonly motivo: string }
  | { readonly tipo: "escalar_a_humano"; readonly motivo: string }
  | { readonly tipo: "descartar"; readonly motivo: string };

export type TipoDeAccion = AccionOrquestador["tipo"];

export interface PropuestaOrquestador {
  readonly accion: AccionOrquestador;
  readonly razonamiento: string;
  readonly evidencia: readonly string[];
}

export interface ContextoOrquestador {
  readonly punto: PuntoDeDecision;
  readonly ahora: string;
  /** Duración de un «día» de secuencia (DEMO_DAY_MINUTES), para proponer esperas. */
  readonly minutosPorDia: number;
  readonly etapa: ProspectStage;
  readonly rama: SequenceKind | null;
  readonly cambiadaDe: SequenceKind | null;
  readonly cuenta: Account;
  /** Paso vencido que motiva la decisión (`paso_vencido`, `senal_nueva`). */
  readonly paso: { readonly id: string; readonly titulo: string; readonly dia: number } | null;
  readonly enviados: number;
  /** Intención de la respuesta (`respuesta_clasificada`). */
  readonly intent: ReplyIntent | null;
  /** Lo único que puede proponer: el motor rechaza lo demás. */
  readonly menu: readonly TipoDeAccion[];
}

/** Lo que el Orquestador lee de una campaña: el flujo proyectado del registro. */
export interface ResumenCampana {
  readonly campaignName: string;
  /** Prospects que están ahora en cada etapa. */
  readonly actuales: Readonly<Partial<Record<ProspectStage, number>>>;
  readonly cuentasEncontradas: number;
  readonly aplazadosHoy: number;
}

export interface RevisionCampana {
  readonly lectura: string;
  readonly cuello: ProspectStage | null;
  /** Una sugerencia para la persona; se guarda y se muestra, no se ejecuta. */
  readonly propuesta: { readonly texto: string; readonly efecto: string } | null;
}

export interface PlanificadorOrquestador {
  proponerSiguienteAccion(contexto: ContextoOrquestador): Promise<PropuestaOrquestador>;
  revisarCampana(resumen: ResumenCampana): Promise<RevisionCampana>;
}

export interface Agentes {
  readonly orquestador: PlanificadorOrquestador;
  readonly icp: IcpStructurer;
  readonly cuentas: AccountScorer;
  readonly enlaces: SelectorDeEnlaces;
  readonly contactos: ContactResolver;
  readonly redactor: DraftWriter;
  readonly respuestas: ReplyClassifier;
}
