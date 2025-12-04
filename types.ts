

export interface ServerConfig {
  id: string;
  name: string;
  version: string;
  software?: 'vanilla' | 'paper'; // Added software type
  memory: number; // in MB
  port: number;
  maxPlayers: number;
  motd: string;
  eulaAccepted: boolean;
  status: 'created' | 'ready' | 'starting' | 'running' | 'stopped';
  createdAt: number;
  path: string;
  displayDomain?: string; // Optional domain for display (e.g. play.myserver.com)
  noIpConfig?: NoIpConfig;
  logHistoryLimit?: number; // Number of lines to load on join
  autoBackup?: AutoBackupConfig;
  autoSave?: AutoSaveConfig;
  activePlayers?: number; // Runtime only
}

export interface AutoBackupConfig {
  enabled: boolean;
  interval: number; // in minutes
}

export interface AutoSaveConfig {
  enabled: boolean;
  interval: number; // in minutes
}

export interface NoIpConfig {
  username?: string;
  password?: string;
  hostname?: string;
  enabled: boolean;
  autoStart?: boolean;
}

export interface CreateServerFormData {
  name: string;
  software: 'vanilla' | 'paper';
  version: string;
  memory: number;
  port: number;
  maxPlayers: number;
  motd: string;
  eula: boolean;
}

export interface ServerStats {
  cpu: number; // Percentage
  memory: number; // in bytes
  memoryLimit: number; // in bytes
}

export interface Waypoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  dimension: string;
  createdAt: number;
}

export interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number; // for ops
  banned?: boolean; // helper
  reason?: string; // for bans
  created?: string;
  source?: string;
  expires?: string;
}

export interface PlayerHistoryEntry {
  name: string;
  uuid?: string;
  firstJoined: number;
  lastSeen: number;
  totalJoins: number;
  isOnline: boolean;
  lastIp?: string;
  waypoints?: Waypoint[];
}

export interface Backup {
  name: string;
  createdAt: number;
  size: number;
  path: string;
}

export interface FileInfo {
  name: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  path: string;
}

export interface InventoryItem {
    Slot: number;
    id: string;
    Count: number;
    tag?: {
        Damage?: number;
        display?: { Name?: string; Lore?: string[] };
        Enchantments?: any[];
        [key: string]: any;
    };
}

export interface Attribute {
    Name: string;
    Base: number;
    Current?: number; // Calculated often
}

export interface ActiveEffect {
    Id: number;
    Amplifier: number;
    Duration: number;
    ShowParticles: boolean;
}

export interface PlayerData {
    Pos: [number, number, number]; // X, Y, Z
    Rotation: [number, number];
    Dimension: string;
    Inventory: InventoryItem[];
    EnderItems?: InventoryItem[];
    Health: number;
    foodLevel: number;
    foodSaturationLevel: number;
    foodExhaustionLevel: number;
    XpLevel: number;
    XpP: number; // Progress 0.0 - 1.0
    XpTotal: number;
    Score: number;
    Attributes?: Attribute[];
    active_effects?: ActiveEffect[];
    abilities?: {
        walkSpeed: number;
        flySpeed: number;
        mayfly: boolean;
        flying: boolean;
        invulnerable: boolean;
    };
    [key: string]: any;
}

export interface ModrinthProject {
    project_id: string;
    title: string;
    description: string;
    icon_url?: string;
    author: string;
    downloads: number;
    follows: number;
}