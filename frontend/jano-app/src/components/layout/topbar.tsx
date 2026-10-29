"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Dot } from "@/components/ui/primitives";
import { signOutAndRedirect } from "@/lib/auth/session";

export function Topbar({ title, subtitle, actions, autopilot = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; autopilot?: boolean }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3.5">
      <div className="min-w-0">
        <h1 className="font-display truncate text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {subtitle && <div className="truncate text-sm text-jano-muted">{subtitle}</div>}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        {actions}
        {/* Estado de la autonomía, no un botón: enlaza a donde se cambia. */}
        <Link href="/cumplimiento" className="hidden items-center gap-2 text-sm font-semibold text-jano-muted hover:text-jano-tinta sm:flex" title="Cambiar en Cumplimiento">
          <Dot tone={autopilot ? "c" : "w"} />
          {autopilot ? "Piloto automático" : "Tú apruebas cada mensaje"}
        </Link>
        <button type="button" aria-label="Cerrar sesión" onClick={() => void signOutAndRedirect()} className="flex h-10 w-10 items-center justify-center rounded-full bg-jano-papel hover:bg-jano-gris">
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
