import { describe, expect, it } from 'vitest';
import { estimateCostUsd, estimateTokens } from './pricing.js';

describe('pricing', () => {
  it('estimates tokens from chars', () => {
    expect(estimateTokens('12345678')).toBe(2);
  });
  it('estimates known model cost', () => {
    expect(estimateCostUsd('openai', 'gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75);
  });
});
