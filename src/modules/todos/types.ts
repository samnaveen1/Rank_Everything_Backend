export type Todo = {
  id: string;
  title: string;
  details: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoInput = {
  title: string;
  details?: string;
};
