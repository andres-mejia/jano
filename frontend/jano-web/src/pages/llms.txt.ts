import type { APIRoute } from "astro";
import { pathFor, t, type Lang, type LegalKey } from "../i18n";

/**
 * /llms.txt (https://llmstxt.org): resumen de Jano para modelos de lenguaje,
 * en español y en inglés, generado desde los mismos diccionarios que la web.
 */
const legal: LegalKey[] = ["privacy", "terms", "cookies", "notice"];

function block(lang: Lang, abs: (p: string) => string): string[] {
  const d = t(lang);
  const es = lang === "es";
  return [
    `## ${es ? "Qué es Jano" : "What Jano is"}`,
    "",
    d.meta.description,
    "",
    `- ${es ? "Producto de" : "Made by"}: Tekhos (https://tekhos.com), jano@tekhos.com`,
    `- ${es ? "Para" : "For"}: ${es ? "pymes B2B españolas" : "Spanish B2B small and mid-sized businesses"}`,
    `- ${es ? "Canal" : "Channel"}: ${es ? "email desde el buzón de Microsoft 365 del cliente" : "email from the customer's own Microsoft 365 mailbox"}`,
    `- ${es ? "Estado" : "Status"}: ${es ? "piloto con un grupo pequeño de empresas; acceso anticipado por sectores" : "pilot with a small group of companies; early access by industry"}`,
    `- ${es ? "Datos" : "Data"}: AWS eu-west-1 (Irlanda / Ireland); LLM: Amazon Bedrock`,
    "",
    `### ${es ? "Cómo funciona" : "How it works"}`,
    "",
    d.flow.lead,
    "",
    `- ${d.flow.orchestrator.title}: ${d.flow.orchestrator.text}`,
    ...d.flow.agents.map((a) => `- ${a.title}: ${a.text}`),
    "",
    `### ${d.rules.title}`,
    "",
    ...d.rules.items.map((r) => `- ${r.title}: ${r.text}`),
    "",
    `### ${d.faq.title}`,
    "",
    ...d.faq.items.flatMap((f) => [`**${f.q}**`, f.a, ""]),
    `### ${es ? "Páginas" : "Pages"}`,
    "",
    `- [${es ? "Inicio" : "Home"}](${abs(pathFor("home", lang))})`,
    ...legal.map((k) => `- [${d.footer.links[k]}](${abs(pathFor(k, lang))})`),
    "",
  ];
}

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://jano.tekhos.com");
  const abs = (p: string) => new URL(p, base).toString();
  const body = [
    "# Jano",
    "",
    `> ${t("es").brand.byline}. ${t("es").brand.tagline} para pymes B2B: encuentra cuentas, localiza al contacto, escribe en el momento oportuno y agenda la reunión. La IA propone, un motor con reglas ejecuta y la persona aprueba lo que sale con su nombre.`,
    `> ${t("en").brand.byline}. An AI sales team for B2B small businesses: it finds accounts, reaches the right person, writes at the right moment and books the meeting. The AI proposes, a rules engine executes, and a person approves everything sent under their name.`,
    "",
    "# Español",
    "",
    ...block("es", abs),
    "# English",
    "",
    ...block("en", abs),
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
