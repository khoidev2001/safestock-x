export function validateDemoContainerIdentity(containers, env) {
  const errors = [];
  const byService = new Map(
    containers.map((container) => [
      container.Config?.Labels?.["com.docker.compose.service"],
      container,
    ]),
  );

  validateContainer(
    byService.get("postgres"),
    {
      service: "postgres",
      name: "safestock_demo_postgres",
      image: "postgres:16-alpine",
      project: "safestock-demo",
      containerPort: "5432/tcp",
      hostPort: String(env.POSTGRES_PORT ?? ""),
      volume: "safestock-demo_pgdata",
      destination: "/var/lib/postgresql/data",
      environment: {
        POSTGRES_DB: String(env.POSTGRES_DB ?? ""),
        POSTGRES_USER: String(env.POSTGRES_USER ?? ""),
        POSTGRES_PASSWORD: String(env.POSTGRES_PASSWORD ?? ""),
      },
    },
    errors,
  );
  validateContainer(
    byService.get("redis"),
    {
      service: "redis",
      name: "safestock_demo_redis",
      image: "redis:7-alpine",
      project: "safestock-demo",
      containerPort: "6379/tcp",
      hostPort: String(env.REDIS_PORT ?? ""),
      volume: "safestock-demo_redisdata",
      destination: "/data",
    },
    errors,
  );

  if (errors.length > 0) {
    throw new Error(`Demo container identity check failed:\n- ${errors.join("\n- ")}`);
  }
}

function validateContainer(container, expected, errors) {
  if (!container) {
    errors.push(`${expected.service} container is missing`);
    return;
  }
  if (container.Name?.replace(/^\//, "") !== expected.name) {
    errors.push(`${expected.service} container name does not match demo stack`);
  }
  if (container.Config?.Image !== expected.image) {
    errors.push(`${expected.service} image does not match demo stack`);
  }
  const containerEnvironment = Object.fromEntries(
    (container.Config?.Env ?? []).map((entry) => {
      const separator = entry.indexOf("=");
      return separator < 0 ? [entry, ""] : [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  for (const [key, value] of Object.entries(expected.environment ?? {})) {
    if (containerEnvironment[key] !== value) {
      errors.push(`${expected.service} environment does not match demo config`);
    }
  }
  if (container.Config?.Labels?.["com.docker.compose.project"] !== expected.project) {
    errors.push(`${expected.service} Compose project is not safestock-demo`);
  }
  if (!container.State?.Running || container.State?.Health?.Status !== "healthy") {
    errors.push(`${expected.service} container is not running and healthy`);
  }

  const bindings = container.NetworkSettings?.Ports?.[expected.containerPort] ?? [];
  if (
    bindings.length !== 1 ||
    bindings[0].HostIp !== "127.0.0.1" ||
    bindings[0].HostPort !== expected.hostPort
  ) {
    errors.push(`${expected.service} port binding does not match demo config`);
  }

  const hasVolume = (container.Mounts ?? []).some(
    (mount) =>
      mount.Type === "volume" &&
      mount.Name === expected.volume &&
      mount.Destination === expected.destination,
  );
  if (!hasVolume) errors.push(`${expected.service} volume does not match demo project`);
}
