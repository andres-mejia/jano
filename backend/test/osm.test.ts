import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ATRIBUCION_OSM, candidatasDe, consultaOverpass, ManualCompanySource, OsmCompanySource, provinciasDe } from "../src/adapters/web/osm";

/**
 * Candidatas de OpenStreetMap (spec 008 T020b) con una respuesta de Overpass
 * grabada: los nombres y las webs del fichero son inventados.
 */
const grabada = JSON.parse(readFileSync(new URL("./fixtures/overpass-valencia.json", import.meta.url), "utf8")) as unknown;

test("regiones del ICP: una comunidad se trocea en sus provincias", () => {
  assert.deepEqual(provinciasDe("Comunitat Valenciana"), ["ES-V", "ES-A", "ES-CS"]);
  assert.deepEqual(provinciasDe("comunidad valenciana"), ["ES-V", "ES-A", "ES-CS"]);
  assert.deepEqual(provinciasDe("Castellón"), ["ES-CS"]);
  assert.deepEqual(provinciasDe("València"), ["ES-V"]);
  assert.deepEqual(provinciasDe("Región de Murcia"), ["ES-MU"]);
  assert.deepEqual(provinciasDe("Narnia"), []);
});

test("la consulta pide agencias con web propia y sin marca de cadena, en el área de la provincia", () => {
  const q = consultaOverpass("ES-V");
  assert.match(q, /^\[out:json\]\[timeout:25\];area\["ISO3166-2"="ES-V"\]/);
  for (const f of ['nwr["shop"="travel_agency"]["website"][!"brand"]', 'nwr["office"="travel_agent"]["contact:website"][!"brand"]']) assert.ok(q.includes(f), f);
});

test("de la respuesta: un dominio por agencia, con su origen; fuera cadenas, redes sociales y webs no válidas", () => {
  assert.deepEqual(candidatasDe(grabada), [
    { nombre: "Brújula Viajes", dominio: "brujula-viajes.example", ciudad: "Gandia", origen: "osm:way/2001" },
    { nombre: "Rutas del Turia", dominio: "rutas-turia.example", ciudad: null, origen: "osm:node/1002" },
    { nombre: "Viajes Azahar", dominio: "viajes-azahar.example", ciudad: "València", origen: "osm:node/1001" },
  ]);
});

test("una región se consulta provincia a provincia, con cabeceras propias, y reintenta una vez un 429", async () => {
  const llamadas: { url: string; accept: string | null; agente: string | null; data: string }[] = [];
  let primera = true;
  const pedir: typeof fetch = async (url, init) => {
    const cabeceras = new Headers(init?.headers);
    llamadas.push({
      url: String(url),
      accept: cabeceras.get("accept"),
      agente: cabeceras.get("user-agent"),
      data: new URLSearchParams(String(init?.body)).get("data") ?? "",
    });
    if (primera) {
      primera = false;
      return new Response("demasiadas", { status: 429 });
    }
    return Response.json(grabada);
  };
  const osm = new OsmCompanySource({ pedir, esperaReintentoMs: 1 });
  assert.equal(osm.atribucion, ATRIBUCION_OSM);
  assert.ok(osm.admite("Comunitat Valenciana"));
  assert.ok(!osm.admite("Narnia"));

  const r = await osm.buscar("Comunitat Valenciana", 50);
  assert.equal(r.length, 3);
  assert.deepEqual(
    llamadas.map((l) => /ISO3166-2"="([^"]+)"/.exec(l.data)?.[1]),
    ["ES-V", "ES-V", "ES-A", "ES-CS"],
  );
  assert.ok(llamadas.every((l) => l.url === "https://overpass-api.de/api/interpreter" && l.accept === "application/json" && l.agente?.startsWith("JanoBot/")));

  // Con el límite alcanzado no se consultan más provincias.
  llamadas.length = 0;
  assert.equal((await osm.buscar("Comunitat Valenciana", 2)).length, 2);
  assert.equal(llamadas.length, 1);
  await assert.rejects(osm.buscar("Narnia", 10), /región no reconocida/);
});

test("un error de Overpass que no es temporal se propaga", async () => {
  const osm = new OsmCompanySource({ pedir: async () => new Response("mal", { status: 400 }), esperaReintentoMs: 1 });
  await assert.rejects(osm.buscar("Castellón", 10), /Overpass respondió 400 para ES-CS/);
});

test("dominios pegados a mano: origen manual y nombre deducido", () => {
  assert.deepEqual(new ManualCompanySource().candidatas(["viajes-faro.example"]), [
    { nombre: "Viajes faro", dominio: "viajes-faro.example", ciudad: null, origen: "manual" },
  ]);
});
