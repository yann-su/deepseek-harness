import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsSlotHooks, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, OnboardingSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuthController, AuthSnapshot } from './controller.ts'
import css from './LoginGate.module.css'

/** Component-side injected face; the renderer turns `hooks.auth` into `useAuth`. */
export interface LoginGateInjected {
  readonly controller: AuthController
  readonly hooks: { readonly auth: HostObservable<AuthSnapshot> }
}

type LoginGateProps = PropsRuntime<'shell.overlay'> & PropsLocale<'multiUser'> & PropsSlotHooks<{ auth: HostObservable<AuthSnapshot> }> & {
  readonly controller: AuthController
}

/** Full-page account gate mounted above the shell until an app session exists. */
export function LoginGate({ controller, useAuth, t }: LoginGateProps) {
  const state = useAuth(snapshot => snapshot)
  const [mode, setMode] = useState<'password' | 'cookie'>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [cookie, setCookie] = useState('')
  const [providerId, setProviderId] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const first = state.providers[0]
    if (first !== undefined && providerId === '') setProviderId(String(first.id))
  }, [providerId, state.providers])

  if (state.status === 'authenticated') return null

  const firstAccount = !state.hasAccounts
  const busy = submitted || state.status === 'loading'
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    try {
      if (mode === 'password') {
        if (username.trim() === '' || password === '') return
        if (firstAccount) await controller.register(username, password, displayName.trim() || undefined)
        else await controller.password(username, password)
      } else {
        if (providerId === '' || cookie.trim() === '') return
        await controller.cookie(providerId, cookie)
      }
    } finally {
      setSubmitted(false)
    }
  }

  return (
    <OnboardingSurface>
      <main className={css.card} aria-labelledby="dsh-login-title">
        <div className={css.brand}>{t('brand')}</div>
        <h1 id="dsh-login-title" className={css.title}>{t('title')}</h1>
        <p className={css.subtitle}>{t('subtitle')}</p>
        {state.status === 'loading' && <p className={css.status}>{t('loading')}</p>}
        {state.status === 'error' && (
          <div className={css.error} role="alert">
            <span>{state.error}</span>
            <Button size="sm" variant="outline" onClick={() => { void controller.refresh() }}>{t('retry')}</Button>
          </div>
        )}
        <div className={css.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? css.tabActive : css.tab} onClick={() => { setMode('password') }}>{t('usePassword')}</button>
          <button type="button" role="tab" aria-selected={mode === 'cookie'} className={mode === 'cookie' ? css.tabActive : css.tab} onClick={() => { setMode('cookie') }}>{t('useCookie')}</button>
        </div>
        <form className={css.form} onSubmit={(event) => { void submit(event) }}>
          {mode === 'password' ? (
            <>
              <label className={css.label}>{t('username')}<Input required value={username} placeholder={t('usernamePlaceholder')} onChange={(event) => { setUsername(event.currentTarget.value) }} /></label>
              <label className={css.label}>{t('password')}<Input required type="password" value={password} placeholder={t('passwordPlaceholder')} onChange={(event) => { setPassword(event.currentTarget.value) }} /></label>
              {firstAccount && <label className={css.label}>{t('displayName')}<Input value={displayName} placeholder={t('displayNamePlaceholder')} onChange={(event) => { setDisplayName(event.currentTarget.value) }} /></label>}
              <Button variant="primary" type="submit" disabled={busy}>{busy ? (firstAccount ? t('signingUp') : t('signingIn')) : (firstAccount ? t('createFirst') : t('signIn'))}</Button>
            </>
          ) : (
            <>
              {state.providers.length > 0 ? <label className={css.label}>{t('provider')}<select value={providerId} onChange={(event) => { setProviderId(event.currentTarget.value) }}>{state.providers.map(provider => <option key={String(provider.id)} value={String(provider.id)}>{provider.label}</option>)}</select></label> : <p className={css.status}>{t('noProviders')}</p>}
              <label className={css.label}>{t('cookie')}<textarea required value={cookie} placeholder={t('cookiePlaceholder')} onChange={(event) => { setCookie(event.currentTarget.value) }} /></label>
              <p className={css.hint}>{t('cookieHint')}</p>
              <Button variant="primary" type="submit" disabled={busy || providerId === ''}>{busy ? t('signingIn') : t('signIn')}</Button>
            </>
          )}
        </form>
      </main>
    </OnboardingSurface>
  )
}
