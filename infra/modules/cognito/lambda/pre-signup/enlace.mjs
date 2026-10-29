// Lógica del trigger PreSignUp (spec 006), sin SDK: el directorio de usuarios llega
// como puerto y `index.mjs` lo cablea con Cognito.
//
// Forma de fintrack/infra/modules/auth-triggers/lambda/pre-signup, pero cerrada: Jano
// es B2B con alta solo por administrador, así que Google solo enlaza con un usuario
// existente con el mismo email y nunca crea uno nuevo. Ante la duda (email sin
// verificar, usuario deshabilitado, error de AWS) se rechaza: falla cerrado.

export const SIN_ACCESO = "SIN_ACCESO";

// Estados de un usuario dado de alta por el administrador (no federado).
const ESTADOS_ENLAZABLES = new Set(["CONFIRMED", "FORCE_CHANGE_PASSWORD", "RESET_REQUIRED"]);

const log = (msg, meta = {}) => console.log(JSON.stringify({ msg, ...meta }));

/**
 * @param directorio.buscarPorEmail(userPoolId, email) -> [{ username, enabled, status }]
 * @param directorio.enlazar(userPoolId, proveedor, sujeto, destino)
 */
export function crearHandler({ directorio }) {
  return async (event) => {
    if (event.triggerSource !== "PreSignUp_ExternalProvider") return event;

    const { userPoolId, userName } = event;
    const attrs = event.request?.userAttributes ?? {};
    const email = (attrs.email ?? "").trim().toLowerCase();
    const [proveedor, ...resto] = userName.split("_");
    const sujeto = resto.join("_");

    if (!email || String(attrs.email_verified) !== "true" || !sujeto) {
      log("rechazado", { motivo: "email_no_verificado", proveedor });
      throw new Error(SIN_ACCESO);
    }

    const candidatos = (await directorio.buscarPorEmail(userPoolId, email)).filter(
      (u) => u.username !== userName && u.enabled && ESTADOS_ENLAZABLES.has(u.status),
    );
    if (candidatos.length !== 1) {
      log("rechazado", { motivo: candidatos.length ? "varios_usuarios" : "sin_alta", proveedor });
      throw new Error(SIN_ACCESO);
    }

    await directorio.enlazar(userPoolId, proveedor, sujeto, candidatos[0].username);
    log("enlazado", { proveedor, destino: candidatos[0].username });
    return event;
  };
}
