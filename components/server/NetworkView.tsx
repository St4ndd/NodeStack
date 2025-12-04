import React, { useState } from 'react';
import { Globe, Router, Copy } from 'lucide-react';
import { ServerConfig } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';

export const NetworkView: React.FC<{ 
    server: ServerConfig, 
    onUpdateConfig: (c: ServerConfig) => void, 
    tunnelActive: boolean, 
    tunnelUrl: string | null, 
    onStartTunnel: () => void, 
    onStopTunnel: () => void 
}> = ({ server, onUpdateConfig, tunnelActive, tunnelUrl, onStartTunnel, onStopTunnel }) => {
    const [domain, setDomain] = useState(server.displayDomain || '');
    const [saving, setSaving] = useState(false);
    const { toast } = useUI();

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/update-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: server.id, path: server.path, updates: { displayDomain: domain } })
            });
            const data = await res.json();
            if (data.success) {
                onUpdateConfig(data.server);
                toast.success("Domain Updated");
            }
        } catch (e) { toast.error("Failed to update domain"); }
        setSaving(false);
    };

    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 space-y-8">
            <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Globe className="w-5 h-5 text-emerald-500"/> Direct Connection</h3>
                <div className="bg-black/40 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
                    <div>
                        <div className="text-zinc-500 text-xs uppercase font-bold tracking-wider mb-1">Server Address</div>
                        <div className="text-xl text-white font-mono select-all">
                             {server.displayDomain || `localhost:${server.port}`}
                        </div>
                    </div>
                    <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(server.displayDomain || `localhost:${server.port}`); toast.success("Copied to clipboard"); }}><Copy className="w-4 h-4" /></Button>
                </div>
                <div className="mt-4 flex gap-2">
                    <input 
                        type="text" 
                        placeholder="play.example.com" 
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white flex-1 focus:border-emerald-500 outline-none"
                        value={domain}
                        onChange={e => setDomain(e.target.value)}
                    />
                    <Button onClick={handleSave} isLoading={saving} disabled={domain === server.displayDomain}>Save Domain</Button>
                </div>
                <p className="text-zinc-500 text-xs mt-2">Set a custom domain for display purposes. You still need to configure DNS records yourself.</p>
            </div>

            <div className="border-t border-zinc-800 pt-8">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2"><Router className="w-5 h-5 text-blue-500"/> Public Tunnel</h3>
                        <p className="text-zinc-400 text-sm max-w-md">
                            Expose your local server to the internet using a temporary Pinggy tunnel. Great for testing with friends.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {tunnelActive && <div className="animate-pulse w-3 h-3 bg-emerald-500 rounded-full"></div>}
                        <Button variant={tunnelActive ? "danger" : "primary"} onClick={tunnelActive ? onStopTunnel : onStartTunnel}>
                            {tunnelActive ? "Stop Tunnel" : "Start Tunnel"}
                        </Button>
                    </div>
                </div>

                {tunnelActive && tunnelUrl && (
                    <div className="mt-6 bg-blue-900/10 border border-blue-500/30 rounded-lg p-4">
                        <div className="text-blue-200 text-sm font-bold mb-1">Tunnel Active</div>
                        <div className="text-2xl text-white font-mono select-all">{tunnelUrl.replace('tcp://', '')}</div>
                        <p className="text-blue-300/60 text-xs mt-2">Share this address with your friends to join.</p>
                    </div>
                )}
            </div>
        </div>
    );
};