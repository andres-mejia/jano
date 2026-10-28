/**
 * Sesión Cognito: una sola capa para token, usuario y cierre de sesión.
 * Amplify se importa dinámicamente para que el bundle de modo mock no lo
 * cargue.
 */

import { isMockMode } from "@/lib/config/env";
import { buildAmplifyConfig, isAmplifyConfigured } from "./amplify-config";

export interface SessionUser {
  readonly email: string;
  readonly name: string;
  readonly tenantId: string;
  readonly role: "owner" | "member";
}

const MOCK_USER: SessionUser = {
  email: "lucia@rumbonorte.example",
  name: "Lucía Marín",
  tenantId: "tenant-demo",
  role: "owner",
};

let configured = false;

async function ensureAmplify(): Promise<void> {
  if (configured || !isAmplifyConfigured()) return;
  const { Amplify } = await import("aws-amplify");
  Amplify.configure(buildAmplifyConfig(), { ssr: false });
  configured = true;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (isMockMode()) return null;
  try {
    await ensureAmplify();
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession({ forceRefresh });
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (isMockMode()) return MOCK_USER;
  try {
    await ensureAmplify();
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession();
    const payload = session.tokens?.idToken?.payload;
    if (!payload) return null;
    const str = (k: string): string => (typeof payload[k] === "string" ? (payload[k] as string) : "");
    return {
      email: str("email"),
      name: str("name") || str("email"),
      tenantId: str("custom:tenant_id"),
      role: str("custom:role") === "owner" ? "owner" : "member",
    };
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  if (isMockMode()) return;
  await ensureAmplify();
  const auth = await import("aws-amplify/auth");
  const result = await auth.signIn({
    username: email,
    password,
    options: { authFlowType: "USER_AUTH", preferredChallenge: "PASSWORD_SRP" },
  });
  if (!result.isSignedIn) {
    throw new Error(`Inicio de sesión incompleto: ${result.nextStep.signInStep}`);
  }
}

let signOutInFlight = false;

export async function signOutAndRedirect(): Promise<void> {
  if (signOutInFlight) return;
  signOutInFlight = true;
  try {
    if (!isMockMode()) {
      await ensureAmplify();
      const { signOut } = await import("aws-amplify/auth");
      await signOut().catch(() => undefined);
    }
  } finally {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // Recarga completa a propósito: vacía el estado de Amplify y de react-query.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
    signOutInFlight = false;
  }
}
