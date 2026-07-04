import { getAuthToken } from './auth'

/**
 * Fetch wrapper that injects the static bearer token into the Authorization
 * header.
 *
 * In the slim build the token does not expire and is not refreshable, so there
 * is no 401-retry path: a 401 means the persisted token does not match the
 * server's `TEST_AUTH_TOKEN`, which the caller surfaces as a re-login prompt
 * (token re-entry) rather than an automatic refresh.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getAuthToken()
  if (token)
    headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers, credentials: 'omit' })
}
