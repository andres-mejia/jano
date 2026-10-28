/**
 * Cliente tipado de la API, una función por operación del contrato
 * (`operationId` de contracts/openapi/jano-api.yaml). Las páginas consumen
 * esto y nunca `apiFetch` directamente.
 */

import type {
  Account,
  AccountStatus,
  ApproveDraft,
  AuditEntry,
  Campaign,
  CampaignStatus,
  ComplianceSummary,
  Connection,
  Contact,
  CreateCampaign,
  DashboardSummary,
  FlowMap,
  Guardrails,
  IcpTurn,
  InboxItem,
  Prospect,
  ProspectEvent,
  ProspectStage,
  RegenerateDraft,
} from "@jano/domain";

import { apiFetch } from "./client";

export interface ProspectDetail {
  prospect: Prospect;
  account: Account;
  contact: Contact | null;
}

export interface ProspectActionResult {
  prospect: Prospect;
  event: ProspectEvent;
}

export const jano = {
  getDashboardSummary: () => apiFetch<DashboardSummary>("GET", "/dashboard/summary"),

  listCampaigns: () => apiFetch<Campaign[]>("GET", "/campaigns"),
  createCampaign: (input: CreateCampaign) => apiFetch<{ campaign: Campaign; turn: IcpTurn }>("POST", "/campaigns", input),
  getCampaign: (id: string) => apiFetch<Campaign>("GET", `/campaigns/${id}`),
  getIcpTurns: (id: string) => apiFetch<IcpTurn[]>("GET", `/campaigns/${id}/icp`),
  refineIcp: (id: string, text: string) => apiFetch<IcpTurn>("POST", `/campaigns/${id}/icp`, { text }),
  setCampaignStatus: (id: string, status: CampaignStatus) => apiFetch<Campaign>("PUT", `/campaigns/${id}/status`, { status }),
  getFlowMap: (id: string) => apiFetch<FlowMap>("GET", `/campaigns/${id}/flow`),
  listStageEvents: (id: string, stage: ProspectStage) => apiFetch<ProspectEvent[]>("GET", `/campaigns/${id}/flow/${stage}/events`),
  listAccounts: (id: string, status?: AccountStatus) =>
    apiFetch<Account[]>("GET", `/campaigns/${id}/accounts${status ? `?status=${status}` : ""}`),
  approveAccounts: (id: string, accountIds: string[]) => apiFetch<{ approved: number }>("POST", `/campaigns/${id}/accounts/approve`, { accountIds }),
  discardAccounts: (id: string, accountIds: string[]) => apiFetch<{ discarded: number }>("POST", `/campaigns/${id}/accounts/discard`, { accountIds }),

  getProspect: (id: string) => apiFetch<ProspectDetail>("GET", `/prospects/${id}`),
  listProspectEvents: (id: string) => apiFetch<ProspectEvent[]>("GET", `/prospects/${id}/events`),
  stopProspect: (id: string) => apiFetch<ProspectActionResult>("POST", `/prospects/${id}/stop`),
  approveStep: (id: string, stepId: string) => apiFetch<ProspectActionResult>("POST", `/prospects/${id}/steps/${stepId}/approve`),

  listInbox: () => apiFetch<InboxItem[]>("GET", "/inbox"),
  getInboxItem: (id: string) => apiFetch<InboxItem>("GET", `/inbox/${id}`),
  approveDraft: (id: string, edit: ApproveDraft) => apiFetch<InboxItem>("POST", `/inbox/${id}/approve`, edit),
  discardDraft: (id: string) => apiFetch<InboxItem>("POST", `/inbox/${id}/discard`),
  regenerateDraft: (id: string, input: RegenerateDraft) => apiFetch<InboxItem>("POST", `/inbox/${id}/regenerate`, input),

  getComplianceSummary: () => apiFetch<ComplianceSummary>("GET", "/compliance/summary"),
  listAudit: () => apiFetch<AuditEntry[]>("GET", "/compliance/audit"),
  getGuardrails: () => apiFetch<Guardrails>("GET", "/compliance/guardrails"),
  setGuardrails: (g: Guardrails) => apiFetch<Guardrails>("PUT", "/compliance/guardrails", g),

  listConnections: () => apiFetch<Connection[]>("GET", "/connections"),
} as const;
