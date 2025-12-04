

import React, { useEffect, useRef, useState } from 'react';
import { ServerConfig, ServerStats } from '../types';
import { ArrowLeft, Terminal, Play, Square, Circle, Settings as SettingsIcon, Users, Globe, Copy, Check, Archive, RotateCw, Skull, FileText, Package, AlertTriangle, Download, MapPin, Map as MapIcon } from 'lucide-react';
import { Button } from './Button';
import { io, Socket } from 'socket.io-client';
import { FileManager } from './FileManager';
import { useUI } from './UI';

// Sub-components
import { ConsoleView } from './server/ConsoleView';
import { ResourcesPanel } from './server/ResourcesPanel';
import { SettingsView } from './server/SettingsView';
import { NetworkView } from './server/NetworkView';
import { PlayersView } from './server/PlayersView';
import { WorldsView } from './server/WorldsView';
import { PluginsView } from './server/PluginsView';
import { CheckpointsView } from './server/CheckpointsView';
import { LiveMapView } from './server/LiveMapView';

interface ServerDetailProps {
  server: ServerConfig;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: ServerConfig['status']) => void;
  onUpdateConfig: (updatedServer: ServerConfig) => void;
}

interface StatPoint {
  cpu: number;
  memory: number;
  timestamp: number;
}

