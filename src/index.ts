// Default exports (OpenAI-compatible API)
export { createMinimax, minimax, minimaxOpenAI } from './minimax-openai-provider';
export type { MinimaxProvider, MinimaxProviderSettings } from './minimax-openai-provider';

// Backwards compatibility aliases
export { createMinimax as createMinimaxOpenAI } from './minimax-openai-provider';
export type { MinimaxProvider as MinimaxOpenAIProvider, MinimaxProviderSettings as MinimaxOpenAIProviderSettings } from './minimax-openai-provider';

// Common exports
export type { MinimaxErrorData } from './minimax-chat-options';
