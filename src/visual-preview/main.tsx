import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../app/AuthContext'
import '../index.css'
import App from '../App'

// This entry is included only in the explicit SHAFX_VISUAL_PREVIEW=1 test build.
// It supplies the context needed by workspace panels for screenshot QA without
// changing the real auth gate in src/main.tsx or becoming part of a normal build.
const root = document.getElementById('root')
if (!root) throw new Error('Visual preview root #root not found')

createRoot(root).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
)
