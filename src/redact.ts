const patterns: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]'],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, '$1[REDACTED_TOKEN]'],
  [/\b(sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_OPENAI_KEY]'],
  [/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*)[^\s]+/gi, '$1[REDACTED_SECRET]'],
  [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_HIGH_ENTROPY]'],
];

export function redactText(input: string): string {
  return patterns.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), input);
}

export function hasSecretLikeText(input: string): boolean {
  return patterns.some(([pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}
