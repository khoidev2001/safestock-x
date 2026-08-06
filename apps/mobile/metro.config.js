const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

// Expo SDK 52+ tự nhận diện pnpm workspace. Dev server giữ workspace root để
// Expo không nhân đôi apps/mobile trong entry URL. Gradle Windows lại truyền
// ./index.js tương đối với app khi embed release, nên release cần app root.
const config = getDefaultConfig(__dirname);
if (process.env.NODE_ENV === "production") {
  config.server.unstable_serverRoot = __dirname;
}

/**
 * Ép React và React Native về ĐÚNG MỘT bản trong gói.
 *
 * pnpm dựng node_modules bằng liên kết tượng trưng, nên cùng một gói React tới
 * được qua nhiều đường dẫn khác nhau — đường của app, đường của expo-modules-core.
 * Metro coi mỗi đường là một module riêng và nạp React hai lần; bản thứ hai chưa
 * bao giờ được gắn vào cây render nên dispatcher rỗng, và mọi hook chạy bên trong
 * thư viện đều ngã:
 *
 *   Invalid hook call … Cannot read property 'useRef' of null
 *     exports.useRef      react/cjs/react.development.js
 *     usePermission       expo-modules-core/src/PermissionsHook.ts
 *     QrScanner           apps/mobile/InventoryScreen.tsx
 *
 * Cả hai đường đều trỏ về cùng react@18.3.1 trên đĩa — không phải xung đột phiên
 * bản, chỉ là Metro không biết chúng là một.
 *
 * Phải chặn ở resolveRequest chứ không dùng extraNodeModules: extraNodeModules
 * chỉ là phương án DỰ PHÒNG khi không phân giải được theo cách thường, mà ở đây
 * cách thường vẫn chạy — chỉ là ra nhầm bản.
 */
const SINGLETONS = ["react", "react-dom", "react-native", "scheduler"];

const singletonRoots = new Map();
for (const name of SINGLETONS) {
  try {
    singletonRoots.set(
      name,
      path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] })),
    );
  } catch {
    // Gói không có trong dự án thì bỏ qua, không chốt gì cả.
  }
}

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, root] of singletonRoots) {
    if (moduleName !== name && !moduleName.startsWith(`${name}/`)) continue;
    // Phân giải lại từ THƯ MỤC ĐÃ CHỐT, giữ nguyên phần đuôi (vd "react/jsx-runtime").
    return context.resolveRequest(
      { ...context, originModulePath: path.join(root, "package.json") },
      moduleName,
      platform,
    );
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
