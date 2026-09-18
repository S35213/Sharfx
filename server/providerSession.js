export const providerSessionNeedsRefresh = (session, nowMs = Date.now(), skewMs = 60_000) => {
  if (!session || !session.accessToken) return true
  if (!Number.isFinite(session.expiresAtMs)) return Boolean(session.refreshToken)
  return session.expiresAtMs <= nowMs + Math.max(0, skewMs)
}

export const refreshProviderSession = async ({ session, refresh }) => {
  if (!session?.refreshToken) throw new Error('Provider session does not contain a refresh token.')
  const next = await refresh(session.refreshToken, session)
  if (!next?.accessToken) throw new Error('Provider refresh returned no access token.')
  return {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken || session.refreshToken,
    expiresAtMs: Number.isFinite(next.expiresAtMs) ? next.expiresAtMs : undefined,
  }
}