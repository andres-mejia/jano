"use client";

import { useEffect, useState } from "react";

interface Pendiente {
  readonly id: string;
  readonly texto: string;
  readonly hecho: string;
  readonly restante: number;
  readonly ejecutar: () => void;
}

/**
 * Lo que sale con tu nombre no se ejecuta al instante: queda unos segundos en
 * cuenta atrás con «Deshacer», y al terminar se confirma lo hecho. Todos los
 * cambios de estado van en callbacks de temporizador, nunca en el cuerpo del efecto.
 */
export function useConDeshacer(segundos = 10) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  useEffect(() => {
    if (!pendiente) return;
    const t = setTimeout(() => {
      if (pendiente.restante <= 1) {
        pendiente.ejecutar();
        setPendiente(null);
        setHecho(pendiente.hecho);
      } else {
        setPendiente({ ...pendiente, restante: pendiente.restante - 1 });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [pendiente]);

  useEffect(() => {
    if (!hecho) return;
    const t = setTimeout(() => setHecho(null), 4000);
    return () => clearTimeout(t);
  }, [hecho]);

  return {
    pendiente,
    hecho,
    programar: (p: Omit<Pendiente, "restante">) => {
      setHecho(null);
      setPendiente({ ...p, restante: segundos });
    },
    deshacer: () => setPendiente(null),
    ahora: () => {
      if (!pendiente) return;
      pendiente.ejecutar();
      setPendiente(null);
      setHecho(pendiente.hecho);
    },
  };
}

export function AvisoDeshacer({ estado }: { estado: ReturnType<typeof useConDeshacer> }) {
  const { pendiente, hecho, deshacer, ahora } = estado;
  if (!pendiente && !hecho) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-jano-tinta px-4 py-3 text-sm text-white shadow-[0_12px_32px_color-mix(in_srgb,var(--color-jano-tinta)_35%,transparent)]">
      {pendiente ? (
        <>
          <span className="min-w-0 flex-1">
            {pendiente.texto} <span className="text-jano-nav-texto tabular">en {pendiente.restante} s</span>
          </span>
          <button type="button" onClick={deshacer} className="rounded-lg px-2.5 py-1 font-semibold text-jano-bronce hover:bg-jano-tinta-2">
            Deshacer
          </button>
          <button type="button" onClick={ahora} className="rounded-lg px-2.5 py-1 font-semibold hover:bg-jano-tinta-2">
            Ya
          </button>
        </>
      ) : (
        <span>{hecho}</span>
      )}
    </div>
  );
}
