const NO_STORE = "private, no-store, max-age=0";

/**
 * Keeps the browser on ungphonhanh.life while Cloudflare forwards only API and
 * Socket.IO traffic to the public tunnel origin.  The same paths are served by
 * the LAN Caddy proxy when split-DNS resolves the hostname internally.
 */
export function resolveBackendOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("BACKEND_ORIGIN must be configured");
  }

  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("BACKEND_ORIGIN must be an HTTPS origin without a path");
  }

  return url;
}

export function createUpstreamRequest(request, backendOrigin) {
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(`${incoming.pathname}${incoming.search}`, backendOrigin);
  const upstream = new Request(upstreamUrl, request);

  // The upstream host is selected from its URL.  Preserve the original public
  // host separately so audit logs can distinguish public and LAN requests.
  upstream.headers.delete("Host");
  upstream.headers.set("X-Forwarded-Host", incoming.host);
  upstream.headers.set("X-Forwarded-Proto", incoming.protocol.slice(0, -1));

  return upstream;
}

export function isRoutedApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/socket.io" ||
    pathname.startsWith("/socket.io/")
  );
}

function noStore(response) {
  // A 101 response owns a WebSocket object. Re-wrapping it would drop the
  // upgraded connection, so return it unchanged.
  if (response.webSocket) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", NO_STORE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    try {
      if (!isRoutedApiPath(new URL(request.url).pathname)) {
        return new Response("Not found", {
          status: 404,
          headers: { "Cache-Control": NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const upstream = createUpstreamRequest(request, resolveBackendOrigin(env.BACKEND_ORIGIN));
      return noStore(await fetch(upstream));
    } catch (error) {
      console.error("Hybrid API router could not reach its configured backend", error);
      return new Response("Dich vu API tam thoi khong san sang", {
        status: 502,
        headers: { "Cache-Control": NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  },
};
