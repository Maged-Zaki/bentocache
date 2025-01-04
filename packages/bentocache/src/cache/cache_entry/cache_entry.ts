import type { CacheSerializer } from '../../types/main.js'

/**
 * Represents a cache entry stored inside a cache driver.
 */
export class CacheEntry {
  /**
   * The key of the cache item.
   */
  #key: string

  /**
   * The value of the item.
   */
  #value: any

  /**
   * The logical expiration is the time in miliseconds when the item
   * will be considered expired. But, if grace period is enabled,
   * the item will still be available for a while.
   */
  #logicalExpiration: number

  #earlyExpiration: number
  #serializer: CacheSerializer

  constructor(key: string, item: Record<string, any>, serializer: CacheSerializer) {
    this.#key = key
    this.#value = item.value
    this.#logicalExpiration = item.logicalExpiration
    this.#earlyExpiration = item.earlyExpiration
    this.#serializer = serializer
  }

  getValue() {
    return this.#value
  }

  getKey() {
    return this.#key
  }

  getLogicalExpiration() {
    return this.#logicalExpiration
  }

  getEarlyExpiration() {
    return this.#earlyExpiration
  }

  isLogicallyExpired() {
    return Date.now() >= this.#logicalExpiration
  }

  isEarlyExpired() {
    if (!this.#earlyExpiration) {
      return false
    }

    if (this.isLogicallyExpired()) {
      return false
    }

    return Date.now() >= this.#earlyExpiration
  }

  static fromDriver(key: string, item: string, serializer: CacheSerializer) {
    return new CacheEntry(key, serializer.deserialize(item), serializer)
  }

  applyFallbackDuration(duration: number) {
    this.#logicalExpiration += duration
    this.#earlyExpiration = 0
    return this
  }

  expire() {
    this.#logicalExpiration = Date.now() - 100
    this.#earlyExpiration = 0
    return this
  }

  serialize() {
    return this.#serializer.serialize({
      value: this.#value,
      logicalExpiration: this.#logicalExpiration,
      earlyExpiration: this.#earlyExpiration,
    })
  }
}
