import bcrypt from "bcryptjs";
import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";
import { findUser, normalizeHandle } from "../users/repository.js";
import { UserDocument } from "../users/types.js";
import { bearerTokenFrom, createSessionForUser, resolveCurrentUserFromToken } from "./session.js";

export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export type AuthUser = {
  id: string;
  handle: string;
  name: string;
  email: string;
  avatarUrl: string;
  provider: "local" | "google";
  createdAt: string;
};

export type AuthResult = {
  token: string;
  user: AuthUser;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;

const collection = async () => (await getDatabase()).collection<UserDocument>("users");

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeName = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const sanitizeHandle = (value: unknown): string | undefined => {
  const raw = typeof value === "string" ? value.trim() : "";
  const handle = normalizeHandle(raw) ?? normalizeHandle(raw.replace(/\s+/g, "_"));
  return handle && handle.length >= 3 ? handle : undefined;
};

export const toAuthUser = (user: UserDocument): AuthUser => ({
  id: user.id ?? user.handle,
  handle: user.handle,
  name: user.name,
  email: user.email ?? "",
  avatarUrl: user.avatarUrl,
  provider: user.provider ?? "local",
  createdAt: user.joinedAt,
});

const createAuthResult = async (handle: string): Promise<AuthResult> => {
  const user = await findUser(handle);

  if (!user) {
    throw new AuthError(500, "Account could not be loaded.");
  }

  const token = await createSessionForUser(handle);
  return { token, user: toAuthUser(user) };
};

const uniqueHandleFor = async (base: string, users: Awaited<ReturnType<typeof collection>>): Promise<string> => {
  const start = sanitizeHandle(base) ?? "rankio";
  let candidate = start;

  for (let suffix = 2; suffix < 50; suffix += 1) {
    const existing = await users.findOne({ handle: candidate });
    if (!existing) {
      return candidate;
    }
    candidate = `${start}${suffix}`.slice(0, 32);
  }

  return `${start}${randomUUID().slice(0, 6)}`.slice(0, 32);
};

export const registerAccount = async (input: {
  name?: unknown;
  email?: unknown;
  handle?: unknown;
  password?: unknown;
}): Promise<AuthResult> => {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const rawHandle = typeof input.handle === "string" ? input.handle.trim().replace(/^@/, "").toLowerCase() : "";

  let handle: string;
  if (rawHandle) {
    if (!/^[a-z0-9_.]{3,32}$/.test(rawHandle)) {
      throw new AuthError(400, "Username must be 3-32 letters, numbers, dots, or underscores.");
    }
    handle = rawHandle;
  } else {
    handle = sanitizeHandle(name) ?? "";
    if (handle.length < 3) {
      throw new AuthError(400, "Pick a username with 3-32 letters, numbers, dots, or underscores.");
    }
  }

  if (name.length < 2 || name.length > 80) {
    throw new AuthError(400, "Enter your name (2-80 characters).");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError(400, "Enter a valid email address.");
  }
  if (password.length < 8 || password.length > 72) {
    throw new AuthError(400, "Password must be 8-72 characters long.");
  }

  const users = await collection();
  const existingByEmail = await users.findOne({ email });
  const existingByHandle = await users.findOne({ handle });

  if (existingByEmail || existingByHandle) {
    throw new AuthError(409, "Unable to create account. Please check your details.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await users.insertOne({
      id: randomUUID(),
      handle,
      name,
      email,
      passwordHash,
      provider: "local",
      bio: "",
      avatarUrl: `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(handle)}`,
      followerCount: 0,
      followingCount: 0,
      following: [],
      joinedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AuthError(409, "Unable to create account. Please check your details.");
    }
    throw error;
  }

  return createAuthResult(handle);
};

export const loginAccount = async (input: {
  identifier?: unknown;
  email?: unknown;
  handle?: unknown;
  password?: unknown;
}): Promise<AuthResult> => {
  const identifier =
    typeof input.identifier === "string"
      ? input.identifier.trim()
      : typeof input.email === "string"
        ? input.email.trim()
        : typeof input.handle === "string"
          ? input.handle.trim()
          : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!identifier || !password) {
    throw new AuthError(401, "Invalid email/username or password.");
  }

  const users = await collection();
  const normalizedEmail = normalizeEmail(identifier);
  const normalizedHandle = sanitizeHandle(identifier);
  const user = identifier.includes("@")
    ? await users.findOne({ email: normalizedEmail })
    : await users.findOne({
        $or: [
          { handle: normalizedHandle ?? "" },
          { email: normalizedEmail },
        ],
      });

  if (!user || !user.passwordHash) {
    throw new AuthError(401, "Invalid email/username or password.");
  }

  const match = await bcrypt.compare(password, user.passwordHash);

  if (!match) {
    throw new AuthError(401, "Invalid email/username or password.");
  }

  return createAuthResult(user.handle);
};

type GoogleProfile = {
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
  picture?: unknown;
};

/**
 * Verifies the Google identity server-side: the client only receives an access
 * token, and the profile is fetched from Google directly so it cannot be forged.
 */
export const googleSignIn = async (accessToken: unknown): Promise<AuthResult> => {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new AuthError(400, "Google access token is required.");
  }

  let profile: GoogleProfile;

  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    });

    if (!response.ok) {
      throw new AuthError(401, "Google sign-in could not be verified.");
    }

    profile = (await response.json()) as GoogleProfile;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(401, "Google sign-in could not be verified.");
  }

  const email = normalizeEmail(profile.email);
  if (!EMAIL_PATTERN.test(email) || profile.email_verified === false) {
    throw new AuthError(401, "Your Google account email is not verified.");
  }

  const users = await collection();
  let user: UserDocument | null = await users.findOne({ email });

  if (!user) {
    const fallbackName =
      (typeof profile.name === "string" && profile.name.trim()) ||
      (typeof profile.given_name === "string" && profile.given_name.trim()) ||
      email.split("@")[0];
    const handle = await uniqueHandleFor(email.split("@")[0], users);

    const newUser: UserDocument = {
      id: randomUUID(),
      handle,
      name: fallbackName.slice(0, 80),
      email,
      provider: "google",
      bio: "",
      avatarUrl:
        typeof profile.picture === "string" && profile.picture
          ? profile.picture
          : `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(fallbackName)}`,
      followerCount: 0,
      followingCount: 0,
      following: [],
      joinedAt: new Date().toISOString(),
    };

    await users.insertOne(newUser as any);
    user = newUser;
  }

  return createAuthResult(user.handle);
};

/** Returns the signed-in user for a request, or null when there is no valid session. */
export const authUserFromRequest = async (request?: unknown): Promise<AuthUser | null> => {
  const handle = await resolveCurrentUserFromToken(request);
  if (!handle) {
    return null;
  }

  const user = await findUser(handle);
  return user ? toAuthUser(user) : null;
};

/** Fastify preHandler: rejects the request with 401 unless a valid session token is present. */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const handle = await resolveCurrentUserFromToken(request);

  if (!handle) {
    return reply.code(401).send({ message: "Sign in to continue." });
  }
};

/** Vercel guard: same contract as requireAuth but throws for the mirror's catch block. */
export const requireAuthedHandle = async (request: unknown): Promise<string> => {
  const handle = await resolveCurrentUserFromToken(request);

  if (!handle) {
    throw new AuthError(401, "Sign in to continue.");
  }

  return handle;
};

export { bearerTokenFrom };
