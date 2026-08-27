import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Terminal, HelpCircle, FileWarning } from 'lucide-react';

interface FaqItem {
  id: string;
  title: string;
  titleBn: string;
  cause: string;
  solution: string;
  code?: string;
}

const faqs: FaqItem[] = [
  {
    id: 'codesign',
    title: 'Code Signing Certificate Error (winCodeSign)',
    titleBn: 'উইন্ডোজ কোড সাইনিং এরর (Code signing skipped)',
    cause: 'GitHub Actions রানারে ডিজিটাল সার্টিফিকেট না থাকলে electron-builder কোড সাইন করতে গিয়ে ফেইল করতে পারে।',
    solution: 'package.json এর win ব্লকে "forceCodeSigning": false দিন এবং sign.js যুক্ত করে bypass করুন। আমাদের workflow ফাইলে CSC_IDENTITY_AUTO_DISCOVERY: false অলরেডি কনফিগার করা আছে।',
    code: `// package.json -> "win"
"forceCodeSigning": false,
"signExecutable": false,
"signAndEditExecutable": false`,
  },
  {
    id: 'pyinstaller_missing_modules',
    title: 'PyInstaller ModuleNotFoundError on server.exe startup',
    titleBn: 'PyInstaller মডিউল মিসিং এরর (laspy, uvicorn, e57)',
    cause: 'PyInstaller কিছু ডাইনামিক লাইব্রেরি (যেমন uvicorn, laspy lazrs) স্বয়ংক্রিয়ভাবে খুঁজে পায় না।',
    solution: 'build-exe.yml এর pyinstaller কমান্ডে --hidden-import ফ্ল্যাগগুলো যথাযথভাবে দেওয়া আছে।',
    code: `pyinstaller \\
  --onedir \\
  --name server \\
  --hidden-import=laspy \\
  --hidden-import=uvicorn \\
  --hidden-import=fastapi \\
  backend/server.py`,
  },
  {
    id: 'backend_dist_not_found',
    title: 'electron-builder: "backend_dist/server/ does not exist"',
    titleBn: 'ইলেকট্রন বিল্ডার backend ফোল্ডার খুঁজে পাচ্ছে না',
    cause: 'PyInstaller কম্পাইল করার আগেই যদি npm run build চালানো হয়, তাহলে backend_dist মিসিং দেখাবে।',
    solution: 'GitHub Actions এ অবশ্যই প্রথমে Python PyInstaller বিল্ড স্টেপ রান হবে, তারপর npm run build চলবে। আমাদের তৈরি করা workflow এই ক্রমানুসার নিশ্চিত করে।',
  },
  {
    id: 'download_size_large',
    title: 'GitHub Artifacts Download Expired / Large File Size',
    titleBn: 'আর্টিফ্যাক্ট ডাউনলোড লিংক পাওয়া এবং মেয়াদ',
    cause: 'GitHub Actions ফ্রি একাউন্টে তৈরি হওয়া .exe ফাইল ৩০ দিন পর্যন্ত ক্লাউডে সংরক্ষিত থাকে।',
    solution: 'স্থায়ীভাবে আনলিমিটেড সময় সংরক্ষণের জন্য গিট ট্যাগ দিয়ে রিলিজ পাবলিশ করুন (git tag v1.0.0 && git push origin v1.0.0)। এতে GitHub Releases পেইজে সবসময় .exe পাওয়া যাবে।',
    code: `git tag v1.0.0
git push origin v1.0.0`,
  },
  {
    id: 'max_memory_v8',
    title: 'JavaScript heap out of memory during point cloud rendering',
    titleBn: 'বড় পয়েন্ট ক্লাউড ফাইল লোড করার মেমোরি লিমিট',
    cause: 'ডিফল্ট Electron ইনস্ট্যান্সে V8 মেমোরি লিমিট ১.৪ GB থাকে।',
    solution: 'main.js ফাইলের শুরুতে --max-old-space-size=4096 ফ্ল্যাগ যোগ করুন (৪ GB মেমোরি বরাদ্দ)।',
    code: `// main.js top level:
const { app } = require('electron');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');`,
  },
];

export const TroubleshootGuide: React.FC = () => {
  const [openId, setOpenId] = useState<string>('codesign');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          সাধারণ সমস্যা ও সমাধান (Troubleshooting & FAQs)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          GitHub Actions এবং Electron + PyInstaller দিয়ে উইন্ডোজ .exe বিল্ড করার সময় যে সাধারণ সমস্যাগুলো হতে পারে এবং তার সমাধান।
        </p>
      </div>

      {/* Accordion FAQ list */}
      <div className="space-y-3">
        {faqs.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden transition-all shadow-sm"
            >
              <button
                onClick={() => setOpenId(isOpen ? '' : faq.id)}
                className="w-full text-left p-4.5 flex items-center justify-between gap-4 hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                    !
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {faq.titleBn}
                    </h3>
                    <p className="text-xs text-slate-400">{faq.title}</p>
                  </div>
                </div>

                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-800/80 space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      কারণ (Cause):
                    </span>
                    <p className="text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      {faq.cause}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">
                      সমাধান (Solution):
                    </span>
                    <p className="text-slate-200 leading-relaxed bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded-lg">
                      {faq.solution}
                    </p>
                  </div>

                  {faq.code && (
                    <div className="space-y-1">
                      <span className="text-cyan-400 font-semibold uppercase tracking-wider text-[10px]">
                        কোড স্নিপেট:
                      </span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                        {faq.code}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
