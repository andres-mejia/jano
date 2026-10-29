import type { APIRoute } from "astro";

/**
 * robots.txt: todo indexable, incluidas las páginas legales. Los rastreadores
 * de IA se nombran uno a uno para que su permiso sea explícito.
 */
const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://jano.tekhos.com");
  const body = [
    "# Jano, un producto de Tekhos. Todo el sitio es público.",
    "User-agent: *",
    "Allow: /",
    "",
    ...aiCrawlers.flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${new URL("/sitemap-index.xml", base).toString()}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
