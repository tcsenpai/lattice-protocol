/**
 * Sample test to verify Vitest is working
 */

import { describe, it, expect } from 'vitest';

describe('Vitest setup', () => {
  it('should pass a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async tests', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });

  it('should support object matching', () => {
    const obj = { a: 1, b: { c: 2 } };
    expect(obj).toEqual({ a: 1, b: { c: 2 } });
  });
});
