import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";

export type AuthSession = {
  handle: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const collection = async () => (await getDatabase()).collection<AuthSession>("auth_sessions");

/** Sessions store only the hash, so a database leak never exposes live tokens. */
export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const bearerTokenFrom = (request?: unknown): string => {
  const headers = (request as { headers?: Record<string, unknown> } | undefined)?.headers ?? {};
  const authorization = headers["authorization"] ?? headers["Authorization"];
  return typeof authorization === "string"
    ? authorization.replace(/^Bearer\s+/i, "").trim()
    : "";
};

export const createSessionForUser = async (handle: string): Promise<string> => {
  const token = randomBytes(32).toString("hex");

  await (await collection()).insertOne({
    handle,
    tokenHash: hashSessionToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  return token;
};

/** Resolves a request to a handle only when it carries a valid, unexpired session token. */
export const resolveCurrentUserFromToken = async (request?: unknown): Promise<string | null> => {
  const token = bearerTokenFrom(request);
  if (!token) {
    return null;
  }

  const sessions = await collection();
  const tokenHash = hashSessionToken(token);
  const session = await sessions.findOne({ tokenHash });

  if (!session) {
    return null;
  }

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await sessions.deleteOne({ tokenHash });
    return null;
  }

  return session.handle;
};

export const clearUserSessions = async (handle: string): Promise<void> => {
  await (await collection()).deleteMany({ handle });
};

export const clearSessionForToken = async (token: string): Promise<void> => {
  if (!token) {
    return;
  }
  await (await collection()).deleteOne({ tokenHash: hashSessionToken(token) });
};
