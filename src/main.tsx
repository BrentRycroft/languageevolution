import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./index.css";

/**
 * main.tsx
 *
 * Vite entry point — mounts <App /> into #root.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
