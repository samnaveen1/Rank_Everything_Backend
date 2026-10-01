import { Collection, Filter } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";
import { listAllRankings } from "../rankings/repository.js";
import { RankingItem } from "../rankings/types.js";
import { buildUserMap, currentUserHandle, listUsers, resolveUser } from "../users/repository.js";
import { UserHandle } from "../users/types.js";
import {
  ActivityDocument,
  ActivityItem,
  ActivityKind,
  ActivityPage,
  ActivityTarget,
  LeaderboardEntry,
} from "./types.js";

const collection = async (): Promise<Collection<ActivityDocument>> => {
  const database = await getDatabase();
  return database.collection<ActivityDocument>("activity");
};

const MAX_COMMENTS = 50;
const MAX_COMMENT_LENGTH = 500;

const rankingTargets = (rankings: RankingItem[]): Map<string, ActivityTarget> =>
  new Map(
    rankings.map((ranking) => [
      ranking.id,
      {
        id: ranking.id,
        title: ranking.title,
        category: ranking.category,
        posterUrl: ranking.posterUrls[0] ?? null,
        rating: ranking.rating,
      },
    ]),
  );

const toActivityItem = (
  document: ActivityDocument,
  users: Map<string, UserHandle>,
  targets: Map<string, ActivityTarget>,
  viewer: string,
): ActivityItem => {
  const actor = users.get(document.actorHandle) ?? {
    handle: document.actorHandle,
    name: document.actorHandle,
    avatarUrl: "",
  };

  return {
    id: document.id,
    kind: document.kind,
    actor,
    createdAt: document.createdAt,
    target: document.targetId ? targets.get(document.targetId) ?? null : null,
    likeCount: document.likeHandles.length,
    commentCount: document.comments.length,
    shareCount: document.shareCount,
    likedByMe: document.likeHandles.includes(viewer),
    comments: document.comments,
  };
};

const loadContext = async (): Promise<{
  users: Map<string, UserHandle>;
  targets: Map<string, ActivityTarget>;
}> => {
  const [users, rankings] = await Promise.all([listUsers(), listAllRankings()]);
  return { users: buildUserMap(users), targets: rankingTargets(rankings) };
};

export const listActivity = async (options: {
  limit?: number;
  skip?: number;
  authorHandle?: string;
  rankingId?: string;
} = {}): Promise<ActivityPage> => {
  const activity = await collection();
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const skip = Math.max(0, options.skip ?? 0);

  const filter: Filter<ActivityDocument> = {};
  if (options.authorHandle) {
    filter.actorHandle = options.authorHandle;
  }
  if (options.rankingId) {
    filter.targetId = options.rankingId;
  }

  const [documents, total, { users, targets }] = await Promise.all([
    activity.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    activity.countDocuments(filter),
    loadContext(),
  ]);

  const viewer = currentUserHandle();

  return {
    items: documents.map((document) => toActivityItem(document, users, targets, viewer)),
    total,
    hasMore: skip + documents.length < total,
  };
};

export const createActivity = async (input: {
  kind: ActivityKind;
  actorHandle: string;
  targetId: string | null;
  body?: string;
}): Promise<ActivityDocument> => {
  const document: ActivityDocument = {
    id: randomUUID(),
    kind: input.kind,
    actorHandle: input.actorHandle,
    targetId: input.targetId,
    body: input.body ?? "",
    createdAt: new Date().toISOString(),
    likeHandles: [],
    shareCount: 0,
    comments: [],
  };

  await (await collection()).insertOne(document);
  return document;
};

export const toggleLike = async (
  id: string,
  handle: string,
): Promise<{ likeCount: number; likedByMe: boolean } | null> => {
  const activity = await collection();
  const document = await activity.findOne({ id });

  if (!document) {
    return null;
  }

  const alreadyLiked = document.likeHandles.includes(handle);
  const update = alreadyLiked
    ? { $pull: { likeHandles: handle } as never }
    : { $addToSet: { likeHandles: handle } as never };

  await activity.updateOne({ id }, update);

  return { likeCount: alreadyLiked ? document.likeHandles.length - 1 : document.likeHandles.length + 1, likedByMe: !alreadyLiked };
};

export const addShare = async (id: string): Promise<number | null> => {
  const activity = await collection();
  const document = await activity.findOne({ id });

  if (!document) {
    return null;
  }

  const shareCount = document.shareCount + 1;
  await activity.updateOne({ id }, { $inc: { shareCount: 1 } });
  return shareCount;
};

export const addComment = async (
  id: string,
  body: unknown,
  authorHandle: string,
): Promise<ActivityItem | null> => {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) {
    throw new Error("Comment cannot be empty.");
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  const activity = await collection();
  const document = await activity.findOne({ id });

  if (!document) {
    return null;
  }

  const author = await resolveUser(authorHandle);
  const comments = [
    ...document.comments,
    { id: randomUUID(), author, body: text, createdAt: new Date().toISOString() },
  ].slice(-MAX_COMMENTS);

  const updated = await activity.findOneAndUpdate(
    { id },
    { $set: { comments } },
    { returnDocument: "after" },
  );

  if (!updated) {
    return null;
  }

  const { users, targets } = await loadContext();
  return toActivityItem(updated, users, targets, currentUserHandle());
};

const weightByReviewCount = (ranking: RankingItem): number => {
  // Bayesian-ish weighting: community scores lean on their own rating, then
  // get pulled toward the 7.5 neutral point by a virtual vote.
  const virtualVotes = 4;
  const personalWeight = 1;
  return (ranking.rating * personalWeight + 7.5 * virtualVotes) / (personalWeight + virtualVotes);
};

export const buildLeaderboard = async (options: {
  category?: string;
  limit?: number;
  viewer?: string;
}): Promise<LeaderboardEntry[]> => {
  const [rankings, users] = await Promise.all([listAllRankings(), listUsers()]);
  const userMap = buildUserMap(users);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const viewer = options.viewer ?? currentUserHandle();

  const filtered = rankings.filter(
    (ranking) => !options.category || options.category === "All" || ranking.category === options.category,
  );

  const ranked = [...filtered].sort((left, right) => {
    const scoreDelta = weightByReviewCount(right) - weightByReviewCount(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return (right.reviewCount || 0) - (left.reviewCount || 0);
  });

  return ranked.slice(0, limit).map((ranking, index) => ({
    globalRank: index + 1,
    rankingId: ranking.id,
    title: ranking.title,
    category: ranking.category,
    tags: ranking.tags,
    posterUrl: ranking.posterUrls[0] ?? null,
    consensusRating: weightByReviewCount(ranking),
    ratingCount: ranking.reviewCount || ranking.voteDistribution["5"] || 0,
    author: userMap.get(ranking.authorHandle) ?? {
      handle: ranking.authorHandle,
      name: ranking.authorHandle,
      avatarUrl: "",
    },
    userRating: ranking.authorHandle === viewer ? ranking.rating : null,
    trend:
      ranking.reviewCount >= 40 ? "up" : ranking.reviewCount >= 10 ? "steady" : "down",
  }));
};
