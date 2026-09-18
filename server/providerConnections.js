const cookieValue = (req, name) => (req.headers?.cookie || '')
  .split(';')
  .map((part) => part.trim())
  .find((part) => part.startsWith(name + '='))
  ?.slice(name.length + 1) || null

const configured = () => Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const authRequest = async (token) => fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
  headers: {
    apikey: process.env.SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + token,
  },
})

const rest = async (path, options = {}) => fetch(process.env.SUPABASE_URL + '/rest/v1' + path, {
  ...options,
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
})

const rpc = async (name, body) => fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/' + name, {
  method: 'POST',
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

const decodeJson = async (response, fallback) => {
  try { return await response.json() } catch { return fallback }
}

export const getShafxUser = async (req) => {
  if (!configured()) return null
  const session = cookieValue(req, 'shafx_session')
  if (!session) return null
  const response = await authRequest(decodeURIComponent(session))
  if (!response.ok) return null
  return decodeJson(response, null)
}

export const createProviderSecret = async ({ secret, name, description }) => {
  const response = await rpc('create_shafx_provider_secret', {
    p_secret: secret,
    p_name: name,
    p_description: description || null,
  })
  const payload = await decodeJson(response, null)
  if (!response.ok) throw new Error(payload?.message || 'Unable to store provider secret securely.')
  const row = Array.isArray(payload) ? payload[0] : payload
  const value = row?.create_shafx_provider_secret ?? row
  if (typeof value !== 'string' || !value) throw new Error('Provider secret storage returned no reference.')
  return value
}

export const readProviderSecret = async (secretRef) => {
  if (!secretRef) throw new Error('Provider secret reference is missing.')
  const response = await rpc('read_shafx_provider_secret', { p_secret_id: secretRef })
  const payload = await decodeJson(response, null)
  if (!response.ok) throw new Error(payload?.message || 'Unable to read provider secret securely.')
  const row = Array.isArray(payload) ? payload[0] : payload
  const value = row?.read_shafx_provider_secret ?? row
  if (typeof value !== 'string' || !value) throw new Error('Provider secret could not be loaded.')
  return value
}

export const deleteProviderSecret = async (secretRef) => {
  if (!secretRef) return false
  const response = await rpc('delete_shafx_provider_secret', { p_secret_id: secretRef })
  const payload = await decodeJson(response, false)
  if (!response.ok) throw new Error(payload?.message || 'Unable to delete provider secret.')
  const row = Array.isArray(payload) ? payload[0] : payload
  return Boolean(row?.delete_shafx_provider_secret ?? row)
}

export const createProviderConnection = async (input) => {
  const response = await rest('/shafx_provider_connections', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: input.userId,
      provider_id: input.providerId,
      label: input.label || input.providerId,
      environment: input.environment || 'mixed',
      state: input.state || 'connected',
      auth_method: input.authMethod || 'oauth2',
      credential_ref: input.credentialRef || null,
      provider_subject: input.providerSubject || null,
      expires_at: input.expiresAt || null,
      last_seen_at: input.lastSeenAt || new Date().toISOString(),
      metadata: input.metadata || {},
    }),
  })
  const payload = await decodeJson(response, null)
  if (!response.ok) throw new Error(payload?.message || 'Unable to save provider connection.')
  return Array.isArray(payload) ? payload[0] : payload
}

export const syncProviderAccounts = async ({ connectionId, userId, providerId, accounts }) => {
  const deactivateResponse = await rest('/shafx_provider_accounts?connection_id=eq.' + encodeURIComponent(connectionId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ active: false }),
  })
  if (!deactivateResponse.ok) throw new Error('Unable to refresh provider account state.')

  if (!accounts.length) return []

  const rows = accounts.map((account) => ({
    connection_id: connectionId,
    user_id: userId,
    provider_id: providerId,
    provider_account_id: account.accountId,
    label: account.accountLabel || account.accountId,
    environment: account.environment,
    currency: account.currency || null,
    balance: Number.isFinite(account.balance) ? account.balance : null,
    equity: Number.isFinite(account.equity) ? account.equity : null,
    used_margin: Number.isFinite(account.usedMargin) ? account.usedMargin : null,
    free_margin: Number.isFinite(account.freeMargin) ? account.freeMargin : null,
    floating_pl: Number.isFinite(account.floatingPL) ? account.floatingPL : null,
    active: true,
    last_synced_at: new Date().toISOString(),
    metadata: account.metadata || {},
  }))

  const response = await rest('/shafx_provider_accounts?on_conflict=user_id,provider_id,provider_account_id,environment', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
  const payload = await decodeJson(response, null)
  if (!response.ok) throw new Error(payload?.message || 'Unable to synchronize provider accounts.')
  return Array.isArray(payload) ? payload : []
}

