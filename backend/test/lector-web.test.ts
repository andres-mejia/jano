import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { DeterministicSelectorDeEnlaces } from "../src/adapters/deterministas/ia";
import { RelojFijo } from "../src/adapters/deterministas/reloj";
import { AGENTE_HTTP, LectorWeb, type Transporte } from "../src/adapters/web/lector";
import type { SelectorDeEnlaces } from "../src/ports/ia";

/**
 * Lector web (spec 008 T020) contra un servidor HTTP local que hace de varios
 * sitios inventados: la URL lógica `https://<sitio>/<ruta>` se sirve en
 * `http://127.0.0.1:<puerto>/<sitio>/<ruta>`. Las comprobaciones (https, mismo
 * sitio, robots.txt) se hacen sobre la URL lógica, como en producción.
 */
const reloj = new RelojFijo(new Date("2026-10-29T09:00:00.000Z"));

const PORTADA = `<!doctype html><html><head><title>Viajes Faro · Agencia en Valencia</title><style>.x{}</style></head>
<body><nav><a href="/">Inicio</a> <a href="/quienes-somos">Quiénes somos</a> <a href="/noticias">Noticias</a>
<a href="https://viajes-faro.example/empleo#ofertas">Trabaja con nosotros</a> <a href="/aviso-legal">Aviso legal</a>
<a href="/catalogo.pdf">Catálogo</a> <a href="https://otra-agencia.example/">Partner</a> <a href="http://viajes-faro.example/inseguro">Inseguro</a></nav>
<main><h1>Agencia de viajes para empresas</h1><p>Organizamos viajes de empresa, congresos e incentivos para clientes de la Comunitat Valenciana desde 1998.
Tenemos oficina propia en el centro de Valencia y un equipo de doce personas especializadas en grupos.</p>
<p>Llámanos o escríbenos y te preparamos una propuesta para tu próximo evento corporativo.</p></main>
<script>console.log("no es texto")</script></body></html>`;

const pagina = (titulo: string, texto: string) => `<!doctype html><html><head><title>${titulo}</title></head><body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;

type Manejador = (req: IncomingMessage, res: ServerResponse) => void;
const html = (cuerpo: string): Manejador => (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(cuerpo);
};
const robots = (texto: string): Manejador => (_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(texto);
};

const SITIOS: Record<string, Record<string, Manejador>> = {
  "viajes-faro.example": {
    "/robots.txt": robots("User-agent: *\nDisallow: /privado\n\nUser-agent: JanoBot\nDisallow: /aviso-legal\n"),
    "/": html(PORTADA),
    "/quienes-somos": html(pagina("Quiénes somos", "Somos una agencia familiar fundada en 1998 con oficina en Valencia.")),
    "/noticias": html(pagina("Noticias", "Abrimos nueva oficina en Castellón el 1 de octubre de 2026.")),
    "/empleo": html(pagina("Empleo", "Buscamos responsable comercial para el área de empresas. Publicado el 1 de octubre de 2026.")),
  },
  "prohibido.example": {
    "/robots.txt": robots("User-agent: JanoBot\nDisallow: /\n"),
    "/": html(PORTADA),
  },
  "sin-robots.example": {
    "/": html(pagina("Sin robots", "Agencia de viajes con una web sencilla y sin robots.txt, que se puede leer entera sin problema alguno. ".repeat(3))),
  },
  "lenta.example": {
    "/": (_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(PORTADA);
      }, 1000);
    },
  },
  "enorme.example": {
    "/": (_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write(`<html><body><p>INICIO ${"agencia de viajes ".repeat(500)}</p>`);
      res.write(`<p>${"relleno ".repeat(200_000)}</p>`);
      res.end("<p>FINAL</p></body></html>");
    },
  },
  "a-http.example": {
    "/": (_req, res) => {
      res.writeHead(301, { location: "http://a-http.example/" });
      res.end();
    },
  },
};

let servidor: Server;
let transporte: Transporte;
const pedidas: { url: string; agente: string | undefined }[] = [];

before(async () => {
  servidor = createServer((req, res) => {
    const [, host = "", ...resto] = (req.url ?? "/").split("/");
    const ruta = `/${resto.join("/")}`.split("?")[0] ?? "/";
    pedidas.push({ url: `https://${host}${ruta}`, agente: req.headers["user-agent"] });
    const m = SITIOS[host]?.[ruta];
    if (m) return m(req, res);
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("no");
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  transporte = (url, init) => fetch(`http://127.0.0.1:${port}/${url.host}${url.pathname}${url.search}`, init);
});
after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

