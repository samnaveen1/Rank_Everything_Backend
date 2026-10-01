import bcrypt from "bcryptjs";
import { Db } from "mongodb";
import { env } from "../config/env.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDatabase, getDatabase } from "../db/mongodb.js";
import { ActivityDocument } from "../modules/community/types.js";
import { RankingItem, StarLevel, emptyDistribution, toRankingItem } from "../modules/rankings/types.js";
import { UserDocument } from "../modules/users/types.js";

/** Deterministic PRNG so re-seeding produces identical data. */
const makeRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const random = makeRandom(20240517);

const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];

const poster = (slug: string): string => `https://picsum.photos/seed/${slug}/300/450`;
const avatar = (handle: string): string => `https://picsum.photos/seed/avatar-${handle}/160/160`;

const USERS: UserDocument[] = [
  { handle: env.currentUserHandle, name: "Sam", bio: "Rating everything I can. Movies first, then dinner.", avatarUrl: avatar(env.currentUserHandle), followerCount: 128, followingCount: 84, joinedAt: "2024-02-11T09:00:00.000Z" },
  { handle: "rahul", name: "Rahul Menon", bio: "Binge watcher. 4K or nothing.", avatarUrl: avatar("rahul"), followerCount: 4820, followingCount: 312, joinedAt: "2023-08-02T09:00:00.000Z" },
  { handle: "ananya", name: "Ananya Iyer", bio: "Book hoarder. Will judge your shelf.", avatarUrl: avatar("ananya"), followerCount: 3610, followingCount: 540, joinedAt: "2023-11-19T09:00:00.000Z" },
  { handle: "dev", name: "Dev Kapoor", bio: "Street food hunter. Ask me about Kolkata.", avatarUrl: avatar("dev"), followerCount: 2940, followingCount: 205, joinedAt: "2024-01-30T09:00:00.000Z" },
  { handle: "meera", name: "Meera Nair", bio: "Solo traveller. 23 countries and counting.", avatarUrl: avatar("meera"), followerCount: 5130, followingCount: 601, joinedAt: "2023-06-14T09:00:00.000Z" },
  { handle: "karthik", name: "Karthik Raman", bio: "Series completionist. No spoilers.", avatarUrl: avatar("karthik"), followerCount: 2210, followingCount: 143, joinedAt: "2024-04-08T09:00:00.000Z" },
  // Dev-only sign-in for QA (never surfaced in the UI). Password is hashed at
  // seed time, so the plaintext never reaches the database.
  { handle: "samtest", name: "Sam Test", email: "test@rank.io", passwordHash: await bcrypt.hash("Rank.ioDemo@123", 12), provider: "local", bio: "Development-only account for testing RANK.io.", avatarUrl: avatar("samtest"), followerCount: 56, followingCount: 12, following: ["rahul", "ananya"], joinedAt: "2024-05-01T09:00:00.000Z" },
];

type Seed = {
  title: string;
  category: string;
  tags: string[];
  rating: number;
  author: string;
  description: string;
  ageDays: number;
};

