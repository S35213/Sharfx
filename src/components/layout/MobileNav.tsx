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
  <nav aria-label="Terminal navigation" className="fixed inset-x-0 bottom-0 z-[60] border-t border-shafx-border bg-[#080C12]/96 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_40px_rgba(0,0,0,.32)] backdrop-blur-xl lg:hidden">
    <div className="mx-auto flex max-w-xl items-stretch justify-around">
      {items.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onChange(id)} className={`flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium transition ${active ? 'text-shafx-accent' : 'text-shafx-textMuted hover:text-shafx-text'}`}>
          <span className={`flex h-8 w-9 items-center justify-center rounded-xl ${active ? 'bg-shafx-accent/10 ring-1 ring-inset ring-shafx-accent/15' : ''}`}><Icon size={18} strokeWidth={active ? 2.3 : 1.8} /></span>
          <span>{label}</span>
        </button>
      })}
    </div>
  </nav>
)
