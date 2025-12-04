
import React from 'react';
import { ServerConfig } from '../types';
import { Box, Folder, Globe, Users } from 'lucide-react';
import { Button } from './Button';

interface ServerListProps {
  servers: ServerConfig[];
  onSelectServer: (server: ServerConfig) => void;
  onCreateNew: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({ servers, onSelectServer, onCreateNew }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Your Servers</h2>
          <p className="text-zinc-400">Local server installations on this PC</p>
        </div>
        <Button onClick={onCreateNew}>
          + Create New
        </Button>
      </div>

      {servers.length === 0 ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <Box className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No servers installed</h3>
          <p className="text-zinc-500 max-w-sm mb-6">Create a new server configuration to download the server JAR and setup the environment on your disk.</p>
          <Button onClick={onCreateNew}>Install Server</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servers.map(server => (
            <div 
              key={server.id}
              onClick={() => onSelectServer(server)}
              className="group bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-emerald-900/5"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                     <div className={`w-3 h-3 rounded-full ${server.status === 'running' ? 'bg-emerald-500' : server.status === 'starting' ? 'bg-yellow-500' : 'bg-zinc-600'}`} />
                     {server.status === 'running' && (
                       <div className="absolute top-0 left-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                     )}
                  </div>
                  <h3 className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors">{server.name}</h3>
                </div>
                {server.displayDomain ? (
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded flex items-center gap-1 border border-emerald-900/50">
                    <Globe className="w-3 h-3" />
                    {server.displayDomain}
                  </span>
                ) : (
                   <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-1 rounded">
                     {server.port === 25565 ? 'Default Port' : `:${server.port}`}
                   </span>
                )}
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Version</span>
                  <span className="text-zinc-300 font-medium">{server.version}</span>
                </div>
                 <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Status</span>
                  <span className={`font-medium uppercase text-xs tracking-wider ${server.status === 'running' ? 'text-emerald-500' : server.status === 'starting' ? 'text-yellow-500' : 'text-zinc-500'}`}>
                    {server.status || 'STOPPED'}
                  </span>
                </div>
                {server.status === 'running' && (
                  <div className="flex justify-between text-sm pt-2 border-t border-zinc-800/50 mt-2">
                    <span className="text-zinc-500 flex items-center gap-1"><Users className="w-3 h-3"/> Players</span>
                    <span className="text-emerald-400 font-medium bg-emerald-900/20 px-1.5 rounded text-xs">
                       {server.activePlayers || 0} / {server.maxPlayers}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                 <Button variant="secondary" className="w-full text-sm h-9">
                    <Folder className="w-4 h-4" />
                    Manage Server
                 </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
