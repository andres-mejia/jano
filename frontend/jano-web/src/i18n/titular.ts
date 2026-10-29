/**
 * Datos del titular de la web (LSSI art. 10). Única fuente para el aviso
 * legal y las políticas. El titular es una persona física (autónomo) que
 * opera con el nombre comercial Tekhos. Un campo vacío no se muestra: sin
 * marcadores en la página.
 */
export interface Titular {
  /** Nombre completo de la persona física titular. */
  readonly nombre: string;
  /** Nombre comercial con el que opera. */
  readonly nombreComercial: string;
  readonly nif: string;
  readonly domicilio: string;
  /** Registro mercantil: no aplica a un autónomo, queda vacío y oculto. */
  readonly registro: string;
  readonly email: string;
  readonly web: string;
}

export const titular: Titular = {
  nombre: "Robinson Andrés Mejía Fernández",
  nombreComercial: "Tekhos",
  nif: "ES 16831970H",
  domicilio: "Paseo Rei en Jaume 5, 46130 Valencia",
  registro: "",
  email: "jano@tekhos.com",
  web: "https://tekhos.com",
};
