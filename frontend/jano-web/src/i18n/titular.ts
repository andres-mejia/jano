/**
 * Datos del titular de la web (LSSI art. 10). Única fuente para el aviso
 * legal y las políticas. Un campo vacío no se muestra: se rellenan cuando
 * Tekhos los confirme, sin poner marcadores en la página.
 */
export interface Titular {
  readonly razonSocial: string;
  readonly nif: string;
  readonly domicilio: string;
  readonly registro: string;
  readonly email: string;
  readonly web: string;
}

export const titular: Titular = {
  razonSocial: "Tekhos",
  nif: "",
  domicilio: "",
  registro: "",
  email: "jano@tekhos.com",
  web: "https://tekhos.com",
};
