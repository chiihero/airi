import type Redis from 'ioredis'

import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { HonoEnv } from './types/hono'

import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { createRedis } from './libs/redis'
import { resolveRequestAuth } from './libs/request-auth'
import { createUnauthorizedWsEvents } from './libs/ws-auth'
import { sessionMiddleware } from './middlewares/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createProviderRoutes } from './routes/providers'
import { createConfigKVService } from './services/adapters/config-kv'
import { createCharacterService } from './services/domain/characters'
import { createChatService } from './services/domain/chats'
import { createProviderService } from './services/domain/providers'
import { createUserDeletionService } from './services/domain/user-deletion'
import { ApiError, createInternalError } from './utils/error'
import { nanoid } from './utils/id'
import { getTrustedOrigin } from './utils/origin'

interface AppDeps {
  db: Database
  characterService: ReturnType<typeof createCharacterService>
  chatService: ReturnType<typeof createChatService>
  providerService: ReturnType<typeof createProviderService>
  configKV: ReturnType<typeof createConfigKVService>
  redis: Redis
  env: Env
  userDeletionService: ReturnType<typeof createUserDeletionService>
}

/**
 * Wire the four retained routes (chats / characters / providers / chat-ws) onto
 * a Hono app. Auth is resolved purely from the static bearer token via
 * {@link resolveRequestAuth}; there is no better-auth session lookup.
 */
export async function buildApp(deps: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      await next()

      // NOTICE: All API responses should be non-cacheable. Auth carries the
      // static bearer token in the Authorization header, and stale API payloads
      // are not safe to serve from edge caches after mutations.
      c.res.headers.set('Cache-Control', 'no-store, no-cache, private, max-age=0')
      c.res.headers.set('Pragma', 'no-cache')
      c.res.headers.set('Expires', '0')
    })
    .use(
      '/api/*',
      cors({
        origin: origin => getTrustedOrigin(origin, deps.env.ADDITIONAL_TRUSTED_ORIGINS),
        credentials: true,
      }),
    )
    .use(honoLogger())

  // WebSocket setup — must be registered BEFORE bodyLimit middleware.
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
  // Per-process stable id used by the chat-ws sub callback to skip echoes of
  // its own publishes across multiple instances.
  const instanceId = process.env.SERVER_INSTANCE_ID || nanoid()
  const chatWsSetup = createChatWsHandlers(deps.chatService, deps.redis, instanceId, null)

  app.get('/ws/chat', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token)
      return createUnauthorizedWsEvents()

    const session = await resolveRequestAuth(
      deps.env,
      new Headers({ Authorization: `Bearer ${token}` }),
    )
    if (!session?.user)
      return createUnauthorizedWsEvents()

    return chatWsSetup(session.user.id)
  }))

  const builtApp = app
    .use('*', sessionMiddleware(deps.env))
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        const logFields = { details: err.details, cause: (err as { cause?: unknown }).cause }

        if (err.statusCode >= 500) {
          logger.withError(err).withFields(logFields).error('API error occurred')
        }
        else if (err.statusCode !== 401) {
          logger.withError(err).withFields(logFields).warn('API error occurred')
        }

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })

    /**
     * Liveness probe. Returns 200 as long as the Node process is alive; must
     * not touch Postgres/Redis so a single upstream blip does not recycle the
     * process.
     */
    .on('GET', '/livez', c => c.json({ status: 'live' }))
    /**
     * Readiness probe. Verifies the instance can serve traffic by pinging the
     * two infra dependencies (Postgres + Redis) that, if down, mean the
     * retained routes genuinely cannot serve.
     */
    .on('GET', '/readyz', async (c) => {
      const [dbResult, redisResult] = await Promise.allSettled([
        deps.db.execute('SELECT 1'),
        deps.redis.ping(),
      ])

      const dbReady = dbResult.status === 'fulfilled'
      const redisReady = redisResult.status === 'fulfilled'
      const ready = dbReady && redisReady

      return c.json(
        {
          status: ready ? 'ready' : 'not_ready',
          checks: { db: dbReady ? 'ok' : 'fail', redis: redisReady ? 'ok' : 'fail' },
        },
        ready ? 200 : 503,
      )
    })

    /**
     * Service identity at the API root.
     */
    .on('GET', '/', c => c.json({
      service: 'airi-api',
      message: 'Project AIRI personal API server.',
    }))

    /**
     * Session resolution for the static-token model.
     *
     * The shared frontend `fetchSession()` calls this with the persisted Bearer
     * token. sessionMiddleware has already resolved the principal via the
     * static-token resolver and set `c.get('user')` / `c.get('session')`; this
     * handler just echoes them back in the `{ user, session }` envelope the
     * frontend expects. A missing/invalid token yields null and a 401 so the
     * frontend clears local auth state.
     */
    .get('/api/auth/get-session', (c) => {
      const user = c.get('user')
      const session = c.get('session')
      if (!user || !session)
        return c.json({ user: null, session: null }, 401)
      return c.json({ user, session })
    })

    .route('/api/v1/characters', createCharacterRoutes(deps.characterService))
    .route('/api/v1/providers', createProviderRoutes(deps.providerService))
    .route('/api/v1/chats', createChatRoutes(deps.chatService))

    .notFound(c => c.json({
      error: 'NOT_FOUND',
      message: `No route matched ${c.req.method} ${new URL(c.req.url).pathname}.`,
    }, 404))

  return { app: builtApp, injectWebSocket }
}

