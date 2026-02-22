import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  sectionType: string;
}

interface State {
  hasError: boolean;
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
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Section:${this.props.sectionType}] Runtime error:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