export const ServerDetail: React.FC<ServerDetailProps> = ({ server, onBack, onDelete, onUpdateConfig }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [statsHistory, setStatsHistory] = useState<StatPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'settings' | 'players' | 'worlds' | 'network' | 'files' | 'plugins' | 'checkpoints' | 'map'>('console');
  const [copied, setCopied] = useState(false);
  
  // Java Error State
  const [javaError, setJavaError] = useState<{required: number, installed: number} | null>(null);

  // Pinggy state
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const { confirm, toast } = useUI();

  // Clear stats if server stops
  useEffect(() => {
    if (server.status === 'stopped') {
      setStats(null);
      setStatsHistory([]);
    }
  }, [server.status]);

  // Initialize Socket Connection for Logs/Room events
  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      withCredentials: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-server', server.id);
    });

    socket.on('log-history', (data: { id: string, logs: string[] }) => {
       if (data.id === server.id) {
         setLogs(data.logs);
       }
    });

    socket.on('console-log', (data: { id: string, message: string }) => {
      if (data.id === server.id) {
        setLogs(prev => [...prev.slice(-400), data.message]); // Keep partial local buffer
      }
    });

    socket.on('stats-update', (data: { id: string, stats: ServerStats }) => {
       if (data.id === server.id) {
         setStats(data.stats);
         setStatsHistory(prev => {
            const now = Date.now();
            const newHistory = [...prev, { cpu: data.stats.cpu, memory: data.stats.memory, timestamp: now }];
            return newHistory.slice(-60);
         });
       }
    });

    socket.on('tunnel-status', (data: { id: string, active: boolean, url?: string }) => {
      if(data.id === server.id) {
        setTunnelActive(data.active);
        if(data.url) setTunnelUrl(data.url);
        else if (!data.active) setTunnelUrl(null);
      }
    });

    socket.on('java-error', (data: { id: string, required: number, installed: number }) => {
        if(data.id === server.id) {
            setJavaError({ required: data.required, installed: data.installed });
        }
    });

    return () => {
      socket.disconnect();
    };
  }, [server.id]);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'console') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const handleStart = () => {
    setLogs([]); 
    setJavaError(null);
    socketRef.current?.emit('start-server', server);
  };

  const handleStop = () => {
    socketRef.current?.emit('stop-server', server.id);
  };
  
  const handleRestart = () => {
    // DO NOT CLEAR LOGS HERE. 
    // We want to see the shutdown sequence.
    socketRef.current?.emit('restart-server', server);
  };

  const handleKill = async () => {
    const ok = await confirm({
       title: "Force Kill Process?",
       message: "This will immediately terminate the server process. Unsaved data will be lost.",
       confirmText: "Kill Server",
       variant: 'danger'
    });

    if(ok) {
       socketRef.current?.emit('kill-server', server.id);
       toast.warning('Process Killed', 'The server process was terminated.');
    }
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    socketRef.current?.emit('send-command', { id: server.id, command });
    setCommand('');
  };

  const startTunnel = () => {
    socketRef.current?.emit('start-tunnel', { 
        id: server.id, 
        port: server.port, 
        password: server.pinggy?.password, 
        username: server.pinggy?.username 
    });
  };

  const stopTunnel = () => {
    socketRef.current?.emit('stop-tunnel', { id: server.id });
  };

  const getStatusColor = () => {
    switch (server.status) {
      case 'running': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'starting': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-red-500 bg-red-500/10 border-red-500/20';
    }
  };

  const displayAddress = tunnelActive && tunnelUrl 
    ? tunnelUrl.replace('tcp://', '')
    : (server.displayDomain || (server.port === 25565 ? 'localhost' : `localhost:${server.port}`));

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    toast.info('Copied', 'Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col max-w-7xl mx-auto relative">
      
      {javaError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
             <div className="bg-[#18181b] border border-red-500/30 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
                <div className="flex items-start gap-4">
                   <div className="p-3 bg-red-500/10 rounded-full">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                   </div>
                   <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2">Java Version Error</h3>
                      <p className="text-zinc-300 text-sm mb-4">
                         This server requires <strong>Java {javaError.required}</strong>.
                         <br/>
                         {javaError.installed === 0 
                            ? "No Java detected." 
                            : `Found Java ${javaError.installed}.`
                         }
                      </p>
                      <div className="flex gap-3 justify-end">
                         <Button variant="secondary" onClick={() => setJavaError(null)}>Close</Button>
                         <a href={`https://adoptium.net/temurin/releases/?version=${javaError.required}`} target="_blank" rel="noreferrer" className="no-underline">
                             <Button><Download className="w-4 h-4" /> Download Java {javaError.required}</Button>
                         </a>
                      </div>
                   </div>
                </div>
             </div>
          </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {server.name}
              </h1>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md hover:border-emerald-500/50 hover:bg-zinc-800 transition-all group"
                title="Copy Server Address"
              >
                <Globe className="w-3 h-3 text-zinc-500 group-hover:text-emerald-400" />
                <span className="text-xs font-mono text-zinc-300 group-hover:text-white">{displayAddress}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-500 group-hover:text-white" />}
              </button>
            </div>
            
            <div className={`text-xs font-mono px-2 py-0.5 rounded border inline-flex items-center gap-2 mt-1 ${getStatusColor()}`}>
              <Circle className={`w-2 h-2 fill-current ${server.status === 'running' ? 'animate-pulse' : ''}`} />
              {(server.status || 'STOPPED').toUpperCase()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
           {server.status === 'running' || server.status === 'starting' ? (
             <>
               <Button variant="danger" onClick={handleStop}>
                  <Square className="w-4 h-4 fill-current" /> Stop
               </Button>
               <Button variant="secondary" onClick={handleRestart} className="hover:text-yellow-400">
                  <RotateCw className="w-4 h-4" /> Restart
               </Button>
               <Button variant="secondary" onClick={handleKill} className="hover:bg-red-900/50 text-red-400 border-red-900/50" title="Force Kill Process">
                  <Skull className="w-4 h-4" /> Kill
               </Button>
             </>
           ) : (
             <Button variant="primary" onClick={handleStart}>
                <Play className="w-4 h-4 fill-current" /> Start Server
             </Button>
           )}
           <div className="h-8 w-px bg-zinc-700 mx-2 hidden lg:block"></div>
           <Button variant="secondary" onClick={() => onDelete(server.id)} disabled={server.status === 'running' || server.status === 'starting'}>
              Delete
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-0">
        
        {/* Left Col: Menu */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
           <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden p-2 space-y-1">
              {[
                { id: 'console', icon: Terminal, label: 'Console' },
                { id: 'files', icon: FileText, label: 'File Manager' },
                ...(server.software === 'paper' ? [{ id: 'plugins', icon: Package, label: 'Plugins' }] : []),
                { id: 'map', icon: MapIcon, label: 'Live Map' },
                { id: 'settings', icon: SettingsIcon, label: 'Settings' },
                { id: 'checkpoints', icon: MapPin, label: 'Checkpoints' },
                { id: 'players', icon: Users, label: 'Players' },
                { id: 'worlds', icon: Archive, label: 'Worlds & Backups' },
                { id: 'network', icon: Globe, label: 'Network & Domain' }
              ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${activeTab === item.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                >
                   <item.icon className="w-4 h-4" /> {item.label}
                </button>
              ))}
           </div>
        </div>

        {/* Right Col: Content Area */}
        <div className="lg:col-span-3 h-full min-h-0 relative">
          {activeTab === 'console' && (
             <div className="flex flex-col xl:flex-row gap-4 h-full min-h-0">
                <div className="flex-1 h-full min-w-0">
                    <ConsoleView 
                      logs={logs} 
                      logsEndRef={logsEndRef} 
                      status={server.status} 
                      command={command} 
                      setCommand={setCommand} 
                      handleSendCommand={handleSendCommand} 
                    />
                </div>
                <div className="xl:w-80 shrink-0 h-full min-h-0">
                   <ResourcesPanel stats={stats} history={statsHistory} maxMemory={server.memory} status={server.status} />
                </div>
             </div>
          )}
          {activeTab === 'settings' && <SettingsView server={server} onUpdateConfig={onUpdateConfig} />}
          {activeTab === 'files' && <FileManager server={server} />}
          {activeTab === 'players' && <PlayersView server={server} socket={socketRef.current} />}
          {activeTab === 'worlds' && <WorldsView server={server} status={server.status} onUpdateConfig={onUpdateConfig} />}
          {activeTab === 'network' && (
             <NetworkView 
                server={server} 
                onUpdateConfig={onUpdateConfig} 
                tunnelActive={tunnelActive} 
                tunnelUrl={tunnelUrl} 
                onStartTunnel={startTunnel}
                onStopTunnel={stopTunnel}
             />
          )}
          {activeTab === 'plugins' && <PluginsView server={server} />}
          {activeTab === 'checkpoints' && <CheckpointsView server={server} socket={socketRef.current} />}
          {activeTab === 'map' && <LiveMapView server={server} />}
        </div>

      </div>
    </div>
  );
};