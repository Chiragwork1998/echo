// Jest's toEqual compares typed arrays one element at a time, which takes seconds for megabytes.
// Never imported by app code.

export function expectBytes(actual: Uint8Array | null | undefined, expected: Uint8Array): void {
  expect(actual).toBeDefined();
  expect(actual?.length).toBe(expected.length);
  expect(Buffer.compare(actual ?? new Uint8Array(0), expected)).toBe(0);
}
