import React from 'react'
import { BarChart3, Bot, History, UserCircle } from 'lucide-react'

export type MobileNavTab = 'market' | 'agent' | 'history' | 'account'

interface MobileNavProps {
  activeTab: MobileNavTab
  onChange: (tab: MobileNavTab) => void
}

const items: Array<{ id: MobileNavTab; label: string; icon: React.ElementType }> = [
  { id: 'market', label: 'Market', icon: BarChart3 },
  { id: 'agent', label: 'Bot', icon: Bot },
  { id: 'history', label: 'History', icon: History },
  { id: 'account', label: 'Account', icon: UserCircle },
]

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onChange }) => (
  <nav aria-label="Terminal navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-shafx-border bg-shafx-surface/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur lg:hidden">
    <div className="mx-auto flex max-w-lg items-stretch justify-around">
      {items.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onChange(id)} className={`flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs transition ${active ? 'text-shafx-primary' : 'text-shafx-textMuted hover:text-shafx-text'}`}><Icon size={20} strokeWidth={active ? 2.4 : 2} /><span>{label}</span></button>
      })}
    </div>
  </nav>
)
