import http from "node:http";

const targetPort = Number(process.env.EXPO_WEB_TARGET_PORT ?? 8096);
const proxyPort = Number(process.env.EXPO_WEB_ISOLATED_PORT ?? 8097);
const targetHost = process.env.EXPO_WEB_TARGET_HOST ?? "127.0.0.1";

const server = http.createServer((clientReq, clientRes) => {
  void proxyRequest(clientReq, clientRes);
});

async function proxyRequest(clientReq, clientRes) {
  try {
    const body =
      clientReq.method === "GET" || clientReq.method === "HEAD"
        ? undefined
        : await readRequestBody(clientReq);
    const response = await fetch(`http://${targetHost}:${targetPort}${clientReq.url}`, {
      method: clientReq.method,
      headers: normalizeRequestHeaders(clientReq.headers),
      body,
      redirect: "manual",
    });

    const headers = Object.fromEntries(response.headers.entries());
    delete headers["content-encoding"];
    delete headers["content-length"];
    clientRes.writeHead(response.status, {
      ...headers,
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "credentialless",
    });

    if (clientReq.method === "HEAD") {
      clientRes.end();
      return;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    clientRes.end(bytes);
  } catch (error) {
    clientRes.writeHead(502, {
      "content-type": "text/plain; charset=utf-8",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "credentialless",
    });
    clientRes.end(`Expo web target is not reachable: ${error.message}`);
  }
}

function normalizeRequestHeaders(headers) {
  const next = { ...headers };
  next.host = `${targetHost}:${targetPort}`;
  delete next.connection;
  return next;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

server.listen(proxyPort, "127.0.0.1", () => {
  console.log(
    `Isolated Expo web proxy listening on http://localhost:${proxyPort} -> http://${targetHost}:${targetPort}`
  );
});

setInterval(() => undefined, 60_000);
