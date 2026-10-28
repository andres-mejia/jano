import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRevenue, timeAgo } from "./format";

test("formatRevenue muestra millones y miles con coma decimal", () => {
  assert.equal(formatRevenue(4_200_000), "4,2 M€");
  assert.equal(formatRevenue(1_000_000), "1 M€");
  assert.equal(formatRevenue(850_000), "850 k€");
  assert.equal(formatRevenue(null), "—");
});

test("timeAgo redondea a minutos, horas y días", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  assert.equal(timeAgo("2026-10-28T11:59:40.000Z", now), "ahora");
  assert.equal(timeAgo("2026-10-28T11:48:00.000Z", now), "hace 12 min");
  assert.equal(timeAgo("2026-10-28T09:00:00.000Z", now), "hace 3 h");
  assert.equal(timeAgo("2026-10-25T12:00:00.000Z", now), "hace 3 d");
});
