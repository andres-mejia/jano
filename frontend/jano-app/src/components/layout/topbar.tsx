"use client";

import { Bell, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { Dot, Spark } from "@/components/ui/primitives";
import { signOutAndRedirect } from "@/lib/auth/session";

export function Topbar({ title, subtitle, actions, autopilot = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; autopilot?: boolean }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3.5">
      <div className="min-w-0">
        <h1 className="font-display truncate text-[27px] font-bold leading-tight">{title}</h1>
        {subtitle && <div className="truncate text-[13.5px] text-jano-muted">{subtitle}</div>}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        {actions}
        <label className="hidden items-center gap-2.5 rounded-full bg-jano-papel px-4 py-2.5 text-jano-muted shadow-[0_0_0_1.5px_#d9d6fa,0_6px_18px_rgba(67,56,214,0.10)] lg:flex">
          <Spark />
          <input type="search" placeholder="Pide algo a Jano…" className="w-56 bg-transparent text-[14.5px] outline-none placeholder:text-jano-muted" aria-label="Pide algo a Jano" />
          <kbd className="font-mono rounded-md bg-jano-niebla px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
        </label>
        <span className="flex items-center gap-2 rounded-full bg-jano-tinta px-4 py-2.5 text-[13px] font-semibold text-white">
          <Dot tone={autopilot ? "c" : "w"} />
          {autopilot ? "Piloto automático" : "Tú apruebas"}
        </span>
        <button type="button" aria-label="Avisos" className="flex h-10 w-10 items-center justify-center rounded-full bg-jano-papel">
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Cerrar sesión" onClick={() => void signOutAndRedirect()} className="flex h-10 w-10 items-center justify-center rounded-full bg-jano-papel">
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
