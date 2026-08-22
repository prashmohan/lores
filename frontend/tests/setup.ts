/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import '@testing-library/jest-dom';
import * as matchers from 'vitest-axe/matchers';
import type { AxeMatchers } from 'vitest-axe';
import { expect } from 'vitest';

declare module 'vitest' {
  export interface Assertion<T = any> extends AxeMatchers {}
  export interface AsymmetricMatchersContaining extends AxeMatchers {}
}

expect.extend(matchers);
