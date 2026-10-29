// Lógica del formulario de acceso anticipado (spec 002, US2), sin SDK: el almacén
// y el correo llegan como puertos y `index.mjs` los cablea con DynamoDB y SES.
//
// POST { email, locale?, empresa? }:
//   201  alta nueva: se guarda, se confirma al usuario y se avisa a `notify`
//   409  el email ya estaba: no se reenvía nada
//   429  más de `rateLimitPerHour` peticiones de la misma IP en la hora
//   400  JSON o email no válidos
// `empresa` es el honeypot del formulario: con contenido se responde 201 sin
// guardar ni enviar nada.

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normalizarEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

const respuesta = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const log = (level, msg, meta = {}) => console.log(JSON.stringify({ level, msg, ...meta }));

/**
 * @param almacen.guardarSiNoExiste(item) -> true si lo guardó, false si ya existía
 * @param almacen.contarPeticion(clave, ttlEpoch) -> número de peticiones con esa clave
 * @param correo.enviar({ to, subject, text, tipo })
 */
export function crearHandler({ almacen, correo, config, ahora = () => new Date() }) {
  const { notify, siteUrl, rateLimitPerHour } = config;

  async function dentroDelLimite(ip) {
    if (!ip) return true;
    const t = ahora().getTime();
    const n = await almacen.contarPeticion(`rate#${ip}#${Math.floor(t / 3_600_000)}`, Math.floor(t / 1000) + 3660);
    return n <= rateLimitPerHour;
  }

  return async (event) => {
    const method = event.requestContext?.http?.method ?? "GET";
    if (method !== "POST") return respuesta(405, { ok: false, error: "method_not_allowed" });

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respuesta(400, { ok: false, error: "invalid_json" });
    }

    if (typeof body.empresa === "string" && body.empresa.trim()) {
      log("INFO", "honeypot");
      return respuesta(201, { ok: true });
    }

    const email = normalizarEmail(body.email);
    if (!email) return respuesta(400, { ok: false, error: "invalid_email" });

    if (!(await dentroDelLimite(event.requestContext?.http?.sourceIp))) {
      log("WARN", "rate_limited");
      return respuesta(429, { ok: false, error: "rate_limited" });
    }

    const locale = String(body.locale ?? "es").slice(0, 5);
    const source = String(event.headers?.["x-jano-source"] ?? "landing").slice(0, 30);
    const nuevo = await almacen.guardarSiNoExiste({ email, partition: "waitlist", created_at: ahora().toISOString(), locale, source });
    if (!nuevo) return respuesta(409, { ok: false, error: "already_registered" });

    // El alta ya está guardada: un fallo de SES se registra y no tumba la respuesta.
    try {
      await correo.enviar({
        to: email,
        subject: "Estás en la lista de Jano",
        text: `Hola:\n\nGracias por pedir acceso a Jano. Te escribiremos cuando abramos plazas; mientras tanto no recibirás nada más.\n\nJano\n${siteUrl}`,
        tipo: "waitlist-confirmation",
      });
      if (notify) {
        await correo.enviar({
          to: notify,
          subject: `Nueva alta en la waitlist de Jano (${source})`,
          text: `Alta: ${email}\nOrigen: ${source}\nIdioma: ${locale}`,
          tipo: "waitlist-notify",
        });
      }
    } catch (err) {
      log("ERROR", "ses_send_failed", { error: err.message });
    }
    return respuesta(201, { ok: true });
  };
}
