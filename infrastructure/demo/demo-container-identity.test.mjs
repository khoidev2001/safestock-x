import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoContainerIdentity } from "./demo-container-identity.mjs";

const env = {
  POSTGRES_PORT: "55434",
  REDIS_PORT: "56381",
  POSTGRES_DB: "safestock_demo",
  POSTGRES_USER: "safestock_demo",
  POSTGRES_PASSWORD: "demo-database-password",
};
const containers = [
  containerFixture({
    service: "postgres",
    name: "safestock_demo_postgres",
    image: "postgres:16-alpine",
    containerPort: "5432/tcp",
    hostPort: "55434",
    volume: "safestock-demo_pgdata",
    destination: "/var/lib/postgresql/data",
    environment: [
      "POSTGRES_DB=safestock_demo",
      "POSTGRES_USER=safestock_demo",
      "POSTGRES_PASSWORD=demo-database-password",
    ],
  }),
  containerFixture({
    service: "redis",
    name: "safestock_demo_redis",
    image: "redis:7-alpine",
    containerPort: "6379/tcp",
    hostPort: "56381",
    volume: "safestock-demo_redisdata",
    destination: "/data",
  }),
];

test("accepts healthy containers owned by the demo Compose project", () => {
  assert.doesNotThrow(() => validateDemoContainerIdentity(containers, env));
});

test("rejects an operational or unhealthy Redis container", () => {
  const poisoned = structuredClone(containers);
  poisoned[1].Config.Labels["com.docker.compose.project"] = "infrastructure";
  poisoned[1].State.Health.Status = "unhealthy";
  assert.throws(
    () => validateDemoContainerIdentity(poisoned, env),
    /not safestock-demo|not running/,
  );
});

test("rejects a shared or incorrectly published volume and port", () => {
  const poisoned = structuredClone(containers);
  poisoned[0].Mounts[0].Name = "infrastructure_pgdata";
  poisoned[0].NetworkSettings.Ports["5432/tcp"][0].HostPort = "55433";
  assert.throws(() => validateDemoContainerIdentity(poisoned, env), /port binding|volume/);
});

function containerFixture({
  service,
  name,
  image,
  containerPort,
  hostPort,
  volume,
  destination,
  environment = [],
}) {
  return {
    Name: `/${name}`,
    Config: {
      Image: image,
      Env: environment,
      Labels: {
        "com.docker.compose.project": "safestock-demo",
        "com.docker.compose.service": service,
      },
    },
    State: { Running: true, Health: { Status: "healthy" } },
    NetworkSettings: {
      Ports: { [containerPort]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] },
    },
    Mounts: [{ Type: "volume", Name: volume, Destination: destination }],
  };
}
