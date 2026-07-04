/**
 * Minimal structural shape for the optional engagement metrics passed into the
 * retained chats/characters/chat-ws services.
 *
 * In the personal slim build there is no OpenTelemetry meter provider, so
 * callers pass `null` and every `metrics?.xxx` call site is a no-op. The shape
 * is kept so the service signatures and call sites do not have to change —
 * only the import path moved from the deleted `otel/` module to here.
 *
 * Each counter mirrors the OpenTelemetry `Counter`-like `.add(value, attrs?)`
 * contract so a future meter provider could be wired back in without touching
 * the services.
 */
export interface EngagementCounter {
  add: (value: number, attributes?: Record<string, string | number | boolean>) => void
}

export interface EngagementMetrics {
  characterEngagement: EngagementCounter
  characterCreated: EngagementCounter
  characterDeleted: EngagementCounter
  chatMessages: EngagementCounter
  wsMessagesSent: EngagementCounter
  wsMessagesReceived: EngagementCounter
  wsConnectionsActive: { addCallback: (cb: (result: { observe: (value: number) => void }) => void) => void }
}

/**
 * Optional product-event sink. In the slim build no service is wired, so the
 * `?.` call site in chats.ts is a no-op. The shape mirrors the deleted
 * product-events service's `track` signature.
 */
export interface ProductEventSink {
  track: (event: {
    userId: string
    feature: string
    action: string
    status: string
    source: string
    metadata?: Record<string, unknown>
  }) => void | Promise<void>
}
