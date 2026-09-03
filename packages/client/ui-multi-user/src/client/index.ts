/** Browser login gate: account session state plus password/Cookie forms. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { AccountFooterAction, type AccountFooterActionInjected } from './AccountFooterAction.tsx'
import { LoginGate, type LoginGateInjected } from './LoginGate.tsx'
import { AuthController } from './controller.ts'
import { en, zh, type MultiUserKey } from './locales.ts'

export type { AuthSnapshot } from './controller.ts'
export type { MultiUserKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { multiUser: MultiUserKey }
}

const NS = 'multiUser'

/** Services required by the account gate. */
export const inject = ['slots', 'locale']

/** Mount account dictionaries and the full-page login entry. */
export function apply(ctx: ClientContext): void {
  const controller = new AuthController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-user: dictionaries')
  void controller.refresh()
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'multi-user-auth',
    order: -100,
    locale: NS,
    inject: (): LoginGateInjected => ({ controller, hooks: { auth: controller.source } }),
  }, LoginGate))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'multi-user-account',
    order: -100,
    locale: NS,
    inject: (): AccountFooterActionInjected => ({ controller, hooks: { auth: controller.source } }),
  }, AccountFooterAction))
}
