import React from 'react';
import { Github, Play, Download, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';

interface HeaderProps {
  activeTab: 'guide' | 'generator' | 'files' | 'troubleshoot';
  setActiveTab: (tab: 'guide' | 'generator' | 'files' | 'troubleshoot') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold text-lg">
              ⚙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  GitHub EXE Builder for Cloudify
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  GitHub Actions CI/CD
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Electron + Python FastAPI + PyInstaller → Windows <code className="text-cyan-300 font-mono">.exe</code>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'guide'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>ধাপে ধাপে গাইড (Guide)</span>
            </button>

            <button
              onClick={() => setActiveTab('generator')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'generator'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Workflow YAML Generator</span>
            </button>

            <button
              onClick={() => setActiveTab('files')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'files'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>প্রয়োজনীয় ফাইল (Files)</span>
            </button>

            <button
              onClick={() => setActiveTab('troubleshoot')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'troubleshoot'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>সমস্যা সমাধান (FAQ)</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
