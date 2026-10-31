/* Test-only ambient shims for node builtins.
 *
 * tsconfig.app.json intentionally bundles only vite/client types, and this
 * file must not add dependencies. Vitest executes on node, where these
 * modules and process.cwd() exist at runtime — the declarations below only
 * satisfy the typechecker for test files that read fixture sources.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
declare module 'node:path' {
  export function join(...parts: string[]): string
}
declare const process: {
  cwd(): string
}
