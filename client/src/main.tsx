console.log('[MAIN] Starting application...');

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log('[MAIN] Imports loaded successfully');

// Global error handling to prevent Vite HMR WebSocket errors from crashing the app
window.addEventListener('unhandledrejection', (event) => {
  // Suppress Vite HMR WebSocket errors (wss://localhost:undefined)
  if (event.reason?.message?.includes('WebSocket') && event.reason?.message?.includes('undefined')) {
    console.warn('[App] Suppressed Vite HMR WebSocket error:', event.reason?.message);
    event.preventDefault();
    return;
  }
  // Log other unhandled rejections for debugging
  console.error('[App] Unhandled promise rejection:', event.reason);
});

console.log('[MAIN] About to mount React app...');
const rootElement = document.getElementById("root");
console.log('[MAIN] Root element:', rootElement);

if (rootElement) {
  createRoot(rootElement).render(<App />);
  console.log('[MAIN] React app mounted successfully');
} else {
  console.error('[MAIN] ERROR: Root element not found!');
}
