import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  platform: "node",
  target: "esnext",
  skipNodeModulesBundle: true,
  clean: true,
  shims: false,
  minify: "terser",
  splitting: true,
  keepNames: true,
  dts: false,
  sourcemap: "inline",
  treeshake: true,
  tsconfig: "tsconfig.json",
  silent: false
});