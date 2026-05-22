import { describe, expect, it } from 'vitest';
import { redactText } from './redact.js';

describe('redactText', () => {
  it('redacts env secrets and bearer tokens', () => {
    const text = 'API_KEY=abcdef1234567890 Bearer abcdefghijklmnopqrstuvwxyz1234567890';
    expect(redactText(text)).toContain('[REDACTED_SECRET]');
    expect(redactText(text)).toContain('[REDACTED_TOKEN]');
  });
});
