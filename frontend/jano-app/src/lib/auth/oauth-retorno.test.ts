import assert from "node:assert/strict";
import { test } from "node:test";

import { clasificarRetorno, mensajeDeRetorno } from "./oauth-retorno";

const retorno = (error: string, descripcion?: string) =>
  `?${new URLSearchParams({ error, ...(descripcion ? { error_description: descripcion } : {}) }).toString()}`;

test("sin error en la URL no hay nada que tratar", () => {
  assert.equal(clasificarRetorno(""), null);
  assert.equal(clasificarRetorno("?code=abc&state=xyz"), null);
});

test("el rechazo del trigger PreSignUp es sin_acceso", () => {
  assert.equal(clasificarRetorno(retorno("invalid_request", "PreSignUp failed with error SIN_ACCESO. ")), "sin_acceso");
  assert.match(mensajeDeRetorno("sin_acceso") ?? "", /administrador/);
});

test("el primer login tras enlazar se reintenta", () => {
  const r = retorno("invalid_request", "Already found an entry for username Google_123");
  assert.equal(clasificarRetorno(r), "reintentar");
});

test("cancelar en Google no muestra error", () => {
  assert.equal(clasificarRetorno(retorno("access_denied")), "cancelado");
  assert.equal(mensajeDeRetorno("cancelado"), null);
});

test("cualquier otro error es genérico y no enseña códigos internos", () => {
  assert.equal(clasificarRetorno(retorno("server_error", "Internal 500")), "google");
  assert.doesNotMatch(mensajeDeRetorno("google") ?? "", /500|server_error/);
  assert.equal(mensajeDeRetorno("otra-cosa"), null);
});
