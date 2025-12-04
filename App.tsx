

import React, { useState, useEffect, useRef } from 'react';
import { CreateServerModal } from './components/CreateServerModal';
import { ServerList } from './components/ServerList';
import { ServerDetail } from './components/ServerDetail';
import { CreateServerFormData, ServerConfig } from './types';
import { WifiOff, LogOut } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { UIProvider, useUI } from './components/UI';
import { AuthScreen } from './components/AuthScreen';

const AppContent: React.FC = () => {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  
  const { toast, confirm } = useUI();

  // Derive the selected server object from the main list.
  const selectedServer = servers.find(s => s.id === selectedServerId) || null;

  // Global Socket for Status Updates
  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = socket;
    
    socket.on('status-change', (data: { id: string, status: ServerConfig['status'] }) => {
       setServers(prevServers => prevServers.map(s => {
          if (s.id === data.id) {
             const count = data.status === 'stopped' ? 0 : s.activePlayers;
             return { ...s, status: data.status, activePlayers: count };
          }
          return s;
       }));
    });

    socket.on('player-count', (data: { id: string, count: number }) => {
       setServers(prevServers => prevServers.map(s => {
          if (s.id === data.id) {
             return { ...s, activePlayers: data.count };
          }
          return s;
       }));
    });

    socket.on('connect_error', (err) => {
        if (err.message === 'Authentication error') {
             // Let the main auth check handle redirection if needed, or just warn
             console.error("Socket Auth Failed");
        }
    });

    return () => { socket.disconnect(); };
  }, []);

  const fetchServers = async () => {
    try {
      const res = await fetch('/api/servers');
      if (res.ok) {
        const data = await res.json();
        setServers(data);
      } else {
        if(res.status === 401) {
             window.location.reload(); // Force re-auth check
             return;
        }
        setBackendStatus(false);
      }
    } catch (e) {
      console.error("Failed to fetch servers", e);
      setBackendStatus(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleBackToDashboard = () => {
    setSelectedServerId(null);
    if (socketRef.current) {
       socketRef.current.emit('request-status-refresh');
    }
    fetchServers();
  };

  const handleCreateServer = async (data: CreateServerFormData) => {
    try {
      const response = await fetch('/api/create-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Backend failed to create server.');

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      const newServer: ServerConfig = result.server || {
        id: result.id,
        name: data.name,
        version: data.version,
        memory: data.memory,
        port: data.port,
        maxPlayers: data.maxPlayers,
        motd: data.motd,
        eulaAccepted: data.eula,
        status: 'ready',
        createdAt: Date.now(),
        path: result.path
      };

      setServers(prev => [newServer, ...prev]);
      toast.success('Server Created', `${newServer.name} is ready to play!`);
    } catch (error: any) {
      toast.error('Creation Failed', error.message || "Could not connect to backend.");
      throw error;
    }
  };

  const handleDeleteServer = async (id: string) => {
    const serverToDelete = servers.find(s => s.id === id);
    if (!serverToDelete) return;

    const confirmed = await confirm({
      title: `Delete ${serverToDelete.name}?`,
      message: "This action cannot be undone. All files, worlds, and settings will be permanently lost.",
      confirmText: "Yes, Delete Server",
      variant: 'danger'
    });

    if(confirmed) {
      try {
        const res = await fetch('/api/delete-server', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ path: serverToDelete.path })
        });
        
        if (res.ok) {
          setServers(prev => prev.filter(s => s.id !== id));
          if (selectedServerId === id) setSelectedServerId(null);
          toast.success("Server Deleted");
        } else {
          const err = await res.json();
          toast.error('Failed to delete', err.error);
        }
      } catch (e) {
        toast.error('Connection Error', 'Could not reach backend.');
      }
    }
  };
  
  const handleUpdateConfig = (updatedServer: ServerConfig) => {
    setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
  };

  const handleLogout = async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#0f0f12] text-zinc-100 font-sans selection:bg-emerald-500/30">
      
      <nav className="h-16 border-b border-zinc-800 bg-[#18181b]/50 backdrop-blur fixed w-full top-0 z-40">
        <div className="container mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
             <img 
               src="/favicon.png" 
               alt="NS" 
               className="w-8 h-8 rounded-lg object-contain bg-transparent" 
               onError={(e) => { e.currentTarget.src = 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/box.svg'; }} 
             />
             <span className="font-bold text-lg tracking-tight">NodeStack</span>
          </div>
          <div className="flex items-center gap-4">
             {!backendStatus && (
               <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-900/20 px-3 py-1.5 rounded border border-red-900/50">
                  <WifiOff className="w-3 h-3" />
                  Backend Offline? Run "node server.js"
               </div>
             )}
             <div className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded hidden md:block border border-zinc-800">
                v1.2.6 • Secure Mode
             </div>
             <button onClick={handleLogout} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors" title="Logout">
                 <LogOut className="w-5 h-5" />
             </button>
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-blue-500 shadow-inner" />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-24 pb-12">
        {selectedServer ? (
          <ServerDetail 
            server={selectedServer} 
            onBack={handleBackToDashboard}
            onDelete={handleDeleteServer}
            onUpdateStatus={() => {}} 
            onUpdateConfig={handleUpdateConfig}
          />
        ) : (
          isLoading ? (
             <div className="flex items-center justify-center h-64 text-zinc-500">
                <div className="animate-spin mr-3 h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                Loading servers...
             </div>
          ) : (
            <ServerList 
              servers={servers} 
              onSelectServer={(s) => setSelectedServerId(s.id)}
              onCreateNew={() => setIsModalOpen(true)}
            />
          )
        )}
      </main>

      <CreateServerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateServer} 
      />
    </div>
  );
};

const App: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<'loading' | 'setup' | 'login' | 'authenticated'>('loading');

  const checkAuth = async () => {
      try {
          const res = await fetch('/api/auth/status');
          if (res.ok) {
              const data = await res.json();
              if (data.authenticated) setAuthStatus('authenticated');
              else if (data.setupRequired) setAuthStatus('setup');
              else setAuthStatus('login');
          } else {
              // Network error or backend down
              setAuthStatus('loading'); 
          }
      } catch(e) {
          console.error(e);
      }
  };

  useEffect(() => {
      checkAuth();
  }, []);

  if (authStatus === 'loading') {
      return (
          <div className="min-h-screen bg-[#0f0f12] flex items-center justify-center text-zinc-500">
              <div className="animate-spin mr-3 h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
              Starting NodeStack...
          </div>
      );
  }

  if (authStatus === 'setup' || authStatus === 'login') {
      return <AuthScreen mode={authStatus} onSuccess={() => setAuthStatus('authenticated')} />;
  }

  return (
    <UIProvider>
      <AppContent />
    </UIProvider>
  );
};

export default App;
