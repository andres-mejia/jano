"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";

const STATUS_LABEL = { draft: "Borrador", active: "Activa", paused: "Pausada", finished: "Cerrada" } as const;

export default function CampaignsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: jano.listCampaigns });
  const [prompt, setPrompt] = useState("");
  const create = useMutation({
    mutationFn: () => jano.createCampaign({ prompt, meetingsGoal: 12 }),
    onSuccess: ({ campaign }) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(`/campanas/${campaign.id}` as "/campanas");
    },
  });

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (prompt.trim().length < 10) return;
    create.mutate();
  }

  return (
    <>
      <Topbar title="Campañas" subtitle="Cada campaña nace de una frase" />

      <Card title="Nueva campaña">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1.5 text-sm font-semibold">
            Describe tu cliente ideal
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Por ejemplo: agencias de viajes españolas que facturen más de 1 M€"
              className="rounded-lg border border-jano-linea px-3.5 py-2.5 text-base font-normal outline-none placeholder:text-jano-gris-medio focus:border-jano-cobalto focus:ring-2 focus:ring-jano-cobalto/25"
            />
          </label>
          <Button type="submit" size="lg" disabled={create.isPending || prompt.trim().length < 10}>
            {create.isPending ? "Estructurando el ICP…" : "Crear campaña"}
          </Button>
        </form>
        <p className="mt-2 text-sm text-jano-muted">Jano la convierte en un perfil de cliente que puedes corregir antes de que busque cuentas.</p>
        {create.isError && <p className="mt-2 text-sm text-jano-rojo-texto">No se ha podido crear la campaña.</p>}
      </Card>

      <Card title="Tus campañas">
        <ul>
          {(campaigns.data ?? []).map((c) => {
            return (
              <ListItem key={c.id}>
                <div className="min-w-0">
                  <Link href={`/campanas/${c.id}` as "/campanas"} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <div className="truncate text-sm text-jano-muted">{c.prompt}</div>
                </div>
                <div className="ml-auto hidden shrink-0 text-sm text-jano-muted tabular md:block">
                  {c.stats.accountsFound} cuentas · {c.stats.contacted} contactadas · {c.stats.meetings} de {c.meetingsGoal} reuniones
                </div>
                <span className="w-16 shrink-0 text-right text-sm font-semibold">{STATUS_LABEL[c.status]}</span>
              </ListItem>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
