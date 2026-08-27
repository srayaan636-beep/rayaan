import React, { useState } from 'react';
import { Header } from './components/Header';
import { StepGuide } from './components/StepGuide';
import { WorkflowGenerator } from './components/WorkflowGenerator';
import { FileStructureValidator } from './components/FileStructureValidator';
import { TroubleshootGuide } from './components/TroubleshootGuide';
import { 
  Github, 
  Terminal, 
  DownloadCloud, 
  FileCode, 
  Sparkles, 
  ShieldCheck, 
  Cpu, 
  Zap, 
  Layers,
  ArrowRight
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'guide' | 'generator' | 'files' | 'troubleshoot'>('guide');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'guide' && <StepGuide />}
        {activeTab === 'generator' && <WorkflowGenerator />}
        {activeTab === 'files' && <FileStructureValidator />}
        {activeTab === 'troubleshoot' && <TroubleshootGuide />}
      </main>

      {/* Quick Summary Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Cloudify Point Cloud Viewer • Automated GitHub Actions Windows Installer CI/CD</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>FastAPI Server</span>
            <span>•</span>
            <span>PyInstaller</span>
            <span>•</span>
            <span>Electron Builder</span>
            <span>•</span>
            <span>Windows x64 NSIS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