export const touchProviderConnection = async ({ userId, connectionId, state = 'connected' }) => {
  const response = await rest('/shafx_provider_connections?id=eq.' + encodeURIComponent(connectionId) + '&user_id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ state, last_seen_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error('Unable to update provider connection state.')
}

export const getProviderConnection = async (userId, connectionId, includeSecret = false) => {
  const select = includeSecret
    ? 'id,user_id,provider_id,label,environment,state,auth_method,credential_ref,provider_subject,expires_at,last_seen_at,metadata,created_at,updated_at'
    : 'id,user_id,provider_id,label,environment,state,auth_method,expires_at,last_seen_at,metadata,created_at,updated_at'
  const response = await rest('/shafx_provider_connections?id=eq.' + encodeURIComponent(connectionId) + '&user_id=eq.' + encodeURIComponent(userId) + '&select=' + select)
  const payload = await decodeJson(response, [])
  if (!response.ok) throw new Error(payload?.message || 'Unable to load provider connection.')
  return Array.isArray(payload) ? payload[0] || null : null
}

export const listProviderConnections = async (userId) => {
  const connectionResponse = await rest('/shafx_provider_connections?user_id=eq.' + encodeURIComponent(userId) + '&select=id,provider_id,label,environment,state,auth_method,expires_at,last_seen_at,metadata,created_at,updated_at&order=created_at.desc')
  const accountResponse = await rest('/shafx_provider_accounts?user_id=eq.' + encodeURIComponent(userId) + '&select=id,connection_id,provider_id,provider_account_id,label,environment,currency,balance,equity,used_margin,free_margin,floating_pl,active,last_synced_at,metadata,created_at,updated_at&order=created_at.desc')
  const connections = await decodeJson(connectionResponse, [])
  const accounts = await decodeJson(accountResponse, [])
  if (!connectionResponse.ok || !accountResponse.ok) throw new Error('Unable to load SHAFX provider connections.')
  const accountRows = Array.isArray(accounts) ? accounts : []
  return (Array.isArray(connections) ? connections : []).map((connection) => ({
    id: connection.id,
    providerId: connection.provider_id,
    label: connection.label,
    environment: connection.environment,
    state: connection.state,
    authMethod: connection.auth_method,
    expiresAt: connection.expires_at,
    lastSeenAt: connection.last_seen_at,
    metadata: connection.metadata || {},
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
    accounts: accountRows
      .filter((account) => account.connection_id === connection.id)
      .map((account) => ({
        id: account.id,
        providerAccountId: account.provider_account_id,
        label: account.label,
        environment: account.environment,
        currency: account.currency,
        balance: account.balance == null ? null : Number(account.balance),
        equity: account.equity == null ? null : Number(account.equity),
        usedMargin: account.used_margin == null ? null : Number(account.used_margin),
        freeMargin: account.free_margin == null ? null : Number(account.free_margin),
        floatingPL: account.floating_pl == null ? null : Number(account.floating_pl),
        active: Boolean(account.active),
        lastSyncedAt: account.last_synced_at,
        metadata: account.metadata || {},
      })),
  }))
}

export const disconnectProviderConnection = async ({ userId, connectionId }) => {
  const connection = await getProviderConnection(userId, connectionId, true)
  if (!connection) throw new Error('Provider connection not found.')
  if (connection.credential_ref) await deleteProviderSecret(connection.credential_ref)
  const response = await rest('/shafx_provider_connections?id=eq.' + encodeURIComponent(connectionId) + '&user_id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      state: 'disconnected',
      expires_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    }),
  })
  if (!response.ok) throw new Error('Unable to disconnect provider connection.')
}

export const recordProviderAudit = async ({ userId, connectionId, accountId, eventType, severity = 'info', metadata = {} }) => {
  await rest('/shafx_provider_audit_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      connection_id: connectionId || null,
      account_id: accountId || null,
      event_type: eventType,
      severity,
      metadata,
    }),
  }).catch(() => undefined)
}