const SEEDS: Seed[] = [
  { title: "Interstellar", category: "Movies", tags: ["Sci-Fi", "Drama", "Space"], rating: 9.6, author: "rahul", description: "The docking scene still gets me every time. Nolan's best by a mile.", ageDays: 40 },
  { title: "Parasite", category: "Movies", tags: ["Thriller", "Drama", "Korean Cinema"], rating: 9.4, author: "ananya", description: "Tight, nasty, endlessly clever. The tonal shift in the middle act is immaculate.", ageDays: 38 },
  { title: "Oppenheimer", category: "Movies", tags: ["Drama", "Biography", "Historical"], rating: 8.9, author: "karthik", description: "A three-hour biopic that never drags. Nolan's risk paid off.", ageDays: 33 },
  { title: "The Grand Budapest Hotel", category: "Movies", tags: ["Comedy", "Adventure", "Indie"], rating: 9.1, author: "ananya", description: "A perfect little machine. Wes Anderson at his most precise.", ageDays: 29 },
  { title: "RRR", category: "Movies", tags: ["Action", "Indian Cinema", "Musical"], rating: 9.2, author: "dev", description: "Pure adrenaline, zero filler. The interval fight is the best thing in Indian cinema this decade.", ageDays: 25 },
  { title: "Everything Everywhere All at Once", category: "Movies", tags: ["Sci-Fi", "Comedy", "Action"], rating: 9.0, author: "rahul", description: "Chaotic in the best way. The hot dog fingers scene deserves the Oscar.", ageDays: 21 },
  { title: "Dune: Part Two", category: "Movies", tags: ["Sci-Fi", "Adventure", "Epic"], rating: 8.7, author: "karthik", description: "Genuinely intimidating sound design. A little cold, but the scale is unmatched.", ageDays: 18 },
  { title: "Spirited Away", category: "Movies", tags: ["Animation", "Fantasy", "Family"], rating: 9.5, author: "ananya", description: "Still the best animated film ever made. Twenty years on, it hasn't aged.", ageDays: 15 },
  { title: "Joker", category: "Movies", tags: ["Drama", "Psychological", "Controversial"], rating: 7.4, author: "karthik", description: "A heavy two hours. Joaquin carries it, but the ending is a hard sell.", ageDays: 12 },
  { title: "Whiplash", category: "Movies", tags: ["Drama", "Music", "Psychological"], rating: 9.3, author: "rahul", description: "The final four minutes justify the entire climb.", ageDays: 9 },
  { title: "Kantara", category: "Movies", tags: ["Action", "Indian Cinema", "Drama"], rating: 8.8, author: "dev", description: "Genuinely original. Blooped entirely on location in coastal Karnataka.", ageDays: 6 },
  { title: "Sinners", category: "Movies", tags: ["Horror", "Thriller", "Period"], rating: 8.4, author: "meera", description: "Atmospheric and nasty. The sound design does most of the work.", ageDays: 4 },
  { title: "The Office", category: "Web Series", tags: ["Comedy", "Workplace", "Classic"], rating: 9.7, author: "karthik", description: "The benchmark. Nothing else has aged this well.", ageDays: 44 },
  { title: "Severance", category: "Web Series", tags: ["Sci-Fi", "Thriller", "Mystery"], rating: 9.4, author: "rahul", description: "Best sci-fi show of the decade. That corridor scene is a masterclass.", ageDays: 31 },
  { title: "Scavengers Reign", category: "Web Series", tags: ["Animation", "Sci-Fi", "Adventure"], rating: 9.2, author: "ananya", description: "Quiet, strange, beautiful. The Vesper scene is one of a kind.", ageDays: 22 },
  { title: "The Bear", category: "Web Series", tags: ["Drama", "Comedy", "Culinary"], rating: 9.0, author: "dev", description: "Chaotic kitchen energy that somehow never loses you.", ageDays: 16 },
  { title: "Dark", category: "Web Series", tags: ["Mystery", "Sci-Fi", "German Cinema"], rating: 9.5, author: "meera", description: "The tightest time-travel plot ever constructed. Respect the timeline.", ageDays: 10 },
  { title: "Kazakhstan", category: "Restaurants", tags: ["Street Food", "Central Asian", "Must Try"], rating: 9.1, author: "dev", description: "The plov alone is worth the trip. Get there before 1pm.", ageDays: 27 },
  { title: "Swordfish", category: "Restaurants", tags: ["Seafood", "Fine Dining", "Date Night"], rating: 8.6, author: "meera", description: "Beautiful room, excellent sashimi, a little steep on the wine list.", ageDays: 20 },
  { title: "Toscano", category: "Restaurants", tags: ["Italian", "Pasta", "Cosy"], rating: 8.9, author: "ananya", description: "Handmade pasta done properly. Book ahead, it fills up fast.", ageDays: 14 },
  { title: "The Kathi Roll Co.", category: "Restaurants", tags: ["Street Food", "Indian", "Late Night"], rating: 8.3, author: "dev", description: "Perfect 2am fuel. The egg bhurji roll is the move.", ageDays: 8 },
  { title: "Kissa Sizzlers", category: "Restaurants", tags: ["Grill", "Indian", "Family"], rating: 7.9, author: "karthik", description: "Solid grill, generous portions, a little loud on a Friday.", ageDays: 5 },
  { title: "Kerala Backwaters", category: "Travel", tags: ["Beach", "Culture", "Nature"], rating: 9.6, author: "meera", description: "Stay on a houseboat overnight. Wake up on the lake, not in a hotel.", ageDays: 35 },
  { title: "Iceland Ring Road", category: "Travel", tags: ["Road Trip", "Nature", "Adventure"], rating: 9.8, author: "meera", description: "Ten days, one ring road, zero regrets. September for the aurora.", ageDays: 30 },
  { title: "Kyoto in Autumn", category: "Travel", tags: ["Culture", "City Break", "Photography"], rating: 9.4, author: "ananya", description: "Late November for the maples. Arashiyama before 7am or not at all.", ageDays: 19 },
  { title: "Manali", category: "Travel", tags: ["Mountains", "Road Trip", "Nature"], rating: 8.2, author: "dev", description: "Great for a long weekend. Skip the mall road and head to Solang.", ageDays: 11 },
  { title: "Lisbon", category: "Travel", tags: ["City Break", "Food", "Culture"], rating: 9.3, author: "rahul", description: "Trams, tinned fish, and the best sunset view in Europe.", ageDays: 7 },
  { title: "Project Hail Mary", category: "Books", tags: ["Sci-Fi", "Adventure", "Fiction"], rating: 9.5, author: "ananya", description: "I read this in two sittings. Rocky is the best character of the year.", ageDays: 24 },
  { title: "The Overstory", category: "Books", tags: ["Fiction", "Literary", "Nature"], rating: 9.0, author: "ananya", description: "Slow to start, enormous by the end. Worth the patience.", ageDays: 17 },
  { title: "Atomic Habits", category: "Books", tags: ["Non-Fiction", "Self Help", "Productivity"], rating: 8.5, author: "karthik", description: "Useful framework, occasionally repetitive. The habit stacking idea stuck.", ageDays: 13 },
  { title: "Piranesi", category: "Books", tags: ["Fantasy", "Fiction", "Mystery"], rating: 9.2, author: "meera", description: "Under two hundred pages and one of the strangest worlds I've read.", ageDays: 9 },
  { title: "Sapiens", category: "Books", tags: ["Non-Fiction", "History", "Popular Science"], rating: 8.7, author: "rahul", description: "Grand in scope, occasionally reductive. A great conversation starter.", ageDays: 3 },
  { title: "Elden Ring", category: "Games", tags: ["Action RPG", "Open World", "Hard"], rating: 9.4, author: "karthik", description: "Two hundred hours and I still don't know what happened after the first boss.", ageDays: 26 },
  { title: "Disco Elysium", category: "Games", tags: ["RPG", "Narrative", "Indie"], rating: 9.9, author: "rahul", description: "The best writing in the medium. Every skill check is a writing prompt.", ageDays: 23 },
  { title: "Hades II", category: "Games", tags: ["Roguelike", "Action", "Indie"], rating: 9.0, author: "ananya", description: "A roguelike that made me excited to fail again.", ageDays: 2 },
  // The current user's own board, so "My Top 10" and the profile grid are not
  // empty on a fresh install.
  { title: "Mad Max: Fury Road", category: "Movies", tags: ["Action", "Sci-Fi", "Modern Classic"], rating: 9.7, author: env.currentUserHandle, description: "Two hours of unbroken momentum. Practical stunts over CGI any day.", ageDays: 2 },
  { title: "Get Out", category: "Movies", tags: ["Thriller", "Horror", "Social Commentary"], rating: 9.4, author: env.currentUserHandle, description: "Jordan Peele turns a simple premise into a nerve attack.", ageDays: 5 },
  { title: "Past Lives", category: "Movies", tags: ["Drama", "Romance", "Indie"], rating: 9.1, author: env.currentUserHandle, description: "Quietly devastating. The final twenty minutes land without raising its voice.", ageDays: 9 },
  { title: "Severance", category: "Web Series", tags: ["Sci-Fi", "Thriller", "Mystery"], rating: 9.6, author: env.currentUserHandle, description: "The corridor sequence is still the benchmark for television.", ageDays: 1 },
  { title: "The Bear", category: "Web Series", tags: ["Drama", "Culinary", "Workplace"], rating: 9.2, author: env.currentUserHandle, description: "Chewy on its own chaos, disarmingly tender underneath.", ageDays: 6 },
  { title: "Kissa Sizzlers", category: "Restaurants", tags: ["Grill", "Indian", "Family"], rating: 8.4, author: env.currentUserHandle, description: "Go for the mixed grill. Loud, busy, worth it.", ageDays: 4 },
  { title: "Toscano", category: "Restaurants", tags: ["Italian", "Pasta", "Cosy"], rating: 9.0, author: env.currentUserHandle, description: "The hand-rolled pici is the best pasta in the neighbourhood.", ageDays: 11 },
  { title: "Kyoto in Autumn", category: "Travel", tags: ["Culture", "Photography", "City Break"], rating: 9.5, author: env.currentUserHandle, description: "Late November, weekdays only, Arashiyama at sunrise.", ageDays: 13 },
  { title: "Manali", category: "Travel", tags: ["Mountains", "Nature", "Road Trip"], rating: 8.0, author: env.currentUserHandle, description: "Skip the mall road entirely. Solang or bust.", ageDays: 20 },
  { title: "Project Hail Mary", category: "Books", tags: ["Sci-Fi", "Adventure", "Fiction"], rating: 9.7, author: env.currentUserHandle, description: "Read it in one sitting. Rocky is the best character of the year.", ageDays: 7 },
  { title: "Piranesi", category: "Books", tags: ["Fantasy", "Mystery", "Fiction"], rating: 9.3, author: env.currentUserHandle, description: "Short, strange, and completely absorbing.", ageDays: 15 },
  { title: "Elden Ring", category: "Games", tags: ["Action RPG", "Open World", "Hard"], rating: 9.2, author: env.currentUserHandle, description: "Two hundred hours and I am still lost in the Leyndell marshes.", ageDays: 18 },
];

