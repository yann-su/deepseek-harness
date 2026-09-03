/** Host half of the browser account UI plugin; routes are supplied separately. */
export const name = 'ui-multi-user'

/**
 * The host half has no state of its own. The API controller owns the account
 * routes, while this entry only gives the Web loader a valid dual-face plugin.
 */
export function apply(): void {}
