"use client";

import { useLanguage } from '../hooks/useLanguage';
import { Globe2 } from 'lucide-react';

export default function LanguageModal() {
  const { language, setLanguage } = useLanguage();

  if (language !== null) return null;

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/95 backdrop-blur-xl w-full max-w-sm mx-auto rounded-[32px] p-8 shadow-2xl border border-white flex flex-col items-center text-center animate-in zoom-in-95 duration-300 relative">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
          <Globe2 className="h-8 w-8 text-blue-600" />
        </div>
        
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Select Language</h2>
        <p className="text-[14px] font-medium text-slate-600 mb-8 leading-relaxed">
          කරුණාකර ඔබගේ භාෂාව තෝරන්න
        </p>

        <div className="flex flex-col gap-4 w-full">
          <button 
            onClick={() => setLanguage('si')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-[18px] font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
          >
            සිංහල 
          </button>
          <button 
            onClick={() => setLanguage('en')}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl text-[16px] font-black uppercase tracking-wider transition-all active:scale-[0.98]"
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
