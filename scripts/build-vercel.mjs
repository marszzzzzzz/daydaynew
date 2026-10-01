// Vercel 建構（Build Output API v3）：
// - 前端：vite build → .vercel/output/static（Vercel CDN 派）
// - 後端：server/vercel-entry.ts 用 esbuild 打包成單一檔案 → .vercel/output/functions/api.func
// - 路由：/api/* → function；其他路徑先搵靜態檔，搵唔到就回 index.html（SPA）
import fs from "node:fs";
import { execSync } from "node:child_process";
import { build } from "esbuild";

const OUT = ".vercel/output";
fs.rmSync(OUT, { recursive: true, force: true });

execSync("npx vite build", { stdio: "inherit" });
fs.cpSync("dist/public", `${OUT}/static`, { recursive: true });

const fn = `${OUT}/functions/api.func`;
await build({
  entryPoints: ["server/vercel-entry.ts"],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // PGlite 只係本機開發用（Vercel 一定有 DATABASE_URL），唔打包
  external: ["@electric-sql/pglite", "drizzle-orm/pglite"],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
fs.writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30, regions: ["sin1"] }, null, 2),
);
fs.writeFileSync(`${fn}/package.json`, JSON.stringify({ type: "module" }));

fs.writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api(/.*)?$", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`✓ .vercel/output ready（function ${kb(`${fn}/index.mjs`)} KB）`);
