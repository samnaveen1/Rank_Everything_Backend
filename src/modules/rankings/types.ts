export type StarLevel = 1 | 2 | 3 | 4 | 5;

export type VoteDistribution = Record<`${StarLevel}`, number>;

export type RankingItem = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  rating: number;
  description: string;
  posterUrls: string[];
  authorHandle: string;
  reviewCount: number;
  voteDistribution: VoteDistribution;
  createdAt: string;
  updatedAt: string;
};

export type RankingInput = {
  title: string;
  category: string;
  tags: string[];
  rating: number;
  description: string;
  posterUrls: string[];
  authorHandle: string;
  reviewCount?: number;
  voteDistribution?: VoteDistribution;
};

export type RankingPatch = Partial<RankingInput>;

export type RatingBucket = {
  stars: StarLevel;
  count: number;
  percent: number;
};

export type RatingBreakdown = {
  rankingId: string;
  title: string;
  category: string;
  posterUrl: string | null;
  average: number;
  totalVotes: number;
  distribution: RatingBucket[];
};

export type RankingPage = {
  items: RankingItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const emptyDistribution = (): VoteDistribution => ({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });

/**
 * Maps a stored document onto the current shape. Documents written before the
 * poster/tag/author fields existed still load correctly.
 */
export const toRankingItem = (document: Record<string, unknown>): RankingItem => {
  const legacyName = typeof document.name === "string" ? document.name : "";
  const legacyNotes = typeof document.notes === "string" ? document.notes : "";
  const distribution = (document.voteDistribution ?? {}) as Partial<VoteDistribution>;

  return {
    id: String(document.id),
    title: typeof document.title === "string" ? document.title : legacyName,
    category: typeof document.category === "string" ? document.category : "Uncategorized",
    tags: Array.isArray(document.tags) ? document.tags.map(String) : [],
    rating: typeof document.rating === "number" ? document.rating : 0,
    description: typeof document.description === "string" ? document.description : legacyNotes,
    posterUrls: Array.isArray(document.posterUrls) ? document.posterUrls.map(String) : [],
    authorHandle: typeof document.authorHandle === "string" ? document.authorHandle : "unknown",
    reviewCount: typeof document.reviewCount === "number" ? document.reviewCount : 0,
    voteDistribution: {
      "1": Number(distribution["1"] ?? 0),
      "2": Number(distribution["2"] ?? 0),
      "3": Number(distribution["3"] ?? 0),
      "4": Number(distribution["4"] ?? 0),
      "5": Number(distribution["5"] ?? 0),
    },
    createdAt: typeof document.createdAt === "string" ? document.createdAt : new Date(0).toISOString(),
    updatedAt: typeof document.updatedAt === "string" ? document.updatedAt : new Date(0).toISOString(),
  };
};
