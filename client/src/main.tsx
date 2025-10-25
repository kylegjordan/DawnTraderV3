import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
