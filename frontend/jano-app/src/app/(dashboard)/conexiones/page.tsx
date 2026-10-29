"use client";

import { useQuery } from "@tanstack/react-query";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { timeAgo } from "@/lib/format";


export default function ConnectionsPage() {
  const q = useQuery({ queryKey: ["connections"], queryFn: jano.listConnections });
  const items = q.data ?? [];
  const connected = items.filter((c) => c.status === "connected").length;

  const conError = items.filter((c) => c.status === "error").length;
  const sinConfigurar = items.filter((c) => c.status === "not_configured").length;

  return (
    <>
      <Topbar title="Conexiones" subtitle="De dónde sale cada dato y si está llegando" />
      <Card
        title="Fuentes y canales"
        action={
          <span className="text-sm font-normal text-jano-muted tabular">
            {connected} conectadas{conError ? ` · ${conError} con error` : ""}
            {sinConfigurar ? ` · ${sinConfigurar} sin configurar` : ""}
          </span>
        }
      >
        <ul>
          {items.map((c) => (
            <ListItem key={c.kind}>
              <div className="min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="truncate text-sm text-jano-muted">{c.detail}</div>
              </div>
              <span className="ml-auto hidden shrink-0 text-sm text-jano-muted sm:block">{c.lastCheckedAt ? `Comprobado ${timeAgo(c.lastCheckedAt)}` : ""}</span>
              {c.status === "connected" ? (
                <span className="w-28 shrink-0 text-right text-sm font-semibold text-jano-verde-texto">Conectado</span>
              ) : c.status === "error" ? (
                <Button size="sm" variant="outline" className="w-28 shrink-0">
                  Reconectar
                </Button>
              ) : (
                <span className="w-28 shrink-0 text-right text-sm text-jano-muted">Sin configurar</span>
              )}
            </ListItem>
          ))}
        </ul>
        <p className="mt-3 text-sm text-jano-muted">Las credenciales viven en AWS Secrets Manager; ni la app ni el modelo de IA las ven.</p>
      </Card>
    </>
  );
}
