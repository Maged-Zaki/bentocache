import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb'
import type { Redis as IoRedis, RedisOptions as IoRedisOptions } from 'ioredis'
import type { Knex } from 'knex'

/**
 * Options that are common to all drivers
 *
 * Some of theses options may be also defined in
 * the BentoCache options. Setting them specifically
 * for a driver will override the BentoCache options.
 */
export type DriverCommonOptions = {
  ttl?: number
  prefix?: string
}

/**
 * Options for Cloudflare KV driver
 */
export type CloudflareKvConfig = {
  /**
   * Cloudflare account ID
   */
  accountId: string

  /**
   * Your Cloudflare KV namespace ID
   */
  namespaceId: string

  /**
   * API token from https://dash.cloudflare.com/profile/api-tokens
   */
  apiToken: string

  /**
   * Should the driver not throw an error when the minimum
   * TTL is not respected ( 60 seconds )
   */
  ignoreMinTtlError?: boolean
} & DriverCommonOptions

/**
 * Options for DynamoDB driver
 */
export type DynamoDBConfig = {
  /**
   * DynamoDB table name to use.
   */
  table: {
    name: string
  }

  /**
   * AWS credentials
   */
  credentials?: DynamoDBClientConfig['credentials']

  /**
   * Region of your DynamoDB instance
   */
  region: DynamoDBClientConfig['region']

  /**
   * Endpoint to your DynamoDB instance
   */
  endpoint: DynamoDBClientConfig['endpoint']
} & DriverCommonOptions

/**
 * Options for Memory driver
 */
export type MemoryConfig = {
  /**
   * Maximum       number of items to store in the cache
   * before removing the least recently used items
   *
   * @default 1000
   */
  maxSize?: number
} & DriverCommonOptions

/**
 * Options for Redis driver
 */
export type RedisConfig = {
  /**
   * A IoRedis connection instance or connection options
   */
  connection: IoRedis | IoRedisOptions
} & DriverCommonOptions

/**
 * Options for File driver
 */
export type FileConfig = {
  /**
   * Directory where the cache files will be stored
   */
  directory: string
} & DriverCommonOptions

/**
 * Options for SQL drivers
 */
export type SqlConfig = {
  /**
   * A Knex connection instance or connection options
   */
  connection: Knex | Knex.Config['connection']

  /**
   * Table name to use
   */
  tableName?: string

  /**
   * Should the driver automatically create the table
   * @default true
   */
  autoCreateTable?: boolean
} & DriverCommonOptions
