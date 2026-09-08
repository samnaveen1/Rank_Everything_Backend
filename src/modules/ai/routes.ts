import { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

type SuggestionBody = {
  name?: string;
  notes?: string;
};

export const registerAiRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post<{ Body: SuggestionBody }>("/api/ai/suggestions", async (request, reply) => {
    if (!env.aiApiUrl || !env.aiApiKey || !env.aiModel) {
      return reply.code(503).send({
        message: "AI suggestions are not configured. Add AI_API_URL, AI_API_KEY, and AI_MODEL to backend/.env.",
      });
    }

    const name = request.body?.name?.trim() ?? "";
    const notes = request.body?.notes?.trim() ?? "";

    if (!name && !notes) {
      return reply.code(400).send({ message: "Name or notes are required." });
    }

    const response = await fetch(env.aiApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.aiApiKey}`,
      },
      body: JSON.stringify({
        model: env.aiModel,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return JSON with category (string), rating (number from 0 to 10), and notes (short string). Give useful suggestions, but make clear they are suggestions.",
          },
          {
            role: "user",
            content: JSON.stringify({ name, notes }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return reply.code(502).send({ message: "The AI provider returned an error." });
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return reply.code(502).send({ message: "The AI provider returned no suggestions." });
    }

    try {
      return JSON.parse(content);
    } catch {
      return reply.code(502).send({ message: "The AI provider returned invalid suggestions." });
    }
  });
};
