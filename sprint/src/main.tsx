import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { keepDelivering } from '../../shared/client'

// Votes and suggestions that could not be sent last time go now, and keep trying.
keepDelivering()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
