import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 1. Add the Bootstrap CSS import here:
import 'bootstrap/dist/css/bootstrap.min.css'

// 2. Keep your custom CSS import below it
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)