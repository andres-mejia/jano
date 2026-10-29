import type { CurrentTenant, TenantUser } from "@jano/domain";

/** Equipo de ejemplo (spec 007): empresa y personas inventadas, dominios `.example`. */
export const TENANT: CurrentTenant = {
  id: "tenant-demo",
  name: "Rumbo Norte",
  plan: "piloto",
  status: "active",
  role: "owner",
};

export const TEAM: TenantUser[] = [
  {
    userId: "mock-owner",
    email: "lucia@rumbonorte.example",
    name: "Lucía Marín",
    role: "owner",
    status: "active",
    invitedBy: "ops",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  {
    userId: "mock-member-1",
    email: "mateo@rumbonorte.example",
    name: "Mateo Ruiz",
    role: "member",
    status: "active",
    invitedBy: "mock-owner",
    createdAt: "2026-10-12T10:30:00.000Z",
  },
  {
    userId: "mock-member-2",
    email: "nora@rumbonorte.example",
    name: null,
    role: "member",
    status: "invited",
    invitedBy: "mock-owner",
    createdAt: "2026-10-28T16:05:00.000Z",
  },
];
