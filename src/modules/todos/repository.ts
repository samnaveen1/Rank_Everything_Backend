import { Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../db/mongodb.js";
import { Todo, TodoInput } from "./types.js";

const collection = async (): Promise<Collection<Todo>> => {
  const database = await getDatabase();
  return database.collection<Todo>("todos");
};

export const listTodos = async (): Promise<Todo[]> => {
  const todos = await (await collection()).find({}).toArray();
  return todos.sort((left, right) => Number(left.completed) - Number(right.completed) || right.updatedAt.localeCompare(left.updatedAt));
};

export const createTodo = async (input: TodoInput): Promise<Todo> => {
  const now = new Date().toISOString();
  const todo: Todo = { id: randomUUID(), title: input.title.trim(), details: input.details?.trim() ?? "", completed: false, createdAt: now, updatedAt: now };
  await (await collection()).insertOne(todo);
  return todo;
};

export const updateTodo = async (id: string, input: Partial<TodoInput> & { completed?: boolean }): Promise<Todo | null> => {
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.details !== undefined) update.details = input.details.trim();
  if (input.completed !== undefined) update.completed = input.completed;
  return (await (await collection()).findOneAndUpdate({ id }, { $set: update }, { returnDocument: "after" })) ?? null;
};

export const deleteTodo = async (id: string): Promise<boolean> => {
  const result = await (await collection()).deleteOne({ id });
  return result.deletedCount === 1;
};
