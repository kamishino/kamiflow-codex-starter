export function registerApiRoutes(fastify: any, handlers: Record<string, any>) {
  fastify.get("/api/chat/health", handlers.health);
  fastify.post("/api/chat/token/verify", handlers.verifyToken);
  fastify.get("/api/chat/session", handlers.session);
  fastify.get("/api/chat/sessions", handlers.sessions);
  fastify.get("/api/chat/transcript", handlers.transcript);
  fastify.post("/api/chat/reveal", handlers.reveal);
  fastify.post("/api/chat/bind", handlers.bind);
}
