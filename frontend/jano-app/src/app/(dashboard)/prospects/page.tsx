"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { DEMO_IDS } from "@jano/demo";
import { STAGE_LABEL, timeAgo } from "@/lib/format";
import type { ProspectStage } from "@jano/domain";

/**
 * Lista de prospects. El contrato del MVP no tiene un listado de prospects
 * propio: se proyecta desde los eventos por etapa de la campaña. Cuando el
 * backend exponga `GET /campaigns/{id}/prospects`, el contrato se actualiza
 * antes y esta página lo consume (AGENTS.md §4).
 */
export default function ProspectsPage() {
  const campaignId = DEMO_IDS.campaign;
  const flow = useQuery({ queryKey: ["flow", campaignId], queryFn: () => jano.getFlowMap(campaignId) });
  const stages: ProspectStage[] = (flow.data?.nodes ?? []).flatMap((n) => (n.stage === "icp" ? [] : [n.stage]));
  const events = useQuery({
    queryKey: ["stage-events-all", campaignId, stages],
    queryFn: async () => (await Promise.all(stages.map((s) => jano.listStageEvents(campaignId, s)))).flat(),
    enabled: stages.length > 0,
  });
  const seen = new Set<string>();
  const latest = (events.data ?? [])
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((e) => {
      if (seen.has(e.prospectId)) return false;
      seen.add(e.prospectId);
      return true;
    });

  // Etapa y empresa salen de la ficha de cada prospect, no del evento.
  const fichas = useQuery({
    queryKey: ["prospects-fichas", latest.map((e) => e.prospectId)],
    queryFn: async () => Object.fromEntries(await Promise.all(latest.map(async (e) => [e.prospectId, await jano.getProspect(e.prospectId)] as const))),
    enabled: latest.length > 0,
  });

  return (
    <>
      <Topbar title="Prospects" subtitle="Cada prospect es una cuenta con contacto dentro de una campaña" />
      <Card title="Con actividad reciente" action={<span className="text-sm font-normal text-jano-muted tabular">{latest.length} prospects</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-base">
            <thead>
              <tr className="text-left text-xs font-semibold text-jano-muted">
                <th className="pb-2 pr-3">Empresa</th>
                <th className="pb-2 pr-3">Etapa</th>
                <th className="pb-2 pr-3">Último paso</th>
                <th className="pb-2 text-right">Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((e) => {
                const [name, ...rest] = e.summary.split(":");
                const ficha = fichas.data?.[e.prospectId];
                return (
                  <tr key={e.prospectId} className="border-t border-jano-linea">
                    <td className="py-2.5 pr-3">
                      <Link href={`/prospects/${e.prospectId}` as "/prospects"} className="font-semibold hover:underline">
                        {ficha?.account.name ?? (rest.length ? name : "Ver prospect")}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-sm">{ficha ? STAGE_LABEL[ficha.prospect.stage] : "…"}</td>
                    <td className="py-2.5 pr-3 text-sm text-jano-muted">{rest.join(":").trim() || e.summary}</td>
                    <td className="whitespace-nowrap py-2.5 text-right text-sm text-jano-muted">{timeAgo(e.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {latest.length === 0 && <p className="py-6 text-center text-sm text-jano-muted">Todavía no hay prospects con actividad.</p>}
      </Card>
    </>
  );
}
