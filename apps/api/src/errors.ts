import type { FastifyReply } from "fastify";

export function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: "unauthorized",
    message: "A valid Clerk session token is required."
  });
}

export function sendNotConfigured(reply: FastifyReply, service: string) {
  return reply.code(503).send({
    error: "not_configured",
    message: `${service} is not configured yet.`
  });
}
