import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import robotsParser from "robots-parser";

import type { SelectorDeEnlaces } from "../../ports/ia";
import type { Reloj } from "../../ports/reloj";
import type { EnlaceInterno, LecturaWeb, PaginaLeida, WebReader } from "../../ports/web";
import { elegirPorPalabras } from "../deterministas/ia";

/**
 * Lector de webs públicas (spec 008 FR-013). Solo `https`, respeta `robots.txt`
 * con el agente `JanoBot`, 10 s y 512 KB por página, y devuelve el texto principal
 * sin HTML (Readability sobre linkedom). Lee la portada y, de sus enlaces al mismo
 * sitio, las páginas que elige el Account Finder (como mucho 3: empleo, noticias,
 * quiénes somos, oficinas). Lo que no se puede leer no es un error: es un motivo.
 */

export const AGENTE_HTTP = "JanoBot (+https://jano.tekhos.com)";
/** Nombre con el que JanoBot se busca en las reglas de `robots.txt`. */
export const AGENTE_ROBOTS = "JanoBot";

const MAX_REDIRECCIONES = 3;
const MAX_ENLACES = 80;
/** Texto por página que llega al modelo: lo que cabe de sobra para juzgar el encaje. */
const MAX_TEXTO = 6000;
const NO_HTML = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|rar|docx?|xlsx?|pptx?|mp3|mp4|avi|mov)$/i;

export type Transporte = (url: URL, init: RequestInit) => Promise<Response>;

export interface OpcionesLector {
  readonly reloj: Reloj;
  readonly enlaces: SelectorDeEnlaces;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxInternas?: number;
  /** Cómo se pide una URL. En producción, `fetch` tal cual; los tests la llevan a un servidor local. */
  readonly transporte?: Transporte;
}

type Descarga = { readonly ok: true; readonly url: URL; readonly html: string } | { readonly ok: false; readonly motivo: string };

/** Lo mínimo del DOM de linkedom que se usa aquí (el proyecto compila sin la librería DOM). */
interface Nodo {
  readonly textContent: string | null;
  getAttribute(nombre: string): string | null;
  remove(): void;
}
interface Documento {
  querySelector(selector: string): Nodo | null;
  querySelectorAll(selector: string): Iterable<Nodo>;
  readonly body: Nodo | null;
}

const sitio = (host: string) => host.toLowerCase().replace(/^www\./, "");
const espacios = (t: string) => t.replace(/\s+/g, " ").trim();

export class LectorWeb implements WebReader {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxInternas: number;
  private readonly transporte: Transporte;

  constructor(private readonly o: OpcionesLector) {
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.maxBytes = o.maxBytes ?? 512 * 1024;
    this.maxInternas = o.maxInternas ?? 3;
    this.transporte = o.transporte ?? ((url, init) => fetch(url, init));
  }

  async leer(dominio: string): Promise<LecturaWeb> {
    const robots = new Map<string, Promise<RobotsDeOrigen>>();
    const portada = await this.descargar(new URL(`https://${dominio}/`), robots);
    if (!portada.ok) return portada;
    const leidaEn = this.o.reloj.ahora().toISOString();
    const inicio = extraer(portada.html, portada.url);
    const paginas: PaginaLeida[] = [{ url: portada.url.href, titulo: inicio.titulo, texto: inicio.texto, leidaEn }];
    if (!inicio.texto) return { ok: false, motivo: "Su portada no tiene texto legible." };

    const candidatas = inicio.enlaces.filter((e) => e.url !== portada.url.href);
    if (!candidatas.length) return { ok: true, paginas };
    let elegidas: readonly string[];
    try {
      elegidas = await this.o.enlaces.elegir({
        dominio,
        portada: { titulo: inicio.titulo, texto: inicio.texto },
        enlaces: candidatas,
        maximo: this.maxInternas,
      });
    } catch (e) {
      // Sin el modelo, las mismas páginas por palabras clave: la cuenta no se pierde por eso.
      console.warn(JSON.stringify({ msg: "selector_de_enlaces_fallido", dominio, error: e instanceof Error ? e.message : String(e) }));
      elegidas = elegirPorPalabras(candidatas, this.maxInternas);
    }
    const permitidas = new Set(candidatas.map((c) => c.url));
    for (const url of [...new Set(elegidas)].filter((u) => permitidas.has(u)).slice(0, this.maxInternas)) {
      const d = await this.descargar(new URL(url), robots, sitio(portada.url.host));
      if (!d.ok) continue;
      const p = extraer(d.html, d.url);
      if (p.texto) paginas.push({ url: d.url.href, titulo: p.titulo, texto: p.texto, leidaEn: this.o.reloj.ahora().toISOString() });
    }
    return { ok: true, paginas };
  }

