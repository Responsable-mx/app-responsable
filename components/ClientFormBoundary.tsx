"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface State {
  error: Error | null;
}

export class ClientFormBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: "edit-cliente" },
      extra: { componentStack: info.componentStack },
    });
    console.error("[ClientFormBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded space-y-3">
          <h2 className="text-sm font-bold text-rose-800">
            Error al cargar el formulario de edición
          </h2>
          <p className="text-xs text-rose-700">
            {this.state.error.message}
          </p>
          <details className="text-xs text-rose-600">
            <summary className="cursor-pointer font-medium">
              Detalle técnico
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap bg-rose-100 p-3 rounded text-[11px]">
              {this.state.error.stack}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1.5 bg-rose-700 text-white rounded hover:bg-rose-800"
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
