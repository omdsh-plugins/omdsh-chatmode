import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

/**
 * Absolute path inside a harness package's sources.
 *
 * The `.`/`./client` exports of the harness's browser packages are LOADER
 * BUNDLES — they open with `window.__ModuleLoader__.load({...})` and are meant
 * to be fetched by the shell, not imported by a test runner. Specs therefore
 * resolve those specifiers to the package's sources, exactly as the harness's
 * own vitest setup does through its tsconfig paths.
 *
 * A PUBLISHED harness package ships no sources — only `lib/` and `.d.ts` — so
 * this is also where the registry build mode runs out of road. Building
 * against the pin works (types are all the compiler needs, and the browser
 * halves are external at runtime); running the browser specs does not.
 * @param packageName - the harness package.
 * @param source - path of the entry module inside that package.
 * @returns the absolute source path.
 */
function harnessSource(packageName: string, source: string): string {
  const path = join(dirname(require.resolve(`${packageName}/package.json`)), source)
  // Registry mode has no sources to alias to. Resolving to the guard instead
  // of throwing here keeps the node-only specs runnable in both modes: only a
  // spec that actually imports the harness hits the failure, and it says what
  // to do about it.
  return existsSync(path) ? path : REGISTRY_MODE_GUARD
}

/** Throws on import; see tests/registry-mode-guard.ts. */
const REGISTRY_MODE_GUARD = join(import.meta.dirname, 'tests', 'registry-mode-guard.ts')

export default defineConfig({
  resolve: {
    // The harness sources aliased below resolve `react` from THEIR node_modules,
    // which is a second copy of the same version — and two React instances mean
    // a null dispatcher the moment a shared component calls a hook. In the real
    // browser the shell's frozen module table makes react one instance for every
    // plugin; deduping is how a spec reproduces that.
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^@deepseek-ai\/dsh-client-runtime\/client$/,
        replacement: harnessSource('@deepseek-ai/dsh-client-runtime', 'src/client/index.ts'),
      },
      {
        find: /^@deepseek-ai\/dsh-client-ui-primitives$/,
        replacement: harnessSource('@deepseek-ai/dsh-client-ui-primitives', 'src/index.ts'),
      },
      {
        find: /^@deepseek-ai\/dsh-client-ui-slots$/,
        replacement: harnessSource('@deepseek-ai/dsh-client-ui-slots', 'src/index.ts'),
      },
    ],
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // node by default; specs touching the browser halves opt in with a
    // per-file `// @vitest-environment jsdom` pragma (harness convention).
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/css-modules.d.ts'],
    },
  },
})
