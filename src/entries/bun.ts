import { loadConfig, createContainer } from "../config/container";

const config = loadConfig(process.env as Record<string, string | undefined>);
const { app } = createContainer(config);
const server = Bun.serve({ port: config.port, fetch: app.fetch });
console.log(`pagebox listening on http://localhost:${server.port}`);
