export type UserDocument = {
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  /** Handles this user follows. Used to compute follow state without an auth layer. */
  following?: string[];
  joinedAt: string;
  id?: string;
  email?: string;
  passwordHash?: string;
  provider?: "local" | "google";
};

export type UserHandle = {
  handle: string;
  name: string;
  avatarUrl: string;
};

export type UserProfile = UserHandle & {
  bio: string;
  followerCount: number;
  followingCount: number;
  isCurrentUser: boolean;
};

export type UserStats = {
  rankingCount: number;
  averageRating: number | null;
  followerCount: number;
  topCategories: string[];
};

export const toUserProfile = (document: UserDocument, isCurrentUser: boolean): UserProfile => ({
  handle: document.handle,
  name: document.name,
  avatarUrl: document.avatarUrl,
  bio: document.bio,
  followerCount: document.followerCount,
  followingCount: document.followingCount,
  isCurrentUser,
});

export const toUserHandle = (document: UserDocument): UserHandle => ({
  handle: document.handle,
  name: document.name,
  avatarUrl: document.avatarUrl,
});

export const fallbackUser = (handle: string): UserDocument => ({
  handle,
  name: handle,
  bio: "",
  avatarUrl: "",
  followerCount: 0,
  followingCount: 0,
  joinedAt: new Date(0).toISOString(),
});
