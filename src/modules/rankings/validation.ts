import { env } from "../../config/env.js";
import { RankingInput, RankingPatch } from "./types.js";

export const MAX_TAGS = 8;
export const MAX_POSTERS = 6;
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;

export const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const asTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(asTrimmedString).filter(Boolean))].slice(0, MAX_TAGS);
};

export const asPosters = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(asTrimmedString)
    .filter((url) => url.length > 0)
    .slice(0, MAX_POSTERS);
};

export const asRating = (value: unknown): number => {
  const rating = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rating)) {
    throw new Error("Rating must be a number.");
  }
  if (rating < 0 || rating > 10) {
    throw new Error("Rating must be between 0 and 10.");
  }
  return Math.round(rating * 10) / 10;
};

const parseTitle = (value: unknown): string => {
  const title = asTrimmedString(value);
  if (!title) {
    throw new Error("Title is required.");
  }
  if (title.length > MAX_TITLE) {
    throw new Error(`Title must be ${MAX_TITLE} characters or fewer.`);
  }
  return title;
};

const parseCategory = (value: unknown): string => {
  const category = asTrimmedString(value);
  if (!category) {
    throw new Error("Category is required.");
  }
  return category;
};

const parseDescription = (value: unknown): string => {
  const description = typeof value === "string" ? value.trim() : "";
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`Description must be ${MAX_DESCRIPTION} characters or fewer.`);
  }
  return description;
};

export const parseInput = (body: unknown): RankingInput => {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const raw = body as Record<string, unknown>;

  return {
    title: parseTitle(raw.title),
    category: parseCategory(raw.category),
    tags: asTags(raw.tags),
    rating: asRating(raw.rating),
    description: parseDescription(raw.description),
    posterUrls: asPosters(raw.posterUrls),
    authorHandle: asTrimmedString(raw.authorHandle) || env.currentUserHandle,
  };
};

export const parsePatch = (body: unknown): RankingPatch => {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const raw = body as Record<string, unknown>;
  const patch: RankingPatch = {};

  if (raw.title !== undefined) {
    patch.title = parseTitle(raw.title);
  }

  if (raw.category !== undefined) {
    patch.category = parseCategory(raw.category);
  }

  if (raw.rating !== undefined) {
    patch.rating = asRating(raw.rating);
  }

  if (raw.tags !== undefined) {
    patch.tags = asTags(raw.tags);
  }

  if (raw.description !== undefined) {
    patch.description = parseDescription(raw.description);
  }

  if (raw.posterUrls !== undefined) {
    patch.posterUrls = asPosters(raw.posterUrls);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No supported fields were provided.");
  }

  return patch;
};
