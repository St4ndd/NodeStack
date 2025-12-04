
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Search, Globe, Calendar, Hash } from 'lucide-react';
import { ServerConfig, Waypoint } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';
import { Socket } from 'socket.io-client';

export const CheckpointsView: React.FC<{ server: ServerConfig, socket: Socket | null }> = ({ server, socket }) => {
    const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
    const [adding, setAdding] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({ name: 'Spawn', x: 0, y: 70, z: 0, dimension: 'minecraft:overworld' });
    
    const { toast, confirm } = useUI();

    useEffect(() => {
        fetchWaypoints();
    }, [server.path]);

    const fetchWaypoints = async () => {
        try {
            const res = await fetch('/api/server/waypoints', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: server.path, action: 'list' })
            });
            const data = await res.json();
            setWaypoints(data.waypoints || []);
        } catch(e) { console.error(e); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newWaypoint: Waypoint = {
                id: Math.random().toString(36).substr(2, 9),
                createdAt: Date.now(),
                ...formData
            };
            const res = await fetch('/api/server/waypoints', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    path: server.path, 
                    action: 'add',
                    waypoint: newWaypoint
                })
            });
            const data = await res.json();
            if(data.success) {
                setWaypoints(data.waypoints);
                setAdding(false);
                toast.success("Checkpoint Added");
                setFormData({ name: '', x: 0, y: 70, z: 0, dimension: 'minecraft:overworld' });
            }
        } catch(e) { toast.error("Failed to add checkpoint"); }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(!await confirm({ title: "Delete Checkpoint?", message: "This cannot be undone.", variant: 'danger' })) return;
        try {
             const res = await fetch('/api/server/waypoints', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: server.path, action: 'delete', waypointId: id })
            });
            const data = await res.json();
            if(data.success) setWaypoints(data.waypoints);
        } catch(e) { toast.error("Failed to delete"); }
    };

    const filteredWaypoints = waypoints.filter(wp => wp.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-zinc-800 bg-[#18181b] flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-emerald-500" /> Server Checkpoints
                    </h2>
                    <p className="text-zinc-400 text-sm mt-1">Manage important locations for teleportation.</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                         <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                         <input 
                             type="text" 
                             className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                             placeholder="Search checkpoints..."
                             value={searchTerm}
                             onChange={e => setSearchTerm(e.target.value)}
                         />
                    </div>
                    <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add New</Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {adding && (
                    <div className="mb-6 bg-zinc-900/50 border border-emerald-500/30 rounded-xl p-6 animate-fade-in">
                        <h3 className="font-bold text-white mb-4">New Checkpoint</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-zinc-500 block mb-1">Name</label>
                                    <input required type="text" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none" placeholder="Spawn" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 block mb-1">Dimension</label>
                                    <select 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        value={formData.dimension}
                                        onChange={e => setFormData({...formData, dimension: e.target.value})}
                                    >
                                        <option value="minecraft:overworld">Overworld</option>
                                        <option value="minecraft:the_nether">Nether</option>
                                        <option value="minecraft:the_end">The End</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div><label className="text-xs text-zinc-500 block mb-1">X</label><input required type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm outline-none" value={formData.x} onChange={e=>setFormData({...formData, x: Number(e.target.value)})} /></div>
                                <div><label className="text-xs text-zinc-500 block mb-1">Y</label><input required type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm outline-none" value={formData.y} onChange={e=>setFormData({...formData, y: Number(e.target.value)})} /></div>
                                <div><label className="text-xs text-zinc-500 block mb-1">Z</label><input required type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm outline-none" value={formData.z} onChange={e=>setFormData({...formData, z: Number(e.target.value)})} /></div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
                                <Button type="submit">Save Checkpoint</Button>
                            </div>
                        </form>
                    </div>
                )}

                {filteredWaypoints.length === 0 ? (
                    <div className="text-zinc-500 text-center py-12 italic border border-dashed border-zinc-800 rounded-xl">
                        No checkpoints found. Add one to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredWaypoints.map(wp => (
                            <div key={wp.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all group relative">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-lg ${
                                            wp.dimension.includes('nether') ? 'bg-red-500/10 text-red-500' : 
                                            wp.dimension.includes('end') ? 'bg-purple-500/10 text-purple-500' : 
                                            'bg-emerald-500/10 text-emerald-500'
                                        }`}>
                                            <Globe className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm">{wp.name}</div>
                                            <div className="text-xs text-zinc-500 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(wp.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleDelete(wp.id, e)} 
                                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-900/10 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-zinc-300 flex justify-between items-center border border-zinc-800/50">
                                    <div className="flex gap-4">
                                        <span>X: <span className="text-white">{wp.x}</span></span>
                                        <span>Y: <span className="text-white">{wp.y}</span></span>
                                        <span>Z: <span className="text-white">{wp.z}</span></span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
