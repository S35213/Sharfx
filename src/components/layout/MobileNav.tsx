import React from 'react'
import { BarChart3, Bot, History, UserCircle } from 'lucide-react'

export type MobileNavTab = 'market' | 'agent' | 'history' | 'account'

interface MobileNavProps { activeTab: MobileNavTab; onChange: (tab: MobileNavTab) => void }

const items: Array<{ id: MobileNavTab; label: string; icon: React.ElementType }> = [
  { id: 'market', label: 'Market', icon: BarChart3 },
  { id: 'agent', label: 'Bot', icon: Bot },
  { id: 'history', label: 'Orders', icon: History },
  { id: 'account', label: 'Account', icon: UserCircle },
]

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onChange }) => (
  <nav aria-label="Terminal navigation" className="fixed inset-x-0 bottom-0 z-[70] border-t border-shafx-border bg-[#080C12]/98 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_44px_rgba(0,0,0,.42)] backdrop-blur-xl lg:hidden">
    <div className="mx-auto grid max-w-xl grid-cols-4 gap-1.5 px-1 py-1.5">
      {items.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(id)}
            className={active
              ? 'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-shafx-accent/10 text-shafx-accent ring-1 ring-inset ring-shafx-accent/20'
              : 'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-shafx-textMuted active:bg-shafx-surfaceHover'}
          >
            <span className="flex h-9 w-12 items-center justify-center"><Icon size={20} strokeWidth={active ? 2.25 : 1.8} /></span>
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        )
      })}
    </div>
  </nav>
)
