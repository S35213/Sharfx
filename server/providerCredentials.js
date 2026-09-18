export const validateCredentialFields = (fields = [], credentials = {}) => {
  const values = credentials && typeof credentials === 'object' ? credentials : {}
  const missing = fields
    .filter((field) => field?.required)
    .map((field) => String(field.key || ''))
    .filter((key) => !String(values[key] || '').trim())
  return { valid: missing.length === 0, missing }
}