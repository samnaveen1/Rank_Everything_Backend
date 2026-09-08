import "dotenv/config";

const required = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "rank_everything",
  corsOrigins: (process.env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  aiApiUrl: process.env.AI_API_URL?.trim() || undefined,
  aiApiKey: process.env.AI_API_KEY?.trim() || undefined,
  aiModel: process.env.AI_MODEL?.trim() || undefined,
};
