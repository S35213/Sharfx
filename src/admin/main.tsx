import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import AdminApp from './AdminApp'

const root = document.getElementById('owner-root')
if (!root) throw new Error('Owner console root not found')

createRoot(root).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
