import { describe, expect, it } from 'vitest'

import { getTrustedOrigin, resolveTrustedRequestOrigin } from '../origin'

describe('origin utils', () => {
  it('allows localhost origins', () => {
    expect(getTrustedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('allows https localhost (mkcert dev)', () => {
    expect(getTrustedOrigin('https://localhost:5273')).toBe('https://localhost:5273')
    expect(getTrustedOrigin('https://127.0.0.1:5273')).toBe('https://127.0.0.1:5273')
  })

  it('allows native deep-link schemes', () => {
    expect(getTrustedOrigin('capacitor://localhost')).toBe('capacitor://localhost')
    expect(getTrustedOrigin('ai.moeru.airi-pocket://links')).toBe('ai.moeru.airi-pocket://links')
  })

  it('rejects private LAN Vite dev origins unless listed in ADDITIONAL_TRUSTED_ORIGINS', () => {
    expect(getTrustedOrigin('https://10.0.0.129:5273')).toBe('')
    expect(getTrustedOrigin('https://198.18.0.1:5273')).toBe('')
    expect(getTrustedOrigin('https://192.168.1.5:5273')).toBe('')

    const extra = ['https://10.0.0.129:5273', 'https://198.18.0.1:5273', 'https://192.168.1.5:5273']
    expect(getTrustedOrigin('https://10.0.0.129:5273', extra)).toBe('https://10.0.0.129:5273')
    expect(getTrustedOrigin('https://198.18.0.1:5273', extra)).toBe('https://198.18.0.1:5273')
    expect(getTrustedOrigin('https://192.168.1.5:5273', extra)).toBe('https://192.168.1.5:5273')
  })

  it('rejects untrusted origins', () => {
    expect(getTrustedOrigin('https://example.com')).toBe('')
  })

  it('prefers a trusted referer origin', () => {
    const request = new Request('http://localhost/api/v1/chats', {
      headers: {
        referer: 'http://localhost:5173/settings',
        origin: 'https://example.com',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('http://localhost:5173')
  })

  it('falls back to a trusted origin header when referer is missing', () => {
    const request = new Request('http://localhost/api/v1/chats', {
      headers: {
        origin: 'http://localhost:5173',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('http://localhost:5173')
  })

  it('returns undefined when neither referer nor origin is trusted', () => {
    const request = new Request('http://localhost/api/v1/chats', {
      headers: { origin: 'https://evil.example.com' },
    })

    expect(resolveTrustedRequestOrigin(request, [])).toBeUndefined()
  })
})
