import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(scriptDirectory, "..");
const androidRoot = join(mobileRoot, "android");
const isWindows = process.platform === "win32";

const javaHomes = unique([
  process.env.JAVA_HOME,
  process.env.JDK_HOME,
  ...(isWindows
    ? [
        "C:\\Program Files\\Java\\jdk-21",
        "C:\\Program Files\\Java\\jdk-17",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-21",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-17",
      ]
    : []),
]);

const javaHome = javaHomes.find(isJdk17OrNewer);
const androidSdk = unique([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  ...(isWindows && process.env.LOCALAPPDATA
    ? [join(process.env.LOCALAPPDATA, "Android", "Sdk")]
    : []),
]).find(isAndroidSdk);

if (!javaHome) {
  console.error(
    "Android release requires JDK 17 or newer. Set JAVA_HOME to a JDK (not a JRE), then run pnpm mobile android:release again.",
  );
  process.exitCode = 1;
} else if (!androidSdk) {
  console.error(
    "Android release requires Android SDK. Set ANDROID_HOME or ANDROID_SDK_ROOT to a valid SDK, then run pnpm mobile android:release again.",
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    isWindows ? "gradlew.bat" : "./gradlew",
    ["assembleRelease", "--no-daemon"],
    {
      cwd: androidRoot,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: androidSdk,
        ANDROID_SDK_ROOT: androidSdk,
        NODE_ENV: "production",
      },
      stdio: "inherit",
      shell: isWindows,
    },
  );

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

function isJdk17OrNewer(javaHome) {
  const executable = join(javaHome, "bin", isWindows ? "java.exe" : "java");
  if (!existsSync(executable)) return false;

  const version = spawnSync(executable, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${version.stdout ?? ""}\n${version.stderr ?? ""}`;
  const matched = output.match(/version\s+"(?:1\.)?(\d+)/);
  return version.status === 0 && Number(matched?.[1]) >= 17;
}

function isAndroidSdk(androidSdk) {
  return existsSync(join(androidSdk, "platform-tools")) && existsSync(join(androidSdk, "platforms"));
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}