const FEED_COMMENTS: string[] = [
  "This is exactly the ranking I was waiting for.",
  "Strong pick. What's your second choice in this category?",
  "Watched it twice this month. Holds up completely.",
  "I have the opposite take but I respect the conviction.",
  "Adding this to my list immediately.",
  "The description sold me more than the score did honestly.",
  "Underrated. Glad to see it get some love.",
  "Same. That final act is genuinely special.",
];

const buildDistribution = (rating: number, reviewCount: number) => {
  const distribution = emptyDistribution();
  if (reviewCount === 0) {
    return distribution;
  }

  const centre = rating >= 9 ? 5 : rating >= 7 ? 4 : rating >= 5 ? 3 : 2;
  const weights: Record<number, number> = { 5: 0.5, 4: 0.28, 3: 0.12, 2: 0.06, 1: 0.04 };

  let assigned = 0;
  (Object.keys(weights) as string[]).forEach((key, index) => {
    const stars = Number(key);
    const distance = Math.abs(stars - centre);
    const scale = 1 / (1 + distance);
    const share = index === Object.keys(weights).length - 1 ? reviewCount - assigned : Math.round(reviewCount * weights[stars] * scale * 2);
    const count = Math.max(0, Math.min(reviewCount - assigned, share));
    distribution[key as `${StarLevel}`] = count;
    assigned += count;
  });

  return distribution;
};

