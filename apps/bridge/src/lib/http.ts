export function jsonResponse(payload: unknown, status: number, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    status,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
