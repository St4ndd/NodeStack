import React from 'react';
import { Send } from 'lucide-react';

interface ConsoleViewProps {
  logs: string[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  status: string;
  command: string;
  setCommand: (cmd: string) => void;
  handleSendCommand: (e: React.FormEvent) => void;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({ logs, logsEndRef, status, command, setCommand, handleSendCommand }) => {
  return (
    <div className="flex flex-col h-full bg-[#0f0f12] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-400">terminal</span>
        <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div><div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
          {logs.map((log, i) => (
            <div key={i} className="break-words whitespace-pre-wrap"><span className={log.includes('[ERR]') ? 'text-red-400' : 'text-emerald-500/90'}>{log}</span></div>
          ))}
          <div ref={logsEndRef} />
      </div>
      <div className="p-2 bg-zinc-900 border-t border-zinc-800">
        <form onSubmit={handleSendCommand} className="flex gap-2">
          <span className="text-emerald-500 font-mono py-2 pl-2">{'>'}</span>
          <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={status === 'running' ? "Type a command..." : "Server offline"} disabled={status !== 'running'} className="flex-1 bg-transparent text-white font-mono text-sm focus:outline-none py-2 placeholder-zinc-600 disabled:cursor-not-allowed" />
          <button type="submit" disabled={status !== 'running' || !command.trim()} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 rounded-lg transition-colors disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </div>
  );
};