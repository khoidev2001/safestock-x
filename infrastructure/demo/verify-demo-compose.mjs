import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const composeFile = resolve(repositoryRoot, "infrastructure/docker-compose.yml");
const operational = render(resolve(repositoryRoot, ".env.example"));
const demo = render(resolve(repositoryRoot, ".env.demo.example"), "safestock-demo");

assert.equal(operational.name, "infrastructure");
assert.equal(operational.services.postgres.container_name, "safestock_postgres");
assert.equal(operational.services.redis.container_name, "safestock_redis");
assert.equal(operational.services.postgres.ports[0].published, "55433");
assert.equal(operational.services.redis.ports[0].published, "56380");
assert.equal(operational.volumes.pgdata.name, "infrastructure_pgdata");
assert.equal(operational.volumes.redisdata.name, "infrastructure_redisdata");

assert.equal(demo.name, "safestock-demo");
assert.equal(demo.services.postgres.container_name, "safestock_demo_postgres");
assert.equal(demo.services.redis.container_name, "safestock_demo_redis");
assert.equal(demo.services.postgres.ports[0].host_ip, "127.0.0.1");
assert.equal(demo.services.redis.ports[0].host_ip, "127.0.0.1");
assert.equal(demo.services.postgres.ports[0].published, "55434");
assert.equal(demo.services.redis.ports[0].published, "56381");
assert.equal(demo.services.postgres.environment.POSTGRES_DB, "safestock_demo");
assert.equal(demo.services.postgres.environment.POSTGRES_USER, "safestock_demo");
assert.notEqual(
  demo.services.postgres.environment.POSTGRES_PASSWORD,
  operational.services.postgres.environment.POSTGRES_PASSWORD,
);
assert.equal(demo.volumes.pgdata.name, "safestock-demo_pgdata");
assert.equal(demo.volumes.redisdata.name, "safestock-demo_redisdata");

assert.notEqual(demo.volumes.pgdata.name, operational.volumes.pgdata.name);
assert.notEqual(demo.volumes.redisdata.name, operational.volumes.redisdata.name);
console.log("Operational and demo Compose resources are isolated by configuration.");

function render(envFile, projectName) {
  const args = ["compose", "--env-file", envFile];
  if (projectName) args.push("-p", projectName);
  args.push("-f", composeFile, "config", "--format", "json");
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "docker compose config failed");
  return JSON.parse(result.stdout);
}
