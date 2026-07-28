module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          // expo-modules-autolinking 2.0.8 cannot load Expo's config through
          // pnpm's Windows junction and otherwise infers the legacy namespace.
          packageImportPath: "import expo.modules.ExpoModulesPackage;",
          packageInstance: "new ExpoModulesPackage()",
        },
      },
    },
  },
};
