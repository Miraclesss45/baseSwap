// src/components/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080b11] flex items-center justify-center p-6">
          <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.05] bg-red-500 blur-3xl" />
            <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.04] bg-red-600 blur-3xl" />
          </div>

          <div className="relative w-full max-w-md">
            <div className="relative rounded-2xl bg-[#0a0f1a] border border-red-500/20 p-8 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>

              <h1 className="font-mono text-xl font-bold text-red-400 text-center mb-3 tracking-tight">
                Application Error
              </h1>
              <p className="font-mono text-sm text-slate-500 text-center leading-relaxed">
                Something went wrong and the app could not recover.
              </p>

              {this.state.error?.message && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-950/40 border border-red-500/15">
                  <p className="font-mono text-xs text-red-400/80 leading-relaxed break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="mt-6 w-full py-3 rounded-xl font-mono text-sm font-bold text-white
                           bg-gradient-to-br from-red-600 to-red-500
                           hover:from-red-500 hover:to-red-400
                           shadow-lg shadow-red-500/20 hover:shadow-red-500/30
                           hover:-translate-y-px active:scale-[0.98]
                           transition-all duration-200"
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