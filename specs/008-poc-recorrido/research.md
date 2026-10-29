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

## Pendiente
- Coste medio por cuenta analizada y por prospect (SC-004), tras el recorrido en dev.
