import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Search, DownloadCloud, Check, Trash2 } from 'lucide-react';
import { ServerConfig, ModrinthProject } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';

export const PluginsView: React.FC<{ server: ServerConfig }> = ({ server }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchVersion, setSearchVersion] = useState(server.version || '1.20.4');
    const [results, setResults] = useState<ModrinthProject[]>([]);
    const [installed, setInstalled] = useState<{name: string}[]>([]);
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<'browse' | 'installed'>('browse');
    const [errorMsg, setErrorMsg] = useState('');
    const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());

    const { toast, confirm } = useUI();

    useEffect(() => {
        fetchInstalled();
    }, [server.path]);

    useEffect(() => {
        if (server.version && server.version !== 'latest') {
            setSearchVersion(server.version);
        }
    }, [server.version]);

    const fetchInstalled = () => {
        setErrorMsg('');
        fetch('/api/plugins/installed', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ path: server.path })
        })
        .then(async res => {
            if(!res.ok) throw new Error("Failed to fetch plugins");
            const data = await res.json();
            setInstalled(data.plugins || []);
        })
        .catch(e => {
            console.error(e);
            setErrorMsg("Could not connect to backend.");
        });
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');
        setResults([]);
        
        try {
            const res = await fetch('/api/plugins/search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ query: searchTerm, version: searchVersion })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || "Search failed");
            setResults(data.hits || []);
        } catch(err: any) {
            console.error(err);
            setErrorMsg(err.message || "Search failed. Backend error.");
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async (project: ModrinthProject) => {
        setInstalling(project.project_id);
        try {
            const res = await fetch('/api/plugins/install', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    path: server.path, 
                    projectId: project.project_id, 
                    version: searchVersion 
                })
            });
            const data = await res.json();
            if(data.success) {
                toast.success('Installed', `Added ${data.fileName}`);
                setJustInstalled(prev => new Set(prev).add(project.project_id));
                fetchInstalled();
            } else {
                toast.error('Install Failed', data.error);
            }
        } catch(err) {
            toast.error('Install Failed', 'Network or backend error.');
        } finally {
            setInstalling(null);
        }
    };

    const handleDelete = async (fileName: string) => {
        const ok = await confirm({
            title: "Uninstall Plugin",
            message: `Are you sure you want to remove ${fileName}?`,
            confirmText: "Uninstall",
            variant: "danger"
        });
        if(!ok) return;

        try {
            await fetch('/api/plugins/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: server.path, fileName })
            });
            fetchInstalled();
            toast.success('Plugin Removed');
        } catch(e) { toast.error("Delete failed"); }
    };

    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-zinc-800 bg-[#18181b] flex items-center justify-between">
                <div className="flex gap-4">
                    <button onClick={() => setActiveView('browse')} className={`pb-2 text-sm font-medium transition-colors ${activeView === 'browse' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-400 hover:text-white'}`}>Browse Plugins</button>
                    <button onClick={() => setActiveView('installed')} className={`pb-2 text-sm font-medium transition-colors ${activeView === 'installed' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-400 hover:text-white'}`}>Installed ({installed.length})</button>
                </div>
                <div className="text-xs text-zinc-500 flex items-center gap-1">
                    Powered by <a href="https://modrinth.com" target="_blank" className="text-emerald-500 hover:underline">Modrinth</a>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {errorMsg && (
                    <div className="bg-red-900/10 border border-red-900/30 text-red-200 p-4 rounded-lg mb-4 text-sm text-center">
                        <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-red-400" />
                        {errorMsg}
                    </div>
                )}
                {activeView === 'browse' ? (
                    <div className="space-y-6">
                        <form onSubmit={handleSearch} className="flex gap-2 items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input 
                                    type="text" 
                                    placeholder="Search plugins (e.g. WorldEdit)..."
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-white focus:border-emerald-500 outline-none"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                             <input 
                                type="text" 
                                title="Target Minecraft Version"
                                placeholder="Version"
                                className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none text-center"
                                value={searchVersion}
                                onChange={e => setSearchVersion(e.target.value)}
                            />
                            <Button type="submit" isLoading={loading}>Search</Button>
                        </form>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {results.map(p => {
                                const isJustInstalled = justInstalled.has(p.project_id);
                                return (
                                <div key={p.project_id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 hover:border-zinc-600 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <img src={p.icon_url || 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package.svg'} alt={p.title} className="w-12 h-12 rounded-lg bg-zinc-800 object-contain p-1" />
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-white truncate">{p.title}</h3>
                                            <div className="text-xs text-zinc-500">by {p.author}</div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-zinc-400 line-clamp-2 h-8">{p.description}</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-xs text-zinc-500 flex items-center gap-1"><DownloadCloud className="w-3 h-3"/> {p.downloads}</span>
                                        {isJustInstalled ? (
                                             <Button variant="secondary" className="text-xs h-7 px-3 bg-emerald-900/30 border-emerald-500/30 text-emerald-400" disabled>
                                                <Check className="w-3 h-3" /> Installed
                                             </Button>
                                        ) : (
                                            <Button variant="secondary" className="text-xs h-7 px-3" onClick={() => handleInstall(p)} isLoading={installing === p.project_id}>Install</Button>
                                        )}
                                    </div>
                                </div>
                            )})}
                        </div>
                        {!loading && results.length === 0 && !errorMsg && <div className="text-center text-zinc-500 py-10">Search for plugins to get started.</div>}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {installed.length === 0 && <div className="text-zinc-500 italic text-center py-10">No plugins installed.</div>}
                        {installed.map(pl => (
                            <div key={pl.name} className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded"><Package className="w-5 h-5" /></div>
                                    <span className="text-sm font-medium text-white">{pl.name}</span>
                                </div>
                                <Button variant="danger" className="text-xs h-8" onClick={() => handleDelete(pl.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};