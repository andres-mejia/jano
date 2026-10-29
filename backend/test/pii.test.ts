import assert from "node:assert/strict";
import { test } from "node:test";

import { limpiarPii, limpiarPiiProfundo } from "../src/domain/pii";

/** PiiStripper (spec 008 T021): datos inventados, nunca reales (AGENTS.md §5). */

test("teléfonos españoles e internacionales, con y sin separadores", () => {
  const r = limpiarPii("Llámanos al 961 234 567, al +34 612-345-678, al 0034 912345678 o al +33 1 23 45 67 89.");
  assert.equal(r.texto, "Llámanos al [TELÉFONO], al [TELÉFONO], al [TELÉFONO] o al [TELÉFONO].");
  assert.equal(r.sustituciones.telefono, 4);
});

test("emails de cualquier forma", () => {
  const r = limpiarPii("Escribe a reservas@viajes-azahar.example o a Ana.Gil+web@correo.example.");
  assert.equal(r.texto, "Escribe a [EMAIL] o a [EMAIL].");
  assert.equal(r.sustituciones.email, 2);
});

test("NIF, DNI, NIE y CIF", () => {
  const r = limpiarPii("CIF B12345678, DNI 12345678Z, NIE X-1234567-L, NIF ES B98765432 y 87654321-X.");
  assert.equal(r.texto, "CIF [NIF], DNI [NIF], NIE [NIF], NIF [NIF] y [NIF].");
  assert.equal(r.sustituciones.nif, 5);
});

test("IBAN agrupado o seguido, sin confundirlo con un teléfono", () => {
  const r = limpiarPii("Transferencia a ES91 2100 0418 4502 0005 1332 o a ES9121000418450200051332.");
  assert.equal(r.texto, "Transferencia a [IBAN] o a [IBAN].");
  assert.deepEqual(r.sustituciones, { iban: 2 });
});

test("lo que no es un dato personal se queda igual", () => {
  const texto = "Fundada en 1998, 25 empleados, 3 oficinas. Abierto de 9:30 a 14:00. Código postal 46001. Pedido 2026-10-29.";
  assert.deepEqual(limpiarPii(texto), { texto, sustituciones: {} });
});

test("una entrada estructurada: limpia el texto y respeta ids, URLs y fechas", () => {
  const entrada = {
    stepId: "a1b2c3d4-9876-4543-8123-56789abcdef0",
    url: "https://viajes-azahar.example/contacto?tel=961234567",
    leidaEn: "2026-10-29T09:00:00.000Z",
    paginas: [{ texto: "Tel. 961 234 567 · info@viajes-azahar.example" }],
  };
  const r = limpiarPiiProfundo(entrada);
  assert.deepEqual(r.valor, { ...entrada, paginas: [{ texto: "Tel. [TELÉFONO] · [EMAIL]" }] });
  assert.deepEqual(r.sustituciones, { telefono: 1, email: 1 });
});
