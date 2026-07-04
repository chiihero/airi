import type { InferOutput } from 'valibot'

import { Buffer } from 'node:buffer'
import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { check, integer, minValue, nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

/**
 * Parses `ADDITIONAL_TRUSTED_ORIGINS`: comma-separated absolute origins used for
 * CORS (`/api/*`). Each segment is normalized via `URL.origin` so trailing
 * slashes are stripped.
 *
 * Before:
 * - `" https://10.0.0.129:5273/ , https://198.18.0.1:5273 "`
 *
 * After:
 * - `["https://10.0.0.129:5273", "https://198.18.0.1:5273"]`
 */
export function parseAdditionalTrustedOriginsEnv(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed)
    return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const part of trimmed.split(',')) {
    const entry = part.trim()
    if (!entry)
      continue

    let normalized: string
    try {
      normalized = new URL(entry).origin
    }
    catch {
      throw new TypeError(`ADDITIONAL_TRUSTED_ORIGINS: invalid URL origin segment "${entry}"`)
    }

    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }

  return out
}

function optionalIntegerFromString(defaultValue: number, envKey: string, minimum: number) {
  return optional(
    pipe(
      string(),
      nonEmpty(`${envKey} must not be empty`),
      transform(input => Number(input)),
      integer(`${envKey} must be an integer`),
      minValue(minimum, `${envKey} must be at least ${minimum}`),
    ),
    String(defaultValue),
  )
}

const EnvSchema = object({
  HOST: optional(string(), '0.0.0.0'),
  PORT: optionalIntegerFromString(3000, 'PORT', 1),

  API_SERVER_URL: optional(string(), 'http://localhost:3000'),

  // Canonical web app origin, kept for CORS / origin resolution fallbacks.
  WEB_APP_URL: optional(string(), 'http://localhost:5173'),

  // Comma-separated exact origins (e.g. Capacitor dev server `https://10.x:5273`).
  ADDITIONAL_TRUSTED_ORIGINS: optional(
    pipe(
      string(),
      transform(raw => parseAdditionalTrustedOriginsEnv(raw)),
    ),
    '',
  ),

  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),
  REDIS_URL: pipe(string(), nonEmpty('REDIS_URL is required')),

  // Static bearer token for the single personal user. This is the only auth
  // mechanism in the slimmed server — resolveRequestAuth compares the
  // Authorization header against this via timingSafeEqual and synthesizes a
  // virtual user/session, with no database session row and no OIDC/JWT path.
  // NOTICE: keep this secret. Anyone with this token fully impersonates the
  // single user.
  TEST_AUTH_TOKEN: pipe(string(), nonEmpty('TEST_AUTH_TOKEN is required (the single static bearer token)')),
  TEST_AUTH_USER_ID: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_ID must not be empty when set')), 'test-user'),
  TEST_AUTH_USER_EMAIL: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_EMAIL must not be empty when set')), 'test@example.com'),
  TEST_AUTH_USER_NAME: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_NAME must not be empty when set')), 'Test User'),
  TEST_AUTH_USER_ROLE: optional(string(), ''),

  // Envelope-encryption master key for in-process LLM/TTS router config.
  // Stored as base64-encoded 32 random bytes. The personal slim build does not
  // run the LLM router, but the key stays required so env parsing stays
  // consistent if the router is re-enabled later.
  LLM_ROUTER_MASTER_KEY: pipe(
    string(),
    nonEmpty('LLM_ROUTER_MASTER_KEY is required'),
    transform(b64 => Buffer.from(b64, 'base64')),
    check(buf => buf.length === 32, 'LLM_ROUTER_MASTER_KEY must decode to exactly 32 bytes (base64-encoded 32-byte random)'),
  ),
  LLM_ROUTER_MASTER_KEY_PREVIOUS: optional(pipe(
    string(),
    nonEmpty('LLM_ROUTER_MASTER_KEY_PREVIOUS must not be empty when set'),
    transform(b64 => Buffer.from(b64, 'base64')),
    check(buf => buf.length === 32, 'LLM_ROUTER_MASTER_KEY_PREVIOUS must decode to exactly 32 bytes when set'),
  )),

  // Database pool
  DB_POOL_MAX: optionalIntegerFromString(20, 'DB_POOL_MAX', 1),
  DB_POOL_IDLE_TIMEOUT_MS: optionalIntegerFromString(30000, 'DB_POOL_IDLE_TIMEOUT_MS', 1),
  DB_POOL_CONNECTION_TIMEOUT_MS: optionalIntegerFromString(5000, 'DB_POOL_CONNECTION_TIMEOUT_MS', 1),
  DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: optionalIntegerFromString(10000, 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS', 1),
})

export type Env = InferOutput<typeof EnvSchema>

export function parseEnv(inputEnv: Record<string, string> | typeof env): Env {
  try {
    return parse(EnvSchema, inputEnv)
  }
  catch (err) {
    useLogger().withError(err).error('Invalid environment variables')
    exit(1)
  }
}

export const parsedEnv = injeca.provide('env', () => parseEnv(env))
