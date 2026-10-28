# ADR-002 · La IA decide, un motor con reglas ejecuta

**Estado**: aceptada · **Fecha**: 2026-10-29

## Contexto
El producto se vende como «dirigido por IA»: el cliente describe su ICP en una frase y los agentes hacen el resto. A la vez, cada mensaje sale con el nombre del cliente, hay límites de entregabilidad, bajas que respetar y un marco legal (LSSI, RGPD) todavía por dictaminar. Un agente con libertad para enviar es un riesgo que no compensa, y un flujo donde la IA solo redacta no diferencia de nadie.

## Decisión
- Los cinco agentes (Orquestador, Account Finder, Contact Finder, Outreach, Response) **proponen**: qué cuentas, qué contacto, qué secuencia, qué mensaje, qué respuesta y cuándo. Devuelven propuestas estructuradas con razonamiento y evidencia citada.
- Un **motor de ejecución determinista** es el único que envía, reserva, registra o detiene. Antes de cada acción evalúa reglas fijas que el modelo no ve como texto modificable: límite de envíos por buzón y día, email verificado, lista de supresión, respuesta previa, canal permitido.
- El estado de cada prospect es una **máquina de estados explícita** (`PROSPECT_TRANSITIONS` en `packages/domain`); la IA elige transiciones dentro del grafo, no inventa pasos.
- Todo queda en un **registro de eventos append-only** con agente, tipo, resumen, razonamiento, evidencia, reglas comprobadas y mensaje. El mapa de flujo, el centro de mando y la auditoría son proyecciones de ese registro.
- **Aprobación humana por defecto**; el piloto automático es opt-in por cliente y por tipo de respuesta, y queda auditado.

## Alternativas
- **Orquestador LLM que decide el siguiente agente** (la idea original): descartado como mecanismo de ejecución; se conserva como capa de planificación y priorización encima del motor.
- **Editor de flujos tipo n8n para el cliente**: descartado; contradice la promesa de producto y cuesta mantenerlo. Se construye la vista de solo lectura del flujo en ejecución.

## Consecuencias
- El grafo de secuencias se puede dibujar y explicar; la confianza del cliente se apoya en poder ver por qué pasó cada cosa.
- El motor se testea sin modelo; los agentes se evalúan aparte con sets de casos.
- Añadir un canal o una regla es un cambio en el motor y en el contrato, no en un prompt.
