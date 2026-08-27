import React, { useState } from 'react';
import { defaultProjectFiles } from '../data/workflowTemplates';
import { ProjectFile } from '../types';
import { CheckCircle2, FileCode, Copy, Check, Download, Info, FolderTree, AlertCircle } from 'lucide-react';

export const FileStructureValidator: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<ProjectFile>(defaultProjectFiles[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (file: ProjectFile) => {
    const element = document.createElement('a');
    const blob = new Blob([file.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(blob);
    element.download = file.path.split('/').pop() || file.name;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-emerald-400" />
            GitHub রিপোজিটরির ফাইল স্ট্রাকচার চেকলিস্ট
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            GitHub Actions যাতে কোনো এরর ছাড়া .exe ফাইল বিল্ড করতে পারে, তার জন্য আপনার রিপোজিটরিতে এই ফাইলগুলো থাকা আবশ্যক।
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>মোট প্রয়োজনীয় ফাইল: {defaultProjectFiles.length}টি</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File List */}
        <div className="lg:col-span-5 space-y-2.5">
          {defaultProjectFiles.map((file) => {
            const isSelected = selectedFile.path === file.path;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-600/10 border-blue-500/50 shadow-md shadow-blue-500/5'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileCode
                      className={`w-4 h-4 ${
                        isSelected ? 'text-cyan-400' : 'text-slate-400'
                      }`}
                    />
                    <span
                      className={`text-xs font-mono font-bold ${
                        isSelected ? 'text-cyan-300' : 'text-white'
                      }`}
                    >
                      {file.path}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {file.description}
                  </p>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    file.required
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {file.required ? 'প্রয়োজনীয়' : 'ঐচ্ছিক'}
                </span>
              </button>
            );
          })}

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>গুরুত্বপূর্ণ টিপস:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              আপনার রিপোজিটরিতে <code className="text-white bg-slate-900 px-1 py-0.5 rounded font-mono">backend/server.py</code> এবং <code className="text-white bg-slate-900 px-1 py-0.5 rounded font-mono">main.js</code> ফাইলগুলো নিশ্চিত করুন। PyInstaller স্বয়ংক্রিয়ভাবে <code className="text-cyan-300 font-mono">server.exe</code> তৈরি করে <code className="text-cyan-300 font-mono">backend_dist/server/</code> এ রাখবে।
            </p>
          </div>
        </div>

        {/* Selected File Viewer */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono font-bold text-white">
                  {selectedFile.path}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">{selectedFile.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(selectedFile.content)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'কপি হয়েছে' : 'কপি করুন'}</span>
              </button>

              <button
                onClick={() => handleDownload(selectedFile)}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ডাউনলোড</span>
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-x-auto max-h-[520px] overflow-y-auto">
            <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre">
              {selectedFile.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
