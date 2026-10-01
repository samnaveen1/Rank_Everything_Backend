import { Collection, Filter, Sort } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";
import {
  RatingBreakdown,
  RankingInput,
  RankingItem,
  RankingPage,
  RankingPatch,
  StarLevel,
  emptyDistribution,
  toRankingItem,
} from "./types.js";

const collection = async (): Promise<Collection<RankingItem>> => {
  const database = await getDatabase();
  return database.collection<RankingItem>("ranking_items");
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFilter = (options: {
  category?: string;
  query?: string;
  authorHandle?: string;
}): Filter<RankingItem> => {
  const filter: Filter<RankingItem> = {};

  if (options.category && options.category !== "All") {
    filter.category = options.category;
  }

  if (options.authorHandle) {
    filter.authorHandle = options.authorHandle;
  }

  const query = options.query?.trim();
  if (query) {
    const pattern = new RegExp(escapeRegExp(query), "i");
    filter.$or = [{ title: pattern }, { category: pattern }, { tags: pattern }, { description: pattern }];
  }

  return filter;
};

export const listRankings = async (options: {
  category?: string;
  query?: string;
  authorHandle?: string;
  page?: number;
  pageSize?: number;
  sort?: "rating" | "recent";
}): Promise<RankingPage> => {
  const rankings = await collection();
  const filter = buildFilter(options);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 10));
  const sort: Sort = options.sort === "recent" ? { createdAt: -1 } : { rating: -1 };

  const [documents, total] = await Promise.all([
    rankings
      .find(filter)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    rankings.countDocuments(filter),
  ]);

  return {
    items: documents.map((document) => toRankingItem(document as unknown as Record<string, unknown>)),
    total,
    page,
    pageSize,
  };
};

export const findRanking = async (id: string): Promise<RankingItem | null> => {
  const document = await (await collection()).findOne({ id });
  return document ? toRankingItem(document as unknown as Record<string, unknown>) : null;
};

export const listAllRankings = async (filter: Filter<RankingItem> = {}): Promise<RankingItem[]> => {
  const documents = await (await collection()).find(filter).toArray();
  return documents.map((document) => toRankingItem(document as unknown as Record<string, unknown>));
};

export const createRanking = async (input: RankingInput): Promise<RankingItem> => {
  const now = new Date().toISOString();
  const item: RankingItem = {
    id: randomUUID(),
    title: input.title.trim(),
    category: input.category,
    tags: input.tags,
    rating: input.rating,
    description: input.description,
    posterUrls: input.posterUrls,
    authorHandle: input.authorHandle,
    reviewCount: input.reviewCount ?? 0,
    voteDistribution: input.voteDistribution ?? emptyDistribution(),
    createdAt: now,
    updatedAt: now,
  };

  await (await collection()).insertOne(item);
  return item;
};

export const updateRanking = async (id: string, patch: RankingPatch): Promise<RankingItem | null> => {
  const rankings = await collection();
  const updated = await rankings.findOneAndUpdate(
    { id },
    { $set: { ...patch, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return updated ? toRankingItem(updated as unknown as Record<string, unknown>) : null;
};

export const deleteRanking = async (id: string): Promise<boolean> => {
  const result = await (await collection()).deleteOne({ id });
  return result.deletedCount === 1;
};

export const distinctCategories = async (): Promise<string[]> => {
  const values = await (await collection()).distinct("category");
  return values.filter((value): value is string => typeof value === "string" && value.length > 0);
};

export const distinctTags = async (): Promise<string[]> => {
  const values = await (await collection()).distinct("tags");
  return values.filter((value): value is string => typeof value === "string" && value.length > 0);
};

const starLevelFor = (rating: number): StarLevel => {
  if (rating >= 9) return 5;
  if (rating >= 7) return 4;
  if (rating >= 5) return 3;
  if (rating >= 3) return 2;
  return 1;
};

export const getRatingBreakdown = async (id: string): Promise<RatingBreakdown | null> => {
  const item = await findRanking(id);
  if (!item) {
    return null;
  }

  const totalVotes = (Object.values(item.voteDistribution) as number[]).reduce(
    (total, count) => total + count,
    0,
  );

  // A freshly created ranking has no community votes yet, so fall back to the
  // author's own score as a single-vote distribution.
  const distribution = totalVotes
    ? item.voteDistribution
    : { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, [`${starLevelFor(item.rating)}`]: 1 };

  const bucketTotal = (Object.values(distribution) as number[]).reduce(
    (total, count) => total + count,
    0,
  );

  const levels: StarLevel[] = [5, 4, 3, 2, 1];
  const weighted = levels.reduce((total, level) => total + distribution[level] * level, 0);

  return {
    rankingId: item.id,
    title: item.title,
    category: item.category,
    posterUrl: item.posterUrls[0] ?? null,
    average: bucketTotal > 0 ? Math.round((weighted / bucketTotal) * 2) / 2 : item.rating,
    totalVotes,
    distribution: levels.map((level) => {
      const count = distribution[level];
      return {
        stars: level,
        count,
        percent: bucketTotal > 0 ? Math.round((count / bucketTotal) * 1000) / 10 : 0,
      };
    }),
  };
};
