import assert from "node:assert/strict";
import test from "node:test";
import hybridApiRouter, {
  createUpstreamRequest,
  isRoutedApiPath,
  resolveBackendOrigin,
} from "./worker.mjs";

test("builds an upstream request without changing its path, query, or method", async () => {
  const origin = resolveBackendOrigin("https://api.ungphonhanh.life");
  const request = new Request("https://ungphonhanh.life/api/simulator/devices?warehouseId=wh-1", {
    method: "POST",
    headers: { Authorization: "Bearer access-token", Host: "ungphonhanh.life" },
    body: '{"confirmed":true}',
  });

  const upstream = createUpstreamRequest(request, origin);

  assert.equal(upstream.url, "https://api.ungphonhanh.life/api/simulator/devices?warehouseId=wh-1");
  assert.equal(upstream.method, "POST");
  assert.equal(upstream.headers.get("authorization"), "Bearer access-token");
  assert.equal(upstream.headers.get("host"), null);
  assert.equal(upstream.headers.get("x-forwarded-host"), "ungphonhanh.life");
  assert.equal(upstream.headers.get("x-forwarded-proto"), "https");
  assert.equal(await upstream.text(), '{"confirmed":true}');
});

test("rejects origins that could turn the router into an open proxy", () => {
  for (const value of [
    undefined,
    "http://api.ungphonhanh.life",
    "https://api.ungphonhanh.life/api",
    "https://operator:password@api.ungphonhanh.life",
  ]) {
    assert.throws(() => resolveBackendOrigin(value));
  }
});

test("accepts only API and Socket.IO path boundaries", () => {
  for (const path of ["/api", "/api/health", "/socket.io", "/socket.io/"]) {
    assert.equal(isRoutedApiPath(path), true);
  }
  for (const path of ["/apix", "/socket.iox", "/", "/dashboard"]) {
    assert.equal(isRoutedApiPath(path), false);
  }
});

test("proxies only to the configured origin and makes API responses uncacheable", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;
  globalThis.fetch = async (request) => {
    capturedRequest = request;
    return new Response("accepted", { headers: { "Cache-Control": "public, max-age=3600" } });
  };

  try {
    const response = await hybridApiRouter.fetch(
      new Request("https://ungphonhanh.life/api/simulator/snapshots", {
        method: "POST",
        body: "{}",
      }),
      { BACKEND_ORIGIN: "https://api.ungphonhanh.life" },
    );

    assert.equal(capturedRequest.url, "https://api.ungphonhanh.life/api/simulator/snapshots");
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(await response.text(), "accepted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed when a broad Cloudflare route receives an unrelated path", async () => {
  const response = await hybridApiRouter.fetch(new Request("https://ungphonhanh.life/apix"), {});

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});
