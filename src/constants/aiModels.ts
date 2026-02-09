/**
 * AI Models Configuration for Frontend
 * 
 * Available models for dynamic model selection in UI components.
 * These match the backend dynamicModel.utils.ts configuration.
 */

export type ModelProvider = 'openai' | 'anthropic' | 'google_genai' | 'groq' | 'deepseek';

export interface AIModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  providerLabel: string;
  description?: string;
}

/**
 * Available AI models for content improvement
 * Must match MODEL_ALLOWLIST in dynamicModel.utils.ts
 */
export const AI_MODELS: AIModelOption[] = [
  // OpenAI Models
  {
    id: 'openai:gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    providerLabel: 'OpenAI',
    description: 'Flagship model for coding & agents',
  },
  {
    id: 'openai:gpt-5.1',
    name: 'GPT-5.1',
    provider: 'openai',
    providerLabel: 'OpenAI',
    description: 'Advanced reasoning model',
  },

  // Anthropic Models
  {
    id: 'anthropic:claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    description: 'Smartest Claude model',
  },
  {
    id: 'anthropic:claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    description: 'Most capable for complex tasks',
  },
  {
    id: 'anthropic:claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    description: 'Fastest Claude model',
  },

  // Google Models
  {
    id: 'google_genai:gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google_genai',
    providerLabel: 'Google',
    description: 'Most powerful Gemini',
  },
  {
    id: 'google_genai:gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'google_genai',
    providerLabel: 'Google',
    description: 'Best price-performance',
  },
  {
    id: 'google_genai:gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google_genai',
    providerLabel: 'Google',
    description: 'Advanced reasoning (Default)',
  },

  // Groq Models
  {
    id: 'groq:llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    providerLabel: 'Groq',
    description: 'Ultra-fast inference',
  },
  {
    id: 'groq:llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    provider: 'groq',
    providerLabel: 'Groq',
    description: 'Fastest model',
  },
];

/**
 * Default model ID for content improvement
 */
export const DEFAULT_AI_MODEL_ID = 'openai:gpt-5.2';

/**
 * Get model by ID
 */
export function getModelById(modelId: string): AIModelOption | undefined {
  return AI_MODELS.find(m => m.id === modelId);
}

/**
 * Get display name with provider
 */
export function getModelDisplayName(modelId: string): string {
  const model = getModelById(modelId);
  if (!model) return modelId;
  return `${model.name} (${model.providerLabel})`;
}
