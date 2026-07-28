import assert from "node:assert/strict";
import test from "node:test";
import { OSRM_IMAGE } from "./osrm-artifact.mjs";
import {
  buildGraphDockerCommands,
  buildOfflineAcceptanceCommand,
  parseBbox,
  verifyLiveRoute,
} from "./osrm-operations.mjs";

test("build graph dùng đúng image khóa digest và đủ pipeline MLD", () => {
  const commands = buildGraphDockerCommands({
    dataDirectory: "D:\\safestock\\osrm\\data",
    sourceName: "dong-xuan.osm.pbf",
  });

  assert.equal(commands.length, 3);
  assert.ok(commands.every((command) => command.command === "docker"));
  assert.ok(commands.every((command) => command.args.includes(OSRM_IMAGE)));
  assert.deepEqual(
    commands.map((command) => command.stage),
    ["extract", "partition", "customize"],
  );
  assert.ok(commands[1].args.includes("/data/dong-xuan.osrm"));
  assert.ok(commands[2].args.includes("/data/dong-xuan.osrm"));
  assert.deepEqual(commands[0].args.slice(-3), [
    "-p",
    "/opt/car.lua",
    "/data/dong-xuan.osm.pbf",
  ]);
});

test("bbox parser khóa đúng thứ tự west,south,east,north", () => {
  assert.deepEqual(parseBbox("108.6,13.1,109.3,13.7"), [
    108.6, 13.1, 109.3, 13.7,
  ]);
  assert.throws(() => parseBbox("109.3,13.1,108.6,13.7"), /bbox/i);
});

test("offline acceptance chạy OSRM với network none và graph read-only", () => {
  const command = buildOfflineAcceptanceCommand({
    dataDirectory: "D:\\safestock\\osrm\\data",
  });

  assert.equal(command.command, "docker");
  assert.ok(command.args.includes("--network"));
  assert.equal(command.args[command.args.indexOf("--network") + 1], "none");
  assert.ok(
    command.args.some(
      (argument) => argument.endsWith(":/data:ro"),
    ),
  );
  assert.ok(command.args.includes(OSRM_IMAGE));
  assert.match(command.args.at(-1), /route\/v1\/driving/);
});

test("live verify chỉ pass khi OSRM trả route đường bộ có geometry và metrics", async () => {
  const result = await verifyLiveRoute({
    baseUrl: "http://127.0.0.1:5000",
    graphVersion: "dong-xuan-2026-07-27",
    origin: { lat: 13.3667, lng: 109.0333 },
    destination: { lat: 13.42, lng: 109.08 },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 9300,
              duration: 1020,
              geometry: {
                type: "LineString",
                coordinates: [
                  [109.0333, 13.3667],
                  [109.08, 13.42],
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(result, {
    graphVersion: "dong-xuan-2026-07-27",
    distanceMeters: 9300,
    durationSeconds: 1020,
    geometryPoints: 2,
  });

  await assert.rejects(
    () =>
      verifyLiveRoute({
        baseUrl: "http://127.0.0.1:5000",
        graphVersion: "dong-xuan-2026-07-27",
        origin: { lat: 13.3667, lng: 109.0333 },
        destination: { lat: 13.42, lng: 109.08 },
        fetchImpl: async () =>
          new Response(JSON.stringify({ code: "NoRoute", routes: [] })),
      }),
    /không trả route/i,
  );
});
