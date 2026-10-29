/**
 * Datos del titular de la web (LSSI art. 10). Única fuente para el aviso
 * legal y las políticas. Un campo vacío no se muestra: se rellenan cuando
 * Tekhos los confirme, sin poner marcadores en la página.
 */
export interface Titular {
  /** Nombre con el que se presenta el titular en los textos. */
  readonly nombre: string;
  /** Razón social completa, si difiere del nombre. */
  readonly razonSocial: string;
  readonly nif: string;
  readonly domicilio: string;
  readonly registro: string;
  readonly email: string;
  readonly web: string;
}

export const titular: Titular = {
  nombre: "Tekhos",
  razonSocial: "",
  nif: "ES 16831970H",
  domicilio: "Paseo Rei en Jaume 5, 46130 Valencia",
  registro: "",
  email: "jano@tekhos.com",
  web: "https://tekhos.com",
};
