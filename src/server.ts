import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { closeDatabase } from "./db/mongodb.js";
import { registerAiRoutes } from "./modules/ai/routes.js";
import { registerRankingRoutes } from "./modules/rankings/routes.js";
import { registerTodoRoutes } from "./modules/todos/routes.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.corsOrigins.includes("*") ? true : env.corsOrigins,
  methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
});

app.get("/health", async () => ({ status: "ok" }));
await registerRankingRoutes(app);
await registerTodoRoutes(app);
await registerAiRoutes(app);

const shutdown = async () => {
  await app.close();
  await closeDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ host: "0.0.0.0", port: env.port });
} catch (error) {
  app.log.error(error);
  await closeDatabase();
  process.exit(1);
}
