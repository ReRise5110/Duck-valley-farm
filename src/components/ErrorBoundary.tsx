import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

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
    return {
      hasError: true,
      message: error?.message || 'เกิดข้อผิดพลาดในการแสดงผลระบบ',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#2b180e] flex items-center justify-center p-4">
          <div className="pixel-wood-panel max-w-md w-full p-6 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-rose-700 mx-auto" />
            <h1 className="font-display text-xl font-bold text-[#3a1f0f]">
              เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล
            </h1>
            <p className="text-xs text-[#5c2e14] break-words bg-[#fff9eb] border-2 border-[#723b18] p-3">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-bold text-sm px-5 py-2 inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              รีโหลดหน้าแอป
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
