import type { ClientConfig } from "pg"
import { Client, Pool } from "pg"
import { resolveDatabaseConfig, type DatabaseTarget } from "./targets.ts"

export function resolveClientConfig(target: DatabaseTarget): ClientConfig {
  const config = resolveDatabaseConfig(target)
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.sslMode === "require" || config.sslMode === "verify-full"
      ? { rejectUnauthorized: false }
      : false,
  }
}

export function createClient(target: DatabaseTarget): Client {
  return new Client(resolveClientConfig(target))
}

export function createPool(target: DatabaseTarget): Pool {
  return new Pool(resolveClientConfig(target))
}