const lector = (extra: { selector?: SelectorDeEnlaces; timeoutMs?: number; maxBytes?: number } = {}) =>
  new LectorWeb({ reloj, enlaces: extra.selector ?? new DeterministicSelectorDeEnlaces(), transporte, timeoutMs: extra.timeoutMs ?? 2000, maxBytes: extra.maxBytes ?? 512 * 1024 });

test("lee la portada y las páginas internas útiles, con texto sin HTML, URL y fecha", async () => {
  pedidas.length = 0;
  const r = await lector().leer("viajes-faro.example");
  assert.ok(r.ok);
  assert.deepEqual(
    r.paginas.map((p) => p.url),
    ["https://viajes-faro.example/", "https://viajes-faro.example/empleo", "https://viajes-faro.example/noticias", "https://viajes-faro.example/quienes-somos"],
  );
  const [portada] = r.paginas;
  assert.equal(portada?.titulo, "Viajes Faro · Agencia en Valencia");
  assert.match(portada?.texto ?? "", /viajes de empresa, congresos e incentivos/);
  assert.doesNotMatch(portada?.texto ?? "", /<|console\.log/);
  assert.ok(r.paginas.every((p) => p.leidaEn === "2026-10-29T09:00:00.000Z"));
  assert.match(r.paginas[1]?.texto ?? "", /responsable comercial/);
  // robots.txt una vez, con el agente de Jano, y nada fuera del sitio ni prohibido.
  assert.equal(pedidas.filter((p) => p.url.endsWith("/robots.txt")).length, 1);
  assert.ok(pedidas.every((p) => p.agente === AGENTE_HTTP));
  assert.ok(pedidas.every((p) => p.url.startsWith("https://viajes-faro.example/")));
});

test("el selector solo elige entre los enlaces internos: ni otro sitio, ni http, ni ficheros, ni robots", async () => {
  let recibidos: string[] = [];
  const selector: SelectorDeEnlaces = {
    async elegir({ enlaces }) {
      recibidos = enlaces.map((e) => e.url);
      return ["https://otra-agencia.example/", "https://viajes-faro.example/aviso-legal", "https://viajes-faro.example/inventada", "https://viajes-faro.example/noticias"];
    },
  };
  const r = await lector({ selector }).leer("viajes-faro.example");
  assert.ok(r.ok);
  assert.deepEqual(recibidos.sort(), [
    "https://viajes-faro.example/aviso-legal",
    "https://viajes-faro.example/empleo",
    "https://viajes-faro.example/noticias",
    "https://viajes-faro.example/quienes-somos",
  ]);
  // aviso-legal lo prohíbe robots.txt; la inventada no estaba entre los enlaces.
  assert.deepEqual(r.paginas.map((p) => p.url), ["https://viajes-faro.example/", "https://viajes-faro.example/noticias"]);
});

test("si el selector falla, elige por palabras clave y la cuenta no se pierde", async () => {
  const r = await lector({ selector: { elegir: async () => Promise.reject(new Error("Bedrock no responde")) } }).leer("viajes-faro.example");
  assert.ok(r.ok);
  assert.equal(r.paginas.length, 4);
});

test("robots.txt que prohíbe el rastreo a JanoBot: no se lee y queda el motivo", async () => {
  pedidas.length = 0;
  const r = await lector().leer("prohibido.example");
  assert.deepEqual(r, { ok: false, motivo: "Su robots.txt no permite el rastreo a JanoBot." });
  assert.deepEqual(pedidas.map((p) => p.url), ["https://prohibido.example/robots.txt"]);
});

test("sin robots.txt (404) se puede leer", async () => {
  const r = await lector().leer("sin-robots.example");
  assert.ok(r.ok);
  assert.equal(r.paginas.length, 1);
});

test("una web que no contesta a tiempo queda con el motivo", async () => {
  const r = await lector({ timeoutMs: 300 }).leer("lenta.example");
  assert.deepEqual(r, { ok: false, motivo: "La web no responde (tiempo agotado a los 300 ms)." });
});

test("una página enorme se corta en el tope de bytes", async () => {
  const r = await lector({ maxBytes: 16 * 1024 }).leer("enorme.example");
  assert.ok(r.ok);
  const texto = r.paginas[0]?.texto ?? "";
  assert.match(texto, /^INICIO agencia de viajes/);
  assert.doesNotMatch(texto, /FINAL/);
  assert.ok(texto.length < 16 * 1024);
});

test("solo https: una redirección a http se rechaza", async () => {
  const r = await lector().leer("a-http.example");
  assert.deepEqual(r, { ok: false, motivo: "Solo se leen páginas https; http://a-http.example no lo es." });
});

test("un dominio que no existe no responde", async () => {
  const r = await new LectorWeb({ reloj, enlaces: new DeterministicSelectorDeEnlaces(), timeoutMs: 2000 }).leer("no-existe.invalid");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /^La web no responde/);
});
