// Cableado del trigger PreSignUp con Cognito (SDK v3 del runtime nodejs22.x). La
// lógica vive en enlace.mjs.

import {
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { crearHandler } from "./enlace.mjs";

const cognito = new CognitoIdentityProviderClient({});

const directorio = {
  async buscarPorEmail(userPoolId, email) {
    const out = await cognito.send(
      new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email.replaceAll('"', "")}"`, Limit: 10 }),
    );
    return (out.Users ?? []).map((u) => ({ username: u.Username, enabled: u.Enabled, status: u.UserStatus }));
  },
  async enlazar(userPoolId, proveedor, sujeto, destino) {
    await cognito.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: userPoolId,
        SourceUser: { ProviderName: proveedor, ProviderAttributeName: "Cognito_Subject", ProviderAttributeValue: sujeto },
        DestinationUser: { ProviderName: "Cognito", ProviderAttributeValue: destino },
      }),
    );
  },
};

export const handler = crearHandler({ directorio });
