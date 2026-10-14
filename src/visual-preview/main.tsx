import { createRoot } from 'react-dom/client'
import '../index.css'
import App from '../App'

// This entry is included only in the explicit SHAFX_VISUAL_PREVIEW=1 test build.
// It mounts the workspace for screenshot QA without changing the real auth gate
// in src/main.tsx or becoming part of the normal Render production build.
const root = document.getElementById('root')
if (!root) throw new Error('Visual preview root #root not found')

createRoot(root).render(<App />)
