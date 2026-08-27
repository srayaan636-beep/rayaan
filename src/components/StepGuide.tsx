import React, { useState } from 'react';
import { 
  FolderGit2, 
  Terminal, 
  PlayCircle, 
  DownloadCloud, 
  Copy, 
  Check, 
  ExternalLink, 
  FileCode, 
  CheckCircle2, 
  ArrowRight, 
  Cpu, 
  Package, 
  Sparkles,
  Info
} from 'lucide-react';

export const StepGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [repoUrl, setRepoUrl] = useState<string>('https://github.com/YOUR_USERNAME/cloudify.git');

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-blue-900/60 via-slate-900 to-cyan-950/40 border border-blue-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>সহজ ৪টি ধাপে GitHub Actions দিয়ে Windows .EXE তৈরি</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              গিটহাবে কোড পুশ করেই উইন্ডোজ .EXE ইনস্টলার তৈরি করুন
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              আপনার নিজের পিসিতে কোনো ভারী বিল্ড টুল (PyInstaller / Electron-Builder) চালানো লাগবে না। GitHub Actions ক্লাউডে ফ্রিতে সম্পূর্ণ ব্যাকএন্ড ও ফ্রন্টএন্ড কম্পাইল করে সরাসরি ইনস্টলার <code className="text-cyan-300 bg-slate-800 px-1.5 py-0.5 rounded font-mono">.exe</code> ফাইল তৈরি করে দেবে।
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3.5 text-center min-w-[140px]">
              <div className="text-xs text-slate-400 font-medium">ক্লাউড বিল্ড রানার</div>
              <div className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                windows-latest
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Step Workflow Cards */}
      <div className="grid grid-cols-1 gap-6">
        
        {/* STEP 1 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold flex items-center justify-center text-lg shrink-0">
              ১
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-blue-400" />
                    প্রজেক্টে GitHub Actions Workflow ফাইল যোগ করা
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Step 1: Place the <code className="text-cyan-300">.github/workflows/build-exe.yml</code> in your repository
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 font-mono">
                  .github/workflows/build-exe.yml
                </span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 space-y-2">
                <p>
                  আপনার প্রজেক্টের রুট ফোল্ডারে <code className="text-amber-300 font-mono">.github/workflows/build-exe.yml</code> নামে একটি ফাইল তৈরি করুন। এটি গিটহাবকে স্বয়ংক্রিয়ভাবে নির্দেশ দেয়:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                    <span className="text-blue-400 font-bold block mb-1">1. Python 3.10 Setup</span>
                    <span className="text-slate-400">FastAPI, Laspy, Uvicorn প্যাকেজ ইনস্টল</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                    <span className="text-amber-400 font-bold block mb-1">2. PyInstaller Build</span>
                    <span className="text-slate-400">server.py কে server.exe ফাইলে কম্পাইল</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                    <span className="text-emerald-400 font-bold block mb-1">3. Electron-Builder</span>
                    <span className="text-slate-400">Windows Installer (.exe) তৈরি ও আপলোড</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 font-bold flex items-center justify-center text-lg shrink-0">
              ২
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    GitHub রিপোজিটরিতে কোড পুশ (Push) করা
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Step 2: Commit and push your code to your GitHub Repository
                  </p>
                </div>
              </div>

              {/* Repo URL Input Helper */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs text-slate-400 font-medium whitespace-nowrap">
                  আপনার GitHub Repo URL:
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/your-username/cloudify.git"
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-cyan-300 font-mono flex-1 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Terminal Code Snippet */}
              <div className="relative">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
                  <div className="text-slate-500 select-none mb-2"># ১. আপনার প্রোজেক্ট ফোল্ডারে টার্মিনাল বা CMD খুলুন</div>
                  <div className="text-emerald-400 font-bold">git init</div>
                  <div className="text-emerald-400 font-bold">git branch -M main</div>
                  <div className="text-slate-500 select-none my-1"># ২. সব ফাইল যোগ ও কমিট করুন</div>
                  <div className="text-emerald-400 font-bold">git add .</div>
                  <div className="text-emerald-400 font-bold">git commit -m "Configure GitHub Actions EXE builder workflow"</div>
                  <div className="text-slate-500 select-none my-1"># ৩. রিমোট গিটহাব রিপোজিটরি যুক্ত করুন এবং পুশ করুন</div>
                  <div className="text-cyan-300 font-bold">git remote add origin {repoUrl}</div>
                  <div className="text-cyan-300 font-bold">git push -u origin main</div>
                </div>

                <button
                  onClick={() =>
                    copyToClipboard(
                      `git init\ngit branch -M main\ngit add .\ngit commit -m "Configure GitHub Actions EXE builder workflow"\ngit remote add origin ${repoUrl}\ngit push -u origin main`,
                      2
                    )
                  }
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 border border-slate-700 shadow transition-all"
                >
                  {copiedIndex === 2 ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">কপি হয়েছে!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>কমান্ড কপি করুন</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 3 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 font-bold flex items-center justify-center text-lg shrink-0">
              ৩
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-cyan-400" />
                  GitHub Actions ট্যাবে বিল্ড রান হওয়া দেখা
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Step 3: Watch your build progress live on GitHub Actions
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    GitHub এ আপনার রিপোজিটরিতে যান (যেমন <span className="text-cyan-300 font-mono">{repoUrl}</span>)
                  </li>
                  <li>
                    উপরে <strong className="text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Actions</strong> ট্যাবে ক্লিক করুন।
                  </li>
                  <li>
                    পুশ করার সাথে সাথেই <span className="text-amber-400 font-mono">Build Windows EXE</span> জবটি হলুদ রঙে ঘুরতে (In-progress) শুরু করবে।
                  </li>
                  <li>
                    ম্যানুয়ালি রান করতে চাইলে: বাঁদিকের মেনু থেকে <strong className="text-white">Build Windows EXE</strong> সিলেক্ট করে <span className="text-emerald-400 font-semibold">"Run workflow"</span> বাটনে ক্লিক করুন।
                  </li>
                </ol>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    ✓
                  </div>
                  <div className="text-slate-300">
                    গিটহাবের শক্তিশালী ক্লাউড সার্ভার ২ থেকে ৪ মিনিটের মধ্যে সম্পূর্ণ <code className="text-cyan-300 font-mono">server.exe</code> এবং <code className="text-cyan-300 font-mono">Cloudify Setup.exe</code> বিল্ড করে তৈরি করে ফেলবে।
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 4 */}
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 hover:border-emerald-500/50 transition-all shadow-lg bg-gradient-to-br from-slate-900 to-emerald-950/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-lg shrink-0">
              ৪
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <DownloadCloud className="w-4 h-4 text-emerald-400" />
                    রেডি .EXE ফাইল ডাউনলোড করা
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Step 4: Download your compiled Windows .exe installer directly
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold">
                  Ready to install
                </span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                <p className="leading-relaxed">
                  বিল্ড শেষ হলে (সবুজ টিকমার্ক <span className="text-emerald-400 font-bold">✓</span> আসলে):
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-white font-bold flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-blue-400" />
                      Option A: Artifacts সেকশন থেকে
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Workflow রানের পেইজের একেবারে নিচে <strong className="text-cyan-300">Artifacts</strong> হেডিং-এর নিচে <strong className="text-white">Cloudify-Windows-Installer</strong> এ ক্লিক করলেই ZIP আকারে .exe টি নামিয়ে নিতে পারবেন।
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-white font-bold flex items-center gap-1.5">
                      <DownloadCloud className="w-4 h-4 text-emerald-400" />
                      Option B: GitHub Releases (ট্যাগ দিলে)
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      আপনি <code className="text-amber-300">git tag v1.0.0</code> দিয়ে পুশ করলে রিপোজিটরির <strong>Releases</strong> পেইজে স্থায়ী ডাউনলোড লিংক তৈরি হয়ে যাবে!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
