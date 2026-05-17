// Required: polyfill Node globals before any wallet SDK calls
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;
if (typeof window !== 'undefined') {
  (globalThis as any).WebSocket = window.WebSocket;
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
