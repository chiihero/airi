// Retained providers for the personal slim build:
// - openai / openai-compatible: standard OpenAI-protocol gateways (works with
//   any compatible endpoint, including local proxies).
// - deepseek: DeepSeek official API (OpenAI-compatible baseURL override).
// - ollama / lm-studio: fully local, on-device model runtimes.
// All cloud-vendor providers (anthropic/google/azure/openrouter/xai/...) were
// removed to reduce dependencies; add one back by re-creating its directory and
// importing it here.
import './openai'
import './openai-compatible'
import './deepseek'
import './ollama'
import './lm-studio'
import './official'

export {
  getDefaultStreamingModel,
  getStreamingTtsAvailable,
  OFFICIAL_TRANSCRIPTION_PROVIDER_ID,
} from './official'

export {
  getDefinedProvider,
  listProviders,
} from './registry'
