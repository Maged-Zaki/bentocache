import { pino } from 'pino'
import { BentoCache, bentostore } from 'bentocache'
import { redisDriver } from 'bentocache/drivers/redis'
import { memoryDriver } from 'bentocache/drivers/memory'

export const bento = new BentoCache({
  default: 'memoryAndRedis',
  logger: pino({
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
  stores: {
    memory: bentostore().useL1Layer(memoryDriver({})),

    redis: bentostore().useL2Layer(redisDriver({ connection: { host: 'localhost', port: 6379 } })),

    memoryAndRedis: bentostore()
      .useL1Layer(memoryDriver({}))
      .useL2Layer(redisDriver({ connection: { host: 'localhost', port: 6379 } })),
  },
})
