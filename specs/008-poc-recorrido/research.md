# Investigación 008 · Alternativas open source y fuentes de datos

Fecha: 2026-10-29. Licencias marcadas «de memoria» se comprueban en el `LICENSE` antes de añadir la dependencia.

## Decisiones
| Pieza | Elegido | Descartado y por qué |
|---|---|---|
| Motor y secuencias | Postgres + EventBridge Scheduler (ADR-003) | Temporal (clúster u otro proveedor), Inngest y Trigger.dev (estado fuera de `eu-west-1`), Step Functions (una ejecución por prospect que espera días) |
| Agentes | Converse API de Bedrock directa, zod y un reintento | LangGraph.js y Mastra: diseñados para que el modelo use herramientas y elija el siguiente paso, lo que ADR-002 prohíbe; Mastra mezcla licencia Enterprise. Vercel AI SDK con Bedrock queda como opción si hay que abstraer el proveedor |
| Lectura de webs | `fetch` de Node 22, `robots-parser`, `@mozilla/readability` (Apache-2.0), `linkedom` | Firecrawl autoalojado (AGPL, 6+ contenedores, 8-12 GB), Crawlee (demasiado para 4 páginas por dominio; vuelve si crece el alcance), trafilatura y Crawl4AI (Python) |
| Candidatas | OpenStreetMap vía Overpass (`shop=travel_agency` con `website`, ODbL) | OpenCorporates (plan gratuito solo para proyectos abiertos), INE DIRCE (solo agregados), scrapers de pago |
| Señales registrales | Más adelante: API BORME del BOE (gratis, actos registrales, sin CNAE) y OpenMercantil (por investigar) | — |
| Verificación de email | Fuera de la prueba de concepto; lista blanca en su lugar | Sondeo SMTP propio: AWS bloquea el puerto 25 de salida y muchos MX rechazan IPs de nube. Reacher es AGPL o licencia comercial |
| Correo entrante | SES receiving en `eu-west-1`, `mailparser`, `email-reply-parser` (Crisp) | talon (Python) |
| Correo saliente y `.ics` | `MailComposer` de Nodemailer + SES v2 `Raw`; `.ics` RFC 5545 generado a mano o con `ics` | — |
| AI SDR y CRM open source | Ninguno se adopta | AgentSDR (Next.js + Postgres, MIT según listados; se toman ideas de su bandeja y su taxonomía de intenciones), ai-sales-agent (LangGraph), SalesGPT (Python), Twenty (AGPL, integrar por API si un cliente lo pide) |

## Prueba de la fuente de candidatas
Consulta Overpass del 2026-10-29: en la Comunitat Valenciana hay 129 elementos `shop=travel_agency`; 32 tienen web y 29 de ellas no llevan etiqueta `brand` (no son cadena). Cubre una región; para 50 cuentas la campaña puede abarcar varias provincias. La consulta de toda España superó el tiempo del servidor público y hay que trocearla por comunidad.

## Competidores que el borrador no recoge
- **Genesy** (Barcelona): agentes de IA para ventas B2B; seed de 5 M€ en enero de 2025 y más de 150 clientes según la prensa. Es el competidor directo en España.
- **Knowlee**: SDR con IA para España y Latinoamérica con discurso de AI Act y AEPD.
- **lemlist** (París) y **Amplemarket**: secuencias y outbound con IA muy usados por pymes europeas.

## Fase B · agentes en Bedrock (2026-10-29)

### Dependencias añadidas
Licencias comprobadas en el fichero `LICENSE` de cada paquete instalado, incluidas las dependencias de `linkedom`.

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| `robots-parser` | 3.0.1 | MIT | reglas de `robots.txt` para `JanoBot` |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | texto principal de cada página |
| `linkedom` | 0.18.14 | ISC | DOM para Readability; arrastra `htmlparser2` (MIT), `css-select`, `css-what`, `domhandler`, `domutils`, `entities`, `nth-check` (BSD-2-Clause), `dom-serializer`, `html-escaper`, `@acemir/cssom` (MIT), `boolbase`, `uhyphen` (ISC) |
| `@aws-sdk/client-bedrock-runtime` | ^3.700 | Apache-2.0 | Converse API (en el runtime de Lambda; dependencia de desarrollo) |
| `@aws-sdk/client-sqs` | ^3.700 | Apache-2.0 | cola de cuentas (ídem) |

