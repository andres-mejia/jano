// Ejecuta un comando con un Postgres 16 disponible en DATABASE_URL. En CI lo da el
// servicio del job; en local se levanta un contenedor efímero y se borra al acabar.
import { execFileSync, spawnSync } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
let contenedor = null;

if (!process.env.DATABASE_URL) {
  contenedor = execFileSync("docker", [
    "run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=jano", "-p", "127.0.0.1::5432", "postgres:16",
  ]).toString().trim();
  const puerto = execFileSync("docker", ["port", contenedor, "5432/tcp"]).toString().trim().split(":").pop();
  for (let i = 0; ; i++) {
    const listo = spawnSync("docker", ["exec", contenedor, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"]);
    if (listo.status === 0) break;
    if (i > 60) throw new Error("Postgres no arrancó");
    await new Promise((r) => setTimeout(r, 500));
  }
  process.env.DATABASE_URL = `postgres://postgres:jano@127.0.0.1:${puerto}/postgres`;
}

const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
if (contenedor) execFileSync("docker", ["stop", contenedor], { stdio: "ignore" });
process.exit(r.status ?? 1);
