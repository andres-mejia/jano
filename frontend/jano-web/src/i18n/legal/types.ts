import type { LegalKey } from "../routes";

export interface LegalSection {
  readonly heading: string;
  /** Párrafos en HTML de confianza (texto propio, sin datos de usuario). */
  readonly body: readonly string[];
  /** Si es true, antes del cuerpo se pintan los datos de `titular.ts` que tengan valor. */
  readonly holder?: boolean;
}

export interface LegalDoc {
  readonly title: string;
  readonly description: string;
  readonly sections: readonly LegalSection[];
}

export interface LegalSet {
  readonly docs: Record<LegalKey, LegalDoc>;
  readonly holderLabels: {
    readonly nombre: string;
    readonly nombreComercial: string;
    readonly nif: string;
    readonly domicilio: string;
    readonly registro: string;
    readonly email: string;
    readonly web: string;
  };
}
