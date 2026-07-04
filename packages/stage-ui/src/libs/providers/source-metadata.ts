export type ProviderSourcePricing = 'free' | 'paid'
export type ProviderSourceDeployment = 'local' | 'cloud'

/**
 * Represents source catalogue tags used by provider filtering UI.
 */
export interface ProviderSourceMetadata {
  /** Price bucket shown by the provider source filter. */
  pricing?: ProviderSourcePricing
  /** Runtime/deployment bucket shown by the provider source filter. */
  deployment?: ProviderSourceDeployment
  /** Whether the provider should receive the existing recommended tag. */
  beginnerRecommended?: boolean
}

export interface ProviderSourceMetadataInput {
  id?: string
}

const paidCloud = {
  pricing: 'paid',
  deployment: 'cloud',
} satisfies ProviderSourceMetadata

const freeLocal = {
  pricing: 'free',
  deployment: 'local',
} satisfies ProviderSourceMetadata

const recommendedPaidCloud = {
  ...paidCloud,
  beginnerRecommended: true,
} satisfies ProviderSourceMetadata

const providerSourceMetadataById = {
  // Retained LLM providers
  'deepseek': paidCloud,
  'lm-studio': freeLocal,
  'ollama': freeLocal,
  'openai': paidCloud,
  'openai-compatible': false,

  // Retained local audio / speech / transcription providers
  'app-local-audio-speech': freeLocal,
  'app-local-audio-transcription': freeLocal,
  'browser-local-audio-speech': freeLocal,
  'browser-local-audio-transcription': freeLocal,
  'browser-web-speech-api': freeLocal,
  'chattts': freeLocal,
  'funasr': freeLocal,
  'index-tts-vllm': freeLocal,
  'kokoro-local': freeLocal,
  'openai-compatible-audio-speech': false,
  'openai-compatible-audio-transcription': false,
  'player2-speech': freeLocal,
  'speech-noop': false,

  // Official gateway passthrough (kept for the server-hosted default models)
  'official-provider': recommendedPaidCloud,
  'official-provider-speech': recommendedPaidCloud,
  'official-provider-speech-streaming': recommendedPaidCloud,
} satisfies Record<string, ProviderSourceMetadata | false>

/**
 * Normalizes provider source metadata by dropping undefined fields.
 *
 * Before:
 * - `{ pricing: "paid", deployment: undefined }`
 *
 * After:
 * - `{ pricing: "paid" }`
 */
function compactProviderSourceMetadata(metadata: ProviderSourceMetadata): ProviderSourceMetadata {
  return {
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.deployment ? { deployment: metadata.deployment } : {}),
    ...(metadata.beginnerRecommended !== undefined ? { beginnerRecommended: metadata.beginnerRecommended } : {}),
  }
}

/**
 * Resolves the provider source tags used by settings/provider filtering.
 *
 * Use when:
 * - Rendering provider source cards.
 * - Converting defineProvider() catalogue entries to legacy ProviderMetadata.
 *
 * Expects:
 * - `metadata.id` may identify a provider with catalogue metadata.
 *
 * Returns:
 * - Compact metadata with only meaningful tag fields.
 */
export function resolveProviderSourceMetadata(
  metadata: ProviderSourceMetadataInput = {},
): ProviderSourceMetadata {
  if (!metadata.id)
    return {}

  const sourceMetadata = providerSourceMetadataById[metadata.id as keyof typeof providerSourceMetadataById]
  if (sourceMetadata === false)
    return {}
  if (sourceMetadata)
    return compactProviderSourceMetadata(sourceMetadata)

  return {}
}
