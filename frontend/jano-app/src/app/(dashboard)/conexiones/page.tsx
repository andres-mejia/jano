"use client";

import { useQuery } from "@tanstack/react-query";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem, Pill } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { timeAgo } from "@/lib/format";
import type { ConnectionStatus } from "@jano/domain";

const STATUS: Record<ConnectionStatus, { label: string; tone: "g" | "r" | "n" }> = {
  connected: { label: "Conectado", tone: "g" },
  error: { label: "Reconectar", tone: "r" },
  not_configured: { label: "Sin configurar", tone: "n" },
};

export default function ConnectionsPage() {
  const q = useQuery({ queryKey: ["connections"], queryFn: jano.listConnections });
  const items = q.data ?? [];
  const connected = items.filter((c) => c.status === "connected").length;

  return (
    <>
      <Topbar title="Conexiones" subtitle="De dónde sale cada dato y si está llegando" actions={<Button>Añadir conexión</Button>} />
      <div className="flex flex-wrap gap-2">
        <Pill tone="g">{connected} conectadas</Pill>
        {items.some((c) => c.status === "error") && <Pill tone="r">{items.filter((c) => c.status === "error").length} con error</Pill>}
        {items.some((c) => c.status === "not_configured") && <Pill tone="n">{items.filter((c) => c.status === "not_configured").length} sin configurar</Pill>}
      </div>
      <Card title="Estado" action={<span className="text-[13px] font-normal text-jano-muted">Las credenciales viven en Secrets Manager; el modelo nunca las ve</span>}>
        <ul>
          {items.map((c) => (
            <ListItem key={c.kind}>
              <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-jano-tinta text-sm font-bold text-white">{c.name.charAt(0)}</span>
              <div className="min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="truncate text-[13px] text-jano-muted">{c.detail}</div>
              </div>
              <span className="font-mono ml-auto hidden shrink-0 text-xs text-jano-muted sm:block">{c.lastCheckedAt ? timeAgo(c.lastCheckedAt) : ""}</span>
              <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
            </ListItem>
          ))}
        </ul>
      </Card>
    </>
  );
}
