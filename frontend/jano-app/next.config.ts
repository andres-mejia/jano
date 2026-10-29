import type { NextConfig } from "next";

import { assertEnvValido } from "./src/lib/config/env";

// Un build sin las variables críticas no debe poder publicarse: Amplify
// ejecuta `next build`, y si esto lanza, no hay artefacto que publicar.
assertEnvValido();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@jano/domain", "@jano/demo"],
  typedRoutes: true,
};

export default nextConfig;
