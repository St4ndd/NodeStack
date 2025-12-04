

import React, { useState, useEffect, useRef } from 'react';
import { X, Shield, AlertTriangle, MapPin, Box, Shirt, Zap, Activity, Heart, Beef, Star, Skull, Move, Lock, Anchor, Check, Gamepad2, Trash2, Hash, Ban, DoorOpen, Compass, Navigation, Plus } from 'lucide-react';
import { Button } from '../Button';
import { ServerConfig, PlayerEntry, PlayerData, InventoryItem, PlayerHistoryEntry, Waypoint } from '../../types';
import { useUI } from '../UI';
import { Socket } from 'socket.io-client';

// Helper for durability bars
const getDurabilityColor = (damage: number, max: number) => {
    const pct = 1 - (damage / max);
    if (pct > 0.5) return 'bg-emerald-500';
    if (pct > 0.2) return 'bg-yellow-500';
    return 'bg-red-500';
};

// --- Item Component ---
interface ItemBoxProps {
    item?: InventoryItem;
    label?: string;
    isOffhand?: boolean;
    assetVersion?: string;
    onContextMenu?: (e: React.MouseEvent, item: InventoryItem) => void;
}

const ItemBox: React.FC<ItemBoxProps> = ({ item, label, isOffhand, assetVersion = '1.21.1', onContextMenu }) => {
    const [imgSrc, setImgSrc] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    // Reset state when item changes
    useEffect(() => {
        if (item) {
            const cleanId = item.id.replace('minecraft:', '');
            // Always try 'item' folder first
            setImgSrc(`https://assets.mcasset.cloud/${assetVersion}/assets/minecraft/textures/item/${cleanId}.png`);
            setHasError(false);
        } else {
            setImgSrc(null);
        }
    }, [item?.id, assetVersion]);

    const handleError = () => {
        if (!imgSrc) return;

        // If we failed to load from 'item/' folder, try 'block/' folder
        if (imgSrc.includes('/textures/item/')) {
            const cleanId = item!.id.replace('minecraft:', '');
            setImgSrc(`https://assets.mcasset.cloud/${assetVersion}/assets/minecraft/textures/block/${cleanId}.png`);
        } else {
            setHasError(true);
        }
    };

    const getMaxDamage = (id: string) => {
        if(id.includes('diamond')) return 1561;
        if(id.includes('iron')) return 250;
        if(id.includes('gold')) return 32;
        if(id.includes('stone')) return 131;
        if(id.includes('wood')) return 59;
        if(id.includes('netherite')) return 2031;
        return 100; // Default
    };

    const damage = item?.tag?.Damage;
    const maxDamage = item ? getMaxDamage(item.id) : 100;
    const durPct = damage !== undefined ? Math.max(0, 100 * (1 - (damage / maxDamage))) : null;
    const isEnchanted = item?.tag?.Enchantments && item.tag.Enchantments.length > 0;

    return (
        <div 
            onContextMenu={(e) => {
                if (item && onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, item);
                }
            }}
            className={`
            relative group flex flex-col items-center justify-center 
            w-12 h-12 shrink-0 rounded-lg transition-all
            bg-zinc-900 border border-zinc-800
            hover:bg-zinc-800 hover:border-zinc-600
            ${isOffhand ? 'border-dashed opacity-50' : ''}
            ${item ? 'cursor-context-menu' : ''}
        `} title={item ? item.id : label}>
            
            {label && !item && <span className="text-[9px] text-zinc-700 uppercase font-bold select-none">{label}</span>}
            
            {item ? (
                <>
                    {!hasError && imgSrc ? (
                        <div className="relative w-8 h-8">
                             {/* Actual Item Image */}
                            <img 
                                src={imgSrc} 
                                onError={handleError}
                                alt={item.id} 
                                crossOrigin="anonymous"
                                className="w-full h-full object-contain select-none [image-rendering:pixelated]"
                            />
                            
                            {/* Enchanted Glint Overlay */}
                            {isEnchanted && (
                                <div 
                                    className="absolute inset-0 w-full h-full enchanted-glint"
                                    style={{
                                        WebkitMaskImage: `url(${imgSrc})`,
                                        maskImage: `url(${imgSrc})`,
                                        WebkitMaskSize: 'contain',
                                        maskSize: 'contain',
                                        WebkitMaskRepeat: 'no-repeat',
                                        maskRepeat: 'no-repeat',
                                        WebkitMaskPosition: 'center',
                                        maskPosition: 'center'
                                    }}
                                />
                            )}
                        </div>
                    ) : (
                        <Box className="w-6 h-6 text-zinc-600 opacity-50" />
                    )}
                    
                    {/* Stack Count */}
                    {item.Count > 1 && (
                        <span className="absolute bottom-0 right-1 text-[10px] font-bold text-white leading-none drop-shadow-md select-none font-mono">
                            {item.Count}
                        </span>
                    )}
                    
                    {/* Durability Bar */}
                    {durPct !== null && (
                        <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-zinc-800 rounded-full overflow-hidden opacity-80">
                            <div className={`h-full ${getDurabilityColor(damage!, maxDamage)}`} style={{ width: `${durPct}%` }}></div>
                        </div>
                    )}
                </>
            ) : null}
            
            {/* Tooltip */}
            {item && (
                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 bg-zinc-950 text-white text-sm p-3 rounded-lg border border-zinc-800 whitespace-nowrap z-[100] pointer-events-none shadow-2xl min-w-[140px]">
                    <div className="font-bold text-emerald-400 mb-1">{item.id.replace('minecraft:', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</div>
                    <div className="space-y-0.5 text-zinc-400 text-xs">
                        <div className="text-zinc-500 font-mono">{item.id}</div>
                        {item.tag?.Damage !== undefined && <div>Durability: {Math.floor(((maxDamage - item.tag.Damage)/maxDamage)*100)}%</div>}
                        {item.Count > 1 && <div>Count: {item.Count}</div>}
                    </div>
                    {item.tag?.Enchantments && (
                         <div className="mt-2 pt-2 border-t border-zinc-800 text-purple-400 text-xs">
                            {item.tag.Enchantments.map((ench: any, i: number) => (
                                <div key={i}>{String(ench.id).replace('minecraft:','')} {ench.lvl}</div>
                            ))}
                         </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-600 text-[10px] italic">
                        Right-click to manage
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main Data View ---
const PlayerDataView: React.FC<{ server: ServerConfig, player: { name: string, uuid?: string }, status: string, socket?: Socket | null }> = ({ server, player, status, socket }) => {
    const [data, setData] = useState<PlayerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<'inventory' | 'ender'>('inventory');
    const [assetVersion, setAssetVersion] = useState('1.21.1');
    
    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: InventoryItem } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    // Fetch latest asset version
    useEffect(() => {
        fetch('/api/minecraft/versions?software=vanilla')
            .then(res => res.json())
            .then(data => {
                if (data.versions && data.versions.length > 0) {
                    setAssetVersion(data.versions[0]);
                }
            })
            .catch(e => console.warn("Failed to fetch latest version for assets, using default.", e));
    }, []);

    // Polling Effect
    useEffect(() => {
        if (status === 'online' && socket) {
            const fetchOnline = () => {
                socket.emit('get-online-player-data', { id: server.id, name: player.name });
            };
            
            // Initial fetch
            fetchOnline();

            // Interval fetch
            const interval = setInterval(fetchOnline, 3000);
            return () => clearInterval(interval);
        }
    }, [status, socket, server.id, player.name]);

    useEffect(() => {
        setData(null);
        setError('');
        setLoading(true);

        const loadOffline = async () => {
             if(!player.uuid) { setError("UUID required for offline lookup."); setLoading(false); return; }
             try {
                const propRes = await fetch('/api/read-file', {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path: `${server.path}/server.properties` })
                });
                const propData = await propRes.json();
                let levelName = 'world';
                if(propData.content) {
                    const match = propData.content.match(/level-name=(.+)/);
                    if(match) levelName = match[1].trim();
                }

                const nbtRes = await fetch('/api/read-nbt', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path: `${server.path}/${levelName}/playerdata/${player.uuid}.dat` })
                });
                
                if(!nbtRes.ok) throw new Error('Could not find player data.');
                
                const nbtData = await nbtRes.json();
                const parsed = JSON.parse(nbtData.content);
                setData(parsed);
            } catch(e: any) {
                console.error("NBT Load Error:", e);
                setError("Could not load player data.");
            } finally { setLoading(false); }
        };

        if(status === 'online') {
            if(!socket) { setError("Socket disconnected."); setLoading(false); return; }
            const handler = (res: { id: string, name: string, data?: PlayerData, error?: string }) => {
                if(res.id === server.id && res.name.toLowerCase() === player.name.toLowerCase()) {
                     if(res.error) setError(res.error);
                     else if(res.data) setData(res.data);
                     setLoading(false);
                }
            };
            socket.on('player-data-response', handler);
            return () => { socket.off('player-data-response', handler); };
        } else {
            loadOffline();
        }
    }, [server.path, player.name, player.uuid, status, socket]);

    const handleContextMenu = (e: React.MouseEvent, item: InventoryItem) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item
        });
    };

    const executeItemAction = (action: 'delete' | 'count', value?: number) => {
        if (!contextMenu || !socket || status !== 'online') return;
        
        let slotId = '';
        const rawSlot = contextMenu.item.Slot;

        // Map NBT slots to command slots
        if (rawSlot >= 0 && rawSlot <= 35) {
             slotId = `container.${rawSlot}`;
        } else if (rawSlot === 103) slotId = 'armor.head';
        else if (rawSlot === 102) slotId = 'armor.chest';
        else if (rawSlot === 101) slotId = 'armor.legs';
        else if (rawSlot === 100) slotId = 'armor.feet';
        else if (rawSlot === -106 || rawSlot === 150) slotId = 'weapon.offhand';
        else {
            alert("Cannot edit this slot type via RCON.");
            setContextMenu(null);
            return;
        }

        let command = '';
        if (action === 'delete') {
            command = `item replace entity ${player.name} ${slotId} with air`;
        } else if (action === 'count' && value) {
            command = `item replace entity ${player.name} ${slotId} with ${contextMenu.item.id} ${value}`;
        }

        if (command) {
            socket.emit('send-command', { id: server.id, command });
        }
        setContextMenu(null);
    };

    if(loading && !data) return <div className="p-12 text-center text-zinc-500"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3"></div>Fetching Player Data...</div>;
    if(error && !data) return <div className="p-6 bg-red-900/10 border border-red-900/30 rounded-lg text-red-200 text-sm text-center flex flex-col items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}</div>;
    if(!data) return null;

    const getSlot = (slot: number, source = data.Inventory) => source?.find(i => i.Slot === slot);
    
    // Calculated Stats
    const health = data.Health || 20;
    const food = data.foodLevel || 20;
    const xpLevel = data.XpLevel || 0;
    const xpProgress = data.XpP || 0;
    
    const gamemodeMap = ['Survival', 'Creative', 'Adventure', 'Spectator'];
    const gamemode = gamemodeMap[data.playerGameType] || 'Unknown';

    return (
        <div className="h-full flex flex-col gap-6 animate-fade-in font-sans relative">
            
            {/* Context Menu */}
            {contextMenu && (
                <div 
                    ref={contextMenuRef}
                    className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[160px] flex flex-col py-1"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="px-3 py-1.5 text-xs font-bold text-zinc-500 border-b border-zinc-800 mb-1">
                        {contextMenu.item.id.replace('minecraft:', '')}
                    </div>
                    {status === 'online' ? (
                        <>
                            <button 
                                onClick={() => {
                                    const val = prompt('Enter new count:', String(contextMenu.item.Count));
                                    if(val && !isNaN(Number(val))) executeItemAction('count', Number(val));
                                }}
                                className="px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                            >
                                <Hash className="w-4 h-4" /> Set Count
                            </button>
                            <button 
                                onClick={() => executeItemAction('delete')}
                                className="px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Remove Item
                            </button>
                        </>
                    ) : (
                         <div className="px-3 py-2 text-xs text-zinc-500 italic">Server must be online to edit items.</div>
                    )}
                </div>
            )}

            {/* Top Bar: Vitals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {/* Health */}
                 <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
                     <div className="p-3 bg-red-500/10 text-red-500 rounded-xl"><Heart className="w-6 h-6 fill-current" /></div>
                     <div className="flex-1">
                         <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                            <span>Health</span>
                            <span className="text-zinc-300">{Math.ceil(health)} / 20</span>
                         </div>
                         <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden border border-zinc-700">
                             <div className="bg-red-500 h-full transition-all duration-500" style={{width: `${Math.min(100, (health/20)*100)}%`}}></div>
                         </div>
                     </div>
                 </div>

                 {/* Hunger */}
                 <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
                     <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl"><Beef className="w-6 h-6" /></div>
                     <div className="flex-1">
                         <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                            <span>Hunger</span>
                            <span className="text-zinc-300">{food} / 20</span>
                         </div>
                         <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden border border-zinc-700">
                             <div className="bg-orange-500 h-full transition-all duration-500" style={{width: `${Math.min(100, (food/20)*100)}%`}}></div>
                         </div>
                     </div>
                 </div>

                 {/* XP */}
                 <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
                     <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl"><Star className="w-6 h-6 fill-current" /></div>
                     <div className="flex-1">
                         <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                            <span>Experience</span>
                            <span className="text-emerald-400 font-mono">Lvl {xpLevel}</span>
                         </div>
                         <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden border border-zinc-700">
                             <div className="bg-emerald-500 h-full transition-all duration-500" style={{width: `${xpProgress * 100}%`}}></div>
                         </div>
                     </div>
                 </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Left Column: Stats & Equipment */}
                <div className="xl:col-span-1 flex flex-col gap-4">
                    
                    {/* Equipment Card */}
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                        <h3 className="text-xs uppercase font-bold text-zinc-500 mb-4 flex items-center gap-2">
                            <Shirt className="w-3.5 h-3.5" /> Equipment
                        </h3>
                        <div className="flex justify-center gap-6">
                             {/* Armor Column */}
                             <div className="flex flex-col gap-3">
                                <ItemBox item={getSlot(103)} label="Head" assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                                <ItemBox item={getSlot(102)} label="Body" assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                                <ItemBox item={getSlot(101)} label="Legs" assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                                <ItemBox item={getSlot(100)} label="Feet" assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                             </div>
                             
                             {/* Center Visual / Offhand */}
                             <div className="flex flex-col items-center justify-center gap-4">
                                 <div className="h-32 w-1.5 bg-zinc-800/50 rounded-full"></div>
                                 <ItemBox item={getSlot(-106)} label="Off" isOffhand assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                             </div>
                        </div>
                    </div>

                    {/* Attributes */}
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-3 p-2 bg-zinc-950/50 rounded border border-zinc-800/50">
                            <Gamepad2 className="w-4 h-4 text-emerald-500" />
                            <div className="flex-1 text-xs text-zinc-300 flex justify-between">
                                <span>Gamemode</span>
                                <span className="font-bold text-white">{gamemode}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-2 bg-zinc-950/50 rounded border border-zinc-800/50">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <div className="text-xs font-mono text-zinc-300">
                                {Math.floor(data.Pos[0])}, {Math.floor(data.Pos[1])}, {Math.floor(data.Pos[2])}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-2 bg-zinc-950/50 rounded border border-zinc-800/50">
                            <Box className="w-4 h-4 text-purple-500" />
                            <div className="text-xs font-mono text-zinc-300">
                                {data.Dimension.replace('minecraft:', '')}
                            </div>
                        </div>
                        {data.abilities && (
                            <div className="flex items-center gap-3 p-2 bg-zinc-950/50 rounded border border-zinc-800/50">
                                <Move className="w-4 h-4 text-emerald-500" />
                                <div className="text-xs text-zinc-300">
                                    Fly: <span className={data.abilities.flying ? "text-emerald-400" : "text-zinc-500"}>{data.abilities.flying ? 'ON' : 'OFF'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Active Effects */}
                    {data.active_effects && data.active_effects.length > 0 && (
                        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-3 flex items-center gap-2">
                                <Zap className="w-3 h-3" /> Active Effects
                            </div>
                            <div className="space-y-2">
                                {data.active_effects.map((eff, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
                                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                                        <span className="text-zinc-300 font-medium">ID {eff.Id} (Lvl {eff.Amplifier + 1})</span>
                                        <span className="text-zinc-600 font-mono ml-auto">{Math.floor(eff.Duration / 20)}s</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Inventory */}
                <div className={`xl:col-span-2 rounded-xl p-6 flex flex-col min-h-[500px] transition-colors border ${
                    tab === 'inventory' ? 'bg-zinc-900/20 border-emerald-500/20' : 'bg-zinc-900/20 border-purple-500/20'
                }`}>
                    <div className="flex items-center justify-between mb-8">
                         <div className="flex gap-6">
                             <button onClick={() => setTab('inventory')} className={`text-base font-bold pb-2 px-1 transition-colors ${tab==='inventory' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Inventory</button>
                             <button onClick={() => setTab('ender')} className={`text-base font-bold pb-2 px-1 transition-colors ${tab==='ender' ? 'text-purple-500 border-b-2 border-purple-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Ender Chest</button>
                         </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center">
                        {tab === 'inventory' ? (
                            <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
                                {/* Main Inventory Grid */}
                                <div className="text-emerald-500 text-xs font-bold uppercase tracking-wider mb-4">Storage</div>
                                <div className="grid grid-cols-9 gap-2 mb-6">
                                    {Array.from({length: 27}).map((_, i) => (
                                        <ItemBox key={i+9} item={getSlot(i + 9)} assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                                    ))}
                                </div>
                                
                                {/* Hotbar Grid */}
                                <div className="pt-6 border-t border-zinc-800">
                                    <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-4">Hotbar</div>
                                    <div className="grid grid-cols-9 gap-2">
                                        {Array.from({length: 9}).map((_, i) => (
                                            <ItemBox key={i} item={getSlot(i)} assetVersion={assetVersion} onContextMenu={handleContextMenu} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                             <div className="p-6 bg-zinc-950 border border-purple-500/20 rounded-xl shadow-2xl">
                                <div className="text-purple-500 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2"><Lock className="w-3 h-3"/> Ender Storage</div>
                                <div className="grid grid-cols-9 gap-2">
                                    {Array.from({length: 27}).map((_, i) => (
                                        <ItemBox key={i} item={getSlot(i, data.EnderItems || [])} assetVersion={assetVersion} /> // Ender items read-only context for now
                                    ))}
                                </div>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PlayerDetailModal: React.FC<{ 
  player: { name: string; uuid?: string }; 
  server: ServerConfig;
  isOpen: boolean; 
  onClose: () => void;
  status: 'online' | 'offline';
  lastSeen?: number;
  firstJoined?: number;
  socket: Socket | null;
  ip?: string;
  allPlayers?: PlayerHistoryEntry[];
}> = ({ player, server, isOpen, onClose, status, lastSeen, firstJoined, socket, ip, allPlayers = [] }) => {
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [bans, setBans] = useState<PlayerEntry[]>([]);
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [checkpoints, setCheckpoints] = useState<Waypoint[]>([]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory'>('overview');
  const [pendingAction, setPendingAction] = useState<{ type: 'ban' | 'kick', name: string } | null>(null);
  const [actionReason, setActionReason] = useState('');
  
  // Teleport Modal State
  const [showTpModal, setShowTpModal] = useState(false);
  const [tpMode, setTpMode] = useState<'player' | 'coords' | 'checkpoint'>('player');
  const [tpTargetPlayer, setTpTargetPlayer] = useState('');
  const [tpTargetCheckpoint, setTpTargetCheckpoint] = useState('');
  const [tpCoords, setTpCoords] = useState({ x: 0, y: 0, z: 0 });
  const [fetchingOfflinePos, setFetchingOfflinePos] = useState(false);

  // Real-time last seen updates
  const [now, setNow] = useState(Date.now());

  const { toast } = useUI();

  // Update "now" every 3 seconds to refresh the Last Seen display if online
  useEffect(() => {
    if (status === 'online') {
      const i = setInterval(() => setNow(Date.now()), 3000);
      return () => clearInterval(i);
    }
  }, [status]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('overview');
      setPendingAction(null);
      setActionReason('');
      Promise.all([
        fetch('/api/read-file', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: `${server.path}/ops.json` }) }).then(r=>r.json()).then(d=>d.content ? JSON.parse(d.content) : []).catch(()=>[]),
        fetch('/api/read-file', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: `${server.path}/banned-players.json` }) }).then(r=>r.json()).then(d=>d.content ? JSON.parse(d.content) : []).catch(()=>[]),
        fetch('/api/read-file', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: `${server.path}/whitelist.json` }) }).then(r=>r.json()).then(d=>d.content ? JSON.parse(d.content) : []).catch(()=>[]),
      ]).then(([o, b, w]) => { setOps(o); setBans(b); setWhitelist(w); });

      // Fetch waypoints
      fetch('/api/server/waypoints', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ path: server.path, action: 'list' })
      }).then(r=>r.json()).then(d=> { if(d.waypoints) setCheckpoints(d.waypoints); }).catch(console.error);
    }
  }, [isOpen, server.path, player.name]);

  const toggleOp = () => {
    if(!socket) return;
    const isOp = ops.some(p => p.name.toLowerCase() === player.name.toLowerCase());
    socket.emit('send-command', { id: server.id, command: isOp ? `deop ${player.name}` : `op ${player.name}` });
    toast.success(isOp ? `Removed Operator` : `Added Operator`, player.name);
    onClose();
  };

  const initiateBan = () => {
    const isBanned = bans.some(p => p.name.toLowerCase() === player.name.toLowerCase());
    if (isBanned) {
        // Unban immediately
        socket?.emit('send-command', { id: server.id, command: `pardon ${player.name}` });
        toast.warning(`Unbanned`, player.name);
        onClose();
    } else {
        // Open Reason Dialog
        setPendingAction({ type: 'ban', name: player.name });
        setActionReason('Banned by admin');
    }
  };

  const initiateKick = () => {
      setPendingAction({ type: 'kick', name: player.name });
      setActionReason('Kicked by admin');
  };

  const confirmAction = () => {
      if(!socket || !pendingAction) return;
      
      if (pendingAction.type === 'ban') {
          const reason = actionReason.trim() || "Banned by admin";
          socket.emit('send-command', { id: server.id, command: `ban ${player.name} ${reason}` });
          toast.warning('Banned', `${player.name}: ${reason}`);
      } else if (pendingAction.type === 'kick') {
          const reason = actionReason.trim() || "Kicked by admin";
          socket.emit('send-command', { id: server.id, command: `kick ${player.name} ${reason}` });
          toast.info('Kicked', `${player.name}: ${reason}`);
      }
      onClose();
  };
  
  const handleTeleportSubmit = async () => {
      if (!socket || status !== 'online') return;
      
      if (tpMode === 'player') {
          if (!tpTargetPlayer) return;
          
          // Check if target is offline
          const targetEntry = allPlayers.find(p => p.name === tpTargetPlayer);
          if (targetEntry && !targetEntry.isOnline) {
             setFetchingOfflinePos(true);
             try {
                const res = await fetch('/api/players/get-offline-pos', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path: server.path, uuid: targetEntry.uuid })
                });
                const data = await res.json();
                if(data.pos) {
                     // TP to coords
                     const {x, y, z} = data.pos;
                     const cmd = `tp ${player.name} ${x} ${y} ${z}`;
                     socket.emit('send-command', { id: server.id, command: cmd });
                     toast.success(`Teleported ${player.name}`, `To offline location of ${tpTargetPlayer}`);
                } else {
                    toast.error("Could not find location data");
                }
             } catch(e) {
                 toast.error("Failed to fetch offline data");
             }
             setFetchingOfflinePos(false);
          } else {
             // Standard TP to online player
             socket.emit('send-command', { id: server.id, command: `tp ${player.name} ${tpTargetPlayer}` });
             toast.success(`Teleported`, `${player.name} -> ${tpTargetPlayer}`);
          }
      } else if (tpMode === 'checkpoint') {
           const wp = checkpoints.find(w => w.id === tpTargetCheckpoint);
           if (!wp) return;
           const cmd = `execute in ${wp.dimension} run tp ${player.name} ${wp.x} ${wp.y} ${wp.z}`;
           socket.emit('send-command', { id: server.id, command: cmd });
           toast.success(`Teleported`, `${player.name} -> ${wp.name}`);
      } else {
          socket.emit('send-command', { id: server.id, command: `tp ${player.name} ${tpCoords.x} ${tpCoords.y} ${tpCoords.z}` });
          toast.success(`Teleported`, `${player.name} -> ${tpCoords.x}, ${tpCoords.y}, ${tpCoords.z}`);
      }
      setShowTpModal(false);
  };

  if (!isOpen) return null;
  const isOp = ops.some(p => p.name.toLowerCase() === player.name.toLowerCase());
  const isBanned = bans.some(p => p.name.toLowerCase() === player.name.toLowerCase());
  const isWhitelisted = whitelist.some(p => p.name.toLowerCase() === player.name.toLowerCase());

  // Use local 'now' if online, otherwise use static lastSeen
  const displayLastSeen = status === 'online' ? now : lastSeen;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#18181b] rounded-xl border border-zinc-700 w-full max-w-6xl shadow-2xl flex overflow-hidden relative max-h-[95vh] flex-col md:flex-row h-[800px]" onClick={e => e.stopPropagation()}>
         <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white z-10"><X className="w-5 h-5" /></button>
         
         {/* Teleport Modal Overlay */}
         {showTpModal && (
             <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                 <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl max-w-md w-full shadow-2xl animate-fade-in" onClick={e=>e.stopPropagation()}>
                     <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                         <Compass className="w-5 h-5 text-blue-500" />
                         Teleport {player.name}
                     </h3>
                     
                     <div className="flex bg-zinc-950 p-1 rounded-lg mb-4 border border-zinc-800">
                         <button onClick={()=>setTpMode('player')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tpMode==='player'?'bg-zinc-800 text-white':'text-zinc-500 hover:text-zinc-300'}`}>Player</button>
                         <button onClick={()=>setTpMode('checkpoint')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tpMode==='checkpoint'?'bg-zinc-800 text-white':'text-zinc-500 hover:text-zinc-300'}`}>Checkpoint</button>
                         <button onClick={()=>setTpMode('coords')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tpMode==='coords'?'bg-zinc-800 text-white':'text-zinc-500 hover:text-zinc-300'}`}>Coords</button>
                     </div>

                     {tpMode === 'player' ? (
                         <div className="mb-6">
                             <label className="text-xs text-zinc-500 mb-1 block">Select Target</label>
                             <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none" value={tpTargetPlayer} onChange={e=>setTpTargetPlayer(e.target.value)}>
                                 <option value="">Select a player...</option>
                                 {allPlayers.filter(p => p.name !== player.name).map(p => (
                                     <option key={p.name} value={p.name}>
                                         {p.name} {p.isOnline ? '(Online)' : '(Offline)'}
                                     </option>
                                 ))}
                             </select>
                         </div>
                     ) : tpMode === 'checkpoint' ? (
                         <div className="mb-6">
                             <label className="text-xs text-zinc-500 mb-1 block">Select Checkpoint</label>
                             <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none" value={tpTargetCheckpoint} onChange={e=>setTpTargetCheckpoint(e.target.value)}>
                                 <option value="">Select a checkpoint...</option>
                                 {checkpoints.map(wp => (
                                     <option key={wp.id} value={wp.id}>
                                         {wp.name} ({wp.dimension.replace('minecraft:', '').replace('the_', '')})
                                     </option>
                                 ))}
                             </select>
                         </div>
                     ) : (
                         <div className="flex gap-2 mb-6">
                             <div><label className="text-xs text-zinc-500 mb-1 block">X</label><input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-white" value={tpCoords.x} onChange={e=>setTpCoords({...tpCoords, x: Number(e.target.value)})} /></div>
                             <div><label className="text-xs text-zinc-500 mb-1 block">Y</label><input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-white" value={tpCoords.y} onChange={e=>setTpCoords({...tpCoords, y: Number(e.target.value)})} /></div>
                             <div><label className="text-xs text-zinc-500 mb-1 block">Z</label><input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-white" value={tpCoords.z} onChange={e=>setTpCoords({...tpCoords, z: Number(e.target.value)})} /></div>
                         </div>
                     )}

                     <div className="flex justify-end gap-3">
                         <Button variant="secondary" onClick={() => setShowTpModal(false)}>Cancel</Button>
                         <Button variant="primary" onClick={handleTeleportSubmit} isLoading={fetchingOfflinePos}>Teleport</Button>
                     </div>
                 </div>
             </div>
         )}

         {/* Action Confirmation Overlay */}
         {pendingAction && (
             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                 <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl max-w-md w-full shadow-2xl animate-fade-in">
                     <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                         {pendingAction.type === 'ban' ? <Ban className="w-5 h-5 text-red-500" /> : <DoorOpen className="w-5 h-5 text-orange-500" />}
                         Confirm {pendingAction.type === 'ban' ? 'Ban' : 'Kick'}
                     </h3>
                     <p className="text-zinc-400 text-sm mb-4">
                         Enter a reason for this action. This will be shown to the player.
                     </p>
                     <input 
                        type="text" 
                        className="w-full bg-black/30 border border-zinc-700 rounded-lg px-4 py-2 text-white mb-6 focus:border-emerald-500 outline-none"
                        value={actionReason}
                        onChange={e => setActionReason(e.target.value)}
                        placeholder="Reason..."
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && confirmAction()}
                     />
                     <div className="flex justify-end gap-3">
                         <Button variant="secondary" onClick={() => setPendingAction(null)}>Cancel</Button>
                         <Button variant="danger" onClick={confirmAction}>Confirm {pendingAction.type === 'ban' ? 'Ban' : 'Kick'}</Button>
                     </div>
                 </div>
             </div>
         )}

         <div className="w-full md:w-72 bg-zinc-900 border-r border-zinc-800 p-6 flex flex-col items-center relative shrink-0">
            <div className="relative z-10 mt-8 mb-6">
                <img src={`https://mc-heads.net/body/${player.name}/right`} alt={player.name} className="h-64 object-contain drop-shadow-2xl"/>
            </div>
            <h2 className="text-2xl font-bold text-white mb-1 text-center break-all">{player.name}</h2>
            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border mb-6 ${status === 'online' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>{status}</div>
            
            <div className="w-full pt-6 border-t border-zinc-800 mt-auto">
                 <div className="flex flex-col gap-2">
                    <div className="bg-zinc-950/50 p-3 rounded border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">First Seen</div>
                        <div className="text-xs text-zinc-300 font-mono">{firstJoined ? new Date(firstJoined).toLocaleString() : '-'}</div>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Last Seen</div>
                        <div className="text-xs text-zinc-300 font-mono">{displayLastSeen ? new Date(displayLastSeen).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' }) : '-'}</div>
                    </div>
                    {ip && (
                        <div className="bg-zinc-950/50 p-3 rounded border border-zinc-800">
                            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Last IP</div>
                            <div className="text-xs text-zinc-300 font-mono select-all blur-[2px] hover:blur-none transition-all cursor-default">{ip}</div>
                        </div>
                    )}
                 </div>
            </div>
         </div>
         
         <div className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col bg-[#121215]">
            <div className="flex items-center gap-2 mb-6">
                <span className="text-zinc-500 text-sm">UUID:</span>
                <p className="text-sm font-mono text-zinc-400 select-all bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{player.uuid || 'UUID not resolved'}</p>
            </div>
            
            {/* Action Tabs */}
            <div className="flex gap-6 mb-8 border-b border-zinc-800 shrink-0">
                <button onClick={() => setActiveTab('overview')} className={`pb-3 text-sm font-bold tracking-wide transition-colors ${activeTab === 'overview' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>OVERVIEW</button>
                <button onClick={() => setActiveTab('inventory')} className={`pb-3 text-sm font-bold tracking-wide transition-colors ${activeTab === 'inventory' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>DATA & INVENTORY</button>
            </div>

            <div className="flex-1 min-w-0">
                {activeTab === 'inventory' ? (
                    <PlayerDataView server={server} player={player} status={status} socket={socket} />
                ) : (
                    <div className="max-w-2xl">
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4 uppercase tracking-wider"><Shield className="w-4 h-4 text-emerald-500" /> Permissions & Status</h3>
                                <div className="flex gap-3 flex-wrap">
                                    {isOp ? (
                                        <div className="px-4 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 bg-emerald-900/20 border-emerald-800 text-emerald-400"><Check className="w-4 h-4"/> Operator</div>
                                    ) : (
                                        <div className="px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 bg-zinc-900 border-zinc-800 text-zinc-500">Not Operator</div>
                                    )}
                                    {isWhitelisted ? (
                                        <div className="px-4 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 bg-blue-900/20 border-blue-800 text-blue-400"><Check className="w-4 h-4"/> Whitelisted</div>
                                    ) : (
                                        <div className="px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 bg-zinc-900 border-zinc-800 text-zinc-500">Not Whitelisted</div>
                                    )}
                                    {isBanned && <div className="px-4 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 bg-red-900/20 border-red-800 text-red-400"><Skull className="w-4 h-4"/> Banned</div>}
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-zinc-800">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4 uppercase tracking-wider"><Zap className="w-4 h-4 text-yellow-500" /> Actions</h3>
                                <p className="text-xs text-zinc-500 mb-4">Server must be running to perform these actions.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <Button variant="secondary" className="h-12 border-zinc-700" onClick={toggleOp} disabled={server.status !== 'running'}>
                                        {isOp ? 'Remove Operator' : 'Make Operator'}
                                    </Button>
                                    <Button variant="secondary" className="h-12 border-zinc-700" onClick={initiateBan} disabled={server.status !== 'running'}>
                                        {isBanned ? 'Unban Player' : 'Ban Player...'}
                                    </Button>
                                    
                                    {/* Teleport Button */}
                                    {status === 'online' && (
                                        <Button variant="secondary" className="h-12 border-zinc-700 bg-blue-900/10 hover:bg-blue-900/30 text-blue-400" onClick={() => setShowTpModal(true)} disabled={server.status !== 'running'}>
                                            <Compass className="w-4 h-4 mr-2" /> Teleport...
                                        </Button>
                                    )}

                                    {status === 'online' && (
                                        <Button variant="danger" className="h-12 col-span-1" onClick={initiateKick} disabled={server.status !== 'running'}>
                                            Kick Player...
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
         </div>
      </div>
    </div>
  );
};