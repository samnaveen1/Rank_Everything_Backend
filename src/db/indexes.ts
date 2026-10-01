import { getDatabase } from "./mongodb.js";

/**
 * Every lookup in this app filters on the application-level `id`, which Mongo
 * does not index by default, so each collection is scanned in full. These
 * indexes are created on boot.
 */
export const ensureIndexes = async (): Promise<void> => {
  const database = await getDatabase();

  await Promise.all([
    database.collection("ranking_items").createIndex({ id: 1 }, { unique: true }),
    database.collection("ranking_items").createIndex({ authorHandle: 1, rating: -1 }),
    database.collection("ranking_items").createIndex({ category: 1, rating: -1 }),
    database.collection("users").createIndex({ handle: 1 }, { unique: true }),
    database.collection("users").createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: "string" } } },
    ),
    database.collection("auth_sessions").createIndex(
      { tokenHash: 1 },
      { unique: true, partialFilterExpression: { tokenHash: { $type: "string" } } },
    ),
    database.collection("auth_sessions").createIndex({ handle: 1 }),
    database.collection("auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("activity").createIndex({ id: 1 }, { unique: true }),
    database.collection("activity").createIndex({ createdAt: -1 }),
    database.collection("activity").createIndex({ targetId: 1 }),
  ]);
};
