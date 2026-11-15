import type { SessionInfo } from "@opencode/client/promise"
import { queryOptions, skipToken } from "@tanstack/solid-query"
import type { ServerConnection } from "@/runtime/server/registry"
import type { ServerCtx } from "@/runtime/server/runtime"
import { loadHomeSessionIndex, HOME_SESSION_PAGE_LIMIT } from "./index"

// Keep the immutable result opaque so Solid Query does not recursively unwrap every session on mount.
const selectSessions = (sessions: SessionInfo[]) => () => sessions

export function homeSessionsQuery(conn: ServerConnection.Any | undefined, ctx: ServerCtx | undefined) {
  return queryOptions({
    queryKey: ["home-sessions", conn] as const,
    queryFn: ctx
      ? ({ signal }) => loadHomeSessionIndex((input, options) => ctx.sdk.api.session.list(input, options), signal)
      : skipToken,
    retry: false,
    staleTime: 30_000,
    // Returning to Home shows the last list and refreshes it, instead of loading again once the cache expires.
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnReconnect: true,
    select: selectSessions,
  })
}

// Archived sessions live in the same list call; we just ask for the archived half via the `archived` filter so the
// sidebar can show them in a separate collapsed group instead of losing them when they leave the active list.
export function archivedSessionsQuery(conn: ServerConnection.Any | undefined, ctx: ServerCtx | undefined) {
  return queryOptions({
    queryKey: ["archived-sessions", conn] as const,
    queryFn: ctx
      ? ({ signal }) =>
          ctx.sdk.api.session
            .list(
              { limit: HOME_SESSION_PAGE_LIMIT, order: "desc", parentID: null, archived: true },
              { signal },
            )
            .then((response) => response.data)
      : skipToken,
    retry: false,
    staleTime: 30_000,
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnReconnect: true,
    select: selectSessions,
  })
}
