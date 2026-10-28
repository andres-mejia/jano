import type { ResourcesConfig } from "aws-amplify";

import { ENV, isMockMode } from "@/lib/config/env";

/**
 * Configuración de Amplify Auth para Cognito. Flow USER_AUTH (email +
 * password, con passkeys y OTP disponibles sin cambiar de flow). En modo
 * mock no se configura nada y `useAuth` devuelve un usuario de ejemplo.
 */
export function isAmplifyConfigured(): boolean {
  return !isMockMode() && !!ENV.cognito.userPoolId && !!ENV.cognito.clientId;
}

export function buildAmplifyConfig(): ResourcesConfig {
  const { userPoolId, clientId, domain } = ENV.cognito;
  if (!userPoolId || !clientId) return {};
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        loginWith: {
          email: true,
          ...(domain
            ? {
                oauth: {
                  domain,
                  scopes: ["openid", "email", "profile"],
                  redirectSignIn: [`${origin}/`],
                  redirectSignOut: [`${origin}/login`],
                  responseType: "code" as const,
                },
              }
            : {}),
        },
        signUpVerificationMethod: "code",
      },
    },
  };
}
