import type { Principal, CookieAuthenticatorView } from '@deepseek-ai/dsh-multi-user'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Browser account state projected from the Host auth routes. */
export interface AuthSnapshot {
  readonly status: 'loading' | 'unauthenticated' | 'authenticated' | 'error'
  readonly principal?: Principal
  readonly hasAccounts: boolean
  readonly providers: readonly CookieAuthenticatorView[]
  readonly error?: string
}

interface SessionResponse {
  readonly authenticated: boolean
  readonly hasAccounts: boolean
  readonly principal?: Principal
}

interface ProviderResponse { readonly providers: readonly CookieAuthenticatorView[] }

interface ErrorResponse { readonly error?: { readonly message?: unknown } }

/** Owns the browser-side login state and the account route callbacks. */
export class AuthController {
  /** Stable observable source consumed by the Slot renderer's `useAuth` hook. */
  readonly source: HostObservable<AuthSnapshot> = {
    getSnapshot: (): AuthSnapshot => this.snapshot,
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  private snapshot: AuthSnapshot = { status: 'loading', hasAccounts: false, providers: [] }
  private readonly listeners = new Set<() => void>()

  /** Load the current product session and available third-party providers. */
  async refresh(): Promise<void> {
    this.set({ status: 'loading', hasAccounts: this.snapshot.hasAccounts, providers: this.snapshot.providers })
    try {
      const session = await this.request<SessionResponse>('/api/auth/session')
      const providers = await this.request<ProviderResponse>('/api/auth/providers')
      this.set({
        status: session.authenticated ? 'authenticated' : 'unauthenticated',
        hasAccounts: session.hasAccounts,
        providers: providers.providers,
        ...session.principal === undefined ? {} : { principal: session.principal },
      })
    } catch (error) {
      this.fail(error)
    }
  }

  /**
   * Sign in with a local account and password.
   * @param username - local account name.
   * @param password - local account password.
   */
  async password(username: string, password: string): Promise<void> {
    await this.mutate('/api/auth/password', { username, password })
  }

  /**
   * Create the first or an additional local account.
   * @param username - account name to create.
   * @param password - password to hash on the Host.
   * @param displayName - optional name shown in the account UI.
   */
  async register(username: string, password: string, displayName?: string): Promise<void> {
    await this.mutate('/api/auth/register', { username, password, ...displayName === undefined ? {} : { displayName } })
  }

  /**
   * Exchange a raw third-party Cookie through one selected provider.
   * @param providerId - registered third-party authenticator id.
   * @param cookie - raw Cookie header used for this exchange only.
   */
  async cookie(providerId: string, cookie: string): Promise<void> {
    await this.mutate('/api/auth/cookie', { providerId, cookie })
  }

  /** Revoke the current application session. */
  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' })
      this.set({ status: 'unauthenticated', hasAccounts: this.snapshot.hasAccounts, providers: this.snapshot.providers })
    } catch (error) {
      this.fail(error)
    }
  }

  private async mutate(path: string, payload: object): Promise<void> {
    this.set({ status: 'loading', hasAccounts: this.snapshot.hasAccounts, providers: this.snapshot.providers })
    try {
      const response = await this.request<SessionResponse>(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.authenticated || response.principal === undefined) throw new Error('authentication did not return a principal')
      this.set({ status: 'authenticated', hasAccounts: true, providers: this.snapshot.providers, principal: response.principal })
    } catch (error) {
      this.fail(error)
    }
  }

  private async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, credentials: 'same-origin' })
    let body: unknown
    try { body = await response.json() } catch { body = undefined }
    if (!response.ok) {
      const message = (body as ErrorResponse | undefined)?.error?.message
      throw new Error(typeof message === 'string' ? message : `request failed (${String(response.status)})`)
    }
    return body as T
  }

  private fail(error: unknown): void {
    this.set({ ...this.snapshot, status: 'error', error: error instanceof Error ? error.message : 'authentication failed' })
  }

  private set(snapshot: AuthSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}
