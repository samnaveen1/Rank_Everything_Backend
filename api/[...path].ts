import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    AuthError,
    authUserFromRequest,
    googleSignIn,
    loginAccount,
    registerAccount,
    requireAuthedHandle,
} from "../src/modules/auth/service.js";
import { bearerTokenFrom, clearSessionForToken } from "../src/modules/auth/session.js";
import {
  addComment,
  addShare,
  buildLeaderboard,
  listActivity,
  toggleLike,
} from "../src/modules/community/repository.js";
import {
  createRanking,
  deleteRanking,
  distinctCategories,
  distinctTags,
  findRanking,
  getRatingBreakdown,
  listRankings,
  updateRanking,
} from "../src/modules/rankings/repository.js";
import { emptyDistribution } from "../src/modules/rankings/types.js";
import { asTrimmedString, parseInput, parsePatch } from "../src/modules/rankings/validation.js";
import {
  currentUserHandleFor,
  findUser,
  isFollowing,
  listRankingsForUser,
  setFollowing,
  summarizeUser,
} from "../src/modules/users/repository.js";
import { fallbackUser, toUserProfile } from "../src/modules/users/types.js";

/**
 * Mirrors the Fastify route tree for serverless deployments. Validation is
 * shared with the Fastify routes so the two entry points cannot drift.
 */

const sendCors = (response: VercelResponse): void => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Handle");
};

const sendError = (response: VercelResponse, status: number, message: string): void => {
  response.status(status).json({ message });
};

const positiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** Resolves the path segment or query value "me" to the configured current user. */
const resolveMe = (value: unknown, me: string): string => {
  const raw = asTrimmedString(value);
  return raw === "me" ? me : raw;
};

const resolveOptionalMe = (value: unknown, me: string): string | undefined => {
  const raw = asTrimmedString(value);
  if (!raw) {
    return undefined;
  }

  return raw === "me" ? me : raw;
};

/** Resolves the acting user from the Authorization token or X-User-Handle header. */
const me = async (request: VercelRequest): Promise<string> =>
  currentUserHandleFor({ headers: request.headers as Record<string, unknown> });

const query = (request: VercelRequest, key: string): unknown => {
  const value = request.query[key];
  return Array.isArray(value) ? value[0] : value;
};

const body = (request: VercelRequest): Record<string, unknown> =>
  (request.body ?? {}) as Record<string, unknown>;

