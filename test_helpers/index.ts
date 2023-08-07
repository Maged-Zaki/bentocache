/*
 * @adonisjs/cache
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { setTimeout } from 'node:timers/promises'

export const BASE_URL = new URL('./tmp/', import.meta.url)

export const REDIS_CREDENTIALS = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
}

/**
 * Returns a factory that will throw an error when invoked
 */
export function throwingFactory(errorMsg = 'error') {
  return () => {
    throw new Error(errorMsg)
  }
}

/**
 * Returns a factory that will take some time to return the given value
 */
export function waitAndReturnFactory(ms: number, value: any) {
  return async () => {
    await setTimeout(ms)
    return value
  }
}
