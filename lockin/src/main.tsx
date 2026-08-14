import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { ProfileProvider } from './hooks/useProfile'
import { ThemeProvider } from './hooks/useTheme'
import './index.css'

// Register the service worker with the autoUpdate flow. Because
// vite-plugin-pwa is configured with registerType: 'autoUpdate', this
// reloads the page as soon as a freshly deployed build's service worker
// activates, so the old app shell is never left pointing at removed
// hashed assets (which is what caused the intermittent white screen).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
