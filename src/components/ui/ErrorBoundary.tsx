import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error): void {
    console.error('SYNAPSE ErrorBoundary caught error:', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E1E5E4] rounded-xl p-8">
            <h1 className="text-xl font-semibold text-[#1A2022] mb-2">Something went wrong</h1>
            <p className="text-sm text-[#526063] mb-4">
              SYNAPSE encountered an unexpected state error. You can reload the view or reset local demo state.
            </p>
            <div className="bg-[#F0F2F1] border border-[#E1E5E4] rounded-lg p-3 text-xs font-mono-tabular text-[#526063] break-words mb-6">
              {this.state.message}
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
            >
              Return to SYNAPSE Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
