/**
 * Retorno de Cognito tras «Continuar con Google» (spec 006). Si algo falla, Cognito
 * vuelve a la app con `?error=…&error_description=…`; aquí se traduce a un caso que
 * la interfaz sabe tratar. Sin dependencias para poder probarlo sin navegador.
 */

export type ErrorRetorno = "sin_acceso" | "reintentar" | "cancelado" | "google";

/** Lo lanza el trigger PreSignUp cuando el email de Google no está dado de alta. */
const SIN_ACCESO = "SIN_ACCESO";
/** Primer login tras enlazar la identidad: Cognito falla una vez y el segundo entra. */
const YA_ENLAZADA = "Already found an entry for username";

export function clasificarRetorno(search: string): ErrorRetorno | null {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (!error) return null;
  const descripcion = params.get("error_description") ?? "";
  if (descripcion.includes(SIN_ACCESO)) return "sin_acceso";
  if (descripcion.includes(YA_ENLAZADA)) return "reintentar";
  if (error === "access_denied") return "cancelado";
  return "google";
}

/** Mensaje para `/login`; `null` cuando no hay nada que decir (el usuario canceló). */
export function mensajeDeRetorno(error: string | null): string | null {
  switch (error) {
    case "sin_acceso":
      return "Tu cuenta de Google no tiene acceso a Jano. Pide a tu administrador que te dé de alta con ese email.";
    case "reintentar":
    case "google":
      return "No se ha podido entrar con Google. Prueba otra vez en un momento.";
    default:
      return null;
  }
}