const buildRankings = (): RankingItem[] =>
  SEEDS.map((seed, index) => {
    const reviewCount = Math.floor(random() * 260);
    const createdAt = new Date(Date.now() - seed.ageDays * 86_400_000).toISOString();

    return {
      id: `seed-${String(index + 1).padStart(3, "0")}`,
      title: seed.title,
      category: seed.category,
      tags: seed.tags,
      rating: seed.rating,
      description: seed.description,
      posterUrls: [poster(seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))],
      authorHandle: seed.author,
      reviewCount,
      voteDistribution: buildDistribution(seed.rating, reviewCount),
      createdAt,
      updatedAt: createdAt,
    };
  });

const buildActivity = (rankings: RankingItem[]): ActivityDocument[] =>
  rankings
    .filter((ranking, index) => index % 2 === 0)
    .map((ranking, index) => {
      const createdAt = new Date(
        Date.parse(ranking.createdAt) + index * 5_400_000,
      ).toISOString();

      const likers = USERS.filter(() => random() > 0.62).map((user) => user.handle);

      return {
        id: `seed-activity-${String(index + 1).padStart(3, "0")}`,
        kind: index % 6 === 3 ? "updated" : "ranked",
        actorHandle: ranking.authorHandle,
        targetId: ranking.id,
        body: "",
        createdAt,
        likeHandles: likers,
        shareCount: Math.floor(random() * 40),
        comments: Array.from({ length: Math.floor(random() * 3) }, (_, commentIndex) => {
          const author = pick(USERS);
          return {
            id: `seed-comment-${index}-${commentIndex}`,
            author: { handle: author.handle, name: author.name, avatarUrl: author.avatarUrl },
            body: pick(FEED_COMMENTS),
            createdAt: new Date(Date.parse(createdAt) + (commentIndex + 1) * 1_800_000).toISOString(),
          };
        }),
      } satisfies ActivityDocument;
    });

