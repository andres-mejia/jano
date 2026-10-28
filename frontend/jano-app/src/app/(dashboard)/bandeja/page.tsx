"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem, Pill, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { INTENT_LABEL, formatShortDate } from "@/lib/format";
import type { ApprovalEffect, InboxItem, ReplyIntent } from "@jano/domain";

const INTENT_TONE: Record<ReplyIntent, "g" | "b" | "n" | "r"> = {
  interest: "g",
  objection: "b",
  not_now: "n",
  out_of_office: "n",
  opt_out: "r",
  wrong_person: "n",
  other: "n",
};

const EFFECT_LABEL: Record<ApprovalEffect, [string, string]> = {
  send_reply: ["Enviar la respuesta", "Desde tu buzón de Microsoft 365"],
  hold_slots: ["Reservar los huecos", "Se liberan al confirmar uno"],
  create_opportunity: ["Crear la oportunidad", "En tu CRM o en el Excel"],
  stop_sequence: ["Detener la secuencia", "Sin más seguimientos"],
  add_to_suppression: ["Añadir a la lista de supresión", "No se le volverá a escribir"],
  schedule_follow_up: ["Programar el seguimiento", "En la fecha que pidió"],
};

function InboxView() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: jano.listInbox });
  const [selectedId, setSelectedId] = useState<string | null>(params.get("item"));
  // La edición va ligada al elemento: cambiar de elemento la descarta sin efectos.
  const [editingState, setEditingState] = useState<{ id: string; body: string } | null>(null);

  const items: InboxItem[] = inbox.data ?? [];
  const item = items.find((i) => i.id === selectedId) ?? items[0];
  const editing = editingState && editingState.id === item?.id ? editingState.body : null;
  const setEditing = (body: string | null) => setEditingState(body === null || !item ? null : { id: item.id, body });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["inbox"] });
  const approve = useMutation({ mutationFn: (i: InboxItem) => jano.approveDraft(i.id, editing !== null ? { body: editing } : {}), onSuccess: refresh });
  const discard = useMutation({ mutationFn: (i: InboxItem) => jano.discardDraft(i.id), onSuccess: refresh });
  const regenerate = useMutation({ mutationFn: (i: InboxItem) => jano.regenerateDraft(i.id, { tone: "otra_propuesta" }), onSuccess: refresh });

  const counts = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.intent]: (acc[i.intent] ?? 0) + 1 }), {});
  const total = Math.max(items.length, 1);
  const pending = items.filter((i) => i.draft?.status === "pending_approval").length;

  return (
    <>
      <Topbar title="Bandeja" subtitle="La IA clasifica y redacta. Tú decides qué sale." />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 xl:flex-row">
        <Card className="w-full shrink-0 xl:w-[310px]" title="Respuestas" action={pending > 0 && <Pill tone="b">{pending} nuevas</Pill>}>
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  className={clsx(
                    "flex w-full flex-col gap-1.5 rounded-[13px] px-3 py-2.5 text-left",
                    item?.id === i.id ? "bg-jano-cobalto-tinte shadow-[inset_0_0_0_1.5px_var(--color-jano-cobalto-linea)]" : "shadow-[inset_0_0_0_1px_var(--color-jano-linea)]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-[14.5px]">{i.accountName}</b>
                    <Pill tone={INTENT_TONE[i.intent]}>{INTENT_LABEL[i.intent]}</Pill>
                  </span>
                  <span className="line-clamp-2 text-[13px] text-jano-muted">{i.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex min-w-0 flex-1 flex-col gap-3">
          {!item ? (
            <p className="py-10 text-center text-sm text-jano-muted">Bandeja vacía.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-[17px] font-bold">
                  {item.accountName} · {item.contactName}
                </h2>
                <Pill tone={INTENT_TONE[item.intent]} className="ml-auto">
                  {INTENT_LABEL[item.intent]}
                  {item.intent === "interest" ? " · pide reunión" : ""}
                </Pill>
              </div>
              <div className="rounded-[14px] bg-jano-niebla px-4 py-3 text-[14.5px] leading-relaxed">
                <div className="mb-1 text-[12.5px] text-jano-muted">
                  {item.contactName} · {formatShortDate(item.receivedAt)}
                </div>
                {item.text}
              </div>
              {item.draft ? (
                <div className="ai-border rounded-[14px] px-4 py-3 text-[14.5px] leading-relaxed">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-jano-cobalto-oscuro">
                    <Spark />
                    Borrador de Jano
                    <span className="ml-auto font-medium text-jano-muted">
                      confianza {item.draft.confidence}
                      {item.draft.slots.length > 0 ? ` · ${item.draft.slots.length} huecos libres en tu calendario` : ""}
                    </span>
                  </div>
                  {item.draft.subject && <div className="mb-1 text-[12.5px] text-jano-muted">Asunto: {item.draft.subject}</div>}
                  {editing !== null ? (
                    <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={8} className="w-full rounded-[10px] border border-jano-linea p-3 text-[14.5px] outline-none focus:border-jano-cobalto" aria-label="Editar borrador" />
                  ) : (
                    <div className="whitespace-pre-line">{item.draft.body}</div>
                  )}
                  {item.draft.status !== "pending_approval" && (
                    <Pill tone={item.draft.status === "sent" ? "g" : "n"} className="mt-2">
                      {item.draft.status === "sent" ? "Enviado" : item.draft.status === "approved" ? "Aprobado" : "Descartado"}
                    </Pill>
                  )}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-jano-linea px-4 py-3 text-[13.5px] text-jano-muted">
                  {item.intent === "opt_out" ? "Baja aplicada por el motor sin esperar aprobación." : "Sin borrador: el motor programa el seguimiento solo."}
                  <div className="mt-1 text-xs">{item.intentReasoning}</div>
                </div>
              )}
              {item.draft?.status === "pending_approval" && (
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button size="lg" disabled={approve.isPending} onClick={() => approve.mutate(item)}>
                    {editing !== null ? "Aprobar y enviar la edición" : "Aprobar y enviar"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(editing === null ? item.draft?.body ?? "" : null)}>
                    {editing === null ? "Editar" : "Cancelar edición"}
                  </Button>
                  <Button variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate(item)}>
                    Pedir otro tono
                  </Button>
                  <Button variant="outline" className="ml-auto" disabled={discard.isPending} onClick={() => discard.mutate(item)}>
                    Descartar
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[280px]">
          <Card title="Al aprobar, Jano hará">
            <ul>
              {(item?.effects ?? []).map((e) => (
                <ListItem key={e}>
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-jano-cobalto-tinte text-jano-cobalto">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold">{EFFECT_LABEL[e][0]}</div>
                    <div className="text-[12.5px] text-jano-muted">{EFFECT_LABEL[e][1]}</div>
                  </div>
                </ListItem>
              ))}
            </ul>
          </Card>
          {items.some((i) => i.intent === "opt_out") && (
            <div className="rounded-2xl border border-[#F1C9C1] bg-jano-rojo-tinte p-4 text-[13.5px] text-jano-rojo-texto">
              <b>Baja detectada.</b> {items.find((i) => i.intent === "opt_out")?.accountName} pasa a la lista de supresión. No se le volverá a escribir.
            </div>
          )}
          <Card title="Clasificación de hoy" className="flex-1">
            <div className="mb-2.5 flex h-3 overflow-hidden rounded-full">
              <div className="bg-jano-verde" style={{ width: `${(100 * (counts["interest"] ?? 0)) / total}%` }} />
              <div className="bg-jano-bronce" style={{ width: `${(100 * (counts["objection"] ?? 0)) / total}%` }} />
              <div className="bg-[#9CA0BA]" style={{ width: `${(100 * ((counts["not_now"] ?? 0) + (counts["out_of_office"] ?? 0))) / total}%` }} />
              <div className="bg-jano-rojo" style={{ width: `${(100 * (counts["opt_out"] ?? 0)) / total}%` }} />
            </div>
            <div className="text-[12.5px] leading-7 text-jano-muted">
              Interés {counts["interest"] ?? 0} · Objeción {counts["objection"] ?? 0} · Ahora no {(counts["not_now"] ?? 0) + (counts["out_of_office"] ?? 0)} · Baja {counts["opt_out"] ?? 0}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}
