/**
 * Exact Fetch routes for the Web account session. The transport's process
 * authentication remains owned by Connection; this plugin adds the product
 * account cookie and delegates account policy to `ctx.multiUser`.
 * @module @deepseek-ai/dsh-api-multi-user-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import {
  cookieAuthenticatorId,
  MultiUserError,
  type AuthenticationResult,
} from '@deepseek-ai/dsh-multi-user'
import { z } from 'zod'

/** Stable application-session cookie name; third-party Cookies never use it. */
const ACCOUNT_COOKIE = 'dsh-account-session'
const COOKIE_PATH = '/'
const MAX_COOKIE_HEADER_BYTES = 64 * 1024

const passwordInput = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1_024),
}).strict()

const registrationInput = passwordInput.extend({
  displayName: z.string().trim().min(1).max(128).optional(),
}).strict()

const cookieInput = z.object({
  providerId: z.string().trim().regex(/^[a-z][a-z0-9-]*$/).max(128),
  cookie: z.string().min(1).max(MAX_COOKIE_HEADER_BYTES),
}).strict()

/** Services required by the Web account route consumer. */
export const inject = ['connection', 'multiUser']

/** Stable plugin name used by Cordis Loader diagnostics. */
export const name = 'multi-user-controller'

/** Mount account-session routes on the Connection exact Fetch registry. */
export function apply(ctx: Context): void {
  const register = (path: string, methods: ConnectionFetchRoute['methods'], fetch: ConnectionFetchRoute['fetch']) =>
    ctx.connection.fetch.register({
      path,
      methods,
      fetch: async (request) => {
        try {
          return await fetch(request)
        } catch (error) {
          return routeError(error)
        }
      },
    })

  ctx.effect(() => {
    const disposers = [
      register('/api/auth/session', ['GET'], request => sessionRoute(ctx, request)),
      register('/api/auth/providers', ['GET'], () => Promise.resolve(providersRoute(ctx))),
      register('/api/auth/register', ['POST'], request => registerRoute(ctx, request)),
      register('/api/auth/password', ['POST'], request => passwordRoute(ctx, request)),
      register('/api/auth/cookie', ['POST'], request => cookieRoute(ctx, request)),
      register('/api/auth/logout', ['POST'], request => logoutRoute(ctx, request)),
    ]
    return () => { for (const dispose of disposers.reverse()) void dispose() }
  }, 'multi-user-controller: auth routes')
}

async function sessionRoute(ctx: Context, request: Request): Promise<Response> {
  const token = accountCookie(request)
  const principal = token === undefined ? undefined : await ctx.multiUser.resolveSession(token)
  const hasAccounts = await ctx.multiUser.hasAccounts()
  if (principal === undefined) {
    return json({ authenticated: false, hasAccounts }, token === undefined ? undefined : clearCookie())
  }
  return json({ authenticated: true, hasAccounts, principal })
}

function providersRoute(ctx: Context): Response {
  return json({ providers: ctx.multiUser.listCookieAuthenticators() })
}

async function registerRoute(ctx: Context, request: Request): Promise<Response> {
  const input = await jsonBody(request, registrationInput)
  const account = await ctx.multiUser.createPasswordAccount(
    input.displayName === undefined
      ? { username: input.username, password: input.password }
      : { username: input.username, password: input.password, displayName: input.displayName },
  )
  const result = await ctx.multiUser.loginWithPassword({
    username: input.username,
    password: input.password,
  })
  return json({ account, ...authenticatedView(result) }, setCookie(result))
}

async function passwordRoute(ctx: Context, request: Request): Promise<Response> {
  const input = await jsonBody(request, passwordInput)
  const result = await ctx.multiUser.loginWithPassword(input)
  return json(authenticatedView(result), setCookie(result))
}

async function cookieRoute(ctx: Context, request: Request): Promise<Response> {
  const input = await jsonBody(request, cookieInput)
  const result = await ctx.multiUser.loginWithCookie({
    providerId: cookieAuthenticatorId(input.providerId),
    cookie: input.cookie,
    signal: request.signal,
  })
  return json(authenticatedView(result), setCookie(result))
}

async function logoutRoute(ctx: Context, request: Request): Promise<Response> {
  const token = accountCookie(request)
  if (token !== undefined) {
    const principal = await ctx.multiUser.resolveSession(token)
    if (principal !== undefined) await ctx.multiUser.revokeSession(principal.sessionId)
  }
  return json({ authenticated: false }, clearCookie())
}

function authenticatedView(result: AuthenticationResult): object {
  return { authenticated: true, principal: result.principal, session: result.session }
}

function accountCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (header === null || header.length > MAX_COOKIE_HEADER_BYTES) return undefined
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue
    if (pair.slice(0, separator).trim() !== ACCOUNT_COOKIE) continue
    const value = pair.slice(separator + 1).trim()
    return value === '' ? undefined : value
  }
  return undefined
}

function setCookie(result: AuthenticationResult): ResponseInit {
  const maxAge = Math.max(1, Math.ceil((result.session.expiresAt - Date.now()) / 1_000))
  return { headers: { 'set-cookie': `${ACCOUNT_COOKIE}=${result.token}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${String(maxAge)}` } }
}

function clearCookie(): ResponseInit {
  return { headers: { 'set-cookie': `${ACCOUNT_COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=0` } }
}

async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new MultiUserError('BAD_REQUEST', 'request content type must be application/json')
  }
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    throw new MultiUserError('BAD_REQUEST', 'request body is not valid JSON', { cause: error })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new MultiUserError('BAD_REQUEST', 'request body has invalid fields')
  return parsed.data
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

/**
 * Keep route failures JSON and avoid returning passwords, raw Cookies, or
 * provider exception details to the browser.
 */
function routeError(error: unknown): Response {
  if (error instanceof MultiUserError) {
    const status = error.code === 'INVALID_CREDENTIALS' || error.code === 'COOKIE_AUTHENTICATOR_FAILED'
      ? 401
      : error.code === 'BAD_REQUEST' || error.code === 'INVALID_USERNAME' || error.code === 'PASSWORD_TOO_SHORT'
        || error.code === 'ACCOUNT_EXISTS' || error.code === 'COOKIE_REQUIRED' || error.code === 'COOKIE_AUTHENTICATOR_NOT_FOUND'
        ? 400
        : 500
    return json({ error: { code: error.code, message: error.message } }, { status })
  }
  return json({ error: { code: 'INTERNAL_ERROR', message: 'authentication service failed' } }, { status: 500 })
}
