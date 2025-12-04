
import React, { useState, useEffect } from 'react';
import { X, Server, CheckCircle, Play, Loader2, Box, Layers } from 'lucide-react';
import { Button } from './Button';
import { CreateServerFormData } from '../types';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateServerFormData) => Promise<void>;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [loading, setLoading] = useState(false);
  const [fetchingVersions, setFetchingVersions] = useState(true);
  const [versions, setVersions] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [formData, setFormData] = useState<CreateServerFormData>({
    name: 'Survival World',
    software: 'paper',
    version: 'latest',
    memory: 4096,
    port: 25565,
    maxPlayers: 20,
    motd: 'Welcome to our server!',
    eula: false
  });

  useEffect(() => {
    if (isOpen) {
       fetchVersions();
    }
  }, [isOpen, formData.software]);

  const fetchVersions = async () => {
    setFetchingVersions(true);
    setVersions([]);
    try {
        const res = await fetch(`/api/minecraft/versions?software=${formData.software}`);
        const data = await res.json();
        if(data.versions && Array.isArray(data.versions)) {
            setVersions(data.versions);
            // If current version is not in list and not latest, reset to latest
            if(formData.version !== 'latest' && !data.versions.includes(formData.version)) {
                setFormData(prev => ({ ...prev, version: 'latest' }));
            }
        }
    } catch (e) {
        console.error("Failed to fetch versions", e);
    } finally {
        setFetchingVersions(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.eula) return;
    
    setLoading(true);
    setStatusMessage('Downloading server.jar (this may take a minute)...');
    try {
      await onSubmit(formData);
      onClose();
    } catch (error: any) {
      console.error(error);
      setStatusMessage('Error: ' + (error.message || 'Failed to create server'));
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#18181b] rounded-xl border border-zinc-700 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <Server className="w-6 h-6 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-white">Create New Server</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <form id="create-server-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Server Name</label>
              <input
                type="text"
                required
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>

            {/* Software Selection */}
            <div>
               <label className="block text-sm font-medium text-zinc-400 mb-2">Server Software</label>
               <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => setFormData({...formData, software: 'paper', version: 'latest'})}
                    className={`cursor-pointer rounded-lg border p-3 flex items-center gap-3 transition-all ${formData.software === 'paper' ? 'bg-emerald-900/20 border-emerald-500 ring-1 ring-emerald-500/50' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}
                  >
                     <div className="p-2 bg-zinc-800 rounded">
                        <Layers className="w-5 h-5 text-white" />
                     </div>
                     <div>
                        <div className="text-sm font-bold text-white">Paper</div>
                        <div className="text-[10px] text-zinc-500">Optimized, Plugins</div>
                     </div>
                  </div>

                  <div 
                    onClick={() => setFormData({...formData, software: 'vanilla', version: 'latest'})}
                    className={`cursor-pointer rounded-lg border p-3 flex items-center gap-3 transition-all ${formData.software === 'vanilla' ? 'bg-emerald-900/20 border-emerald-500 ring-1 ring-emerald-500/50' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}
                  >
                     <div className="p-2 bg-zinc-800 rounded">
                        <Box className="w-5 h-5 text-white" />
                     </div>
                     <div>
                        <div className="text-sm font-bold text-white">Vanilla</div>
                        <div className="text-[10px] text-zinc-500">Official Minecraft</div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Version & Port Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Version</label>
                {fetchingVersions ? (
                   <div className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-500 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                   </div>
                ) : (
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.version}
                    onChange={e => setFormData({...formData, version: e.target.value})}
                  >
                    <option value="latest" className="text-emerald-400 font-bold">Latest Release</option>
                    {versions.map(v => (
                       <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Port</label>
                <input
                  type="number"
                  required
                  min="1024"
                  max="65535"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={formData.port}
                  onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                />
              </div>
            </div>

            {/* Memory Slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-zinc-400">Allocated Memory</label>
                <span className="text-sm font-bold text-emerald-400">{formData.memory} MB</span>
              </div>
              <input
                type="range"
                min="1024"
                max="16384"
                step="1024"
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                value={formData.memory}
                onChange={e => setFormData({...formData, memory: parseInt(e.target.value)})}
              />
              <p className="text-xs text-zinc-500 mt-1">Make sure you have Java installed to run this.</p>
            </div>

            {/* Players & MOTD */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Max Players</label>
              <input
                type="number"
                min="1"
                max="1000"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.maxPlayers}
                onChange={e => setFormData({...formData, maxPlayers: parseInt(e.target.value)})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Message of the Day (MOTD)</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
                value={formData.motd}
                onChange={e => setFormData({...formData, motd: e.target.value})}
              />
            </div>

            {/* EULA */}
            <div className={`p-4 rounded-lg border cursor-pointer transition-colors ${formData.eula ? 'bg-emerald-900/20 border-emerald-800' : 'bg-zinc-900 border-zinc-700'}`}
                 onClick={() => setFormData({...formData, eula: !formData.eula})}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${formData.eula ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-500'}`}>
                  {formData.eula && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">I accept the Minecraft EULA</p>
                  <p className="text-xs text-zinc-500 mt-0.5">By checking this, you agree to the Minecraft End User License Agreement.</p>
                </div>
              </div>
            </div>

            {statusMessage && (
               <div className="p-3 bg-blue-900/20 border border-blue-900/50 rounded-lg text-blue-200 text-sm animate-pulse flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {statusMessage}
               </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-700 flex justify-end gap-3 bg-zinc-900/50 rounded-b-xl">
          <Button variant="secondary" onClick={onClose} type="button" disabled={loading}>Cancel</Button>
          <Button type="submit" form="create-server-form" isLoading={loading} disabled={!formData.eula}>
             <Play className="w-4 h-4" /> Install {formData.software === 'paper' ? 'Paper' : 'Vanilla'} Server
          </Button>
        </div>

      </div>
    </div>
  );
};
