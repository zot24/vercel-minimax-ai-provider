import { ProviderV3, LanguageModelV3 } from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

type MinimaxChatModelId = 'MiniMax-M2' | 'MiniMax-M2-Stable' | (string & {});
declare const minimaxErrorDataSchema: z.ZodObject<{
    error: z.ZodObject<{
        message: z.ZodString;
        type: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        param: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
        code: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
type MinimaxErrorData = z.infer<typeof minimaxErrorDataSchema>;

interface MinimaxAnthropicProviderSettings {
    apiKey?: string;
    baseURL?: string;
    headers?: Record<string, string>;
    fetch?: FetchFunction;
}
interface MinimaxAnthropicProvider extends ProviderV3 {
    (modelId: MinimaxChatModelId): LanguageModelV3;
    languageModel(modelId: MinimaxChatModelId): LanguageModelV3;
    chat(modelId: MinimaxChatModelId): LanguageModelV3;
}
declare function createMinimaxAnthropic(options?: MinimaxAnthropicProviderSettings): MinimaxAnthropicProvider;
declare const minimaxAnthropic: MinimaxAnthropicProvider;

interface MinimaxProviderSettings {
    apiKey?: string;
    baseURL?: string;
    headers?: Record<string, string>;
    fetch?: FetchFunction;
}
interface MinimaxProvider extends ProviderV3 {
    (modelId: MinimaxChatModelId): LanguageModelV3;
    languageModel(modelId: MinimaxChatModelId): LanguageModelV3;
    chat(modelId: MinimaxChatModelId): LanguageModelV3;
}
declare function createMinimax(options?: MinimaxProviderSettings): MinimaxProvider;
declare const minimaxOpenAI: MinimaxProvider;

export { type MinimaxAnthropicProvider, type MinimaxAnthropicProviderSettings, type MinimaxErrorData, type MinimaxProvider as MinimaxOpenAIProvider, type MinimaxProviderSettings as MinimaxOpenAIProviderSettings, type MinimaxAnthropicProvider as MinimaxProvider, type MinimaxAnthropicProviderSettings as MinimaxProviderSettings, createMinimaxAnthropic as createMinimax, createMinimax as createMinimaxOpenAI, minimaxAnthropic as minimax, minimaxAnthropic, minimaxOpenAI };
