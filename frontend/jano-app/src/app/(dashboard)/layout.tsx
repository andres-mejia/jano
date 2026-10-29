"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Logo } from "@/components/ui/logo";
import { consumirErrorDeRetorno, reintentarGoogleUnaVez } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // El menú móvil se abre «en» una ruta: al navegar a otra, queda cerrado sin efectos.
  const [menuEn, setMenuEn] = useState<string | null>(null);
  const menu = menuEn === pathname;
  const setMenu = (abierto: boolean) => setMenuEn(abierto ? pathname : null);

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
    <div className="flex min-h-screen gap-3.5 p-3 lg:p-3.5">
      <Sidebar user={auth.user} />

      {/* Móvil: barra superior con el menú en un panel. */}
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-jano-tinta/40" onClick={() => setMenu(false)} />
          <div className="relative h-full w-[260px] shadow-2xl">
            <Sidebar user={auth.user} variant="drawer" />
            <button type="button" aria-label="Cerrar menú" onClick={() => setMenu(false)} className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-jano-tinta-2">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex items-center gap-3 lg:hidden">
          <button type="button" aria-label="Abrir menú" onClick={() => setMenu(true)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-jano-tinta text-white">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link href="/" className="font-display flex items-center gap-2 text-lg font-bold">
            <Logo size={24} left="var(--color-jano-cobalto)" right="var(--color-jano-bronce)" dots="var(--color-jano-papel)" />
            Jano
          </Link>
        </div>
        <main className="flex min-w-0 flex-1 flex-col gap-3.5">{children}</main>
      </div>
    </div>
  );
}
