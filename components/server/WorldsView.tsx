

import React, { useState, useEffect } from 'react';
import { Archive, Download, Save, Clock, Trash2, HardDrive, RefreshCw } from 'lucide-react';
import { ServerConfig, Backup } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';

interface ConfigToggleProps {
    label: string;
    enabled: boolean;
    interval: number;
    onChange: (enabled: boolean, interval: number) => void;
    intervals: { label: string, value: number }[];
}

const ConfigToggle: React.FC<ConfigToggleProps> = ({ label, enabled, interval, onChange, intervals }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
        <div>
             <div className="font-bold text-white text-sm mb-1">{label}</div>
             <div className="text-xs text-zinc-500">
                {enabled ? `Active - Every ${intervals.find(i => i.value === interval)?.label || interval + ' mins'}` : 'Disabled'}
             </div>
        </div>
        <div className="flex items-center gap-3">
             {enabled && (
                 <select 
                   className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none"
                   value={interval}
                   onChange={e => onChange(enabled, Number(e.target.value))}
                 >
                     {intervals.map(m => (
                         <option key={m.value} value={m.value}>{m.label}</option>
                     ))}
                 </select>
             )}
             <button 
               onClick={() => onChange(!enabled, interval)}
               className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
             >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
             </button>
        </div>
    </div>
);

