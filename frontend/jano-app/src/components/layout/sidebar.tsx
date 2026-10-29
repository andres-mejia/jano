"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Activity, Inbox, LayoutGrid, Plug, ShieldCheck, Target, UserCog, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/ui/logo";
import { Dot } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api/client";
import { jano } from "@/lib/api/jano";
import { signOutAndRedirect, type SessionUser } from "@/lib/auth/session";
import { AGENT_LABEL } from "@/lib/format";

const NAV = [
  {
    section: "Visión",
    items: [
      { href: "/", label: "Centro de mando", icon: LayoutGrid },
      { href: "/flujo", label: "Mapa de flujo", icon: Workflow },
    ],
  },
  {
    section: "Trabajo",
    items: [
      { href: "/campanas", label: "Campañas", icon: Target },
      { href: "/prospects", label: "Prospects", icon: Users },
      { href: "/bandeja", label: "Bandeja", icon: Inbox, badge: true },
    ],
  },
  {
    section: "Control",
    items: [
      { href: "/cumplimiento", label: "Cumplimiento", icon: ShieldCheck },
      { href: "/conexiones", label: "Conexiones", icon: Plug },
      { href: "/equipo", label: "Equipo", icon: UserCog, soloOwner: true },
    ],
  },
] as const;

const STATUS_DOT = { working: "g", deciding: "c", waiting_human: "w", idle: "n" } as const;

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: jano.getDashboardSummary });
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: jano.listInbox });
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: jano.getCurrentTenant, staleTime: 5 * 60_000, retry: false });
  // Usuario desactivado o empresa suspendida (spec 007, FR-006): la API responde 403 y se cierra la sesión.
  const sinAcceso = tenant.error instanceof ApiError && tenant.error.status === 403;
  useEffect(() => {
    if (sinAcceso) void signOutAndRedirect();
  }, [sinAcceso]);
  const pendientes = inbox.data?.filter((i) => i.draft?.status === "pending_approval").length ?? 0;
  const initials = user.name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex w-[236px] shrink-0 flex-col rounded-[22px] bg-jano-tinta p-3.5 pt-5 text-jano-nav-texto">
      <Link href="/" className="font-display mb-2 flex items-center gap-2.5 px-2 text-[25px] font-bold text-white">
        <Logo size={30} />
        Jano
      </Link>

      <nav aria-label="Principal" className="flex flex-col">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-2.5 pb-1.5 pt-3.5 text-[11.5px] uppercase tracking-wider text-jano-nav-muted">{group.section}</div>
            {group.items.map((item) => {
              if ("soloOwner" in item && user.role !== "owner") return null;
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[14.5px] font-medium",
                    active ? "bg-jano-tinta-2 text-white shadow-[inset_0_0_0_1px_var(--color-jano-tinta-3)]" : "hover:bg-jano-tinta-2/60",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {item.label}
                  {"badge" in item && pendientes > 0 && (
                    <span className="ml-auto rounded-full bg-jano-bronce px-2 py-px text-[11.5px] font-bold text-jano-tinta tabular">{pendientes}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-[14px] bg-jano-tinta-2 p-3 text-[12.5px]">
        <div className="mb-2 flex justify-between font-semibold text-white">
          Agentes
          <span className="text-[#5EE0A8] tabular">{dashboard.data ? `${dashboard.data.agents.length} activos` : "…"}</span>
        </div>
        {(dashboard.data?.agents ?? []).map((a) => (
          <div key={a.agent} className="flex items-center gap-2 py-[3px]">
            <Dot tone={STATUS_DOT[a.status]} />
            <Activity className="hidden" aria-hidden="true" />
            {AGENT_LABEL[a.agent]}
            {a.status === "waiting_human" && <span className="text-jano-nav-muted">· te espera</span>}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl p-2">
        {user.picture ? (
          // Avatar de Google (lh3.googleusercontent.com): sin referrer, que Google a veces rechaza.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-jano-cobalto-claro),var(--color-jano-bronce))] text-[13px] font-bold text-white">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
          <div className="truncate text-xs">
            {tenant.data?.name ?? "…"} · {user.role === "owner" ? "Responsable" : "Equipo"}
          </div>
        </div>
      </div>
    </aside>
  );
}
