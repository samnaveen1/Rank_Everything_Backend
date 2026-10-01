import { Collection, Filter, Sort } from "mongodb";
import { env } from "../../config/env.js";
import { getDatabase } from "../../db/mongodb.js";
import { resolveCurrentUserFromToken } from "../auth/session.js";
import { RankingItem, toRankingItem } from "../rankings/types.js";
import { UserDocument, UserHandle, UserStats, fallbackUser } from "./types.js";

const collection = async (): Promise<Collection<UserDocument>> => {
  const database = await getDatabase();
  return database.collection<UserDocument>("users");
};

const rankingsCollection = async (): Promise<Collection<RankingItem>> => {
  const database = await getDatabase();
  return database.collection<RankingItem>("ranking_items");
};

export const listUsers = async (): Promise<UserDocument[]> => {
  const users = await (await collection()).find({}).toArray();
  return users.sort((left, right) => right.followerCount - left.followerCount);
};

export const findUser = async (handle: string): Promise<UserDocument | null> => {
  const found = await (await collection()).findOne({ handle });
  return found ?? null;
};

export const resolveUser = async (handle: string): Promise<UserDocument> =>
  (await findUser(handle)) ?? fallbackUser(handle);

/** Ensures a user document exists, used when the current user creates content. */
export const ensureUser = async (
  handle: string,
  defaults: Pick<UserDocument, "name" | "avatarUrl" | "bio">,
): Promise<UserDocument> => {
  const users = await collection();
  await users.updateOne(
    { handle },
    {
      $setOnInsert: {
        handle,
        name: defaults.name,
        avatarUrl: defaults.avatarUrl,
        bio: defaults.bio,
        followerCount: 0,
        followingCount: 0,
        joinedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );

  const created = await users.findOne({ handle });
  return created ?? fallbackUser(handle);
};

export const isFollowing = async (target: string, follower: string): Promise<boolean> => {
  if (target === follower) {
    return false;
  }
  const following = await (await collection()).findOne({
    handle: follower,
    following: target,
  });
  return following !== null;
};

export const setFollowing = async (
  target: string,
  follower: string,
  follow: boolean,
): Promise<{ following: boolean; followerCount: number }> => {
  if (target === follower) {
    const unchanged = await findUser(target);
    return { following: false, followerCount: unchanged?.followerCount ?? 0 };
  }

  const users = await collection();
  const update: Filter<UserDocument> = { handle: follower };

  if (follow) {
    await users.updateOne(update, { $addToSet: { following: target } as never });
  } else {
    await users.updateOne(update, { $pull: { following: target } as never });
  }

  await users.updateOne(
    { handle: target },
    follow ? { $inc: { followerCount: 1 } } : { $inc: { followerCount: -1 } },
  );

  const updated = await users.findOne({ handle: target });
  return { following: follow, followerCount: Math.max(0, updated?.followerCount ?? 0) };
};

export const buildUserMap = (users: UserDocument[]): Map<string, UserHandle> =>
  new Map(
    users.map((user) => [
      user.handle,
      { handle: user.handle, name: user.name, avatarUrl: user.avatarUrl },
    ]),
  );

export const summarizeUser = (
  user: UserDocument,
  rankings: Array<{ rating: number; category: string }>,
): UserStats => {
  const categoryCounts = new Map<string, number>();
  for (const ranking of rankings) {
    categoryCounts.set(ranking.category, (categoryCounts.get(ranking.category) ?? 0) + 1);
  }

  const averageRating =
    rankings.length > 0
      ? Math.round((rankings.reduce((total, ranking) => total + ranking.rating, 0) / rankings.length) * 10) / 10
      : null;

  return {
    rankingCount: rankings.length,
    averageRating,
    followerCount: user.followerCount,
    topCategories: [...categoryCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([category]) => category),
  };
};

/** Normalizes a client-supplied handle into a safe, lowercased slug. */
export const normalizeHandle = (value: unknown): string | undefined => {
  const handle = (typeof value === "string" ? value : "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_.]/g, "");

  return handle.length > 0 && handle.length <= 32 ? handle : undefined;
};

/**
 * Resolves the acting user for a request. Requests can arrive with either a
 * persisted `X-User-Handle` header or a bearer token created during auth.
 */
export const currentUserHandleFor = async (request?: unknown): Promise<string> => {
  const tokenHandle = await resolveCurrentUserFromToken(request);
  if (tokenHandle) {
    return tokenHandle;
  }

  const headers = (request as { headers?: Record<string, unknown> } | undefined)?.headers ?? {};
  const raw = headers["x-user-handle"] ?? headers["X-User-Handle"];
  const normalized = normalizeHandle(raw);

  return normalized ?? env.currentUserHandle;
};

export const currentUserHandle = (): string => env.currentUserHandle;

export type UserRankingGroup = "top" | "recent" | "category";

/**
 * A user's rankings grouped for the profile grid. Only the lightweight fields
 * the grid needs are returned.
 */
export const listRankingsForUser = async (
  handle: string,
  group: UserRankingGroup = "top",
  category?: string,
): Promise<
  Array<{
    id: string;
    title: string;
    category: string;
    tags: string[];
    rating: number;
    posterUrl: string | null;
    updatedAt: string;
  }>
> => {
  const filter = { authorHandle: handle } as Filter<RankingItem>;
  if (group === "category" && category) {
    filter.category = category;
  }

  const sort: Sort = group === "recent" ? { updatedAt: -1 } : { rating: -1 };
  const rankings = await (await rankingsCollection()).find(filter).sort(sort).toArray();

  return rankings.map((ranking) => {
    const item = toRankingItem(ranking as unknown as Record<string, unknown>);
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      tags: item.tags,
      rating: item.rating,
      posterUrl: item.posterUrls[0] ?? null,
      updatedAt: item.updatedAt,
    };
  });
};
