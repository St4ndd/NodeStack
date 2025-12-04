import React, { useState, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import { ServerConfig } from '../../types';
import { Button } from '../Button';
import { useUI } from '../UI';

const CustomCheckbox: React.FC<{ label: string, checked: boolean, onChange: (c: boolean) => void, subLabel?: string }> = ({ label, checked, onChange, subLabel }) => (
  <div 
    className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors w-full"
    onClick={() => onChange(!checked)}
  >
     <div className="mr-3">
       <span className="text-sm font-medium text-zinc-300 block">{label}</span>
       {subLabel && <span className="text-xs text-zinc-500 block mt-0.5">{subLabel}</span>}
     </div>
     <div className={`w-5 h-5 rounded border shrink-0 flex items-center justify-center transition-all ${checked ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-900 border-zinc-700'}`}>
        {checked && <Check className="w-3.5 h-3.5 text-white" />}
     </div>
  </div>
);

const NumberInput: React.FC<{ value: number, onChange: (v: number) => void, min?: number, max?: number, step?: number, label?: string }> = ({ value, onChange, min, max, step = 1, label }) => {
  const handleInc = (delta: number) => {
    const newVal = value + delta;
    if (max !== undefined && newVal > max) return;
    if (min !== undefined && newVal < min) return;
    onChange(newVal);
  };

  return (
    <div className="flex flex-col gap-1.5">
       {label && <label className="text-sm font-medium text-zinc-400">{label}</label>}
       <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden h-10">
          <button onClick={() => handleInc(-step)} className="px-3 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border-r border-zinc-800">-</button>
          <input type="number" className="w-full bg-transparent text-center text-white focus:outline-none appearance-none" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} />
          <button onClick={() => handleInc(step)} className="px-3 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border-l border-zinc-800">+</button>
       </div>
    </div>
  );
};

export const SettingsView: React.FC<{ server: ServerConfig, onUpdateConfig: (s: ServerConfig) => void }> = ({ server, onUpdateConfig }) => {
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memory, setMemory] = useState(server.memory);
  const [logLimit, setLogLimit] = useState(server.logHistoryLimit || 100);
  const { toast } = useUI();
  
  useEffect(() => {
    fetch('/api/read-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${server.path}/server.properties` })
    }).then(res => res.json()).then(data => {
      if(data.content) {
        const props: Record<string, string> = {};
        data.content.split('\n').forEach((line: string) => {
          if(!line.startsWith('#') && line.includes('=')) {
            const [key, val] = line.split('=');
            props[key.trim()] = val.trim();
          }
        });
        setProperties(props);
      }
    }).finally(() => setLoading(false));
  }, [server.path]);

  const handleChange = (key: string, value: string) => { setProperties(prev => ({ ...prev, [key]: value })); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/update-server', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: server.id, path: server.path, updates: { memory, logHistoryLimit: logLimit } })
      });
      const data = await res.json();
      if(data.success) onUpdateConfig(data.server);
      
      let content = `#Minecraft server properties\n#Edited via NodeStack\n`;
      Object.entries(properties).forEach(([key, val]) => { content += `${key}=${val}\n`; });
      await fetch('/api/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${server.path}/server.properties`, content })
      });
      toast.success('Settings Saved', 'Restart server to apply changes.');
    } catch (e) { toast.error('Failed to save settings.'); } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading...</div>;

  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#18181b]">
        <div><h2 className="text-lg font-semibold text-white">Server Settings</h2></div>
        <Button onClick={handleSave} disabled={saving} isLoading={saving}><Save className="w-4 h-4" /> Save</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-500 uppercase tracking-wider mb-2">General</h3>
              <NumberInput label="Allocated RAM (MB)" value={memory} onChange={setMemory} step={256} min={1024} />
              <NumberInput label="Server Port" value={parseInt(properties['server-port'])} onChange={v => handleChange('server-port', v.toString())} />
              <NumberInput label="Max Players" value={parseInt(properties['max-players'])} onChange={v => handleChange('max-players', v.toString())} />
              <div className="flex flex-col gap-1"><label className="text-sm font-medium text-zinc-400">MOTD</label><input type="text" className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:border-emerald-500 outline-none font-mono text-sm" value={properties['motd'] || ''} onChange={e => handleChange('motd', e.target.value)} /></div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-500 uppercase tracking-wider mb-2">Gameplay</h3>
              <div className="flex flex-col gap-1"><label className="text-sm font-medium text-zinc-400">Gamemode</label><select className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:border-emerald-500 outline-none" value={properties['gamemode'] || 'survival'} onChange={e => handleChange('gamemode', e.target.value)}><option value="survival">Survival</option><option value="creative">Creative</option><option value="adventure">Adventure</option><option value="spectator">Spectator</option></select></div>
              <div className="flex flex-col gap-1"><label className="text-sm font-medium text-zinc-400">Difficulty</label><select className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:border-emerald-500 outline-none" value={properties['difficulty'] || 'normal'} onChange={e => handleChange('difficulty', e.target.value)}><option value="peaceful">Peaceful</option><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></div>
              <div className="space-y-3 pt-2">
                 <CustomCheckbox label="Online Mode" subLabel="Verify Accounts" checked={properties['online-mode'] === 'true'} onChange={c => handleChange('online-mode', String(c))} />
                 <CustomCheckbox label="PvP Enabled" checked={properties['pvp'] === 'true'} onChange={c => handleChange('pvp', String(c))} />
              </div>
            </div>
         </div>
      </div>
    </div>
  );
};