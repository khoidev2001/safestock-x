// Mobile (Expo SDK 52) CHƯA hỗ trợ flat config → dùng legacy .eslintrc + ESLint 8 (cô lập trong app này).
// eslint-config-expo đã gồm react/react-native/react-hooks/import; "prettier" tắt rule format xung đột.
module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  ignorePatterns: ["/dist", "/.expo", "/node_modules"],
  rules: {
    "prefer-arrow-callback": "error",
    "arrow-body-style": ["error", "as-needed"],
  },
};
