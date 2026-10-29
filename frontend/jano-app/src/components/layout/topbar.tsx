"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Dot, Spark } from "@/components/ui/primitives";
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
        <label className="hidden items-center gap-2.5 rounded-full bg-jano-papel px-4 py-2.5 text-jano-muted shadow-[0_0_0_1.5px_var(--color-jano-cobalto-linea)] lg:flex">
          <Spark />
          <input type="search" placeholder="Pide algo a Jano…" className="w-56 bg-transparent text-base outline-none placeholder:text-jano-muted" aria-label="Pide algo a Jano" />
          <kbd className="font-mono rounded-md bg-jano-niebla px-1.5 py-0.5 text-xs">Ctrl K</kbd>
        </label>
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