### Decisiones
- **Caché de candidatas en Postgres** (`candidate_cache`, por tenant y región, 24 h) y no en S3: se lee y escribe en la misma transacción con RLS que el resto, no pide permisos ni bucket nuevos y los tests la cubren contra Postgres real. Va por tenant para no tener una tabla sin `tenant_id` (AGENTS.md §4); el precio es una consulta a Overpass por tenant, región y día.
- **Overpass por provincia** (código ISO 3166-2 del área administrativa). La provincia de Valencia tardó 37-46 s en el servidor público y una consulta seguida devolvió 502: 90 s por consulta, un reintento a los 15 s y el trabajador a 300 s.
- **Búsqueda en segundo plano**: la API encola y responde 202; el trabajador `jano-dev-cuentas` busca la región y encola una candidata por mensaje (SQS estándar, DLQ a los 3 intentos). Un mensaje por invocación y 5 a la vez: concurrencia reservada y máximo del event source mapping iguales, para que el throttling no gaste intentos camino de la DLQ.
- **Tope diario** de 500 llamadas por tenant en `ai_usage`, reservado antes de cada llamada (también el reintento) con un upsert condicionado. Si se agota: la API responde 503, el motor bloquea el paso con el motivo y el trabajador deja la cuenta descartada con «tope diario», a la vista de una persona.
- **Precio estimado** para el log y `ai_usage`: 3,30 $ / 16,50 $ por millón de tokens de entrada y salida (Sonnet 4.6 a 3 $ / 15 $ más el 10 % de los perfiles regionales `eu.*`). Es una estimación configurable (`BEDROCK_PRECIO_*`); la cifra buena es la factura de AWS.
- **Sin salida estructurada forzada**: el modelo devuelve JSON en texto y zod lo valida, con un reintento. Forzar una herramienta para obtener JSON contradiría en la forma FR-012 («el modelo no tiene herramientas»).

### Prueba con Bedrock (T022, SC-004 parcial)
`backend/scripts/probar-agentes.ts` con `eu.anthropic.claude-sonnet-4-6` en eu-west-1, 2026-10-29, sobre agencias reales de OpenStreetMap en la Comunitat Valenciana (27 con web propia y sin `brand`). De las 5 primeras, 2 se descartaron sin llamar al modelo (una redirige a http, otra tiene un certificado TLS que no corresponde) y 3 se analizaron de punta a punta: una de viajes de empresa con fit 88 y secuencia consultiva, y dos de ocio para particulares con fit 18 y 28 que el Orquestador propuso descartar. Las 18 llamadas devolvieron JSON válido salvo una contestación que no copió literalmente los huecos y pasó al reintento.

| Medida | Llamadas | Tokens entrada / salida | Coste estimado |
|---|---|---|---|
| Por cuenta analizada (elegir páginas + puntuar; sin enlaces útiles, solo puntuar) | 1-2 | ~2.100 / 420 | **0,021 $** de media (0,010-0,030 $) |
| Por prospect aprobado (Contact Finder + Orquestador + primer borrador) | 3 | ~4.000 / 620 | **0,023 $** |
| Por prospect descartado por el Orquestador (sin borrador) | 2 | ~2.400 / 380 | 0,014 $ |
| Recorrido completo de la prueba (ICP, 3 cuentas, respuesta, lectura de la campaña) | 18 | 28.118 / 3.959 | 0,158 $ |

Latencia por llamada: 0,9-4,2 s; una cuenta tarda 3-17 s entre la lectura de la web y el modelo. Con estas cifras, 50 cuentas analizadas cuestan del orden de 1 $, y el tope de 500 llamadas diarias por tenant da para unas 200 cuentas al día. La prueba de 50 cuentas del recorrido (T043) dará la media buena.

## Pendiente
- Coste medio por cuenta analizada y por prospect (SC-004) con las 50 agencias del recorrido en dev (T043); la medida parcial de arriba es de la prueba manual.
