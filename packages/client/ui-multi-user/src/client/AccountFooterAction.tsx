import type { ReactNode } from 'react'
import { useState } from 'react'
import { IconUserOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, PropsLocale, PropsRuntime, PropsSlotHooks } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { AuthController, AuthSnapshot } from './controller.ts'
import css from './AccountFooterAction.module.css'

/** Component-side injected face for the account footer entry. */
export interface AccountFooterActionInjected {
  /** Browser controller that owns the application session. */
  readonly controller: AuthController
  /** Auth state source bound to the renderer's useAuth selector hook. */
  readonly hooks: { readonly auth: HostObservable<AuthSnapshot> }
}

/** Props supplied by the sidebar footer slot and the multi-user plugin. */
export type AccountFooterActionProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'multiUser'>
  & PropsSlotHooks<{ auth: HostObservable<AuthSnapshot> }>
  & Pick<AccountFooterActionInjected, 'controller'>

function initialOf(displayName: string): string {
  return Array.from(displayName.trim())[0] ?? '?'
}

/** Render the current account identity and its application-session logout action. */
export function AccountFooterAction({ wide, controller, useAuth, t }: AccountFooterActionProps): ReactNode {
  const state = useAuth(snapshot => snapshot)
  const [loggingOut, setLoggingOut] = useState(false)
  if (state.status !== 'authenticated' || state.principal === undefined) return null

  const account = state.principal.account
  const displayName = account.displayName.trim() || account.username
  const avatarText = initialOf(displayName)
  const logout = async (): Promise<void> => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await controller.logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className={css.root} data-testid="multi-user-account">
      <div className={css.identity} title={displayName}>
        <span className={css.avatar} aria-hidden="true">
          {avatarText === '?' ? <IconUserOutline16 size={16} /> : avatarText}
        </span>
        {wide && (
          <span className={css.details}>
            <span className={css.displayName}>{displayName}</span>
            <span className={css.username}>@{account.username}</span>
          </span>
        )}
      </div>
      <Tooltip label={t('logout')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={css.logout}
          aria-label={t('logout')}
          disabled={loggingOut}
          onClick={() => { void logout() }}
        >
          {wide ? (loggingOut ? t('loggingOut') : t('logout')) : <span aria-hidden="true">↪</span>}
        </button>
      </Tooltip>
    </div>
  )
}
