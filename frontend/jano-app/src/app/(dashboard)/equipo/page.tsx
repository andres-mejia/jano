"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem, Pill } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api/client";
import { jano } from "@/lib/api/jano";
import { useAuth } from "@/lib/auth/use-auth";
import { timeAgo } from "@/lib/format";
import type { TenantUser, TenantUserStatus } from "@jano/domain";

const ESTADO: Record<TenantUserStatus, { label: string; tone: "g" | "b" | "n" }> = {
  active: { label: "Activo", tone: "g" },
  invited: { label: "Invitado", tone: "b" },
  disabled: { label: "Desactivado", tone: "n" },
};

const mensaje = (e: unknown): string =>
  e instanceof ApiError && e.message && !e.message.startsWith("API ") ? e.message : "No se ha podido completar. Vuelve a intentarlo.";

/** Equipo del tenant (spec 007): solo el owner invita, desactiva, reactiva y reenvía. */
export default function TeamPage() {
  const auth = useAuth();
  const esOwner = auth.status === "ready" && auth.user.role === "owner";
  const qc = useQueryClient();
  const equipo = useQuery({ queryKey: ["team"], queryFn: jano.listTenantUsers, enabled: esOwner });
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["team"] });
  const invitar = useMutation({
    mutationFn: () => jano.inviteTenantUser({ email, ...(nombre.trim() ? { name: nombre.trim() } : {}) }),
    onSuccess: (u) => {
      setAviso({ tono: "ok", texto: `Invitación enviada a ${u.email}.` });
      setEmail("");
      setNombre("");
      void refrescar();
    },
    onError: (e) => setAviso({ tono: "error", texto: mensaje(e) }),
  });
  const accion = useMutation({
    mutationFn: ({ tipo, u }: { tipo: "disable" | "enable" | "resend"; u: TenantUser }) =>
      tipo === "disable" ? jano.disableTenantUser(u.userId) : tipo === "enable" ? jano.enableTenantUser(u.userId) : jano.resendTenantInvitation(u.userId),
    onSuccess: (u, { tipo }) => {
      const textos = { disable: "ya no puede entrar", enable: "vuelve a tener acceso", resend: "recibirá de nuevo la invitación" };
      setAviso({ tono: "ok", texto: `${u.name ?? u.email} ${textos[tipo]}.` });
      void refrescar();
    },
    onError: (e) => setAviso({ tono: "error", texto: mensaje(e) }),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setAviso(null);
    invitar.mutate();
  };

  if (auth.status === "ready" && !esOwner) {
    return (
      <>
        <Topbar title="Equipo" />
        <Card>Solo el responsable de la cuenta gestiona el equipo.</Card>
      </>
    );
  }

  const usuarios = equipo.data ?? [];
  const activos = usuarios.filter((u) => u.status === "active").length;

  return (
    <>
      <Topbar title="Equipo" subtitle="Quién de tu empresa entra en Jano" />
      <div className="flex flex-wrap gap-2">
        <Pill tone="g">
          <span className="tabular">{activos}</span> activos
        </Pill>
        {usuarios.some((u) => u.status === "invited") && (
          <Pill tone="b">
            <span className="tabular">{usuarios.filter((u) => u.status === "invited").length}</span> pendientes de entrar
          </Pill>
        )}
      </div>

      <Card title="Invitar a alguien">
        <form onSubmit={enviar} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[13px] font-semibold">
            Email de trabajo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@tuempresa.es"
              className="rounded-[10px] bg-jano-papel px-3 py-2 text-[14px] font-normal shadow-[inset_0_0_0_1px_var(--color-jano-linea)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-jano-cobalto)]"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[13px] font-semibold">
            Nombre (opcional)
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              className="rounded-[10px] bg-jano-papel px-3 py-2 text-[14px] font-normal shadow-[inset_0_0_0_1px_var(--color-jano-linea)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-jano-cobalto)]"
            />
          </label>
          <Button type="submit" disabled={invitar.isPending || !email}>
            {invitar.isPending ? "Enviando…" : "Enviar invitación"}
          </Button>
        </form>
        <p className="mt-2 text-[13px] text-jano-muted">
          Le llegará un correo con una contraseña temporal. Si usa Google con ese mismo email, puede entrar con «Continuar con Google».
        </p>
        {aviso && (
          <p role="status" className={aviso.tono === "ok" ? "mt-3 text-[13.5px] text-jano-verde-texto" : "mt-3 text-[13.5px] text-jano-rojo-texto"}>
            {aviso.texto}
          </p>
        )}
      </Card>

      <Card title="Personas">
        {equipo.isLoading && <p className="text-[13.5px] text-jano-muted">Cargando…</p>}
        {equipo.error && <p className="text-[13.5px] text-jano-rojo-texto">{mensaje(equipo.error)}</p>}
        <ul>
          {usuarios.map((u) => {
            const yo = auth.status === "ready" && u.email === auth.user.email.toLowerCase();
            return (
              <ListItem key={u.userId}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {u.name ?? u.email}
                    {yo && <span className="font-normal text-jano-muted"> · tú</span>}
                  </div>
                  <div className="truncate text-[13px] text-jano-muted">
                    {u.name ? `${u.email} · ` : ""}
                    {u.role === "owner" ? "Responsable" : "Equipo"} · desde {timeAgo(u.createdAt)}
                  </div>
                </div>
                <Pill tone={ESTADO[u.status].tone} className="ml-auto">
                  {ESTADO[u.status].label}
                </Pill>
                {u.role === "member" && (
                  <div className="flex shrink-0 gap-1.5">
                    {u.status === "invited" && (
                      <Button variant="ghost" size="sm" disabled={accion.isPending} onClick={() => accion.mutate({ tipo: "resend", u })}>
                        Reenviar
                      </Button>
                    )}
                    {u.status === "disabled" ? (
                      <Button variant="outline" size="sm" disabled={accion.isPending} onClick={() => accion.mutate({ tipo: "enable", u })}>
                        Reactivar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={accion.isPending} onClick={() => accion.mutate({ tipo: "disable", u })}>
                        Desactivar
                      </Button>
                    )}
                  </div>
                )}
              </ListItem>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
