declare module "node:test" {
  type TestFunction = () => void | Promise<void>;
  export default function test(name: string, fn: TestFunction): void;
}

declare module "node:assert/strict" {
  interface AssertStrict {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    match(value: string, regexp: RegExp, message?: string): void;
    rejects(
      promise: Promise<unknown>,
      expected?: RegExp | ((error: unknown) => boolean),
      message?: string
    ): Promise<void>;
  }

  const assert: AssertStrict;
  export default assert;
}

