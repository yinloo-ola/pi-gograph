/** Marker for unfilled stubs. ptk-execute finds these via grep and fills them.
 *  Removed by ptk-finalize once the frontier is empty. */
export function stub(path: string): never {
  throw new Error(`[ptk-stub] ${path}`);
}