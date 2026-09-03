// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Principal } from '@deepseek-ai/dsh-multi-user'
import type {} from '../src/client/index.ts'
import type { AccountFooterActionProps } from '../src/client/AccountFooterAction.tsx'
import { AccountFooterAction } from '../src/client/AccountFooterAction.tsx'
import { AuthController, type AuthSnapshot } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const principal: Principal = {
  accountId: 'account-1' as Principal['accountId'],
  userId: 'user-1' as Principal['userId'],
  sessionId: 'session-1' as Principal['sessionId'],
  account: {
    id: 'account-1' as Principal['accountId'],
    userId: 'user-1' as Principal['userId'],
    username: 'alice',
    displayName: 'Alice',
    createdAt: 0,
  },
  method: 'password',
}

function props(snapshot: AuthSnapshot, controller: AuthController, wide = true): AccountFooterActionProps {
  return {
    wide,
    controller,
    useAuth: <S,>(selector: (value: AuthSnapshot) => S): S => selector(snapshot),
    t: ((key: string) => zh[key as keyof typeof zh] ?? key) as AccountFooterActionProps['t'],
  } as AccountFooterActionProps
}

describe('AccountFooterAction', () => {
  it('shows the avatar, display name, and username for the current account', () => {
    const controller = new AuthController()
    const view = render(<AccountFooterAction {...props({
      status: 'authenticated',
      hasAccounts: true,
      providers: [],
      principal,
    }, controller)} />)

    expect(view.getByTestId('multi-user-account').textContent).toContain('A')
    expect(view.getByText('Alice')).toBeTruthy()
    expect(view.getByText('@alice')).toBeTruthy()
    expect(view.getByRole('button', { name: '退出登录' })).toBeTruthy()
  })

  it('calls the controller logout action and renders only the avatar in the rail', async () => {
    const controller = new AuthController()
    const logout = vi.spyOn(controller, 'logout').mockResolvedValue()
    const view = render(<AccountFooterAction {...props({
      status: 'authenticated',
      hasAccounts: true,
      providers: [],
      principal,
    }, controller, false)} />)

    expect(view.queryByText('Alice')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '退出登录' }))
    await waitFor(() => { expect(logout).toHaveBeenCalledOnce() })
  })

  it('does not render when no account session is authenticated', () => {
    const controller = new AuthController()
    const view = render(<AccountFooterAction {...props({
      status: 'unauthenticated',
      hasAccounts: false,
      providers: [],
    }, controller)} />)

    expect(view.container.textContent).toBe('')
  })
})
