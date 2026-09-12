import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(scriptDirectory, "..");
const androidRoot = join(mobileRoot, "android");
const isWindows = process.platform === "win32";

/**
 * Máy chủ thật của bản phát hành.
 *
 * Metro nhúng cứng `EXPO_PUBLIC_*` vào bundle lúc build chứ không đọc lúc chạy,
 * nên endpoint phải do chính script này quyết định thay vì phụ thuộc `.env.local`
 * — file đó tồn tại để chạy dev và thường trỏ về máy lập trình viên. Bản 0.5.2 đã
 * ra lò với `http://localhost:3110` đúng vì lý do này, mà trên điện thoại thật
 * `localhost` là chính cái điện thoại nên mọi lời gọi đều "Network request failed".
 */
const PRODUCTION_API_BASE_URL = "https://ungphonhanh.life";

/** Bundle gradle sinh ra trước khi nhét vào APK — đọc lại để kiểm chứng endpoint. */
const generatedBundlePath = join(
  androidRoot,
  "app",
  "build",
  "generated",
  "assets",
  "createBundleReleaseJsAndAssets",
  "index.android.bundle",
);

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

const apiBaseUrl = resolveApiBaseUrl();

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
} else if (!apiBaseUrl) {
  process.exitCode = 1;
} else {
  // Đường dẫn tuyệt đối: tên trần chỉ chạy được khi shell chịu tìm trong thư mục
  // hiện hành, và điều đó không đúng ở mọi môi trường chạy lệnh trên Windows.
  const gradleWrapper = join(androidRoot, isWindows ? "gradlew.bat" : "gradlew");
  if (!existsSync(gradleWrapper)) {
    console.error(`Không tìm thấy Gradle wrapper tại ${gradleWrapper}.`);
    process.exitCode = 1;
    throw new Error("Gradle wrapper missing");
  }

  console.log(`Endpoint nhúng vào bundle: ${apiBaseUrl}`);
  discardStaleBundle();

  const result = spawnSync(
    // Node bắt buộc shell cho .bat trên Windows, mà shell lại tách chuỗi theo
    // khoảng trắng — đường dẫn dự án có dấu cách nên phải bọc ngoặc.
    isWindows ? `"${gradleWrapper}"` : gradleWrapper,
    ["assembleRelease", "--no-daemon"],
    {
      cwd: androidRoot,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: androidSdk,
        ANDROID_SDK_ROOT: androidSdk,
        NODE_ENV: "production",
        // Bản release tự mang endpoint của mình. `EXPO_NO_DOTENV` cắt hẳn đường
        // `.env*` của Metro để không file dev nào lọt được vào APK; biến này là
        // `EXPO_PUBLIC_*` duy nhất app dùng nên không mất gì khác khi cắt.
        EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
        EXPO_NO_DOTENV: "1",
      },
      stdio: "inherit",
      shell: isWindows,
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;

  if (result.status === 0 && !verifyBundledApiBase(apiBaseUrl)) {
    process.exitCode = 1;
  }
}

/**
 * Endpoint của bản build: mặc định là máy chủ thật, và chỉ nhường chỗ khi người
 * chạy lệnh tự đặt `EXPO_PUBLIC_API_BASE_URL` trong môi trường (ví dụ bản thử
 * nghiệm cho máy chủ staging). Trả về `null` nếu giá trị đó không dùng được.
 */
function resolveApiBaseUrl() {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!override || override === PRODUCTION_API_BASE_URL) {
    return PRODUCTION_API_BASE_URL;
  }

  // Manifest đặt `usesCleartextTraffic="false"`, nên APK gọi HTTP trần thì Android
  // chặn ngay ở tầng mạng — dừng tại đây còn hơn giao ra một bản không đăng nhập nổi.
  if (!override.startsWith("https://")) {
    console.error(
      `EXPO_PUBLIC_API_BASE_URL=${override} không dùng được cho bản release: Android chặn HTTP trần.`,
    );
    console.error(`Bỏ biến này đi để build vào ${PRODUCTION_API_BASE_URL}, hoặc đặt một URL https.`);
    return null;
  }

  console.warn(`Cảnh báo: build vào ${override} thay vì ${PRODUCTION_API_BASE_URL} (theo biến môi trường).`);
  return override;
}

/**
 * Gradle không coi biến môi trường là đầu vào của tác vụ đóng gói JS, nên khi mã
 * nguồn không đổi nó sẽ báo UP-TO-DATE và giữ nguyên bundle cũ — kể cả bundle đó
 * mang endpoint sai. Xoá sản phẩm đi là cách buộc tác vụ chạy lại.
 */
function discardStaleBundle() {
  rmSync(generatedBundlePath, { force: true });
}

/** Đọc lại bundle vừa sinh để chắc chắn endpoint đã vào đúng, trước khi APK rời máy. */
function verifyBundledApiBase(expectedUrl) {
  if (!existsSync(generatedBundlePath)) {
    console.warn(`Không tìm thấy ${generatedBundlePath}, bỏ qua bước kiểm chứng endpoint.`);
    return true;
  }

  if (readFileSync(generatedBundlePath, "utf8").includes(expectedUrl)) {
    console.log(`Đã kiểm chứng: bundle gọi vào ${expectedUrl}.`);
    return true;
  }

  console.error(`Bundle không chứa ${expectedUrl} — APK này sẽ không đăng nhập được, đừng phát hành.`);
  // Gradle luôn truyền `--reset-cache` cho bước đóng gói JS, nhưng Expo CLI bỏ cờ
  // đó khi thấy biến `CI` — lúc ấy Metro có thể trả lại bản dịch cũ kèm endpoint cũ,
  // vì giá trị `EXPO_PUBLIC_*` không nằm trong khoá cache của Metro.
  console.error(`Xoá ${join(androidRoot, "app", "build")} rồi chạy lại; nếu môi trường có biến CI thì bỏ biến đó ra để Metro chịu dịch lại.`);
  return false;
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
  return (
    existsSync(join(androidSdk, "platform-tools")) && existsSync(join(androidSdk, "platforms"))
  );
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}