const segments = (request: VercelRequest): string[] => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  return path.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
};

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  sendCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  // Path shapes differ per resource, so keep the raw segments and destructure
  // them inside each branch:
  //   /api/rankings/:id/ratings          -> rankings, id, ratings
  //   /api/users/:handle/:verb           -> users, handle, verb
  //   /api/community/feed/:id/:action    -> community, feed, id, action
  const [resource, first, second, third] = segments(request);

  try {
    if (resource === "health" && request.method === "GET") {
      response.status(200).json({ status: "ok" });
      return;
    }

    if (resource === "auth") {
      const action = first;

      if (action === "register" && request.method === "POST") {
        response.status(200).json(await registerAccount(body(request)));
        return;
      }

      if (action === "login" && request.method === "POST") {
        response.status(200).json(await loginAccount(body(request)));
        return;
      }

      if (action === "google" && request.method === "POST") {
        response.status(200).json(await googleSignIn(body(request).accessToken));
        return;
      }

      if (action === "me" && request.method === "GET") {
        const user = await authUserFromRequest(request);
        if (!user) return sendError(response, 401, "Sign in to continue.");
        response.status(200).json(user);
        return;
      }

      if (action === "logout" && request.method === "POST") {
        await clearSessionForToken(bearerTokenFrom(request));
        response.status(200).json({ ok: true });
        return;
      }
    }

    if (resource === "categories" && request.method === "GET") {
      response.status(200).json((await distinctCategories()).sort((a, b) => a.localeCompare(b)));
      return;
    }

    if (resource === "tags" && request.method === "GET") {
      response.status(200).json((await distinctTags()).sort((a, b) => a.localeCompare(b)));
      return;
    }

    if (resource === "rankings") {
      const rankingId = first;
      const subResource = second;

      if (!rankingId && request.method === "GET") {
        const currentUser = await me(request);
        response.status(200).json(await listRankings({
          category: asTrimmedString(query(request, "category")) || undefined,
          query: asTrimmedString(query(request, "q")) || undefined,
          authorHandle: resolveOptionalMe(query(request, "author"), currentUser),
          sort: query(request, "sort") === "recent" ? "recent" : "rating",
          page: positiveInt(query(request, "page"), 1),
          pageSize: positiveInt(query(request, "pageSize"), 10),
        }));
        return;
      }

      if (!rankingId && request.method === "POST") {
        const actor = await requireAuthedHandle(request);
        const item = await createRanking({
          ...parseInput(request.body),
          authorHandle: actor,
          reviewCount: 0,
          voteDistribution: emptyDistribution(),
        });
        response.status(201).json(item);
        return;
      }

      if (rankingId && subResource === "ratings" && request.method === "GET") {
        const breakdown = await getRatingBreakdown(rankingId);
        if (!breakdown) return sendError(response, 404, "Ranking not found.");
        response.status(200).json(breakdown);
        return;
      }

      if (rankingId && request.method === "GET") {
        const item = await findRanking(rankingId);
        if (!item) return sendError(response, 404, "Ranking not found.");
        response.status(200).json(item);
        return;
      }

      if (rankingId && request.method === "PATCH") {
        const actor = await requireAuthedHandle(request);
        const existing = await findRanking(rankingId);
        if (!existing) return sendError(response, 404, "Ranking not found.");
        if (existing.authorHandle !== actor) return sendError(response, 403, "You can only edit your own rankings.");
        const item = await updateRanking(rankingId, parsePatch(request.body));
        if (!item) return sendError(response, 404, "Ranking not found.");
        response.status(200).json(item);
        return;
      }

      if (rankingId && request.method === "DELETE") {
        const actor = await requireAuthedHandle(request);
        const existing = await findRanking(rankingId);
        if (!existing) return sendError(response, 404, "Ranking not found.");
        if (existing.authorHandle !== actor) return sendError(response, 403, "You can only delete your own rankings.");
        if (!(await deleteRanking(rankingId))) return sendError(response, 404, "Ranking not found.");
        response.status(204).end();
        return;
      }
    }

    if (resource === "users") {
      const handle = first;
      const subResource = second;

      if ((!handle || handle === "me") && request.method === "GET") {
        const current = await me(request);
        response.status(200).json(toUserProfile((await findUser(current)) ?? fallbackUser(current), true));
        return;
      }

      if (subResource === "stats" && request.method === "GET") {
        const currentUser = await me(request);
        const target = resolveMe(handle, currentUser);
        const user = (await findUser(target)) ?? fallbackUser(target);
        response.status(200).json(summarizeUser(user, await listRankingsForUser(target)));
        return;
      }

      if (subResource === "rankings" && request.method === "GET") {
        const currentUser = await me(request);
        const group = asTrimmedString(query(request, "group")) || "top";
        const category = asTrimmedString(query(request, "category"));
        response.status(200).json(await listRankingsForUser(resolveMe(handle, currentUser), group as "top" | "recent" | "category", category || undefined));
        return;
      }

      if (subResource === "following" && request.method === "GET") {
        const currentUser = await me(request);
        response.status(200).json({ following: await isFollowing(resolveMe(handle, currentUser), currentUser) });
        return;
      }

      if (subResource === "follow" && request.method === "POST") {
        const actor = await requireAuthedHandle(request);
        const target = resolveMe(handle, actor);
        if (!(await findUser(target))) return sendError(response, 404, "User not found.");
        response.status(200).json(await setFollowing(target, actor, body(request).follow !== false));
        return;
      }
    }

    // Community paths put the sub-resource in the second segment:
    //   /api/community/leaderboard          -> community, leaderboard
    //   /api/community/feed                 -> community, feed
    //   /api/community/feed/:id/:action     -> community, feed, id, action
    if (resource === "community") {
      const subResource = first;
      const activityId = second;
      const action = third;

      if (subResource === "leaderboard" && request.method === "GET") {
        response.status(200).json(await buildLeaderboard({
          category: asTrimmedString(query(request, "category")) || undefined,
          limit: positiveInt(query(request, "limit"), 25),
        }));
        return;
      }

      if (subResource === "feed") {
        if (!activityId && request.method === "GET") {
          const currentUser = await me(request);
          response.status(200).json(await listActivity({
            limit: positiveInt(query(request, "limit"), 20),
            skip: positiveInt(query(request, "offset"), 1) - 1,
            authorHandle: resolveOptionalMe(query(request, "author"), currentUser),
            rankingId: asTrimmedString(query(request, "rankingId")) || undefined,
          }));
          return;
        }

        if (action === "like" && request.method === "POST") {
          const actor = await requireAuthedHandle(request);
          const result = await toggleLike(activityId, actor);
          if (!result) return sendError(response, 404, "Activity not found.");
          response.status(200).json(result);
          return;
        }

        if (action === "share" && request.method === "POST") {
          await requireAuthedHandle(request);
          const shareCount = await addShare(activityId);
          if (shareCount === null) return sendError(response, 404, "Activity not found.");
          response.status(200).json({ shareCount });
          return;
        }

        if (action === "comments" && request.method === "POST") {
          const actor = await requireAuthedHandle(request);
          const updated = await addComment(activityId, body(request).body, actor);
          if (!updated) return sendError(response, 404, "Activity not found.");
          response.status(200).json(updated);
          return;
        }
      }
    }

    sendError(response, 404, "Route not found.");
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    sendError(response, status, error instanceof Error ? error.message : "Request failed.");
  }
}
