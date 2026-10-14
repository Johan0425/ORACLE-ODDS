'use client';

import { Component, type ReactNode } from 'react';

/** Aísla fallos de componentes interactivos para que no tumben la página completa. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="card border-negative/30 p-4 text-sm text-muted">
            Este módulo no pudo cargarse. El resto de la página sigue disponible.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
