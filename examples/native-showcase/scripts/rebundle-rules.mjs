export function nativeBuildChanges(paths) {
  return paths.filter(
    (path) =>
      /^(?:pnpm-lock\.yaml|package\.json|patches\/|packages\/native\/|examples\/native-showcase\/(?:package\.json|app\.json|app\.config\.|ios\/|android\/))/.test(
        path,
      ) ||
      /(?:^|\/)(?:package\.json|expo-module\.config\.json|react-native\.config\.[cm]?js)$/.test(
        path,
      ) ||
      /\.(?:swift|m|mm|c|cpp|h|hpp|java|kt|gradle|podspec|plist|pbxproj|xcconfig)$/.test(path),
  )
}
