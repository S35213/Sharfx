import type { ProviderAdapter, ProviderConnection, ProviderFundingInstruction } from './types'

export async function getProviderFundingInstructions(
  adapter: ProviderAdapter,
  connection: ProviderConnection,
  accountId: string,
  direction: 'deposit' | 'withdrawal',
): Promise<ProviderFundingInstruction> {
  const mode = adapter.descriptor.capabilities.funding[direction]
  if (mode === 'unsupported') throw new Error('Funding is not supported for this provider.')
  const method = direction === 'deposit' ? adapter.getDepositInstructions : adapter.getWithdrawalInstructions
  if (typeof method !== 'function') throw new Error('The provider funding handler is not implemented.')
  const result = await method(connection, accountId)
  if (result.mode !== mode) throw new Error('Provider funding response does not match its advertised capability.')
  return result
}
