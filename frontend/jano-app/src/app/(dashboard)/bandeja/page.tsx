"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { AiTag, Button, Card, ListItem, Pill, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { INTENT_LABEL, formatShortDate } from "@/lib/format";
import type { ApprovalEffect, InboxItem, ReplyIntent } from "@jano/domain";

/** Color del punto de cada intención en la lista: el mismo que en la barra de clasificación. */
const INTENT_DOT: Record<ReplyIntent, string> = {
  interest: "bg-jano-verde",
  objection: "bg-jano-bronce",
  not_now: "bg-jano-gris-medio",
  out_of_office: "bg-jano-gris-medio",
  opt_out: "bg-jano-rojo",
  wrong_person: "bg-jano-gris-medio",
  other: "bg-jano-gris-medio",
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
      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start">
        <Card className="w-full shrink-0 xl:w-[310px]" title="Respuestas" action={pending > 0 && <Pill tone="b">{pending} nuevas</Pill>}>
          <ul className="-mx-2 flex flex-col">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  aria-current={item?.id === i.id}
                  className={clsx("flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left", item?.id === i.id ? "bg-jano-cobalto-tinte" : "hover:bg-jano-niebla")}
                >
                  <span className="flex items-center gap-2">
                    <b className="min-w-0 flex-1 truncate text-base">{i.accountName}</b>
                    {i.draft?.status === "pending_approval" && <span className="h-2 w-2 shrink-0 rounded-full bg-jano-bronce" aria-label="Espera tu aprobación" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-jano-gris-texto">
                    <span className={clsx("h-1.5 w-1.5 rounded-full", INTENT_DOT[i.intent])} aria-hidden="true" />
                    {INTENT_LABEL[i.intent]}
                  </span>
                  <span className="line-clamp-2 text-sm text-jano-muted">{i.text}</span>
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
                <h2 className="font-display text-lg font-bold">
                  {item.accountName} · {item.contactName}
                </h2>
                {/* La intención la clasifica la IA: se abre para ver por qué. */}
                <AiTag className="ml-auto" reason={item.intentReasoning}>
                  {INTENT_LABEL[item.intent]}
                  {item.intent === "interest" ? " · pide reunión" : ""}
                </AiTag>
              </div>
              <div className="rounded-xl bg-jano-niebla px-4 py-3 text-base leading-relaxed">
                <div className="mb-1 text-sm text-jano-muted">
                  {item.contactName} · {formatShortDate(item.receivedAt)}
                </div>
                {item.text}
              </div>
              {item.draft ? (
                <div className="ai-border rounded-xl px-4 py-3 text-base leading-relaxed">
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-jano-cobalto-oscuro">
                    <Spark />
                    Borrador de Jano
                    <span className="ml-auto font-medium text-jano-muted">
                      confianza {item.draft.confidence}
                      {item.draft.slots.length > 0 ? ` · ${item.draft.slots.length} huecos libres en tu calendario` : ""}
                    </span>
                  </div>
                  {item.draft.subject && <div className="mb-1 text-sm text-jano-muted">Asunto: {item.draft.subject}</div>}
                  {editing !== null ? (
                    <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={8} className="w-full rounded-lg border border-jano-linea p-3 text-base outline-none focus:border-jano-cobalto" aria-label="Editar borrador" />
                  ) : (
                    <div className="whitespace-pre-line">{item.draft.body}</div>
                  )}
                  {item.draft.status !== "pending_approval" && (
                    <div className="mt-2 text-sm font-semibold text-jano-muted">
                      {item.draft.status === "sent" ? "Enviado" : item.draft.status === "approved" ? "Aprobado" : "Descartado"}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-jano-linea px-4 py-3 text-sm text-jano-muted">
                  {item.intent === "opt_out" ? "Baja aplicada por el motor sin esperar aprobación." : "Sin borrador: el motor programa el seguimiento solo."}
                  <div className="mt-1 text-xs">{item.intentReasoning}</div>
                </div>
              )}
              {item.draft?.status === "pending_approval" && (
                <div className="flex flex-wrap gap-2">
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
          <Card title={item?.draft?.status === "pending_approval" ? "Si apruebas, Jano hará" : "Lo que hizo el motor"}>
            <ol>
              {(item?.effects ?? []).map((e, n) => (
                <ListItem key={e}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-jano-linea text-xs font-semibold text-jano-muted tabular">{n + 1}</span>
                  <div>
                    <div className="text-sm font-semibold">{EFFECT_LABEL[e][0]}</div>
                    <div className="text-sm text-jano-muted">{EFFECT_LABEL[e][1]}</div>
                  </div>
                </ListItem>
              ))}
            </ol>
          </Card>
          <Card title="Clasificación de hoy">
            <div className="mb-2.5 flex h-3 overflow-hidden rounded-full">
              <div className="bg-jano-verde" style={{ width: `${(100 * (counts["interest"] ?? 0)) / total}%` }} />
              <div className="bg-jano-bronce" style={{ width: `${(100 * (counts["objection"] ?? 0)) / total}%` }} />
              <div className="bg-jano-gris-medio" style={{ width: `${(100 * ((counts["not_now"] ?? 0) + (counts["out_of_office"] ?? 0))) / total}%` }} />
              <div className="bg-jano-rojo" style={{ width: `${(100 * (counts["opt_out"] ?? 0)) / total}%` }} />
            </div>
            <div className="text-sm leading-7 text-jano-muted">
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
