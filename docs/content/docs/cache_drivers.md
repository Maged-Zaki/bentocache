---
summary: The drivers available to use with BentoCache
---

# Cache drivers

Some options are common to all drivers. For more information about them, see the [options](./options.md) page. Here we will rather list the specifics of each driver.

## Redis

You will need to install `ioredis` to use this driver.

The Redis driver can be used with many different providers:
- Upstash
- Vercel KV
- Valkey
- KeyDB
- DragonFly
- Redis Cluster


The driver uses the [ioredis](https://github.com/redis/ioredis) library under the hood. So all possible ioredis configurations are assignable when creating the bentocache driver. Feel free to look at their documentation for more details.

```ts
import { BentoCache, bentostore } from 'bentocache'
import { redisDriver } from 'bentocache/drivers/redis'

const bento = new BentoCache({
  default: 'redis',
  stores: {
    redis: bentostore().useL2Layer(redisDriver({
      connection: { host: '127.0.0.1', port: 6379 }
    }))
  }
})
```

It is also possible to directly pass an Ioredis instance to reuse the connection.

```ts
import { Redis } from 'ioredis'

const ioredis = new Redis()

const bento = new BentoCache({
  default: 'redis',
  stores: {
    redis: bentostore().useL2Layer(redisDriver({
      connection: ioredis
    }))
  }
})
```

| Option       | Description                                                                   | Default |
|--------------|-------------------------------------------------------------------------------|---------|
| `connection` | The connection options to use to connect to Redis or an instance of `ioredis` | N/A     |

## Filesystem

The filesystem driver will store your cache in a distributed way in several files/folders on your filesystem.

```ts
import { BentoCache, bentostore } from 'bentocache'
import { fileDriver } from "bentocache/drivers/file";

const bento = new BentoCache({
  default: 'file',
  stores: {
    redis: bentostore().useL2Layer(
      fileDriver({
        directory: './cache',
        pruneInterval: '1h'
    }))
  }
})
```

| Option          | Description                                                              | Default |
|-----------------|--------------------------------------------------------------------------|---------|
| `directory`     | The directory where the cache files will be stored.                      | N/A     |
| `pruneInterval` | The interval in milliseconds to prune expired entries. false to disable. | false   |

### Prune Interval

Since the filesystem driver does not have a way to automatically prune expired entries, you can set a `pruneInterval` to automatically prune expired entries. By setting this option, the driver will launch a [worker thread](https://nodejs.org/api/worker_threads.html) that will clean up the cache at the specified interval.

## Memory

The memory driver will store your cache directly in memory.

Use [node-lru-cache](https://github.com/isaacs/node-lru-cache) under the hood.


```ts
import { BentoCache, bentostore } from 'bentocache'
import { memoryDriver } from 'bentocache/drivers/memory'

const bento = new BentoCache({
  default: 'memory',
  stores: {
    memory: bentostore().useL1Layer(memoryDriver({
      maxSize: '10mb',
      maxEntrySize: '1mb',
      maxItems: 1000
    }))
  }
})
```

| Option         | Description                                                                                                                                          | Default |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| `maxSize`      | The maximum size of the cache **in bytes**.                                                                                                          | N/A     |
| `maxItems`     | The maximum number of entries that the cache can contain. Note that fewer items may be stored if you are also using `maxSize` and the cache is full. | N/A     |
| `maxEntrySize` | The maximum size of a single entry in bytes.                                                                                                         | N/A     |
| `serialize`    | If the data stored in the memory cache should be serialized/parsed using `JSON.stringify` and `JSON.parse`.                                          | `true`  |

`maxSize` and `maxEntrySize` accept human-readable strings. We use [bytes](https://www.npmjs.com/package/bytes) under the hood so make sure to ensure the format is correct. A `number` can also be passed to these options.

### `serialize` option

By default, the data stored in the memory cache will always be serialized using `JSON.stringify` and `JSON.parse`.
You can disable this feature by setting `serialize` to `false`. This allows for a much faster throughput but at the expense of:
- not being able to limit the size of the stored data, because we can't really know the size of an unserialized object. So if `maxSize` or `maxEntrySize` is set, it throws an error, but you still can use `maxItems` option.
- **Having inconsistent return between the L1 and L2 cache**. The data stored in the L2 Cache will always be serialized because it passes over the network. Therefore, depending on whether the data is retrieved from the L1 and L2, we can have data that does not have the same form. For example, a Date instance will become a string if retrieved from the L2, but will remain a Date instance if retrieved from the L1. So, **you should put extra care when using this feature with an additional L2 cache**.

We recommend never storing anything that is not serializable in the memory cache when an L2 cache is used ( `Date`, `Map`, classes instances, functions etc.. ). However, if you are only using the memory cache, it is safe to store anything you.

## DynamoDB

DynamoDB is also supported by bentocache. You will need to install `@aws-sdk/client-dynamodb` to use this driver.

```ts
import { BentoCache, bentostore } from 'bentocache'
import { dynamoDbDriver } from 'bentocache/drivers/dynamodb'

const bento = new BentoCache({
  default: 'dynamo',
  stores: {
    dynamo: bentostore().useL2Layer(dynamoDbDriver({
      endpoint: '...',
      region: 'eu-west-3',
      table: {
        name: 'cache' // Name of the table
      },

      // Credentials to use to connect to DynamoDB
      credentials: {
        accessKeyId: '...',
        secretAccessKey: '...'
      }
    }))
  }
})
```

You will also need to create a DynamoDB table with a string partition key named `key`. You must create this table before starting to use the driver. 

**Make sure to also enable [Time To Live (TTL)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) on the table, on the `ttl` attribute. This will allow DynamoDB to automatically delete expired items.**

| Option        | Description                                                 | Default |
|---------------|-------------------------------------------------------------|---------|
| `table.name`  | The name of the table that will be used to store the cache. | `cache` |
| `credentials` | The credentials to use to connect to DynamoDB.              | N/A     |
| `endpoint`    | The endpoint to use to connect to DynamoDB.                 | N/A     |
| `region`      | The region to use to connect to DynamoDB.                   | N/A     |


:::warning
You should be careful with the `.clear()` function of the DynamoDB driver. We do not recommend using it. Dynamo does not offer a "native" `clear`, so we are forced to make several API calls to: retrieve the keys and delete them, 25 by 25 (max per `BatchWriteItemCommand`).

So using this function can be costly, both in terms of execution time and API request cost. And also pose rate-limiting problems. Use at your own risk.
:::

## Databases

We offer several drivers to use a database as a cache. The database store should use an adapter for your database. Out of the box, we support [Knex](https://knexjs.org/) and [Kysely](https://kysely.dev/) to interact with the database. Knex and Kysely support many databases: SQLite, MySQL, PostgreSQL, MSSQL, Oracle, and more.

:::note

Note that you can easily create your own adapter by implementing the `DatabaseAdapter` interface if you are using another library not supported by Bentocache. See the [documentation](./extend/custom_cache_driver.md) for more details.

:::

All SQL drivers accept the following options:

| Option            | Description                                                                        | Default      |
|-------------------|------------------------------------------------------------------------------------|--------------|
| `tableName`       | The name of the table that will be used to store the cache.                        | `bentocache` |
| `autoCreateTable` | If the cache table should be automatically created if it does not exist.           | `true`       |
| `connection`      | An instance of `knex` or `Kysely` based on the driver.                             | N/A          |
| `pruneInterval`   | The [Duration](./options.md#ttl-formats) in milliseconds to prune expired entries. | false        |

### Knex

You must provide a Knex instance to use the Knex driver. Feel free to check the [Knex documentation](https://knexjs.org/) for more details about the configuration. Knex support many databases : SQLite, MySQL, PostgreSQL, MSSQL, Oracle, and more.

```ts
import knex from 'knex'
import { BentoCache, bentostore } from 'bentocache'
import { knexDriver } from 'bentocache/drivers/knex'

const db = knex({
  client: 'pg',
  connection: { 
    port: 5432,
    user: 'root', 
    password: 'root', 
    database: 'postgres', 
  }
})

const bento = new BentoCache({
  default: 'pg',
  stores: {
    pg: bentostore().useL2Layer(knexDriver({ connection: db }))
  }
})
```

### Kysely

You must provide a Kysely instance to use the Kysely driver. Feel free to check the [Kysely documentation](https://kysely.dev/) for more details about the configuration. Kysely support the following databases : SQLite, MySQL, PostgreSQL and MSSQL.

You will need to install `mysql2` to use this driver.

```ts
import { Kysely } from 'kysely'
import { BentoCache, bentostore } from 'bentocache'
import { mysqlDriver } from 'bentocache/drivers/kysely'

const db = new Kysely<Database>({ dialect })

const bento = new BentoCache({
  default: 'pg',
  stores: {
    pg: bentostore().useL2Layer(kyselyStore({ connection: db }))
  }
})
```

### Orchid ORM

You must provide an Orchid ORM instance to use the Orchid driver. Feel free to check the [Orchid ORM documentation](https://orchid-orm.netlify.app/) for more details about the configuration. Orchid support the following databases : PostgreSQL.

You will need to install `orchid-orm` to use this driver.

```ts
import { createDb } from 'orchid-orm'
import { BentoCache, bentostore } from 'bentocache'
import { orchidDriver } from 'bentocache/drivers/orchid'

export const db = createDb({ databaseURL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}` })

export const bento = new BentoCache({
  default: 'cache',
  stores: {
    cache: bentostore().useL2Layer(orchidDriver({ connection: db }))
  }
})
```
