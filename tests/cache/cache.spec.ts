/*
 * @adonisjs/cache
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { setTimeout } from 'node:timers/promises'

import { CacheItem } from '../../src/cache_item.js'
import { Memory } from '../../src/drivers/memory.js'
import { NullDriver } from '../../src/drivers/null.js'
import { ChaosCache } from '../../test_helpers/chaos_cache.js'
import { CacheFactory } from '../../factories/cache_factory.js'
import { throwingFactory, waitAndReturnFactory } from '../../test_helpers/index.js'

test.group('Cache', () => {
  test('get() returns deserialized value', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.set('key', { foo: 'bar' })
    assert.deepEqual(await cache.get('key'), { foo: 'bar' })

    await cache.set('key', ['foo', 'bar'])
    assert.deepEqual(await cache.get('key'), ['foo', 'bar'])

    await cache.set('key', 1)
    assert.deepEqual(await cache.get('key'), 1)

    await cache.set('key', true)
    assert.deepEqual(await cache.get('key'), true)
  })

  test('get() with default value', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    assert.deepEqual(await cache.get('key', 'default'), 'default')
  })

  test('get() with graceful retain', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .merge({ gracefulRetain: { enabled: true, duration: '500ms' } })
      .create()

    // init key
    await cache.getOrSet('key', '10ms', () => 'value')

    // should get value
    const r1 = await cache.get('key')

    // wait til key expires
    await setTimeout(100)

    // we are in the grace period. should still get value
    const r2 = await cache.get('key')

    assert.deepEqual(r1, 'value')
    assert.deepEqual(r2, 'value')
  })

  test('get() should not use graceful retain when disabled', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .merge({ gracefulRetain: { enabled: false, duration: '500ms' } })
      .create()

    // init key with grace period
    await cache.getOrSet('key', '10ms', () => 'value', {
      gracefulRetain: { enabled: true, duration: '500ms' },
    })

    // we should get value
    const r1 = await cache.get('key')

    // wait til key expires
    await setTimeout(100)

    // we should not get value since grace period is disabled globally
    const r2 = await cache.get('key')

    // Otherwise if we had enabled grace period, we would get value
    const result = await cache.getOrSet('key', '10ms', throwingFactory('DB call failed'), {
      gracefulRetain: { enabled: true, duration: '500ms' },
    })

    assert.deepEqual(r1, 'value')
    assert.deepEqual(r2, undefined)
    assert.deepEqual(result, 'value')
  })

  test('getMany() with default value', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.setMany([{ key: 'key1', value: 'value1' }])

    const result = await cache.getMany(
      ['key1', 'key2', 'key3'],
      ['default1', 'default2', 'default3']
    )

    assert.deepEqual(result, [
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 'default2' },
      { key: 'key3', value: 'default3' },
    ])
  })

  test('missing() returns true when key does not exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    assert.isTrue(await cache.missing('key1'))
  })

  test('missing() returns false when key exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.set('key1', 'value1')
    assert.isFalse(await cache.missing('key1'))
  })

  test('getOrSetForever() returns value when key exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.set('key1', { foo: 'bar' })
    const value = await cache.getOrSetForever('key1', () => ({ foo: 'baz' }))

    assert.deepEqual(value, { foo: 'bar' })
    assert.deepEqual(await cache.get('key1'), { foo: 'bar' })
  })

  test('getOrSetForever() store values when key does not exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    const value = await cache.getOrSetForever('key1', () => ({ foo: 'bar' }))
    assert.deepEqual(value, { foo: 'bar' })
    assert.deepEqual(await cache.get('key1'), { foo: 'bar' })
  })

  test('getOrSetForever() store items forever', async ({ assert }) => {
    const { cache } = new CacheFactory().merge({ ttl: 10 }).create()

    await cache.getOrSetForever('key1', () => ({ foo: 'bar' }))
    await setTimeout(20)
    assert.deepEqual(await cache.get('key1'), { foo: 'bar' })
  })

  test('setForever() store a value forever', async ({ assert }) => {
    const { cache } = new CacheFactory().merge({ ttl: 10 }).create()

    await cache.setForever('key', 'value')
    await setTimeout(30)
    assert.deepEqual(await cache.get('key'), 'value')
  })

  test('setForever() returns true when value is set', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    const result = await cache.setForever('key', 'value')
    assert.isTrue(result)
  })

  test('Value not in local but in remote', async ({ assert }) => {
    const { cache, remote } = new CacheFactory().withHybridConfig().create()

    await remote.set('foo', JSON.stringify({ value: 'bar' }))
    const value = await cache.get('foo')
    assert.deepEqual(value, 'bar')
  })

  test('value not in local and not in remote should returns undefined', async ({ assert }) => {
    const { cache } = new CacheFactory().withHybridConfig().create()
    const value = await cache.get('foo')

    assert.isUndefined(value)
  })

  test('value only in local should returns value without fetching from remote', async ({
    assert,
  }) => {
    class RemoteDriver extends NullDriver {
      get(): undefined {
        assert.fail('should not be called')
      }
    }

    const { cache, local } = new CacheFactory().withHybridConfig(new RemoteDriver({})).create()

    await local.set('foo', JSON.stringify({ value: 'bar' }))
    const value = await cache.get('foo')
    assert.deepEqual(value, 'bar')
  })

  test('return remote item if logically expired and retain is enabled', async ({ assert }) => {
    const { cache, remote } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: true } })
      .create()

    await remote.set('foo', JSON.stringify({ value: 'bar', logicalExpiration: Date.now() - 1000 }))
    const value = await cache.get('foo')

    assert.deepEqual(value, 'bar')
  }).skip()

  test('doesnt return remote item if logically expired and retain is disabled', async ({
    assert,
  }) => {
    const { cache, remote } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: false } })
      .create()

    await remote.set('foo', JSON.stringify({ value: 'bar', logicalExpiration: Date.now() - 1000 }))
    const value = await cache.get('foo')

    assert.isUndefined(value)
  })

  test('return local item if logically expired and retain is enabled', async ({ assert }) => {
    const { cache, local } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: true } })
      .create()

    await local.set('foo', JSON.stringify({ value: 'bar', logicalExpiration: Date.now() - 1000 }))
    const value = await cache.get('foo')

    assert.deepEqual(value, 'bar')
  })

  test('doesnt return local item if logically expired and retain is disabled', async ({
    assert,
  }) => {
    const { cache, local } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: false } })
      .create()

    await local.set('foo', JSON.stringify({ value: 'bar', logicalExpiration: Date.now() - 1000 }))
    const value = await cache.get('foo')

    assert.isUndefined(value)
  })

  test('set item to local store if found in remote', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    await remote.set('foo', JSON.stringify({ value: 'bar' }))
    await cache.get('foo')

    const value = await local.get('foo')
    assert.deepEqual(value, JSON.stringify({ value: 'bar' }))
  })

  test('return default value if item not found in local and remote', async ({ assert }) => {
    const { cache } = new CacheFactory().withHybridConfig().create()

    const value = await cache.get('foo', 'bar')
    assert.deepEqual(value, 'bar')
  })

  test('returns value when key exists in local', async ({ assert }) => {
    const { cache, local } = new CacheFactory().withHybridConfig().create()

    await local.set('key1', JSON.stringify({ value: 'bar' }))
    const value = await cache.getOrSet('key1', throwingFactory('should not be called'))

    assert.deepEqual(value, 'bar')
  })

  test('returns value when key exists in remote', async ({ assert }) => {
    const { cache, remote } = new CacheFactory().withHybridConfig().create()

    await remote.set('key1', JSON.stringify({ value: 'bar' }))
    const value = await cache.getOrSet('key1', throwingFactory('should not be called'))

    assert.deepEqual(value, 'bar')
  })

  test('set value in local when key does not exist in local but exists in remote', async ({
    assert,
  }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    await remote.set('key1', JSON.stringify({ value: 'bar' }))
    const value = await cache.getOrSet('key1', throwingFactory('should not be called'))
    const localeValue = await local.get('key1')

    assert.deepEqual(value, 'bar')
    assert.deepEqual(localeValue, JSON.stringify({ value: 'bar' }))
  })

  test('store values in both when key does not exists in local and remote', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    const value = await cache.getOrSet('key1', waitAndReturnFactory(40, 'bar'))

    const localeValue = CacheItem.fromDriver('key1', await local.get('key1'))
    const remoteValue = CacheItem.fromDriver('key1', (await remote.get('key1')) as any)

    assert.deepEqual(value, 'bar')
    assert.deepEqual(localeValue.getValue(), 'bar')
    assert.deepEqual(remoteValue.getValue(), 'bar')
  })

  test('with specific ttl', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))
    await setTimeout(20)

    assert.isUndefined(await cache.get('key1'))
    assert.isUndefined(await local.get('key1'))
    assert.isUndefined(await remote.get('key1'))
  })

  test('retain should returns old value if cb throws', async ({ assert }) => {
    assert.plan(3)

    const { cache } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: true, duration: '10m' } })
      .create()

    // init first value
    const r1 = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))

    await setTimeout(100)
    const r2 = await cache.getOrSet('key1', '10ms', () => {
      // Since key1 is logically expired, this factory should be called
      assert.incrementAssertionsCount()
      throw new Error('foo')
    })

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
  })

  test('graceful retain should not returns old value if cb doesnt throws', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: true, duration: '10m' } })
      .create()

    const r1 = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))
    await setTimeout(100)

    const r2 = await cache.getOrSet('key1', '10ms', () => ({ foo: 'baz' }))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'baz' })
  })

  test('should throws if gracefully retained value is outdated', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .merge({ gracefulRetain: { enabled: true, duration: '100ms' } })
      .create()

    // init factory
    const r1 = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))

    // re-get with throwing factory. still in grace period
    const r2 = await cache.getOrSet('key1', '10ms', throwingFactory('should not be called'))
    await setTimeout(101)

    // re-get with throwing factory. out of grace period. should throws
    const r3 = cache.getOrSet('key1', '10ms', throwingFactory('error in factory'))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    await assert.rejects(() => r3, /error in factory/)
  })

  test('should use the default duration when not defined', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .withHybridConfig()
      .merge({ gracefulRetain: { enabled: true, duration: '100ms' } })
      .create()

    await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))
    await setTimeout(50)

    const r1 = await cache.getOrSet('key1', '10ms', throwingFactory())

    await setTimeout(50)
    const r2 = cache.getOrSet('key1', '10ms', throwingFactory('fail'))

    assert.deepEqual(r1, { foo: 'bar' })
    await assert.rejects(() => r2, /fail/)
  })

  test('early expiration', async ({ assert }) => {
    assert.plan(5)

    const { cache } = new CacheFactory()
      .withHybridConfig()
      .merge({ earlyExpiration: 0.5, ttl: 100 })
      .create()

    // Call factory
    const r1 = await cache.getOrSet('key1', () => ({ foo: 'bar' }))

    // wait until early refresh should be done
    await setTimeout(51)

    // Call factory again. Should call factory for early refresh since we waited
    // 51ms and early expiration is 50% of ttl ( so 50ms )
    const r2 = await cache.getOrSet('key1', async () => {
      await setTimeout(50)
      assert.isTrue(true)
      return { foo: 'baz' }
    })

    // This factory should return the first cached value since early refresh is
    // still running
    const r3 = await cache.getOrSet('key1', () => ({ foo: 'bazzz' }))

    await setTimeout(50)

    // This factory should return the second cached value since early refresh is
    // now done
    const r4 = await cache.getOrSet('key1', () => ({ foo: 'bazzzz' }))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'bar' })
    assert.deepEqual(r4, { foo: 'baz' })
  })

  test('early refresh should be locked. only one factory call', async ({ assert }) => {
    assert.plan(4)

    const { cache } = new CacheFactory()
      .merge({ earlyExpiration: 0.5, ttl: 100 })
      .withHybridConfig()
      .create()

    // Init cache with a value
    await cache.getOrSet('key1', () => ({ foo: 'bar' }))
    await setTimeout(51)

    // Two concurrent calls. Only one factory call should be invoked
    const factory = async () => {
      assert.isTrue(true)
      await setTimeout(50)
      return { foo: 'baz' }
    }

    const [r1, r2] = await Promise.all([
      cache.getOrSet('key1', factory),
      cache.getOrSet('key1', factory),
    ])

    // Refresh is done. should have the new value
    await setTimeout(51)
    const r3 = await cache.getOrSet('key1', () => ({ foo: 'bazzz' }))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'baz' })
  })

  test('earlyexpiration of >= 0 or <= 1 should be ignored', async ({ assert }) => {
    const { cache, driver } = new CacheFactory().withHybridConfig().merge({ ttl: 100 }).create()

    await cache.getOrSet('key1', () => ({ foo: 'bar' }), { earlyExpiration: 1 })
    await cache.getOrSet('key2', () => ({ foo: 'bar' }), { earlyExpiration: 0 })

    assert.notInclude(driver.get('key1'), 'earlyExpiration')
    assert.notInclude(driver.get('key2'), 'earlyExpiration')
  })

  test('early refresh should re-increment physical/logical ttls', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .merge({ earlyExpiration: 0.5, ttl: 100 })
      .withHybridConfig()
      .create()

    // init cache
    const r1 = await cache.getOrSet('key1', () => ({ foo: 'bar' }))

    // wait for early refresh threshold
    await setTimeout(60)

    // call factory. should returns the old value.
    // Disable early expiration to test physical ttl
    const r2 = await cache.getOrSet('key1', waitAndReturnFactory(50, { foo: 'baz' }), {
      earlyExpiration: undefined,
    })

    // wait for early refresh to be done
    await setTimeout(50)

    // get the value
    const r3 = await cache.get('key1')

    // wait a bit
    await setTimeout(50)
    const r4 = await cache.get('key1')

    // wait for physical ttl to expire
    await setTimeout(50)
    const r5 = await cache.get('key1')

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'baz' })
    assert.deepEqual(r4, { foo: 'baz' })
    assert.isUndefined(r5)
  })

  test('handles failure in remote cache when retain is enabled', async ({ assert }) => {
    const remoteDriver = new ChaosCache(new Memory({ maxSize: 10, prefix: 'test' }))

    const { cache } = new CacheFactory()
      .withHybridConfig(remoteDriver)
      .merge({ gracefulRetain: { enabled: true, duration: '2h' } })
      .create()

    // init cache
    const r1 = await cache.getOrSet('key1', '100ms', () => ({ foo: 'bar' }))

    // make the remote cache fail
    remoteDriver.alwaysThrow()

    // wait till we enter the grace period
    await setTimeout(100)

    // get the value again
    const r2 = await cache.getOrSet('key1', () => ({ foo: 'baz' }))

    // should have served the old value
    assert.deepEqual(r1, r2)
  })

  test('rethrows error when suppressRemoteCacheErrors is false', async ({ assert }) => {
    const remoteDriver = new ChaosCache(new Memory({ maxSize: 10, prefix: 'test' }))

    const { cache } = new CacheFactory()
      .withHybridConfig(remoteDriver)
      .merge({ gracefulRetain: { enabled: true, duration: '2h' } })
      .create()

    // init cache
    await cache.getOrSet('key1', '100ms', () => ({ foo: 'bar' }))

    // make the remote cache fail
    remoteDriver.alwaysThrow()

    // wait till we enter the grace period
    await setTimeout(100)

    // get the value again
    const r2 = cache.getOrSet('key1', () => ({ foo: 'baz' }), {
      suppressRemoteCacheErrors: false,
    })

    await assert.rejects(() => r2, 'Chaos: Random error')
  })

  test('A set() set item in local and remote store', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    await cache.set('foo', 'bar')

    const r1 = CacheItem.fromDriver('foo', await local.get('foo'))
    const r2 = CacheItem.fromDriver('foo', (await remote.get('foo'))!)

    assert.deepEqual(r1.getValue(), 'bar')
    assert.deepEqual(r2.getValue(), 'bar')
  })

  test('set should use default CacheOptions', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory()
      .withHybridConfig()
      .merge({ earlyExpiration: 0.5, ttl: 60 * 1000 })
      .create()

    await cache.set('foo', 'bar')

    const r1 = CacheItem.fromDriver('foo', await local.get('foo'))
    const r2 = CacheItem.fromDriver('foo', (await remote.get('foo'))!)

    const earlyExpiration = Date.now() + 30 * 1000

    assert.closeTo(r1.getEarlyExpiration(), earlyExpiration, 100)
    assert.closeTo(r2.getEarlyExpiration(), earlyExpiration, 100)
  })

  test('could override default CacheOptions', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory()
      .withHybridConfig()
      .merge({ earlyExpiration: 0.5, ttl: 60 * 1000 })
      .create()

    await cache.set('foo', 'bar', { earlyExpiration: 0.25 })

    const r1 = CacheItem.fromDriver('foo', await local.get('foo'))
    const r2 = CacheItem.fromDriver('foo', (await remote.get('foo'))!)

    const earlyExpiration = Date.now() + 15 * 1000

    assert.closeTo(r1.getEarlyExpiration(), earlyExpiration, 100)
    assert.closeTo(r2.getEarlyExpiration(), earlyExpiration, 100)
  })

  test('getOrSet() returns value when key exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.set('key1', { foo: 'bar' })
    const value = await cache.getOrSet('key1', () => ({ foo: 'baz' }))

    assert.deepEqual(value, { foo: 'bar' })
  })

  test('getOrSet() store values when key does not exists', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    const value = await cache.getOrSet('key1', () => ({ foo: 'bar' }))
    assert.deepEqual(value, { foo: 'bar' })
    assert.deepEqual(await cache.get('key1'), { foo: 'bar' })
  })

  test('getOrSet() with specific ttl', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))
    await setTimeout(20)

    assert.isUndefined(await cache.get('key1'))
  })

  test('graceful retain should returns old value if cb throws', async ({ assert }) => {
    assert.plan(3)

    const { cache } = new CacheFactory().create()

    const result = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }), {
      gracefulRetain: { enabled: true, duration: '10m' },
    })

    await setTimeout(100)
    const result2 = await cache.getOrSet(
      'key1',
      '10ms',
      () => {
        // Since key1 is logically expired, this factory should be called
        assert.incrementAssertionsCount()
        throw new Error('foo')
      },
      { gracefulRetain: { enabled: true, duration: '10m' } }
    )

    assert.deepEqual(result, { foo: 'bar' })
    assert.deepEqual(result2, { foo: 'bar' })
  })

  test('graceful retain should not returns old value if cb doesnt throws', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    const result = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }), {
      gracefulRetain: { enabled: true, duration: '10m' },
    })

    await setTimeout(100)

    const result2 = await cache.getOrSet('key1', '10ms', () => ({ foo: 'baz' }), {
      gracefulRetain: { enabled: true, duration: '10m' },
    })

    assert.deepEqual(result, { foo: 'bar' })
    assert.deepEqual(result2, { foo: 'baz' })
  })

  test('should throws if gracefully retained value is outdated', async ({ assert }) => {
    const { cache } = new CacheFactory().create()

    const result = await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }), {
      gracefulRetain: { enabled: true, duration: '100ms' },
    })

    assert.deepEqual(result, { foo: 'bar' })
    await setTimeout(50)

    const result2 = await cache.getOrSet('key1', '10ms', throwingFactory(), {
      gracefulRetain: { enabled: true, duration: '100ms' },
    })

    assert.deepEqual(result2, { foo: 'bar' })
    await setTimeout(100)

    await assert.rejects(async () => {
      return cache.getOrSet('key1', '10ms', throwingFactory('Error in cb'), {
        gracefulRetain: { enabled: true, duration: '100ms' },
      })
    }, /Error in cb/)
  })

  test('should use the default duration when not defined', async ({ assert }) => {
    const { cache } = new CacheFactory()
      .merge({ gracefulRetain: { enabled: true, duration: '100ms' } })
      .create()

    await cache.getOrSet('key1', '10ms', () => ({ foo: 'bar' }))
    await setTimeout(50)

    const res = await cache.getOrSet('key1', '10ms', throwingFactory())
    assert.deepEqual(res, { foo: 'bar' })

    await setTimeout(50)
    await assert.rejects(
      async () => cache.getOrSet('key1', '10ms', throwingFactory('fail')),
      /fail/
    )
  })

  test('early expiration', async ({ assert }) => {
    const { cache } = new CacheFactory().merge({ earlyExpiration: 0.5, ttl: 100 }).create()

    assert.plan(5)

    // Call factory
    const r1 = await cache.getOrSet('key1', () => ({ foo: 'bar' }))

    await setTimeout(51)

    // Call factory again. Should call factory for early refresh since we waited
    // 51ms and early expiration is 50% of ttl ( so 50ms )
    const r2 = await cache.getOrSet('key1', async () => {
      await setTimeout(50)
      assert.isTrue(true)
      return { foo: 'baz' }
    })

    // This factory should return the first cached value since early refresh is
    // still running
    const r3 = await cache.getOrSet('key1', () => ({ foo: 'bazzz' }))

    await setTimeout(50)

    // This factory should return the second cached value since early refresh is
    // now done
    const r4 = await cache.getOrSet('key1', () => ({ foo: 'bazzzz' }))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'bar' })
    assert.deepEqual(r4, { foo: 'baz' })
  })

  test('early refresh should be locked. only one factory call', async ({ assert }) => {
    const { cache } = new CacheFactory().merge({ earlyExpiration: 0.5, ttl: 100 }).create()

    assert.plan(4)

    // Init cache with a value
    await cache.getOrSet('key1', () => ({ foo: 'bar' }))
    await setTimeout(51)

    // Two concurrent calls. Only one factory call should be invoked
    const factory = async () => {
      assert.isTrue(true)
      await setTimeout(50)
      return { foo: 'baz' }
    }

    const [r1, r2] = await Promise.all([
      cache.getOrSet('key1', factory),
      cache.getOrSet('key1', factory),
    ])

    // Refresh is done. should have the new value
    await setTimeout(51)
    const r3 = await cache.getOrSet('key1', () => ({ foo: 'bazzz' }))

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'baz' })
  })

  test('earlyexpiration of >= 0 or <= 1 should be ignored', async ({ assert }) => {
    const { cache, driver } = new CacheFactory().merge({ ttl: 100 }).create()

    await cache.getOrSet('key1', () => ({ foo: 'bar' }), { earlyExpiration: 1 })
    await cache.getOrSet('key2', () => ({ foo: 'bar' }), { earlyExpiration: 0 })

    assert.notInclude(driver.get('key1'), 'earlyExpiration')
    assert.notInclude(driver.get('key2'), 'earlyExpiration')
  })

  test('early refresh should re-increment physical/logical ttls', async ({ assert }) => {
    const { cache } = new CacheFactory().merge({ earlyExpiration: 0.5, ttl: 100 }).create()

    // init cache
    const r1 = await cache.getOrSet('key1', () => ({ foo: 'bar' }))

    // wait for early refresh threshold
    await setTimeout(60)

    // call factory. should returns the old value.
    // Disable early expiration to test physical ttl
    const r2 = await cache.getOrSet('key1', waitAndReturnFactory(50, { foo: 'baz' }), {
      earlyExpiration: undefined,
    })

    // wait for early refresh to be done
    await setTimeout(50)

    // get the value
    const r3 = await cache.get('key1')

    // wait a bit
    await setTimeout(50)
    const r4 = await cache.get('key1')

    // wait for physical ttl to expire
    await setTimeout(50)
    const r5 = await cache.get('key1')

    assert.deepEqual(r1, { foo: 'bar' })
    assert.deepEqual(r2, { foo: 'bar' })
    assert.deepEqual(r3, { foo: 'baz' })
    assert.deepEqual(r4, { foo: 'baz' })
    assert.isUndefined(r5)
  })

  test('set should invalidate others local cache', async ({ assert }) => {
    const [cache1, local1] = new CacheFactory().withHybridConfig().create()
    const [cache2] = new CacheFactory().withHybridConfig().create()

    // first we initialize the cache with a value
    await cache1.set('foo', 'bar')

    // then we update it from another cache
    await cache2.set('foo', 'baz')

    // so local cache of cache1 should be invalidated
    const r1 = await local1.get('foo')

    // a get should return the new value
    const r2 = await cache1.get('foo')

    assert.isUndefined(r1)
    assert.equal(r2, 'baz')
  })

  test('delete should delete from local and remote', async ({ assert }) => {
    const { cache, local, remote } = new CacheFactory().withHybridConfig().create()

    // first we initialize the cache with a value
    await cache.set('foo', 'bar')

    // then we delete it
    await cache.delete('foo')

    // so local cache should be deleted
    const r1 = await local.get('foo')

    // and remote cache should be deleted
    const r2 = await remote.get('foo')

    assert.isUndefined(r1)
    assert.isUndefined(r2)
  })

  test('delete should throw if remote fail and suppressRemoteCacheErrors is on', async ({
    assert,
  }) => {
    const remoteDriver = new ChaosCache(new Memory({ maxSize: 10, prefix: 'test' }))

    const { cache } = new CacheFactory().withHybridConfig(remoteDriver).create()

    // first we initialize the cache with a value
    await cache.set('foo', 'bar')

    // then we delete it and disable suppressRemoteCacheErrors.
    // so this method will throw
    remoteDriver.alwaysThrow()
    const r1 = cache.delete('foo', {
      suppressRemoteCacheErrors: false,
    })

    await assert.rejects(() => r1, 'Chaos: Random error')

    // but local cache should be deleted
    const r2 = await cache.get('foo')

    assert.isUndefined(r2)
  })

  test('a delete should delete others local cache', async ({ assert }) => {
    const [cache1, local1] = new CacheFactory().withHybridConfig().create()
    const [cache2] = new CacheFactory().withHybridConfig().create()

    // first we initialize the cache1 with a value
    await cache1.set('foo', 'bar')

    // then we delete it from another cache
    await cache2.delete('foo')

    // so local cache of cache1 should be invalidated
    let r1 = await local1.get('foo')

    // a get should return the new value
    const r2 = await cache1.get('foo')

    assert.isUndefined(r1)
    assert.isUndefined(r2)
  })

  test('a delete should delete others local cache even if remote fail', async ({ assert }) => {
    const remote = new ChaosCache(new Memory({ maxSize: 10, prefix: 'test' }))

    const [cache1, local1] = new CacheFactory().withHybridConfig(remote).create()
    const [cache2] = new CacheFactory().withHybridConfig(remote).create()

    // first we initialize the cache1 with a value
    await cache1.set('foo', 'bar')

    // then we delete it from another cache. remote will throw
    remote.alwaysThrow()
    await cache2.delete('foo')

    // so local cache of cache1 should be invalidated
    let r1 = await local1.get('foo')

    const r2 = await cache1.get('foo')
    remote.neverThrow()

    assert.isUndefined(r1)
    assert.isUndefined(r2)
  })
})
