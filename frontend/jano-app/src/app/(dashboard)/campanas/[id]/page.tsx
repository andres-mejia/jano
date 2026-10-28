"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, DemoPill, Pill, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { formatRevenue } from "@/lib/format";
import type { Account, Icp } from "@jano/domain";
import { fitLevelFromScore } from "@jano/domain";

const SIGNAL_LABEL: Record<string, string> = {
  vacante_comercial: "Vacante comercial",
  nueva_oficina: "Nueva oficina",
  web_renovada: "Web renovada",
  cambio_administrador: "Cambio de administrador",
  ronda_financiacion: "Ronda de financiación",
  nuevo_producto: "Nuevo producto",
};

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex gap-1.5 rounded-[9px] border border-jano-cobalto-linea bg-jano-papel px-2.5 py-1 text-[12.5px]">
      <span className="text-jano-muted">{k}</span>
      <b>{v}</b>
    </span>
  );
}

function IcpChips({ icp }: { icp: Icp }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Chip k="Sector" v={icp.sector} />
        {icp.cnae.map((c) => (
          <Chip key={c} k="CNAE" v={c} />
        ))}
        <Chip k="País" v={icp.country === "ES" ? "España" : icp.country} />
        {icp.revenueMinEur !== null && <Chip k="Facturación" v={`> ${formatRevenue(icp.revenueMinEur)}`} />}
        {icp.regions.map((r) => (
          <Chip key={r} k="Región" v={r} />
        ))}
      </div>
      {icp.signals.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {icp.signals.map((s) => (
            <Chip key={s} k="Señal" v={SIGNAL_LABEL[s] ?? s} />
          ))}
        </div>
      )}
    </>
  );
}

function FitBar({ score }: { score: number }) {
  const level = fitLevelFromScore(score);
  const color = level === "alto" ? "bg-jano-verde" : level === "medio" ? "bg-jano-bronce" : "bg-[#9CA0BA]";
  return (
    <div className="flex items-center gap-2">
      <div className="h-[7px] w-16 rounded-full bg-jano-gris">
        <div className={clsx("h-[7px] rounded-full", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-[12.5px] tabular">{score}</span>
    </div>
  );
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => jano.getCampaign(id) });
  const turns = useQuery({ queryKey: ["icp", id], queryFn: () => jano.getIcpTurns(id) });
  const accounts = useQuery({ queryKey: ["accounts", id], queryFn: () => jano.listAccounts(id) });
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refine = useMutation({
    mutationFn: (t: string) => jano.refineIcp(id, t),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["icp", id] });
    },
  });
  const approve = useMutation({
    mutationFn: () => jano.approveAccounts(id, [...selected]),
    onSuccess: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["accounts", id] });
    },
  });
  const discard = useMutation({
    mutationFn: () => jano.discardAccounts(id, [...selected]),
    onSuccess: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["accounts", id] });
    },
  });

  function toggle(accountId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function onRefine(ev: FormEvent) {
    ev.preventDefault();
    if (text.trim().length < 2) return;
    refine.mutate(text.trim());
  }

  const c = campaign.data;
  const list: Account[] = accounts.data ?? [];

  return (
    <>
      <Topbar
        title={c ? `Campaña: ${c.name}` : "Campaña"}
        subtitle="De una frase a una lista de cuentas puntuadas"
        actions={
          c && (
            <Button variant="outline" onClick={() => void jano.setCampaignStatus(id, c.status === "active" ? "paused" : "active").then(() => qc.invalidateQueries({ queryKey: ["campaign", id] }))}>
              {c.status === "active" ? "Pausar campaña" : "Activar campaña"}
            </Button>
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 xl:flex-row">
        <Card ai className="flex w-full shrink-0 flex-col gap-3 xl:w-[380px]" title={<><Spark />Define tu cliente ideal</>}>
          {(turns.data ?? []).map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="max-w-[88%] self-end rounded-[16px_16px_4px_16px] bg-jano-tinta px-3.5 py-2.5 text-[14.5px] text-white">
                {t.text}
              </div>
            ) : (
              <div key={i} className="rounded-[16px_16px_16px_4px] bg-jano-cobalto-tinte px-3.5 py-3 text-[14.5px]">
                <div className={t.icp ? "mb-2" : ""}>{t.text}</div>
                {t.icp && <IcpChips icp={t.icp} />}
              </div>
            ),
          )}
          <form onSubmit={onRefine} className="mt-auto">
            {turns.data?.at(-1)?.suggestions.length ? (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {turns.data.at(-1)?.suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => refine.mutate(s)} className="rounded-full bg-jano-gris px-2.5 py-0.5 text-xs font-semibold text-jano-gris-texto hover:bg-jano-cobalto-tinte">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-xl bg-jano-niebla px-3 py-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ajusta el ICP…" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-jano-muted" aria-label="Ajusta el ICP" />
              <Button type="submit" size="sm" disabled={refine.isPending}>
                Enviar
              </Button>
            </div>
          </form>
        </Card>

        <Card className="flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[17px] font-bold">Cuentas encontradas</h2>
            <Pill tone="v">{c?.stats.accountsFound ?? list.length}</Pill>
            <DemoPill />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" disabled={selected.size === 0 || discard.isPending} onClick={() => discard.mutate()}>
                Descartar
              </Button>
              <Button disabled={selected.size === 0 || approve.isPending} onClick={() => approve.mutate()}>
                Aprobar y buscar contactos{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[14.5px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-jano-muted">
                  <th className="pb-2 pr-2" />
                  <th className="pb-2 pr-2.5">Empresa</th>
                  <th className="pb-2 pr-2.5">Facturación</th>
                  <th className="pb-2 pr-2.5">Fit</th>
                  <th className="pb-2 pr-2.5">Trigger detectado</th>
                  <th className="pb-2 pr-2.5">Fuente</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className={clsx("border-t border-jano-linea", a.status === "discarded" && "opacity-50")}>
                    <td className="py-2.5 pr-2">
                      <input type="checkbox" aria-label={`Seleccionar ${a.name}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 accent-jano-cobalto" />
                    </td>
                    <td className="py-2.5 pr-2.5">
                      <div className="font-semibold">{a.name}</div>
                      <div className="font-mono text-xs text-jano-muted">{a.domain}</div>
                    </td>
                    <td className="font-mono py-2.5 pr-2.5 tabular">{formatRevenue(a.revenueEur)}</td>
                    <td className="py-2.5 pr-2.5" title={a.fitReasoning}>
                      <FitBar score={a.fitScore} />
                    </td>
                    <td className="py-2.5 pr-2.5 text-[13.5px]">{a.trigger?.summary ?? <span className="text-jano-muted">Sin señal reciente</span>}</td>
                    <td className="py-2.5 pr-2.5 text-[13px] text-jano-muted">{[...new Set(a.fitEvidence.map((e) => e.source))].join(" + ")}</td>
                    <td className="py-2.5">
                      <Pill tone={a.status === "contacted" ? "v" : a.status === "discarded" ? "n" : a.status === "found" ? "b" : "g"}>
                        {{ found: "Por revisar", approved: "Aprobada", discarded: "Descartada", enriching: "Buscando contacto", contacted: "Contactada" }[a.status]}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-jano-cobalto-tinte px-3.5 py-2.5 text-[13.5px] text-jano-cobalto-oscuro">
            <Spark />
            Cada fit enlaza con la evidencia que ha leído la IA: registro, web y prensa. Pasa el ratón por la barra para ver el razonamiento.
          </div>
        </Card>
      </div>
    </>
  );
}
