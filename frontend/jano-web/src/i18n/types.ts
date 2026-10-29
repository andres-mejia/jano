/** Forma de los diccionarios de la landing. es.ts y en.ts la cumplen entera. */

export interface TitledText {
  readonly title: string;
  readonly text: string;
}

export interface NavItem {
  /** id del ancla en la home de ese idioma. */
  readonly id: string;
  readonly label: string;
}

export interface Screen {
  /** Nombre del fichero en public/media/pantallas, sin extensión. */
  readonly file: string;
  readonly title: string;
  readonly caption: string;
  readonly alt: string;
}

export interface Dict {
  readonly meta: {
    readonly title: string;
    readonly description: string;
    readonly ogAlt: string;
  };
  readonly brand: {
    readonly tagline: string;
    readonly byline: string;
    readonly homeLabel: string;
  };
  readonly skip: string;
  readonly nav: {
    readonly label: string;
    readonly items: readonly NavItem[];
    readonly login: string;
    readonly cta: string;
    readonly language: string;
  };
  readonly hero: {
    readonly title: string;
    readonly lead: string;
    readonly videoLabel: string;
    readonly videoNote: string;
    readonly play: string;
    readonly pause: string;
    readonly aiLabel: string;
    readonly aiText: string;
  };
  readonly form: {
    readonly label: string;
    readonly placeholder: string;
    readonly submit: string;
    readonly sending: string;
    readonly success: string;
    readonly successDetail: string;
    readonly errorEmpty: string;
    readonly errorInvalid: string;
    readonly errorNetwork: string;
    readonly note: string;
  };
  readonly problems: {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
    readonly items: readonly TitledText[];
  };
  readonly flow: {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
    readonly orchestrator: TitledText;
    readonly agents: readonly TitledText[];
    readonly run: FlowRun;
    readonly note: string;
  };
  readonly screens: {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
    readonly regionLabel: string;
    readonly prev: string;
    readonly next: string;
    readonly pause: string;
    readonly play: string;
    /** Plantilla con {n} y {total}. */
    readonly slideLabel: string;
    readonly goTo: string;
    readonly roleCarousel: string;
    readonly roleSlide: string;
    readonly items: readonly Screen[];
  };
  readonly rules: {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
    readonly items: readonly TitledText[];
  };
  readonly faq: {
    readonly id: string;
    readonly title: string;
    readonly items: readonly { readonly q: string; readonly a: string }[];
  };
  readonly cta: {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
  };
  readonly footer: {
    readonly legalLabel: string;
    readonly links: {
      readonly privacy: string;
      readonly terms: string;
      readonly cookies: string;
      readonly notice: string;
    };
    readonly rights: string;
  };
  readonly notFound: {
    readonly title: string;
    readonly text: string;
    readonly back: string;
  };
  readonly legal: {
    readonly updated: string;
    readonly backHome: string;
  };
}

/** Quién ejecuta un paso del recorrido: un agente (decide la IA), el motor de reglas, la persona o el resultado. */
export type FlowOwner = "agent" | "engine" | "you" | "outcome";

/** Cómo acaba un paso: bien, retenido por una regla o detenido. */
export type FlowTone = "ok" | "hold" | "stop";

/** Recorrido animado de una empresa por el equipo de Jano. */
export interface FlowRun {
  readonly label: string;
  readonly orchestrator: string;
  /** Plantilla con {stage} y {task}. */
  readonly dispatch: string;
  readonly idle: string;
  readonly working: string;
  readonly pending: string;
  readonly feedTitle: string;
  readonly pause: string;
  readonly play: string;
  readonly owners: Readonly<Record<FlowOwner, string>>;
  readonly stages: readonly { readonly title: string; readonly owner: FlowOwner; readonly task: string }[];
  /** Cada escenario recorre los pasos en orden; si tiene menos pasos que etapas, se para en el último. */
  readonly scenarios: readonly {
    readonly company: string;
    readonly start: string;
    readonly steps: readonly { readonly status: string; readonly log: string; readonly tone?: FlowTone }[];
  }[];
}
