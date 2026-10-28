"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem, Pill, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";

const STATUS_LABEL = { draft: ["Borrador", "n"], active: ["Activa", "g"], paused: ["Pausada", "b"], finished: ["Cerrada", "n"] } as const;

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

      <Card ai title={<><Spark />Nueva campaña</>}>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1.5 text-sm font-semibold">
            Describe tu cliente ideal
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Encuentra empresas españolas del sector agencia de viajes con facturación superior a 1 M€"
              className="rounded-[10px] border border-jano-linea px-3.5 py-2.5 text-[15px] font-normal outline-none focus:border-jano-cobalto focus:ring-2 focus:ring-jano-cobalto/25"
            />
          </label>
          <Button type="submit" size="lg" disabled={create.isPending || prompt.trim().length < 10}>
            {create.isPending ? "Estructurando el ICP…" : "Crear campaña"}
          </Button>
        </form>
        {create.isError && <p className="mt-2 text-sm text-jano-rojo-texto">No se ha podido crear la campaña.</p>}
      </Card>

      <Card title="Tus campañas">
        <ul>
          {(campaigns.data ?? []).map((c) => {
            const [label, tone] = STATUS_LABEL[c.status];
            return (
              <ListItem key={c.id}>
                <div className="min-w-0">
                  <Link href={`/campanas/${c.id}` as "/campanas"} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <div className="truncate text-[13px] text-jano-muted">{c.prompt}</div>
                </div>
                <div className="font-mono ml-auto hidden shrink-0 text-xs text-jano-muted tabular md:block">
                  {c.stats.accountsFound} cuentas · {c.stats.contacted} contactadas · {c.stats.meetings}/{c.meetingsGoal} reuniones
                </div>
                <Pill tone={tone}>{label}</Pill>
              </ListItem>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
