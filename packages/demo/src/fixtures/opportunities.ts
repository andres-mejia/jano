import type { Opportunity } from "@jano/domain";

import { IDS } from "./ids";

/** Oportunidades de ejemplo: la reunión de Rumbo Norte del centro de mando. */
export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    prospectId: IDS.prospects.rumboNorte,
    campaignId: IDS.campaign,
    campaignName: "Agencias de viajes · España · facturación superior a 1 M€",
    accountName: "Rumbo Norte Viajes",
    domain: "rumbonorte.example",
    contactName: "Irene Soler",
    contactRole: "CEO",
    contactEmail: "isoler@rumbonorte.example",
    meetingStart: "2026-11-05T09:00:00.000Z",
    meetingEnd: "2026-11-05T09:30:00.000Z",
    status: "open",
    createdAt: "2026-10-28T10:20:00.000Z",
  },
];

/** El mismo formato que el backend: separador `;`, CRLF y BOM para Excel en español. */
export function oportunidadesCsv(lista: readonly Opportunity[]): string {
  const filas = lista.map((o) =>
    [o.accountName, o.domain, o.contactName ?? "", o.contactRole ?? "", o.contactEmail ?? "", o.meetingStart ?? "", "Abierta", o.campaignName, o.createdAt].join(";"),
  );
  return `﻿${["Empresa;Dominio;Contacto;Cargo;Email;Reunión;Estado;Campaña;Creada", ...filas].join("\r\n")}\r\n`;
}
