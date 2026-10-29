"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { consumirErrorDeRetorno, reintentarGoogleUnaVez } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status !== "anonymous") return;
    // Si se llega aquí de vuelta de Google con un error, /login lo explica (spec 006).
    const error = consumirErrorDeRetorno();
    if (error === "reintentar") {
      void reintentarGoogleUnaVez().then((reintentado) => {
        if (!reintentado) router.replace("/login?error=google");
      });
      return;
    }
    router.replace(error ? `/login?error=${error}` : "/login");
  }, [auth.status, router]);

  if (auth.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center text-jano-muted" role="status">
        Abriendo la puerta…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen gap-3.5 p-3.5">
      <Sidebar user={auth.user} />
      <main className="flex min-w-0 flex-1 flex-col gap-3.5">{children}</main>
    </div>
  );
}
