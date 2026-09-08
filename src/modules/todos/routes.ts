import { FastifyInstance } from "fastify";
import { createTodo, deleteTodo, listTodos, updateTodo } from "./repository.js";
import { TodoInput } from "./types.js";

const validateTitle = (body: unknown): TodoInput => {
  const input = body as Partial<TodoInput> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const details = typeof input?.details === "string" ? input.details : "";
  if (!title) throw new Error("Task title is required.");
  return { title, details };
};

export const registerTodoRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/todos", async () => listTodos());

  app.post<{ Body: unknown }>("/api/todos", async (request, reply) => {
    try { return reply.code(201).send(await createTodo(validateTitle(request.body))); }
    catch (error) { return reply.code(400).send({ message: (error as Error).message }); }
  });

  app.patch<{ Params: { id: string }; Body: Partial<TodoInput> & { completed?: boolean } }>("/api/todos/:id", async (request, reply) => {
    try {
      const body = request.body ?? {};
      if (body.title !== undefined && !body.title.trim()) throw new Error("Task title cannot be empty.");
      const todo = await updateTodo(request.params.id, body);
      if (!todo) return reply.code(404).send({ message: "Todo not found." });
      return todo;
    } catch (error) { return reply.code(400).send({ message: (error as Error).message }); }
  });

  app.delete<{ Params: { id: string } }>("/api/todos/:id", async (request, reply) => {
    if (!await deleteTodo(request.params.id)) return reply.code(404).send({ message: "Todo not found." });
    return reply.code(204).send();
  });
};
