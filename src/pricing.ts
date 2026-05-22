export type Pricing = { inputPerMTok: number; outputPerMTok: number };

const table: Record<string, Pricing> = {
  'openai:gpt-5.5': { inputPerMTok: 1.25, outputPerMTok: 10 },
  'openai:gpt-5': { inputPerMTok: 1.25, outputPerMTok: 10 },
  'openai:gpt-4.1': { inputPerMTok: 2, outputPerMTok: 8 },
  'openai:gpt-4.1-mini': { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  'openai:gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
  'openai:gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
};

export function estimateCostUsd(provider = 'openai', model = '', inputTokens = 0, outputTokens = 0): number {
  const pricing = table[`${provider}:${model}`] || table[`openai:${model}`];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
