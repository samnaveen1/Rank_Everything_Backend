import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRanking, deleteRanking, listRankings, updateRanking } from "../src/modules/rankings/repository.js";
import { RankingInput } from "../src/modules/rankings/types.js";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../src/modules/todos/repository.js";
import { TodoInput } from "../src/modules/todos/types.js";

const sendCors = (response: VercelResponse): void => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const sendError = (response: VercelResponse, status: number, message: string): void => {
  response.status(status).json({ message });
};

const rankingInput = (body: unknown): RankingInput => {
  const input = body as Partial<RankingInput> | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const category = typeof input?.category === "string" ? input.category.trim() : "";
  const rating = input?.rating;
  const mapLink = typeof input?.mapLink === "string" ? input.mapLink.trim() : "";
  const notes = typeof input?.notes === "string" ? input.notes : "";

  if (!name || !category) throw new Error("Name and category are required.");
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error("Rating must be a number between 0 and 10.");
  }

  return { name, category, rating, mapLink, notes };
};

const todoInput = (body: unknown): TodoInput => {
  const input = body as Partial<TodoInput> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const details = typeof input?.details === "string" ? input.details : "";
  if (!title) throw new Error("Task title is required.");
  return { title, details };
};

const routeParts = (request: VercelRequest): string[] => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  return path.split("/").filter(Boolean).slice(1);
};

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  sendCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const [resource, id] = routeParts(request);

  try {
    if (resource === "health" && request.method === "GET") {
      response.status(200).json({ status: "ok" });
      return;
    }

    if (resource === "rankings") {
      if (!id && request.method === "GET") {
        response.status(200).json(await listRankings());
        return;
      }
      if (!id && request.method === "POST") {
        response.status(201).json(await createRanking(rankingInput(request.body)));
        return;
      }
      if (id && request.method === "PATCH") {
        const item = await updateRanking(id, rankingInput(request.body));
        if (!item) return sendError(response, 404, "Ranking not found.");
        response.status(200).json(item);
        return;
      }
      if (id && request.method === "DELETE") {
        if (!await deleteRanking(id)) return sendError(response, 404, "Ranking not found.");
        response.status(204).end();
        return;
      }
    }

    if (resource === "todos") {
      if (!id && request.method === "GET") {
        response.status(200).json(await listTodos());
        return;
      }
      if (!id && request.method === "POST") {
        response.status(201).json(await createTodo(todoInput(request.body)));
        return;
      }
      if (id && request.method === "PATCH") {
        const body = (request.body ?? {}) as Partial<TodoInput> & { completed?: boolean };
        if (body.title !== undefined && !body.title.trim()) throw new Error("Task title cannot be empty.");
        const todo = await updateTodo(id, body);
        if (!todo) return sendError(response, 404, "Todo not found.");
        response.status(200).json(todo);
        return;
      }
      if (id && request.method === "DELETE") {
        if (!await deleteTodo(id)) return sendError(response, 404, "Todo not found.");
        response.status(204).end();
        return;
      }
    }

    sendError(response, 404, "Route not found.");
  } catch (error) {
    sendError(response, 400, error instanceof Error ? error.message : "Request failed.");
  }
}
