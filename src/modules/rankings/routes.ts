import { FastifyInstance } from "fastify";
import {
    createRanking,
    deleteRanking,
    listRankings,
    updateRanking,
} from "./repository.js";
import { RankingInput } from "./types.js";

const validateInput = (body: unknown): RankingInput => {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const input = body as Partial<RankingInput>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes : "";
  const mapLink = typeof input.mapLink === "string" ? input.mapLink.trim() : "";

  if (!name || !category) {
    throw new Error("Name and category are required.");
  }

  if (typeof input.rating !== "number" || !Number.isFinite(input.rating)) {
    throw new Error("Rating must be a number.");
  }

  if (input.rating < 0 || input.rating > 10) {
    throw new Error("Rating must be between 0 and 10.");
  }

  return { name, category, rating: input.rating, mapLink, notes };
};

export const registerRankingRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/rankings", async () => listRankings());

  app.post<{ Body: unknown }>("/api/rankings", async (request, reply) => {
    try {
      const item = await createRanking(validateInput(request.body));
      return reply.code(201).send(item);
    } catch (error) {
      return reply.code(400).send({ message: (error as Error).message });
    }
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/api/rankings/:id",
    async (request, reply) => {
      try {
        const item = await updateRanking(request.params.id, validateInput(request.body));

        if (!item) {
          return reply.code(404).send({ message: "Ranking not found." });
        }

        return item;
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/rankings/:id",
    async (request, reply) => {
      const deleted = await deleteRanking(request.params.id);

      if (!deleted) {
        return reply.code(404).send({ message: "Ranking not found." });
      }

      return reply.code(204).send();
    },
  );
};