export const WorldsView: React.FC<{ server: ServerConfig, status: string, onUpdateConfig: (c: ServerConfig) => void }> = ({ server, status, onUpdateConfig }) => {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const { confirm, toast } = useUI();

    const fetchBackups = async () => {
        setLoadingBackups(true);
        try {
            const res = await fetch('/api/server/backup/list', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: server.path })
            });
            const data = await res.json();
            setBackups(data.backups || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingBackups(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, [server.path]);

    const handleCreateBackup = async () => {
        setCreatingBackup(true);
        toast.info("Starting Backup", "This might take a moment...");
        try {
            const res = await fetch('/api/server/backup/create', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: server.id, path: server.path })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Backup Created");
                fetchBackups();
            } else {
                toast.error("Backup Failed", data.error);
            }
        } catch (e) {
            toast.error("Network Error");
        } finally {
            setCreatingBackup(false);
        }
    };

    const handleManualSave = async () => {
        if (status !== 'running') return toast.error("Server Offline", "Start server to save.");
        try {
            const res = await fetch('/api/server/save', {
                 method: 'POST',
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({ id: server.id })
            });
            if (res.ok) toast.success("Save Triggered");
        } catch(e) { toast.error("Failed to trigger save"); }
    };

    const handleReset = async () => {
        const ok = await confirm({
            title: "Reset World?",
            message: "This will DELETE your current world folder. Make sure you have a backup!",
            confirmText: "Reset World",
            variant: 'danger'
        });
        if(ok) {
            try {
                await fetch('/api/files/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path: server.path, subPath: 'world' })
                });
                await fetch('/api/files/delete', {
                     method: 'POST',
                     headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({ path: server.path, subPath: 'world_nether' })
                });
                await fetch('/api/files/delete', {
                     method: 'POST',
                     headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({ path: server.path, subPath: 'world_the_end' })
                });
                toast.success("World Reset", "Restart server to generate a new world.");
            } catch(e) { toast.error("Failed to reset world"); }
        }
    };

    const handleDeleteBackup = async (filename: string) => {
        if (!await confirm({ title: "Delete Backup?", message: "This cannot be undone.", variant: 'danger' })) return;
        try {
            await fetch('/api/server/backup/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: server.path, filename })
            });
            setBackups(prev => prev.filter(b => b.name !== filename));
            toast.success("Backup Deleted");
        } catch (e) { toast.error("Delete Failed"); }
    };

    const updateAutoConfig = async (type: 'autoSave' | 'autoBackup', enabled: boolean, interval: number) => {
        const updates: any = {};
        if (type === 'autoSave') updates.autoSave = { enabled, interval };
        if (type === 'autoBackup') updates.autoBackup = { enabled, interval };

        try {
             const res = await fetch('/api/update-server', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: server.id, path: server.path, updates })
            });
            const data = await res.json();
            if (data.success) {
                onUpdateConfig(data.server);
                toast.success(`${type === 'autoSave' ? 'Auto Save' : 'Auto Backup'} Updated`);
            }
        } catch(e) { toast.error("Failed to update config"); }
    };
    
    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 h-full flex flex-col gap-8 overflow-y-auto">
            
            {/* Top Actions */}
            <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Archive className="w-5 h-5 text-emerald-500"/> World Management
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                     <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-3 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-5"><Save className="w-24 h-24" /></div>
                         <div className="font-medium text-white z-10">Manual Actions</div>
                         <div className="flex gap-2 z-10">
                             <Button onClick={handleManualSave} disabled={status !== 'running'} className="flex-1">
                                 <Save className="w-4 h-4 mr-2" /> Save World
                             </Button>
                             <Button variant="danger" onClick={handleReset} disabled={status === 'running'} className="flex-1">
                                 <RefreshCw className="w-4 h-4 mr-2" /> Reset World
                             </Button>
                         </div>
                         {status === 'running' && <span className="text-[10px] text-zinc-500 z-10">Stop server to reset world.</span>}
                     </div>

                     <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-3 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-5"><Clock className="w-24 h-24" /></div>
                         <div className="font-medium text-white z-10">Automation</div>
                         <div className="grid grid-cols-1 gap-2 z-10">
                              <ConfigToggle 
                                label="Auto Save" 
                                enabled={server.autoSave?.enabled ?? true} 
                                interval={server.autoSave?.interval ?? 10}
                                onChange={(e, i) => updateAutoConfig('autoSave', e, i)}
                                intervals={[
                                    { label: '5 min', value: 5 },
                                    { label: '10 min', value: 10 },
                                    { label: '15 min', value: 15 },
                                    { label: '30 min', value: 30 },
                                    { label: '1 Hour', value: 60 }
                                ]}
                              />
                              <ConfigToggle 
                                label="Auto Backup" 
                                enabled={server.autoBackup?.enabled ?? false} 
                                interval={server.autoBackup?.interval ?? 60}
                                onChange={(e, i) => updateAutoConfig('autoBackup', e, i)}
                                intervals={[
                                    { label: '30 min', value: 30 },
                                    { label: '1 Hour', value: 60 },
                                    { label: '2 Hours', value: 120 },
                                    { label: '6 Hours', value: 360 },
                                    { label: '12 Hours', value: 720 },
                                    { label: '24 Hours', value: 1440 }
                                ]}
                              />
                         </div>
                     </div>
                </div>
            </div>
            
            {/* Backups List */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-blue-500"/> Backups
                    </h3>
                    <Button onClick={handleCreateBackup} isLoading={creatingBackup}>
                        <Download className="w-4 h-4 mr-2" /> Create Backup
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto bg-zinc-900/50 border border-zinc-800 rounded-xl">
                    {loadingBackups ? (
                        <div className="p-8 text-center text-zinc-500">Loading backups...</div>
                    ) : backups.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500 flex flex-col items-center">
                            <Archive className="w-12 h-12 mb-4 opacity-20" />
                            <p>No backups found.</p>
                            <p className="text-sm mt-1">Create one manually or enable auto-backups.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800/50">
                            {backups.map(backup => (
                                <div key={backup.name} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
                                            <Archive className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-white font-medium text-sm">{backup.name}</div>
                                            <div className="text-xs text-zinc-500 flex gap-3 mt-0.5">
                                                <span>{new Date(backup.createdAt).toLocaleString()}</span>
                                                <span>•</span>
                                                <span>{(backup.size / 1024 / 1024).toFixed(2)} MB</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <a href={`/api/files/download-zip?path=${server.path}&file=${backup.path}`} target="_blank" rel="noreferrer">
                                            <Button variant="secondary" className="text-xs h-8">
                                                <Download className="w-3.5 h-3.5 mr-1" /> Download
                                            </Button>
                                        </a>
                                        <Button variant="danger" className="text-xs h-8" onClick={() => handleDeleteBackup(backup.name)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};