import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGraphManifest, verifyGraphArtifact } from "./osrm-artifact.mjs";

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "safestock-osrm-"));
  await writeFile(path.join(directory, "dong-xuan.osrm.cells"), "cells-v1");
  await writeFile(path.join(directory, "dong-xuan.osrm.geometry"), "geometry-v1");
  return directory;
}

test("manifest khóa source, image digest, bbox và checksum từng graph file", async () => {
  const directory = await fixture();

  const manifest = await createGraphManifest({
    dataDirectory: directory,
    graphVersion: "dong-xuan-2026-07-27",
    source: {
      name: "dong-xuan-buffer.osm",
      sha256: "a".repeat(64),
      generatedAt: "2026-07-27T00:00:00.000Z",
    },
    bbox: [108.6, 13.1, 109.3, 13.7],
  });

  assert.equal(manifest.algorithm, "mld");
  assert.match(manifest.image, /@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    manifest.files.map((file) => file.name),
    ["dong-xuan.osrm.cells", "dong-xuan.osrm.geometry"],
  );
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test("preflight chấp nhận graph nguyên vẹn và từ chối file bị sửa", async () => {
  const directory = await fixture();
  const manifest = await createGraphManifest({
    dataDirectory: directory,
    graphVersion: "dong-xuan-2026-07-27",
    source: {
      name: "dong-xuan-buffer.osm",
      sha256: "b".repeat(64),
      generatedAt: "2026-07-27T00:00:00.000Z",
    },
    bbox: [108.6, 13.1, 109.3, 13.7],
  });

  await assert.doesNotReject(() => verifyGraphArtifact(directory, manifest));

  await writeFile(path.join(directory, "dong-xuan.osrm.geometry"), "tampered");
  await assert.rejects(
    () => verifyGraphArtifact(directory, manifest),
    /checksum không khớp.*dong-xuan\.osrm\.geometry/i,
  );
});

test("manifest không chấp nhận graph version placeholder hoặc bbox sai", async () => {
  const directory = await fixture();

  await assert.rejects(
    () =>
      createGraphManifest({
        dataDirectory: directory,
        graphVersion: "dong-xuan-unconfigured",
        source: {
          name: "dong-xuan-buffer.osm",
          sha256: "c".repeat(64),
          generatedAt: "2026-07-27T00:00:00.000Z",
        },
        bbox: [108.6, 13.1, 109.3, 13.7],
      }),
    /graph version/i,
  );

  await assert.rejects(
    () =>
      createGraphManifest({
        dataDirectory: directory,
        graphVersion: "dong-xuan-2026-07-27",
        source: {
          name: "dong-xuan-buffer.osm",
          sha256: "d".repeat(64),
          generatedAt: "2026-07-27T00:00:00.000Z",
        },
        bbox: [109.3, 13.1, 108.6, 13.7],
      }),
    /bbox/i,
  );
});
