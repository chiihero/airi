// NOTICE: social sign-in provider ids are retained for the SignInPanel UI
// surface even though the slim server authenticates via a static bearer token.
// The panel primarily collects a token now; these definitions stay so the
// component type surface remains stable.
export type OAuthProvider = 'google' | 'github'

export interface SignInProviderDefinition {
  id: OAuthProvider
  name: string
  icon: string
}

export const defaultSignInProviders = [
  {
    id: 'google',
    name: 'Google',
    icon: 'i-simple-icons-google',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'i-simple-icons-github',
  },
] satisfies SignInProviderDefinition[]
