# Rank Everything API

Fastify + TypeScript API for the Expo app. MongoDB Atlas is accessed only from this server; never put `MONGODB_URI` or `AI_API_KEY` in the Expo app.

## Setup

1. Copy `.env.example` to `.env`.
2. Create a MongoDB Atlas database user and allow the development machine IP in Atlas Network Access.
3. Fill in `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Install and run:

```bash
npm install
npm run dev
```

The API runs at `http://localhost:4000` by default.

## Endpoints

- `GET /health`
- `GET /api/rankings`
- `POST /api/rankings`
- `PATCH /api/rankings/:id`
- `DELETE /api/rankings/:id`
- `POST /api/ai/suggestions`

The AI endpoint is optional and requires an OpenAI-compatible provider configured in `.env`.
