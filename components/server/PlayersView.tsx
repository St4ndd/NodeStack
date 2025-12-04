
import React, { useState, useEffect } from 'react';
import { ServerConfig, PlayerHistoryEntry } from '../../types';
import { Socket } from 'socket.io-client';
import { PlayerDetailModal } from './PlayerDetailModal';

export const PlayersView: React.FC<{ server: ServerConfig, socket: Socket | null }> = ({ server, socket }) => {
    const [history, setHistory] = useState<PlayerHistoryEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'all'|'online'>('online');
    const [selectedPlayer, setSelectedPlayer] = useState<{name: string, uuid?: string} | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchHistory = () => {
             fetch('/api/read-file', {
                 method: 'POST',
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({ path: `${server.path}/nodestack-players.json` })
             }).then(res => res.json()).then(data => {
                 if(data.content) {
                     try { setHistory(JSON.parse(data.content)); } catch(e) {}
                 }
             }).catch(() => {});
        };
        fetchHistory();
        
        // Listener for real-time history updates
        const handler = (data: { history: PlayerHistoryEntry[] }) => {
            setHistory(data.history);
        };
        socket?.on('player-history-update', handler);
        return () => { socket?.off('player-history-update', handler); }
    }, [server.path, socket]);

    const onlinePlayers = history.filter(p => p.isOnline);
    const displayList = activeTab === 'online' ? onlinePlayers : history;

    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-zinc-800 bg-[#18181b] flex gap-4">
                 <button onClick={() => setActiveTab('online')} className={`pb-2 text-sm font-medium transition-colors ${activeTab === 'online' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-400 hover:text-white'}`}>Online ({onlinePlayers.length})</button>
                 <button onClick={() => setActiveTab('all')} className={`pb-2 text-sm font-medium transition-colors ${activeTab === 'all' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-400 hover:text-white'}`}>History ({history.length})</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
                {displayList.length === 0 && <div className="text-zinc-500 text-center py-10 italic">No players found.</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {displayList.map(player => (
                        <div key={player.name} onClick={() => { setSelectedPlayer(player); setIsModalOpen(true); }} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-zinc-800 transition-colors">
                            <img src={`https://mc-heads.net/avatar/${player.name}`} alt={player.name} className="w-8 h-8 rounded bg-zinc-950" />
                            <div>
                                <div className="font-bold text-white text-sm">{player.name}</div>
                                <div className="text-xs text-zinc-500">
                                    {player.isOnline ? <span className="text-emerald-500">Online</span> : `Seen: ${new Date(player.lastSeen).toLocaleDateString()}`}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedPlayer && (
                <PlayerDetailModal 
                    player={selectedPlayer}
                    server={server}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    status={history.find(p => p.name === selectedPlayer.name)?.isOnline ? 'online' : 'offline'}
                    lastSeen={history.find(p => p.name === selectedPlayer.name)?.lastSeen}
                    firstJoined={history.find(p => p.name === selectedPlayer.name)?.firstJoined}
                    ip={history.find(p => p.name === selectedPlayer.name)?.lastIp}
                    socket={socket}
                    allPlayers={history}
                />
            )}
        </div>
    );
};