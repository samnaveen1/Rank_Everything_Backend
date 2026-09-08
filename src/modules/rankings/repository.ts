import { Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";
import { RankingInput, RankingItem } from "./types.js";

const collection = async (): Promise<Collection<RankingItem>> => {
  const database = await getDatabase();
  return database.collection<RankingItem>("ranking_items");
};

export const listRankings = async (): Promise<RankingItem[]> => {
  const items = await (await collection()).find({}).toArray();
  return items.sort((left, right) => right.rating - left.rating);
};

export const createRanking = async (input: RankingInput): Promise<RankingItem> => {
  const now = new Date().toISOString();
  const item: RankingItem = {
    id: randomUUID(),
    name: input.name.trim(),
    category: input.category.trim(),
    rating: input.rating,
    mapLink: input.mapLink?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };

  await (await collection()).insertOne(item);
  return item;
};

export const updateRanking = async (
  id: string,
  input: RankingInput,
): Promise<RankingItem | null> => {
  const updated = await (await collection()).findOneAndUpdate(
    { id },
    {
      $set: {
        name: input.name.trim(),
        category: input.category.trim(),
        rating: input.rating,
        mapLink: input.mapLink?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );

  return updated;
};

export const deleteRanking = async (id: string): Promise<boolean> => {
  const result = await (await collection()).deleteOne({ id });
  return result.deletedCount === 1;
};
