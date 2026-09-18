export class ProviderExecutionDisabledError extends Error {
  constructor(message = 'External provider order execution is disabled in SHAFX.') {
    super(message)
    this.name = 'ProviderExecutionDisabledError'
    this.code = 'EXECUTION_DISABLED'
    this.status = 409
  }
}

export const assertProviderExecutionEnabled = ({ descriptor, explicitReleaseGate = false } = {}) => {
  if (descriptor?.executionMode === 'external' && !explicitReleaseGate) {
    throw new ProviderExecutionDisabledError()
  }
  return true
}

export const executeProviderOrder = async () => {
  throw new ProviderExecutionDisabledError()
}