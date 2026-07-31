import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OSRM_IMAGE } from "./osrm-artifact.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const composeFile = resolve(scriptDirectory, "docker-compose.yml");

test("OSRM runtime khóa image digest, chỉ bind localhost và mount graph read-only", () => {
  const result = spawnSync("docker", ["compose", "-f", composeFile, "config", "--format", "json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(result.stdout);
  const service = config.services.osrm;

  assert.equal(service.image, OSRM_IMAGE);
  assert.deepEqual(service.command.slice(0, 3), ["osrm-routed", "--algorithm", "mld"]);
  assert.equal(service.ports[0].host_ip, "127.0.0.1");
  assert.equal(service.ports[0].published, "5000");
  assert.equal(service.volumes[0].read_only, true);
  assert.equal(service.read_only, true);
  assert.ok(service.security_opt.includes("no-new-privileges:true"));
  assert.match(service.healthcheck.test.join(" "), /route\/v1\/driving/);
});
