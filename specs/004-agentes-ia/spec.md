# Feature 004 · Agentes de IA sobre Bedrock

**Rama**: `feat/agentes-ia` · **Estado**: especificada · **Depende de**: 003

## Objetivo
Implementar los puertos de IA del motor con Bedrock (Converse API, modelo Claude vía perfil de inferencia `eu.*` en `eu-west-1`, como en Fenora), con salidas estructuradas, evidencia citada y evaluaciones reproducibles. Los agentes proponen; el motor sigue decidiendo.

## Escenarios de usuario

### US1 · De una frase a un ICP estructurado (P1)
El Orquestador convierte el prompt en `Icp` (sector, CNAE, país, facturación, señales), propone sugerencias y acepta correcciones por turnos.
**Aceptación**: el ICP devuelto valida contra `IcpSchema`; una corrección («solo Comunidad Valenciana») cambia solo el campo afectado; cada turno queda en `icp_turns`.

### US2 · Cuentas puntuadas con evidencia (P1)
El Account Finder recibe candidatas del puerto de datos de empresas (registro + web rastreada) y devuelve fit 0–100, razonamiento en una o dos frases, evidencia citada por fuente y el trigger si lo hay.
**Aceptación**: ninguna cuenta con fit sin al menos una evidencia; una cuenta con CNAE fuera del ICP puntúa por debajo de 50; el trigger siempre enlaza una evidencia con fecha.

### US3 · Contacto elegido y verificado (P1)
El Contact Finder elige al interlocutor entre los candidatos (web, LinkedIn público, proveedor), razona por qué, y el motor pide verificación al puerto correspondiente. La confianza la pone el verificador, nunca el modelo.
**Aceptación**: `verificationConfidence` solo existe si `verificationProvider` existe; un contacto sin email verificado no entra en secuencia.

### US4 · Secuencia elegida y mensajes redactados con contexto (P1)
Outreach elige `consultiva` o `trigger`, redacta cada paso con los datos de la cuenta y el trigger, y propone cambiar de rama cuando aparece una señal.
**Aceptación**: cada mensaje cabe en 120 palabras, no inventa datos que no estén en la evidencia, no promete precios ni plazos, y pasa el filtro de PII antes de ir al modelo (`PiiStripper` como en Fenora); el cambio de rama es una propuesta con razonamiento y evidencia.

### US5 · Respuestas clasificadas y borradores listos (P1)
Response clasifica la intención (`ReplyIntent`), explica por qué, redacta el borrador y, si hay interés, pide huecos al puerto de calendario y los incluye.
**Aceptación**: una baja se clasifica `opt_out` con precisión ≥ 0,98 en el set de evaluación; un fuera de oficina nunca genera borrador; el borrador no contiene datos de otros prospects.

## Requisitos funcionales
- **FR-001** Un adaptador Bedrock por puerto, con `system prompt` versionado en el repo (`backend/src/adapters/bedrock/prompts/*.md`) y salida en JSON validada con los esquemas de `@jano/domain`; ante JSON inválido, un reintento y después fallo registrado.
- **FR-002** Sin herramientas de ejecución para el modelo: el modelo nunca envía, reserva ni escribe; devuelve propuestas.
- **FR-003** `PiiStripper` antes de cada llamada: NIF, IBAN, teléfonos y emails de terceros se sustituyen por marcadores; se registra que se aplicó.
- **FR-004** Coste y latencia por llamada en logs y en una métrica CloudWatch por agente y tenant; tope diario de llamadas por tenant configurable.
- **FR-005** Set de evaluación en `backend/evals/` (≥ 50 casos por agente, inventados) con un script `pnpm eval` que mide precisión de intención, validez de JSON y respeto de reglas (sin precios, sin datos inventados). Se ejecuta en CI con el adaptador determinista y a mano contra Bedrock.
- **FR-006** El modelo y el perfil de inferencia son variables de entorno; por defecto el mismo que usa Fenora en producción.

## Criterios de éxito
- **SC-001** Precisión de `ReplyIntent` ≥ 0,9 en el set de evaluación; `opt_out` ≥ 0,98.
- **SC-002** 100 % de las salidas válidas contra los esquemas en el set de evaluación (tras reintento).
- **SC-003** Coste medio por prospect procesado de punta a punta anotado en `research.md` (es la cifra que falta para fijar precio).

## Fuera de alcance
Entrenamiento o fine-tuning, memoria entre campañas, voz.

## Dudas abiertas
- **[NEEDS CLARIFICATION]** Proveedor de datos de empresas (eInforma, Axesor, Iberinform u otro) y su coste por consulta.
- **[NEEDS CLARIFICATION]** Proveedor de verificación de email.
