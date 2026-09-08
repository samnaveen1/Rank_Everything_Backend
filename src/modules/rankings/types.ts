export type RankingItem = {
  id: string;
  name: string;
  category: string;
  rating: number;
  mapLink?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RankingInput = {
  name: string;
  category: string;
  rating: number;
  mapLink?: string;
  notes?: string;
};
