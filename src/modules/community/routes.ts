import { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/service.js";
import { currentUserHandleFor } from "../users/repository.js";
import { addComment, addShare, buildLeaderboard, listActivity, toggleLike } from "./repository.js";

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Resolves the query value "me" to the configured current user. */
const resolveAuthor = (value: unknown, me: string): string | undefined => {
  const author = asString(value);
  if (!author) {
    return undefined;
  }

  return author === "me" ? me : author;
};

const asPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const registerCommunityRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get<{ Querystring: Record<string, unknown> }>("/api/community/leaderboard", async (request) => {
    const entries = await buildLeaderboard({
      category: asString(request.query.category) || undefined,
      limit: asPositiveInt(request.query.limit, 25),
    });
    return entries;
  });

  app.get<{ Querystring: Record<string, unknown> }>('/api/community/feed', async (request) => {
    const currentUser = await currentUserHandleFor(request);
    return listActivity({
      limit: asPositiveInt(request.query.limit, 20),
      skip: asPositiveInt(request.query.offset, 1) - 1,
      authorHandle: resolveAuthor(request.query.author, currentUser),
      rankingId: asString(request.query.rankingId) || undefined,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/community/feed/:id/like",
    { preHandler: requireAuth },
    async (request, reply) => {
      const currentUser = await currentUserHandleFor(request);
      const result = await toggleLike(request.params.id, currentUser);

      if (!result) {
        return reply.code(404).send({ message: "Activity not found." });
      }

      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/community/feed/:id/comments",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const currentUser = await currentUserHandleFor(request);
        const updated = await addComment(request.params.id, body.body, currentUser);

        if (!updated) {
          return reply.code(404).send({ message: "Activity not found." });
        }

        return updated;
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/community/feed/:id/share",
    { preHandler: requireAuth },
    async (request, reply) => {
      const shareCount = await addShare(request.params.id);

      if (shareCount === null) {
        return reply.code(404).send({ message: "Activity not found." });
      }

      return { shareCount };
    },
  );
};
