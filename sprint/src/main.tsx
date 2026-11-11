import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { keepDelivering } from '../../shared/client'

// Votes and suggestions that could not be sent last time go now, and keep trying.
keepDelivering()

// The last line of defence: if anything throws while drawing, say so and offer a way on,
// instead of leaving a white page. Votes already cast are safe in the outbox.
class Safety extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false }
  static getDerivedStateFromError() { return { broken: true } }
  render() {
    if (!this.state.broken) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <p>Sorry, that did not load properly. Your votes so far are safe.</p>
        <button className="btn-primary px-8 py-3.5 text-sm" onClick={() => location.reload()}>Carry on</button>
        <a href="../">View all the prompts instead</a>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Safety><App /></Safety>
  </StrictMode>,
)
