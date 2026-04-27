"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
          <div className="max-w-md w-full bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 mb-2">
              Algo salió mal
            </h1>
            <p className="text-sm text-slate-600 mb-4">
              Ocurrió un error inesperado. Recarga la página. Si el problema
              persiste, avísanos.
            </p>
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">Detalle técnico</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">
                {this.state.message}
              </pre>
            </details>
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="mt-4 px-4 py-2 bg-teal-700 text-white text-sm rounded-lg hover:bg-teal-800"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