const replaceAll = async (database: Db): Promise<void> => {
  const rankings = database.collection<RankingItem>("ranking_items");
  const users = database.collection<UserDocument>("users");
  const activity = database.collection<ActivityDocument>("activity");

  await Promise.all([
    rankings.deleteMany({}),
    users.deleteMany({}),
    activity.deleteMany({}),
    database.collection("auth_sessions").deleteMany({}),
  ]);

  const rankingDocuments = buildRankings();
  const activityDocuments = buildActivity(rankingDocuments);

  // Mirror what the current user already follows so the follow button is not dead on first load.
  const userDocuments = USERS.map((user) =>
    user.handle === env.currentUserHandle ? { ...user, following: USERS.slice(1, 3).map((u) => u.handle) } : user,
  );

  await rankings.insertMany(rankingDocuments as unknown as Array<never>);
  await users.insertMany(userDocuments as unknown as Array<never>);
  await activity.insertMany(activityDocuments as unknown as Array<never>);

  // Rewrite the seed documents through the shared normaliser so any legacy
  // `name` / `notes` fields from older deployments are cleaned up.
  const legacy = await rankings.find({ name: { $exists: true } }).toArray();
  for (const document of legacy) {
    const normalized = toRankingItem(document as unknown as Record<string, unknown>);
    await rankings.updateOne({ id: document.id }, { $set: { ...normalized }, $unset: { name: "", notes: "", mapLink: "" } });
  }

  process.stdout.write(
    `Seeded ${rankingDocuments.length} rankings, ${userDocuments.length} users, ${activityDocuments.length} activity entries.\n`,
  );
};

const main = async () => {
  try {
    const database = await getDatabase();
    await ensureIndexes();
    await replaceAll(database);
  } finally {
    await closeDatabase();
  }
};

await main();
