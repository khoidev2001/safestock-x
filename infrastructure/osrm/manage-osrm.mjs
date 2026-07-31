import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGraphManifest, sha256File, verifyGraphArtifact } from "./osrm-artifact.mjs";
import {
  buildGraphDockerCommands,
  buildOfflineAcceptanceCommand,
  parseBbox,
  verifyLiveRoute,
} from "./osrm-operations.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const dataDirectory = path.resolve(scriptDirectory, "data");
const composeFile = path.resolve(scriptDirectory, "docker-compose.yml");
const manifestPath = path.resolve(dataDirectory, "dong-xuan.osrm.manifest.json");
const defaultBbox = [108.6, 13.1, 109.3, 13.7];
const action = process.argv[2];
const options = parseOptions(process.argv.slice(3));

switch (action) {
  case "build":
    await build();
    break;
  case "manifest":
    await writeManifest();
    break;
  case "preflight":
    console.log(formatPreflight(await preflight()));
    break;
  case "up":
    console.log(formatPreflight(await preflight()));
    run("docker", composeArgs("up", "-d", "--wait"));
    break;
  case "down":
    run("docker", composeArgs("down"));
    break;
  case "status":
    run("docker", composeArgs("ps"));
    break;
  case "logs":
    run("docker", composeArgs("logs", "-f"));
    break;
  case "verify-live":
    await verifyLive();
    break;
  case "verify-offline": {
    console.log(formatPreflight(await preflight()));
    const command = buildOfflineAcceptanceCommand({ dataDirectory });
    run(command.command, command.args);
    break;
  }
  default:
    throw new Error(
      "Dùng: build|manifest|preflight|up|down|status|logs|verify-live|verify-offline. " +
        "Build cần --source và --graph-version.",
    );
}

async function build() {
  const sourcePath = resolveSource();
  const graphVersion = requiredOption("graph-version");
  const bbox = parseBbox(options.bbox ?? defaultBbox);
  const commands = buildGraphDockerCommands({
    dataDirectory,
    sourceName: path.basename(sourcePath),
  });

  for (const command of commands) {
    console.log(`OSRM ${command.stage}...`);
    run(command.command, command.args);
  }

  await writeManifest({ sourcePath, graphVersion, bbox });
  console.log(formatPreflight(await preflight()));
}

async function writeManifest(overrides = {}) {
  const sourcePath = overrides.sourcePath ?? resolveSource();
  const graphVersion = overrides.graphVersion ?? requiredOption("graph-version");
  const bbox = overrides.bbox ?? parseBbox(options.bbox ?? defaultBbox);
  const sourceMetadata = await loadSourceMetadata(sourcePath);
  const manifest = await createGraphManifest({
    dataDirectory,
    graphVersion,
    bbox,
    source: sourceMetadata,
  });

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function preflight() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Thiếu ${path.basename(manifestPath)}. Hãy chạy osrm:build trước.`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await verifyGraphArtifact(dataDirectory, manifest);
  return { ...result, manifest };
}

async function verifyLive() {
  const { manifest } = await preflight();
  const result = await verifyLiveRoute({
    baseUrl: options.url ?? process.env.LOCAL_ROUTING_URL ?? "http://127.0.0.1:5000",
    graphVersion: manifest.graphVersion,
    origin: { lat: 13.3667, lng: 109.0333 },
    destination: { lat: 13.42, lng: 109.08 },
  });
  console.log(
    `OSRM live OK: graph=${result.graphVersion}, ` +
      `distance=${Math.round(result.distanceMeters)}m, ` +
      `duration=${Math.round(result.durationSeconds)}s, ` +
      `geometry=${result.geometryPoints} points.`,
  );
}

async function loadSourceMetadata(sourcePath) {
  const checksum = await sha256File(sourcePath);
  const metadataPath = `${sourcePath}.source.json`;
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    if (metadata.sha256 !== checksum) {
      throw new Error("Checksum source không khớp file metadata.");
    }
    return {
      ...metadata,
      name: path.basename(sourcePath),
      sha256: checksum,
    };
  }

  const metadata = await stat(sourcePath);
  return {
    name: path.basename(sourcePath),
    sha256: checksum,
    generatedAt: metadata.mtime.toISOString(),
  };
}

function resolveSource() {
  const sourceOption = requiredOption("source");
  const sourcePath = path.resolve(repositoryRoot, sourceOption);
  if (path.dirname(sourcePath) !== dataDirectory) {
    throw new Error("Source OSRM phải nằm trực tiếp trong infrastructure/osrm/data.");
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Không tìm thấy source OSRM: ${sourcePath}`);
  }
  return sourcePath;
}

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value == null || value.startsWith("--")) {
      throw new Error(`Option không hợp lệ: ${key ?? "(trống)"}`);
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function requiredOption(name) {
  const value = options[name];
  if (!value) throw new Error(`Thiếu --${name}.`);
  return value;
}

function composeArgs(...args) {
  return ["compose", "-f", composeFile, ...args];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} thất bại với exit code ${result.status}.`);
  }
}

function formatPreflight({ graphVersion, filesVerified }) {
  return `OSRM preflight OK: graph=${graphVersion}, files=${filesVerified}.`;
}
