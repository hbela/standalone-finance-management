const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const forbiddenRuntimePatterns = [
  "convex",
  "@clerk/clerk-expo",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CLERK",
  "EXPO_PUBLIC_DUAL_WRITE",
  "apps/api",
];

function collectRuntimeFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRuntimeFiles(fullPath);
    }
    if (!/\.(ts|tsx|json)$/.test(entry.name)) {
      return [];
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [fullPath];
  });
}

describe("M6 cleanup regression", () => {
  test("runtime mobile code does not reintroduce deleted Convex/Fastify/Clerk era references", () => {
    const roots = [
      path.resolve(__dirname, "..", "App.tsx"),
      path.resolve(__dirname),
      path.resolve(__dirname, "..", "package.json"),
      path.resolve(__dirname, "..", "app.json"),
    ];
    const files = roots.flatMap((root) =>
      fs.statSync(root).isDirectory() ? collectRuntimeFiles(root) : [root]
    );
    const violations = files.flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return forbiddenRuntimePatterns
        .filter((pattern) => text.includes(pattern))
        .map((pattern) => `${path.relative(path.resolve(__dirname, ".."), file)} contains ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