  /**
   * Una página con sus redirecciones: cada salto tiene que ser https, permitido por
   * `robots.txt` y, salvo en la portada, del mismo sitio. 10 s para todo.
   */
  private async descargar(url: URL, robots: Map<string, Promise<RobotsDeOrigen>>, mismoSitio?: string): Promise<Descarga> {
    const senal = AbortSignal.timeout(this.timeoutMs);
    let actual = url;
    try {
      for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
        if (actual.protocol !== "https:") return { ok: false, motivo: `Solo se leen páginas https; ${actual.origin} no lo es.` };
        if (mismoSitio && sitio(actual.host) !== mismoSitio) return { ok: false, motivo: "La página lleva a otro sitio." };
        let r = robots.get(actual.origin);
        if (!r) {
          r = this.robots(actual.origin, senal);
          robots.set(actual.origin, r);
        }
        const reglas = await r;
        if (!reglas.ok) return reglas;
        if (!reglas.permite(actual.href)) return { ok: false, motivo: "Su robots.txt no permite el rastreo a JanoBot." };

        const res = await this.pedir(actual, senal, "text/html,application/xhtml+xml");
        const destino = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && destino) {
          await res.body?.cancel();
          actual = new URL(destino, actual);
          continue;
        }
        if (!res.ok) {
          await res.body?.cancel();
          return { ok: false, motivo: `La web responde con un error (${res.status}).` };
        }
        const tipo = res.headers.get("content-type") ?? "";
        if (!/text\/html|application\/xhtml/i.test(tipo)) {
          await res.body?.cancel();
          return { ok: false, motivo: "La página no es HTML." };
        }
        return { ok: true, url: actual, html: await leerConTope(res, this.maxBytes, tipo) };
      }
      return { ok: false, motivo: "Demasiadas redirecciones." };
    } catch (e) {
      return { ok: false, motivo: noResponde(e, this.timeoutMs) };
    }
  }

  private pedir(url: URL, signal: AbortSignal, accept: string): Promise<Response> {
    return this.transporte(url, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { "user-agent": AGENTE_HTTP, accept, "accept-language": "es-ES,es;q=0.9" },
    });
  }

  /**
   * `robots.txt` del origen. Si no existe (4xx), todo permitido; si el servidor
   * falla o no contesta, no se lee nada, como hacen los buscadores.
   */
  private async robots(origen: string, senal: AbortSignal): Promise<RobotsDeOrigen> {
    const url = new URL("/robots.txt", origen);
    try {
      let actual = url;
      for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
        const res = await this.pedir(actual, senal, "text/plain");
        const destino = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && destino) {
          await res.body?.cancel();
          actual = new URL(destino, actual);
          if (actual.protocol !== "https:") break;
          continue;
        }
        if (res.status >= 400 && res.status < 500) {
          await res.body?.cancel();
          return { ok: true, permite: () => true };
        }
        if (!res.ok) {
          await res.body?.cancel();
          return { ok: false, motivo: `Su robots.txt responde con un error (${res.status}).` };
        }
        const reglas = robotsParser(url.href, await leerConTope(res, this.maxBytes, res.headers.get("content-type") ?? ""));
        return { ok: true, permite: (u) => reglas.isAllowed(u, AGENTE_ROBOTS) !== false };
      }
      return { ok: false, motivo: "Su robots.txt redirige a una dirección no válida." };
    } catch (e) {
      return { ok: false, motivo: noResponde(e, this.timeoutMs) };
    }
  }
}

type RobotsDeOrigen = { readonly ok: true; readonly permite: (url: string) => boolean } | { readonly ok: false; readonly motivo: string };

function noResponde(e: unknown, timeoutMs: number): string {
  const nombre = (e as { name?: unknown }).name;
  if (nombre === "TimeoutError" || nombre === "AbortError") return `La web no responde (tiempo agotado a los ${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`}).`;
  const causa = (e as { cause?: { code?: unknown } }).cause?.code;
  return `La web no responde${typeof causa === "string" ? ` (${causa})` : ""}.`;
}

/** Lee el cuerpo hasta `max` bytes y corta la conexión: una página enorme no pasa del tope. */
async function leerConTope(res: Response, max: number, tipo: string): Promise<string> {
  const lector = res.body?.getReader();
  if (!lector) return "";
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    const cabe = Math.min(value.length, max - total);
    trozos.push(value.subarray(0, cabe));
    total += cabe;
    if (total >= max) {
      await lector.cancel();
      break;
    }
  }
  const charset = /charset=["']?([\w-]+)/i.exec(tipo)?.[1] ?? "utf-8";
  const bytes = Buffer.concat(trozos);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Título, texto principal y enlaces internos de una página. */
export function extraer(html: string, url: URL): { titulo: string | null; texto: string; enlaces: EnlaceInterno[] } {
  const { document } = parseHTML(html) as unknown as { document: Documento };
  const titulo = espacios(document.querySelector("title")?.textContent ?? "").slice(0, 200) || null;

  // Los enlaces, antes de Readability, que reescribe el documento.
  const enlaces = new Map<string, EnlaceInterno>();
  for (const a of document.querySelectorAll("a[href]")) {
    if (enlaces.size >= MAX_ENLACES) break;
    let destino: URL;
    try {
      destino = new URL(a.getAttribute("href") ?? "", url);
    } catch {
      continue;
    }
    if (destino.protocol !== "https:" || sitio(destino.host) !== sitio(url.host) || NO_HTML.test(destino.pathname)) continue;
    destino.hash = "";
    const texto = espacios(a.textContent || a.getAttribute("title") || a.getAttribute("aria-label") || "").slice(0, 100);
    if (!enlaces.has(destino.href)) enlaces.set(destino.href, { url: destino.href, texto });
  }

  let texto = "";
  try {
    texto = espacios(new Readability(document as never).parse()?.textContent ?? "");
  } catch {
    texto = "";
  }
  // Las portadas no suelen ser «artículos»: si Readability se queda corto, el texto visible.
  if (texto.length < 200) {
    const { document: copia } = parseHTML(html) as unknown as { document: Documento };
    for (const n of copia.querySelectorAll("script, style, noscript, template, svg, iframe")) n.remove();
    const visible = espacios(copia.body?.textContent ?? "");
    if (visible.length > texto.length) texto = visible;
  }
  return { titulo, texto: texto.slice(0, MAX_TEXTO), enlaces: [...enlaces.values()] };
}
