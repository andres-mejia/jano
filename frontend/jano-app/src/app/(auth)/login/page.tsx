"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useSyncExternalStore } from "react";

import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { GoogleLogo } from "@/components/ui/google-logo";
import { mensajeDeRetorno } from "@/lib/auth/oauth-retorno";
import { signIn, signInWithGoogle } from "@/lib/auth/session";
import { ENV, isMockMode } from "@/lib/config/env";

const sinSuscripcion = () => () => {};
const leerErrorDeRetorno = () => mensajeDeRetorno(new URLSearchParams(window.location.search).get("error"));

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conGoogle = !isMockMode() && !!ENV.cognito.domain;

  // Error del retorno de Google (lo deja aquí el layout del dashboard). Se lee de la URL
  // en el cliente (en el servidor no hay mensaje) y deja de mostrarse al volver a intentar.
  const errorDeRetorno = useSyncExternalStore(sinSuscripcion, leerErrorDeRetorno, () => null);
  const [retornoVisto, setRetornoVisto] = useState(false);
  const aviso = error ?? (retornoVisto ? null : errorDeRetorno);

  async function onGoogle() {
    setRetornoVisto(true);
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError(mensajeDeRetorno("google"));
      setBusy(false);
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setRetornoVisto(true);
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col justify-between gap-6 bg-jano-tinta p-6 text-white lg:p-10">
        <div className="font-display flex items-center gap-3 text-3xl font-bold">
          <Logo size={40} />
          Jano
        </div>
        <div className="hidden lg:block">
          <h1 className="font-display text-4xl font-semibold leading-tight">Abre la puerta correcta.</h1>
          <p className="mt-4 max-w-md text-jano-nav-texto">La IA elige a quién escribir, cuándo y por qué canal. Tú apruebas lo que sale con tu nombre.</p>
        </div>
        {/* Solo en modo de ejemplo: en un entorno real, la pantalla de entrada no habla de infraestructura. */}
        {isMockMode() ? <p className="hidden text-sm text-jano-nav-muted lg:block">Modo de ejemplo, sin Cognito</p> : <span aria-hidden="true" />}
      </section>

      <section className="flex items-center justify-center p-5 lg:p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-jano-linea bg-jano-papel p-7">
          <h2 className="font-display text-2xl font-bold">Entrar</h2>
          <p className="mt-1 text-sm text-jano-muted">Con tu cuenta de empresa.</p>
          <label className="mt-6 block text-sm font-semibold">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-jano-linea px-3.5 py-2.5 text-base outline-none placeholder:text-jano-gris-medio focus:border-jano-cobalto focus:ring-2 focus:ring-jano-cobalto/25" />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Contraseña
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-jano-linea px-3.5 py-2.5 text-base outline-none placeholder:text-jano-gris-medio focus:border-jano-cobalto focus:ring-2 focus:ring-jano-cobalto/25" />
          </label>
          {aviso && (
            <p role="alert" className="mt-3 rounded-lg bg-jano-rojo-tinte p-3 text-sm text-jano-rojo-texto">
              {aviso}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          {conGoogle && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-jano-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-jano-linea" />o<span className="h-px flex-1 bg-jano-linea" />
              </div>
              <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onGoogle} className="w-full gap-2.5">
                <GoogleLogo />
                Continuar con Google
              </Button>
            </>
          )}
          {isMockMode() && <p className="mt-3 text-center text-xs text-jano-muted">En modo de ejemplo cualquier credencial entra.</p>}
        </form>
      </section>
    </main>
  );
}
