# Modelo de datos 007

Todas las tablas con `ENABLE` y `FORCE ROW LEVEL SECURITY` y política `tenant_id = current_setting('app.tenant_id', true)` (en `tenants`, sobre `id`).

## tenants
| Campo | Tipo | Reglas |
|---|---|---|
| id | text PK | `^tenant-[a-z0-9-]{2,48}$`; estable, es el claim `custom:tenant_id` |
| name | text | 1-120 caracteres |
| plan | text | `piloto` por defecto; sin facturación |
| status | text | `active` o `suspended` |
| created_at | timestamptz | `now()` |

## tenant_users
| Campo | Tipo | Reglas |
|---|---|---|
| tenant_id | text FK → tenants | |
| user_id | text | `sub` de Cognito; PK (`tenant_id`, `user_id`) y único global |
| email | text | minúsculas, único global (un usuario, un tenant) |
| name | text null | |
| role | text | `owner` o `member` |
| status | text | `invited` → `active` (primera petición) ↔ `disabled` |
| invited_by | text null | `user_id` del owner, o `ops` |
| created_at, updated_at | timestamptz | |

Reglas de dominio: solo un owner activo invita, desactiva, reactiva y reenvía; un owner no se desactiva a sí mismo ni a otro owner desde la app; siempre queda al menos un owner activo; reenviar solo a `invited`.

## user_activity (append-only)
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint identity PK | |
| tenant_id | text | |
| actor | text | `user_id` o `ops` |
| action | text | `tenant_created`, `user_invited`, `user_disabled`, `user_enabled`, `invitation_resent`, `tenant_suspended`, `tenant_reactivated`, `user_imported` |
| target | text null | `user_id` afectado |
| at | timestamptz | `now()` |

`jano_api` tiene `SELECT, INSERT` en `user_activity` (sin `UPDATE` ni `DELETE`), `SELECT, INSERT, UPDATE` en `tenant_users` y `SELECT` en `tenants`.
