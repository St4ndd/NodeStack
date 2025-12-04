

import React, { useEffect, useState } from 'react';
import { Map, Download, ExternalLink, AlertCircle, Box, Layers, Globe, CheckCircle, Trash2 } from 'lucide-react';
import { ServerConfig } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';

interface LiveMapViewProps {
    server: ServerConfig;
}

export const LiveMapView: React.FC<LiveMapViewProps> = ({ server }) => {
    const [mapInfo, setMapInfo] = useState<{ type: 'dynmap' | 'bluemap' | null, port: number | null, requiresConfigUpdate?: boolean, pluginFile: string | null }>({ type: null, port: null, pluginFile: null });
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [fixing, setFixing] = useState(false);
    const { toast, confirm } = useUI();

    useEffect(() => {
        fetchMapInfo();
    }, [server.path, server.status]);

    const fetchMapInfo = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/server/map-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: server.path })
            });
            if (res.ok) {
                const data = await res.json();
                setMapInfo(data);
            } else {
                console.warn("Backend returned non-OK status for map info:", res.status);
                // Graceful fallback to prevent crashes if backend sends HTML error
                setMapInfo({ type: null, port: null, pluginFile: null });
            }
        } catch (e) {
            console.error("Failed to fetch map info", e);
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async (plugin: 'dynmap' | 'bluemap') => {
        setInstalling(plugin);
        try {
            // Modrinth Project IDs
            const projectId = plugin === 'dynmap' ? 'dynmap' : 'bluemap';
            
            const res = await fetch('/api/plugins/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: server.path,
                    projectId: projectId,
                    version: server.version || 'latest'
                })
            });
            const data = await res.json();
            
            if (data.success) {
                toast.success(`${plugin === 'dynmap' ? 'Dynmap' : 'BlueMap'} Installed`, "Restart the server to generate the configuration files.");
                // Artificial delay to allow file system to settle before re-checking
                setTimeout(fetchMapInfo, 1000);
            } else {
                toast.error("Installation Failed", data.error || "Unknown error occurred");
            }
        } catch (e) {
            toast.error("Network Error", "Could not reach backend.");
        } finally {
            setInstalling(null);
        }
    };
    
    const handleUninstall = async () => {
        if (!mapInfo.pluginFile) return;
        
        const ok = await confirm({
            title: `Uninstall ${mapInfo.type === 'dynmap' ? 'Dynmap' : 'BlueMap'}?`,
            message: "This will remove the plugin jar. To switch to another map, uninstall this one first.",
            confirmText: "Uninstall & Switch",
            variant: "danger"
        });
        
        if (!ok) return;

        try {
            const res = await fetch('/api/plugins/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: server.path,
                    fileName: mapInfo.pluginFile
                })
            });
            
            if (res.ok) {
                toast.success("Plugin Uninstalled");
                fetchMapInfo();
            } else {
                toast.error("Uninstall Failed");
            }
        } catch (e) {
            toast.error("Network Error");
        }
    };

    const handleFixBlueMap = async () => {
        setFixing(true);
        try {
            const res = await fetch('/api/server/fix-bluemap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: server.path })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Config Updated", "BlueMap EULA/Download accepted. Restart server.");
                fetchMapInfo();
            } else {
                toast.error("Fix Failed", data.error);
            }
        } catch(e) {
            toast.error("Error", "Failed to update config.");
        } finally {
            setFixing(false);
        }
    };

    const getMapUrl = () => {
        if (!mapInfo.port) return '';
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:${mapInfo.port}/`;
    };

    if (loading) {
        return <div className="p-12 text-center text-zinc-500 flex flex-col items-center"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4"></div>Detecting map plugins...</div>;
    }

    // 1. BlueMap Configuration Required (EULA/Download)
    if (mapInfo.type === 'bluemap' && mapInfo.requiresConfigUpdate) {
        return (
             <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center h-full relative">
                 {mapInfo.pluginFile && (
                    <div className="absolute top-4 right-4">
                        <Button variant="danger" className="text-xs h-8" onClick={handleUninstall}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Uninstall
                        </Button>
                    </div>
                )}
                <div className="w-16 h-16 bg-blue-900/20 rounded-full flex items-center justify-center mb-6 border border-blue-500/30">
                    <AlertCircle className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Configuration Required</h3>
                <p className="text-zinc-400 max-w-sm mb-6">
                    BlueMap requires you to accept the download of external web resources to function.
                </p>
                <Button onClick={handleFixBlueMap} isLoading={fixing}>
                    <CheckCircle className="w-4 h-4 mr-2" /> Accept & Enable
                </Button>
                <p className="text-xs text-zinc-500 mt-4">
                    This will update <code>core.conf</code> to set <code>accept-download: true</code>.
                </p>
            </div>
        );
    }

    // 2. Map Installed & Server Running -> Show Iframe
    if (mapInfo.type && mapInfo.port && server.status === 'running') {
        return (
            <div className="bg-[#0f0f12] border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl">
                <div className="p-3 border-b border-zinc-800 bg-[#18181b] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${mapInfo.type === 'bluemap' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {mapInfo.type === 'bluemap' ? <Box className="w-5 h-5"/> : <Globe className="w-5 h-5"/>}
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white capitalize">{mapInfo.type} Live View</div>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                Live on Port {mapInfo.port}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                         {mapInfo.pluginFile && (
                            <Button variant="secondary" className="text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-900/20 border-red-900/30" onClick={handleUninstall}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Switch Map
                            </Button>
                        )}
                        <a href={getMapUrl()} target="_blank" rel="noreferrer">
                            <Button variant="secondary" className="text-xs h-8">
                                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open in Browser
                            </Button>
                        </a>
                    </div>
                </div>
                <div className="flex-1 bg-zinc-950 relative">
                     <iframe 
                        src={getMapUrl()} 
                        className="w-full h-full border-none" 
                        title="Live Map"
                        allowFullScreen
                     />
                </div>
            </div>
        );
    }

    // 3. Map Installed but Server Stopped -> Show Warning
    if (mapInfo.type && server.status !== 'running') {
        return (
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center h-full relative">
                {mapInfo.pluginFile && (
                    <div className="absolute top-4 right-4">
                        <Button variant="danger" className="text-xs h-8" onClick={handleUninstall}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Uninstall
                        </Button>
                    </div>
                )}
                <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="w-8 h-8 text-yellow-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Server Offline</h3>
                <p className="text-zinc-500 max-w-sm mb-6">
                    {mapInfo.type === 'dynmap' ? 'Dynmap' : 'BlueMap'} is installed, but the web server only runs when the Minecraft server is online.
                </p>
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 font-mono">
                    Plugin detected on port: <span className="text-white">{mapInfo.port || 'Unknown'}</span>
                </div>
            </div>
        );
    }

    // 4. Not Installed -> Show Install Options
    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-8 h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 text-center">
                    <div className="inline-flex p-3 bg-zinc-800/50 rounded-xl mb-4">
                        <Map className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Install a Live Map</h2>
                    <p className="text-zinc-400">Choose a visualization engine to render your world in real-time.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Dynmap Option */}
                    <div className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition-colors rounded-xl p-6 flex flex-col relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Globe className="w-32 h-32" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Dynmap</h3>
                        <p className="text-sm text-emerald-500 font-medium mb-4">Classic 2D Google Maps Style</p>
                        <p className="text-sm text-zinc-400 mb-6 flex-1">
                            The standard for Minecraft mapping. Provides a highly detailed, flat 2D view of your world similar to Google Maps. Lightweight and reliable.
                        </p>
                        <ul className="text-xs text-zinc-500 space-y-2 mb-6 font-mono">
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> 2D Top-down & Isometric views</li>
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> Live Player Markers</li>
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> Chat Integration</li>
                        </ul>
                        <Button 
                            onClick={() => handleInstall('dynmap')} 
                            isLoading={installing === 'dynmap'} 
                            disabled={!!installing}
                        >
                            <Download className="w-4 h-4 mr-2" /> Install Dynmap
                        </Button>
                    </div>

                    {/* BlueMap Option */}
                    <div className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 transition-colors rounded-xl p-6 flex flex-col relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Box className="w-32 h-32" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">BlueMap</h3>
                        <p className="text-sm text-blue-500 font-medium mb-4">Modern 3D WebGL Renderer</p>
                        <p className="text-sm text-zinc-400 mb-6 flex-1">
                            A next-generation map that renders your world in full 3D directly in the browser. Rotate, zoom, and explore your builds as if you were in-game.
                        </p>
                         <ul className="text-xs text-zinc-500 space-y-2 mb-6 font-mono">
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> Full 3D Free-cam</li>
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> Day/Night Cycle Simulation</li>
                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-400 rounded-full"/> High Performance WebGL</li>
                        </ul>
                        <Button 
                            onClick={() => handleInstall('bluemap')} 
                            isLoading={installing === 'bluemap'} 
                            disabled={!!installing}
                            className="bg-blue-600 hover:bg-blue-500 focus:ring-blue-500 shadow-blue-900/20"
                        >
                            <Download className="w-4 h-4 mr-2" /> Install BlueMap
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};