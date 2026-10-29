# ADR-003 · Motor de ejecución propio sobre Postgres

**Estado**: aceptada · **Fecha**: 2026-10-29

## Contexto
El borrador de producto deja abierta la decisión «motor propio sobre Postgres, o Temporal» (página 11). El motor de ADR-002 programa pasos que esperan días por prospect, evalúa reglas antes de cada acción, escribe cada decisión en el registro de eventos append-only y tiene que vivir en AWS `eu-west-1` con coste cercano a cero sin clientes (AGENTS.md §8). Lo mantiene un solo desarrollador.

## Decisión
- El estado de cada prospect y sus pasos programados viven en Aurora Postgres, en las mismas tablas que el registro de eventos y con el mismo aislamiento por fila que el resto (spec 007).
- EventBridge Scheduler invoca cada minuto la Lambda `jano-<env>-motor`, que toma los pasos vencidos con `SELECT … FOR UPDATE SKIP LOCKED` en lotes y es idempotente ante reinvocaciones.
- Esperas, reintentos y cambios de rama son datos (`sequence_steps.scheduled_for`, `status`), no estado de un workflow externo.

## Alternativas
- **Temporal**: modelo de workflows duradero y probado, pero exige clúster propio o Temporal Cloud. Añade una pieza que operar y saca el estado fuera de Postgres, lejos del registro de eventos.
- **Inngest y Trigger.dev**: SaaS con opción de autoalojarse; el estado y los datos saldrían de `eu-west-1` o habría que operarlos.
- **Step Functions**: nativo de AWS, pero una ejecución por prospect que espera días multiplica ejecuciones y separa el estado del registro. Se toman sus ideas de reintentos y esperas.

## Consecuencias
- Una sola fuente de verdad: el mapa de flujo, la auditoría y el motor leen las mismas tablas.
- Coste en reposo: el de Aurora en pausa. Pero el scheduler la despierta cada minuto si hay pasos vencidos. Cuando no hay pasos, la Lambda comprueba primero un contador barato y no consulta Aurora.
- Se escribe y se testea a mano lo que Temporal da hecho (reintentos, idempotencia, concurrencia); los tests del motor corren contra Postgres real.
- Si el volumen o la complejidad de los flujos crecen mucho, migrar a Temporal es posible porque las acciones del motor ya pasan por puertos.
