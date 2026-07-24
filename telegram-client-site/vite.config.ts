import vinext from "vinext";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";

function readDeployConfig() {
  const cloudflareConfig = ".cloudflare/deploy.json";
  const sitesConfig = ".openai/hosting.json";
  const source = existsSync(cloudflareConfig) ? cloudflareConfig : sitesConfig;
  const config = JSON.parse(readFileSync(source, "utf8")) as { d1?: string; database_name?: string; database_id?: string };
  return {
    binding: config.d1 || "DB",
    databaseName: config.database_name || "cflow-production",
    databaseId: config.database_id || "00000000-0000-4000-8000-000000000000",
  };
}

const deployConfig = readDeployConfig();

export default defineConfig(async () => {
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: [{ binding: deployConfig.binding, database_name: deployConfig.databaseName, database_id: deployConfig.databaseId }],
        },
      }),
    ],
  };
});
