/**
 * Identificadores fijos de los datos de ejemplo. Son UUID v4 válidos para
 * que pasen los esquemas de `@jano/domain`; las empresas y personas son
 * inventadas y los dominios son `.example` (AGENTS.md §5).
 */
export const IDS = {
  campaign: "6f1c2a4e-3b7d-4c8e-9a1f-2b3c4d5e6f70",
  accounts: {
    rumboNorte: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    albufera: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
    travesia: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
    brisa: "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80",
    mediterraneo: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091",
    costaAzahar: "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8091a2",
    horizonte: "7a8b9c0d-1e2f-4a3b-8c5d-6e7f8091a2b3",
  },
  contacts: {
    irene: "8b9c0d1e-2f3a-4b4c-9d6e-7f8091a2b3c4",
    pablo: "9c0d1e2f-3a4b-4c5d-8e7f-8091a2b3c4d5",
    jorge: "0d1e2f3a-4b5c-4d6e-9f80-91a2b3c4d5e6",
  },
  prospects: {
    rumboNorte: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e",
    albufera: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f",
    travesia: "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e70",
    mediterraneo: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f81",
    costaAzahar: "e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8092",
    horizonte: "f6a7b8c9-d0e1-4f2a-9b4c-5d6e7f8091a3",
    brisa: "a7b8c9d0-e1f2-4a3b-8c5d-6e7f8091a2b4",
  },
  steps: {
    dia0: "11111111-1111-4111-8111-111111111111",
    dia3: "22222222-2222-4222-8222-222222222222",
    dia5: "33333333-3333-4333-8333-333333333333",
    dia6: "44444444-4444-4444-8444-444444444444",
    dia7: "55555555-5555-4555-8555-555555555555",
    dia8: "66666666-6666-4666-8666-666666666666",
    dia12: "77777777-7777-4777-8777-777777777777",
  },
  inbox: {
    albufera: "aa111111-1111-4111-8111-111111111111",
    mediterraneo: "aa222222-2222-4222-8222-222222222222",
    travesia: "aa333333-3333-4333-8333-333333333333",
    costaAzahar: "aa444444-4444-4444-8444-444444444444",
    horizonte: "aa555555-5555-4555-8555-555555555555",
  },
} as const;

let seq = 0;
/** UUID determinista para elementos generados en la sesión mock. */
export function nextMockId(): string {
  seq += 1;
  const n = seq.toString(16).padStart(12, "0");
  return `bbbbbbbb-bbbb-4bbb-8bbb-${n}`;
}
