import React, { useState } from 'react'
import type { ProviderDescriptor } from '../../integrations/core/types'

interface ProviderCredentialFormProps {
  descriptor: ProviderDescriptor
  busy?: boolean
  error?: string | null
  onSubmit: (credentials: Record<string, string>) => void
}

export const ProviderCredentialForm: React.FC<ProviderCredentialFormProps> = ({ descriptor, busy = false, error = null, onSubmit }) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((descriptor.credentialFields || []).map((field) => [field.key, field.options?.[0]?.value || ''])),
  )

  const fields = descriptor.credentialFields || []
  if (fields.length === 0) return <div className="rounded-lg border border-dashed border-shafx-border p-3 text-[10px] text-shafx-textMuted">No credential schema is configured for this provider.</div>

  return (
    <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
      <div className="text-[10px] font-semibold">Connect {descriptor.name}</div>
      <p className="mt-1 text-[9px] leading-relaxed text-shafx-textMuted">Credentials are sent to the SHAFX server and handled by the provider connector. They are not stored in browser storage.</p>
      {fields.map((field) => (
        <div key={field.key} className="mt-2">
          <label className="block text-[9px] text-shafx-textMuted" htmlFor={'provider-' + descriptor.id + '-' + field.key}>{field.label}</label>
          {field.type === 'select' ? (
            <select
              id={'provider-' + descriptor.id + '-' + field.key}
              value={values[field.key] || ''}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              className="mt-1 h-9 w-full rounded border border-shafx-border bg-shafx-surface px-2 text-xs"
            >
              {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <input
              id={'provider-' + descriptor.id + '-' + field.key}
              type={field.type === 'secret' ? 'password' : 'text'}
              autoComplete="off"
              value={values[field.key] || ''}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              placeholder={field.label}
              className="mt-1 h-10 w-full rounded border border-shafx-border bg-shafx-surface px-2 text-xs outline-none focus:border-shafx-primary"
            />
          )}
        </div>
      ))}
      {error && <div className="mt-2 rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-[9px] text-red-300">{error}</div>}
      <button
        type="button"
        onClick={() => onSubmit(values)}
        disabled={busy || fields.some((field) => field.required && !values[field.key]?.trim())}
        className="mt-2 min-h-10 w-full rounded bg-shafx-primary px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Connecting…' : 'Connect provider'}
      </button>
    </div>
  )
}
