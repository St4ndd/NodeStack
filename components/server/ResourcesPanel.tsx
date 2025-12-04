import React from 'react';
import { Activity, Cpu, HardDrive } from 'lucide-react';
import { ServerStats } from '../../types';

interface StatPoint {
  cpu: number;
  memory: number;
  timestamp: number;
}

// Simple SVG Line Graph
const ResourceGraph: React.FC<{ data: number[], max?: number, color: string, height?: number }> = ({ data, max = 100, color, height = 50 }) => {
   if (data.length < 2) return <div className={`h-[${height}px] w-full bg-zinc-900/50 rounded`} />;
   const width = 100;
   const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const normalized = Math.min(val, max) / max;
      const y = height - (normalized * height); 
      return `${x},${y}`;
   }).join(' ');
   const polygonPoints = `0,${height} ${points} 100,${height}`;
   const colors: any = { emerald: { stroke: '#10b981', fill: '#064e3b' }, blue: { stroke: '#3b82f6', fill: '#1e3a8a' }, zinc: { stroke: '#71717a', fill: '#27272a' } };
   const c = colors[color] || colors.zinc;
   return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
         <defs>
            <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" stopColor={c.stroke} stopOpacity={0.2} />
               <stop offset="100%" stopColor={c.stroke} stopOpacity={0} />
            </linearGradient>
         </defs>
         <path d={polygonPoints} fill={`url(#grad-${color})`} stroke="none" />
         <polyline points={points} fill="none" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
   );
};

export const ResourcesPanel: React.FC<{ stats: ServerStats | null, history: StatPoint[], maxMemory: number, status: string }> = ({ stats, history, maxMemory, status }) => {
  const isRunning = status === 'running';
  const cpuVal = isRunning && stats ? stats.cpu : 0;
  const memValMB = isRunning && stats ? stats.memory / 1024 / 1024 : 0;
  const memPercent = Math.min((memValMB / maxMemory) * 100, 100);
  const cpuHistory = history.map(h => h.cpu);
  const memHistory = history.map(h => h.memory / 1024 / 1024);

  return (
    <div className="bg-[#0f0f12] border border-zinc-800 rounded-xl p-5 h-full overflow-y-auto space-y-6 flex flex-col">
       <div>
         <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1"><Activity className="w-4 h-4 text-emerald-500" /> System Resources</h3>
       </div>
       <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2 relative z-10">
             <div className="flex items-center gap-2"><div className="p-1.5 rounded bg-blue-500/10 text-blue-500"><Cpu className="w-4 h-4" /></div><span className="text-sm font-medium text-zinc-300">CPU</span></div>
             <span className="text-lg font-bold text-white font-mono">{cpuVal.toFixed(1)}%</span>
          </div>
          <div className="h-16 w-full mt-2"><ResourceGraph data={cpuHistory} max={100} color="blue" height={64} /></div>
       </div>
       <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2 relative z-10">
             <div className="flex items-center gap-2"><div className="p-1.5 rounded bg-emerald-500/10 text-emerald-500"><HardDrive className="w-4 h-4" /></div><span className="text-sm font-medium text-zinc-300">RAM</span></div>
             <span className="text-lg font-bold text-white font-mono">{(memValMB / 1024).toFixed(2)} GB</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-3">
             <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${memPercent}%` }}></div>
          </div>
          <div className="h-12 w-full mt-2 opacity-75"><ResourceGraph data={memHistory} max={maxMemory} color="emerald" height={48} /></div>
       </div>
    </div>
  );
};