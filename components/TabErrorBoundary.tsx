"use client";

import { Component, type ReactNode } from "react";

// ErrorBoundary scoped a un tab. A diferencia del global ErrorBoundary que
// reemplaza toda la página por una pantalla de error, este solo aísla el
// contenido de un tab. El resto de tabs sigue funcionando.
//
// Caso de uso: si MaterialityTab crashea, Cuestionario y Chat siguen vivos.
type Props = { tabName: string; children: ReactNode };
type State = { hasError: boolean; message: string };

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error(`[TabErrorBoundary:${this.props.tabName}]`, error);
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-rose-700">
                Error en la pestaña {this.props.tabName}
              </p>
              <p className="text-rose-600 mt-1">
                Las otras pestañas siguen funcionando. Recarga la página si el problema persiste.
              </p>
            </div>
            <button
              onClick={this.reset}
              className="text-xs px-3 py-1.5 bg-white border border-rose-300 text-rose-700 rounded hover:bg-rose-100 shrink-0"
            >
              Reintentar
            </button>
          </div>
          <details className="mt-3 text-xs text-rose-600">
            <summary className="cursor-pointer">Detalle técnico</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{this.state.message}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
