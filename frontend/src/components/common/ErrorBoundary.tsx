import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level accessible Error Boundary that prevents uncaught runtime errors
 * from crashing the entire page to a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      console.error('[ErrorBoundary caught error]:', error, errorInfo);
    }
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[400px] w-full flex items-center justify-center p-6 bg-slate-50 text-slate-900"
        >
          <div className="max-w-lg w-full bg-white border-2 border-rose-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 bg-rose-100 border border-rose-300 text-rose-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Something unexpected went wrong
              </h2>
              <p className="text-sm text-slate-600 font-medium">
                The application encountered an error while rendering this view. Your family tree data is safe.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-100 rounded-xl p-3 text-left overflow-x-auto border border-slate-200">
                <p className="text-xs font-mono text-rose-800 break-words font-semibold">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-sm shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl border-2 border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-sm transition-colors cursor-pointer flex items-center justify-center"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
