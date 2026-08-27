import React, { useState } from 'react';
import { BuildConfig } from '../types';
import { generateWorkflowYaml } from '../data/workflowTemplates';
import { Copy, Check, Download, Sparkles, Sliders, Code2, RefreshCw } from 'lucide-react';

export const WorkflowGenerator: React.FC = () => {
  const [config, setConfig] = useState<BuildConfig>({
    appName: 'Cloudify',
    version: '1.5.0',
    pythonVersion: '3.10',
    nodeVersion: '20',
    electronVersion: '28.3.3',
    architecture: 'x64',
    createReleaseOnTag: true,
    artifactRetentionDays: 30,
    outputExeName: 'Cloudify-Windows-Installer',
  });

  const [copied, setCopied] = useState(false);

  const yamlContent = generateWorkflowYaml(config);

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([yamlContent], { type: 'text/yaml' });
    element.href = URL.createObjectURL(file);
    element.download = 'build-exe.yml';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            Workflow কাস্টমাইজার ও জেনারেটর
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            আপনার প্রোজেক্ট অনুযায়ী পাইথন ভার্সন, নোড ভার্সন ও আর্কিটেকচার কনফিগার করে কাস্টম <code className="text-cyan-300">.github/workflows/build-exe.yml</code> তৈরি করুন।
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 flex items-center gap-2 transition-all shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'কপি হয়েছে!' : 'YAML কপি করুন'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30"
          >
            <Download className="w-4 h-4" />
            <span>.YML ডাউনলোড</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Settings Form */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
            <Sliders className="w-4 h-4 text-cyan-400" />
            বিল্ড কনফিগারেশন প্যারামিটার
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                অ্যাপ্লিকেশনের নাম (App Name)
              </label>
              <input
                type="text"
                value={config.appName}
                onChange={(e) => setConfig({ ...config, appName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Python Version
                </label>
                <select
                  value={config.pythonVersion}
                  onChange={(e) => setConfig({ ...config, pythonVersion: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="3.10">Python 3.10 (Recommended)</option>
                  <option value="3.11">Python 3.11</option>
                  <option value="3.9">Python 3.9</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Node.js Version
                </label>
                <select
                  value={config.nodeVersion}
                  onChange={(e) => setConfig({ ...config, nodeVersion: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="20">Node.js 20 LTS (Recommended)</option>
                  <option value="18">Node.js 18</option>
                  <option value="22">Node.js 22</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Output Artifact Name (.zip on GitHub)
              </label>
              <input
                type="text"
                value={config.outputExeName}
                onChange={(e) => setConfig({ ...config, outputExeName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Artifact Retention (দিন)
              </label>
              <select
                value={config.artifactRetentionDays}
                onChange={(e) => setConfig({ ...config, artifactRetentionDays: parseInt(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value={15}>15 দিন (15 Days)</option>
                <option value={30}>30 দিন (30 Days)</option>
                <option value={60}>60 দিন (60 Days)</option>
                <option value={90}>90 দিন (90 Days - Max)</option>
              </select>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.createReleaseOnTag}
                  onChange={(e) => setConfig({ ...config, createReleaseOnTag: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer bg-slate-950 border-slate-800"
                />
                <div>
                  <span className="text-white font-medium block">
                    GitHub Release অটো পাবলিশ (Auto Release)
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    যখনই কোনো গিট ট্যাগ (যেমন v1.0.0) পুশ হবে, তখন সাথে সাথে রিলিজ তৈরি করবে।
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Generated YAML Preview */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono text-slate-300">
                .github/workflows/build-exe.yml
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">YAML</span>
          </div>

          <div className="p-4 flex-1 overflow-x-auto max-h-[500px] overflow-y-auto">
            <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre">
              {yamlContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