export type AppType = Awaited<ReturnType<typeof buildApp>>['app']

/**
 * Assemble the personal slim server: Postgres + Redis + ConfigKV + the three
 * retained domain services. Stripe/OTEL/flux/admin/email/openai-speech have
 * been removed; auth is the static bearer token only.
 *
 * Call stack:
 *
 * runApiServer
 *   -> {@link createApp}
 *     -> initializeExternalDependency(Database)  // retry-bootstraps Postgres + runs drizzle migrations
 *     -> initializeExternalDependency(Redis)     // retry-bootstraps Redis
 *     -> {@link buildApp}                        // mounts chats/characters/providers/chat-ws
 */
export async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  const db = injeca.provide('datastore:db', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const { db: dbInstance, pool } = await initializeExternalDependency(
        'Database',
        logger,
        async (attempt) => {
          const connection = createDrizzle(dependsOn.env)

          try {
            await connection.db.execute('SELECT 1')
            logger.log(`Connected to database on attempt ${attempt}`)
            await migrateDatabase(connection.db)
            logger.log(`Applied schema on attempt ${attempt}`)
            return connection
          }
          catch (error) {
            await connection.pool.end()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(() => pool.end())
      return dbInstance
    },
  })

  const redis = injeca.provide('datastore:redis', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const redisInstance = await initializeExternalDependency(
        'Redis',
        logger,
        async (attempt) => {
          const instance = createRedis(dependsOn.env.REDIS_URL)

          try {
            await instance.connect()
            logger.log(`Connected to Redis on attempt ${attempt}`)
            return instance
          }
          catch (error) {
            instance.disconnect()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(async () => {
        await redisInstance.quit()
      })
      return redisInstance
    },
  })

  const configKV = injeca.provide('datastore:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })

  const characterService = injeca.provide('services:characters', {
    dependsOn: { db },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db, null),
  })

  const providerService = injeca.provide('services:providers', {
    dependsOn: { db },
    build: ({ dependsOn }) => createProviderService(dependsOn.db),
  })

  const chatService = injeca.provide('services:chats', {
    dependsOn: { db },
    build: ({ dependsOn }) => createChatService(dependsOn.db, null, null),
  })

  // NOTICE: user-deletion is a thin scheduler. The slim build keeps the three
  // retained modules registered (providers/characters/chats); the removed
  // flux/stripe modules are simply not registered.
  const userDeletionService = injeca.provide('services:userDeletion', {
    dependsOn: { providerService, characterService, chatService },
    build: ({ dependsOn }) => {
      const service = createUserDeletionService()
      service.register({ name: 'providers', priority: 30, softDelete: ({ userId }) => dependsOn.providerService.deleteAllForUser(userId) })
      service.register({ name: 'characters', priority: 30, softDelete: ({ userId }) => dependsOn.characterService.deleteAllForUser(userId) })
      service.register({ name: 'chats', priority: 30, softDelete: ({ userId }) => dependsOn.chatService.deleteAllForUser(userId) })
      return service
    },
  })

  await injeca.start()
  const resolved = await injeca.resolve({
    db,
    characterService,
    chatService,
    providerService,
    configKV,
    redis,
    env: parsedEnv,
    userDeletionService,
  })

  const { app, injectWebSocket } = await buildApp({
    db: resolved.db,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    configKV: resolved.configKV,
    redis: resolved.redis,
    env: resolved.env,
    userDeletionService: resolved.userDeletionService,
  })

  logger.withFields({ hostname: resolved.env.HOST, port: resolved.env.PORT }).log('Server started')

  return {
    app,
    injectWebSocket,
    port: resolved.env.PORT,
    hostname: resolved.env.HOST,
  }
}

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

/**
 * Boot the personal slim API server and block until it closes.
 */
export async function runApiServer(): Promise<void> {
  const { app: honoApp, injectWebSocket, port, hostname } = await createApp()
  const server = serve({ fetch: honoApp.fetch, port, hostname })
  injectWebSocket(server)

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolve, reject) => {
    server.once('close', () => resolve())
    server.once('error', error => reject(error))
  })
}
