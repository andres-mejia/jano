// Trigger pre-token-generation V2 (plan 002, US3; V2 en la spec 007): copia
// `custom:tenant_id` y `custom:role` del usuario a los claims del ID token y del
// access token, como Fenora. No lee Aurora: entrar no depende de que despierte. El tenant viaja en el JWT y
// nunca se deduce del cuerpo de una petición (AGENTS.md §4), así que un usuario sin
// tenant o con un rol desconocido no recibe token: fallo temprano.

export const ROLES = Object.freeze(["owner", "member"]);

export function claimsDe(userAttributes = {}) {
  const tenantId = (userAttributes["custom:tenant_id"] ?? "").trim();
  const role = (userAttributes["custom:role"] ?? "").trim();
  if (!tenantId) throw new Error("usuario sin custom:tenant_id");
  if (!ROLES.includes(role)) throw new Error(`custom:role no válido: '${role}'`);
  return { "custom:tenant_id": tenantId, "custom:role": role };
}

export const handler = async (event) => {
  const claims = claimsDe(event.request?.userAttributes);
  event.response = {
    ...event.response,
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: { claimsToAddOrOverride: claims },
      accessTokenGeneration: { claimsToAddOrOverride: claims },
    },
  };
  return event;
};
