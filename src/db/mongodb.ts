import { Db, MongoClient } from "mongodb";
import { env } from "../config/env.js";

let client: MongoClient | undefined;
let database: Db | undefined;

export const getDatabase = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  client = new MongoClient(env.mongodbUri);
  await client.connect();
  database = client.db(env.mongodbDbName);

  return database;
};

export const closeDatabase = async (): Promise<void> => {
  await client?.close();
  client = undefined;
  database = undefined;
};
