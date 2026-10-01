import { UserHandle } from "../users/types.js";

export type ActivityKind = "ranked" | "updated" | "commented";

export type ActivityComment = {
  id: string;
  author: UserHandle;
  body: string;
  createdAt: string;
};

export type ActivityTarget = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  rating: number | null;
};

export type ActivityDocument = {
  id: string;
  kind: ActivityKind;
  actorHandle: string;
  targetId: string | null;
  body: string;
  createdAt: string;
  likeHandles: string[];
  shareCount: number;
  comments: ActivityComment[];
};

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  actor: UserHandle;
  createdAt: string;
  target: ActivityTarget | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  likedByMe: boolean;
  comments: ActivityComment[];
};

export type ActivityPage = {
  items: ActivityItem[];
  total: number;
  hasMore: boolean;
};

export type LeaderboardEntry = {
  globalRank: number;
  rankingId: string;
  title: string;
  category: string;
  tags: string[];
  posterUrl: string | null;
  consensusRating: number;
  ratingCount: number;
  author: UserHandle;
  userRating: number | null;
  trend: "up" | "down" | "steady";
};
