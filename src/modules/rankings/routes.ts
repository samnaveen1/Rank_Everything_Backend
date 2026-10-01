import { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/service.js";
import { createActivity } from "../community/repository.js";
import { currentUserHandleFor } from "../users/repository.js";
import {
    createRanking,
    deleteRanking,
    distinctCategories,
    distinctTags,
    findRanking,
    getRatingBreakdown,
    listRankings,
    updateRanking,
} from "./repository.js";
import { emptyDistribution } from "./types.js";
import { asTrimmedString, parseInput, parsePatch } from "./validation.js";

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** Resolves the query value "me" to the configured current user. */
const resolveAuthor = (value: unknown, me: string): string | undefined => {
  const author = asTrimmedString(value);
  if (!author) {
    return undefined;
  }

  return author === "me" ? me : author;
};

export const registerRankingRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get<{ Querystring: Record<string, unknown> }>('/api/rankings', async (request) => {
    const currentUser = await currentUserHandleFor(request);
    return listRankings({
      category: asTrimmedString(request.query.category) || undefined,
      query: asTrimmedString(request.query.q) || undefined,
      authorHandle: resolveAuthor(request.query.author, currentUser),
      sort: request.query.sort === 'recent' ? 'recent' : 'rating',
      page: parseNumber(request.query.page, 1),
      pageSize: parseNumber(request.query.pageSize, 10),
    });
  });

  app.get("/api/categories", async () => {
    const categories = await distinctCategories();
    return categories.sort((left, right) => left.localeCompare(right));
  });

  app.get("/api/tags", async () => {
    const tags = await distinctTags();
    return tags.sort((left, right) => left.localeCompare(right));
  });

  app.get<{ Params: { id: string } }>("/api/rankings/:id", async (request, reply) => {
    const item = await findRanking(request.params.id);

    if (!item) {
      return reply.code(404).send({ message: "Ranking not found." });
    }

    return item;
  });

  app.get<{ Params: { id: string } }>("/api/rankings/:id/ratings", async (request, reply) => {
    const breakdown = await getRatingBreakdown(request.params.id);

    if (!breakdown) {
      return reply.code(404).send({ message: "Ranking not found." });
    }

    return breakdown;
  });

  app.post<{ Body: unknown }>("/api/rankings", { preHandler: requireAuth }, async (request, reply) => {
    try {
      // The signed-in handle always wins over anything in the body.
      const authorHandle = await currentUserHandleFor(request);
      const item = await createRanking({
        ...parseInput(request.body),
        authorHandle,
        reviewCount: 0,
        voteDistribution: emptyDistribution(),
      });

      await createActivity({ kind: "ranked", actorHandle: item.authorHandle, targetId: item.id });

      return reply.code(201).send(item);
    } catch (error) {
      return reply.code(400).send({ message: (error as Error).message });
    }
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/api/rankings/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const existing = await findRanking(request.params.id);

        if (!existing) {
          return reply.code(404).send({ message: "Ranking not found." });
        }

        const me = await currentUserHandleFor(request);
        if (existing.authorHandle !== me) {
          return reply.code(403).send({ message: "You can only edit your own rankings." });
        }

        const patch = parsePatch(request.body);
        const item = await updateRanking(request.params.id, patch);

        if (!item) {
          return reply.code(404).send({ message: "Ranking not found." });
        }

        if (patch.rating !== undefined || patch.title !== undefined) {
          await createActivity({ kind: "updated", actorHandle: item.authorHandle, targetId: item.id });
        }

        return item;
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/rankings/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const existing = await findRanking(request.params.id);

      if (!existing) {
        return reply.code(404).send({ message: "Ranking not found." });
      }

      const me = await currentUserHandleFor(request);
      if (existing.authorHandle !== me) {
        return reply.code(403).send({ message: "You can only delete your own rankings." });
      }

      if (!(await deleteRanking(request.params.id))) {
        return reply.code(404).send({ message: "Ranking not found." });
      }

      return reply.code(204).send();
    },
  );
};
