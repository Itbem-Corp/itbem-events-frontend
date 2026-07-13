import { Component, Fragment, type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  sectionType: string;
}

interface State {
  hasError: boolean;
  retryKey: number;
}

/**
 * Error boundary for individual page sections.
 *
 * If a section component throws during render, this boundary catches the error,
 * logs it (in dev), and renders nothing — preventing one broken section from
 * crashing the entire event page.
 *
 * Must be a class component: React hooks cannot be used as error boundaries.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: Props) {
    if (
      previousProps.sectionType !== this.props.sectionType &&
      this.state.hasError
    ) {
      this.setState({ hasError: false, retryKey: 0 });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Section:${this.props.sectionType}] Runtime error:`, error, info.componentStack);
  }

  private retry = () => {
    this.setState((state) => ({
      hasError: false,
      retryKey: state.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="eventi-product-card mx-auto flex min-h-48 w-full max-w-xl flex-col items-center justify-center px-6 py-8 text-center"
          data-section-type={this.props.sectionType}
          role="alert"
        >
          <p className="text-sm font-semibold text-gray-900">
            Esta sección tuvo un problema
          </p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
            El resto de la invitación sigue disponible. Puedes intentar cargar
            esta parte de nuevo.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/35"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Reintentar sección
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
