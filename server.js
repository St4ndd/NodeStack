const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const os = require('os');
const zlib = require('zlib');
const { NbtReader, parseSNBT } = require('./utils/nbt.js');
const { RconClient } = require('./utils/rcon.js');

// --- CRITICAL FIX FOR NETWORK/PROXY ENVIRONMENTS ---
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- DATA DIRECTORY FIX FOR EXE ---
// If running inside a PKG executable, __dirname is virtual/read-only.
// We must use process.cwd() to store mutable data like servers/ and auth.json.
const DATA_DIR = process.pkg ? process.cwd() : __dirname;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  maxHttpBufferSize: 1e8 
});

const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '500mb' }));

// --- AUTH SYSTEM ---
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSIONS = new Set(); // Stores valid session tokens

// Helper: Hash Password
const hashPassword = (password, salt) => {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey.toString('hex'));
        });
    });
};

// Middleware: Verify Session Cookie
const requireAuth = (req, res, next) => {
    // Allow auth endpoints
    // Using originalUrl to ensure we check the full path regardless of where middleware is mounted
    if (req.originalUrl.startsWith('/api/auth') || req.originalUrl === '/api/health') return next();

    // Check cookie
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return res.status(401).json({ error: "Unauthorized" });

    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });

    if (SESSIONS.has(cookies['ns_session'])) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized: Invalid Session" });
    }
};

// Protect API Routes
app.use('/api', requireAuth);

// Protect Socket.io
io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) return next(new Error('Authentication error'));
    
    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });

    if (SESSIONS.has(cookies['ns_session'])) {
        next();
    } else {
        next(new Error('Authentication error'));
    }
});

// Auth Routes
app.get('/api/auth/status', (req, res) => {
    const setupRequired = !fs.existsSync(AUTH_FILE);
    
    // Check if current user is authenticated
    const cookieHeader = req.headers.cookie || '';
    let authenticated = false;
    if (cookieHeader) {
        const cookies = {};
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            cookies[parts.shift().trim()] = decodeURI(parts.join('='));
        });
        if (SESSIONS.has(cookies['ns_session'])) authenticated = true;
    }

    res.json({ setupRequired, authenticated });
});

app.post('/api/auth/setup', async (req, res) => {
    if (fs.existsSync(AUTH_FILE)) return res.status(403).json({ error: "Auth already configured" });
    
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: "Password too short" });

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);

    fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }));

    // Auto login
    const token = crypto.randomBytes(32).toString('hex');
    SESSIONS.add(token);
    
    res.cookie('ns_session', token, { httpOnly: true, sameSite: 'strict', maxAge: 2592000000 }); // 30 days
    res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
    if (!fs.existsSync(AUTH_FILE)) return res.status(400).json({ error: "Setup required" });

    const { password } = req.body;
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    
    const hash = await hashPassword(password, authData.salt);
    
    if (hash === authData.hash) {
        const token = crypto.randomBytes(32).toString('hex');
        SESSIONS.add(token);
        res.cookie('ns_session', token, { httpOnly: true, sameSite: 'strict', maxAge: 2592000000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid password" });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const cookies = {};
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            cookies[parts.shift().trim()] = decodeURI(parts.join('='));
        });
        SESSIONS.delete(cookies['ns_session']);
    }
    res.clearCookie('ns_session');
    res.json({ success: true });
});


// Ensure servers directory exists in DATA_DIR
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
if (!fs.existsSync(SERVERS_DIR)) {
  fs.mkdirSync(SERVERS_DIR, { recursive: true });
}

// Stores
const runningServers = new Map();
const tunnelProcesses = new Map();
const restartingServers = new Map(); // Stores config of servers waiting to restart
const runtimeStats = new Map();
const rconClients = new Map();
const serverTaskState = new Map(); // id -> { lastSave: number, lastBackup: number }

// --- HELPER FUNCTIONS ---

const FALLBACK_VERSIONS = ['1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'];

// Replaced native fetch with https.request for robust network handling (IPv4 forcing, SSL ignoring)
const fetchExternal = (url) => {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const options = {
                hostname: parsedUrl.hostname,
                port: 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                rejectUnauthorized: false,
                headers: { 'User-Agent': 'NodeStack/Installer' },
                family: 4 // Force IPv4
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`Request failed with status ${res.statusCode}: ${data.substring(0, 100)}`));
                    }
                });
            });

            req.on('error', err => reject(err));
            req.on('timeout', () => { req.destroy(); reject(new Error("Request timed out")); });
            req.setTimeout(15000);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const handleDownload = (currentUrl) => {
        try {
            const parsedUrl = new URL(currentUrl);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                rejectUnauthorized: false,
                headers: { 'User-Agent': 'NodeStack/Installer' },
                family: 4
            };

            https.get(options, (response) => {
                // Handle Redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    handleDownload(response.headers.location);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed with status ${response.statusCode}`));
                    return;
                }
                
                const file = fs.createWriteStream(dest);
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                file.on('error', (err) => {
                    fs.unlink(dest, () => {}); // Delete failed file
                    reject(err);
                });

            }).on('error', (err) => {
                fs.unlink(dest, ()=>{});
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    };
    handleDownload(url);
  });
};

const resolveVanillaUrl = async (versionId) => {
    try {
        const manifestRaw = await fetchExternal('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        const manifest = JSON.parse(manifestRaw);
        let targetId = versionId === 'latest' ? manifest.latest.release : versionId;
        const versionEntry = manifest.versions.find(v => v.id === targetId);
        if (!versionEntry) throw new Error(`Version ${targetId} not found in Mojang manifest`);
        const versionDataRaw = await fetchExternal(versionEntry.url);
        const versionData = JSON.parse(versionDataRaw);
        return versionData.downloads.server.url;
    } catch (e) {
        console.error("Vanilla Resolution Error:", e.message);
        throw e;
    }
};

const resolvePaperUrl = async (versionId) => {
    try {
        if (versionId === 'latest') {
            const projectData = JSON.parse(await fetchExternal('https://api.papermc.io/v2/projects/paper'));
            versionId = projectData.versions[projectData.versions.length - 1];
        }
        const versionData = JSON.parse(await fetchExternal(`https://api.papermc.io/v2/projects/paper/versions/${versionId}`));
        const latestBuild = versionData.builds[versionData.builds.length - 1];
        return `https://api.papermc.io/v2/projects/paper/versions/${versionId}/builds/${latestBuild}/downloads/paper-${versionId}-${latestBuild}.jar`;
    } catch (e) {
        console.error("Paper Resolution Error:", e.message);
        throw e;
    }
};

const appendLog = (serverPathStr, message) => {
  try {
    const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
    const logFile = path.join(DATA_DIR, cleanPath, 'logs.txt');
    if (fs.existsSync(path.dirname(logFile))) fs.appendFileSync(logFile, message + '\n');
  } catch (e) {}
};

const getRecentLogs = (serverPathStr, limit = 100) => {
  try {
    const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
    const logFile = path.join(DATA_DIR, cleanPath, 'logs.txt');
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    if (lines[lines.length-1] === '') lines.pop();
    return lines.slice(-limit);
  } catch (e) { return [`Error reading logs: ${e.message}`]; }
};

const readProperties = (serverPathStr) => {
    try {
        const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
        const propsFile = path.join(DATA_DIR, cleanPath, 'server.properties');
        if (!fs.existsSync(propsFile)) return {};
        const content = fs.readFileSync(propsFile, 'utf-8');
        const props = {};
        content.split('\n').forEach(line => {
            const l = line.trim();
            if (l && !l.startsWith('#') && l.includes('=')) {
                const parts = l.split('=');
                props[parts[0].trim()] = parts.slice(1).join('=').trim();
            }
        });
        return props;
    } catch(e) { return {}; }
};

const createBackup = (serverId, serverPathStr) => {
    const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
    const serverDir = path.join(DATA_DIR, cleanPath);
    const backupsDir = path.join(serverDir, 'backups');
    
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.tar.gz`;
    const backupPath = path.join(backupsDir, backupName);
    
    io.to(`server-${serverId}`).emit('console-log', { id: serverId, message: '[NodeStack] Starting backup...' });
    
    // Exclude backups folder, server.jar, and big files like logs if needed
    // Using tar command
    const cmd = `tar --exclude="./backups" --exclude="./server.jar" -czf "${backupPath}" .`;
    
    exec(cmd, { cwd: serverDir }, (err) => {
        if (err) {
            io.to(`server-${serverId}`).emit('console-log', { id: serverId, message: `[NodeStack] Backup failed: ${err.message}` });
        } else {
            io.to(`server-${serverId}`).emit('console-log', { id: serverId, message: `[NodeStack] Backup created: ${backupName}` });
            io.to(`server-${serverId}`).emit('backup-complete', { filename: backupName });
        }
    });
};

// --- AUTO TASK LOOP ---
setInterval(() => {
    const now = Date.now();
    runningServers.forEach((proc, id) => {
        // Find config path for running server
        let taskState = serverTaskState.get(id);
        
        // If no task state (legacy running process?), try to find path
        if (!taskState) {
            const files = fs.readdirSync(SERVERS_DIR);
            const folder = files.find(f => f.includes(id));
            if (folder) {
                taskState = { lastSave: now, lastBackup: now, path: `servers/${folder}` };
                serverTaskState.set(id, taskState);
            } else {
                return;
            }
        }

        const configPath = path.join(DATA_DIR, taskState.path, 'nodestack.json');
        
        if (fs.existsSync(configPath)) {
            try {
                // Read fresh config to catch runtime changes
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                let stateDirty = false;

                // Auto Save Logic
                if (config.autoSave && config.autoSave.enabled) {
                    const intervalMs = config.autoSave.interval * 60 * 1000;
                    if (now - taskState.lastSave > intervalMs) {
                        proc.stdin.write('save-all\n');
                        taskState.lastSave = now;
                        stateDirty = true;
                        io.to(`server-${id}`).emit('console-log', { id, message: '[NodeStack] Auto-saving world...' });
                    }
                }

                // Auto Backup Logic
                if (config.autoBackup && config.autoBackup.enabled) {
                     const intervalMs = config.autoBackup.interval * 60 * 1000;
                     if (now - taskState.lastBackup > intervalMs) {
                         createBackup(id, taskState.path);
                         taskState.lastBackup = now;
                         stateDirty = true;
                     }
                }
                
                if (stateDirty) serverTaskState.set(id, taskState);

            } catch (e) {
                // Ignore config read errors in loop
            }
        }
    });
}, 10000); // Check every 10 seconds

// --- SERVER START LOGIC (Extracted to be reusable for restarts) ---
const startServerInstance = async (config) => {
    if (runningServers.has(config.id)) return;

    // Check Java
    const required = getRequiredJavaVersion(config.version);
    const installed = await getInstalledJavaVersion();
    
    if (required > 8 && installed !== 0 && installed < required) {
        io.emit('java-error', { id: config.id, required, installed });
        return;
    }

    console.log(`Starting server ${config.name} (RAM: ${config.memory}MB)...`);
    io.emit('status-change', { id: config.id, status: 'starting' });

    const serverDir = path.join(DATA_DIR, config.path);
    const jarFile = 'server.jar';
    
    // Auto-accept EULA just in case
    if (config.eulaAccepted) {
       fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true');
    }

    // Initialize Tasks State (Start timers from now)
    serverTaskState.set(config.id, { lastSave: Date.now(), lastBackup: Date.now(), path: config.path });

    // Pass specific TrustStore for Windows to fix SSL downloads in Paper
    const isWindows = os.platform() === 'win32';
    const sslArgs = isWindows ? ['-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT'] : [];

    const javaArgs = [
       ...sslArgs,
       `-Xmx${config.memory}M`, 
       `-Xms${Math.min(config.memory, 1024)}M`, 
       '-jar', jarFile, 
       'nogui'
    ];

    const serverProcess = spawn('java', javaArgs, {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.on('error', (err) => {
        const msg = `[NodeStack] Failed to launch Java: ${err.message}`;
        console.error(msg);
        io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: msg });
        appendLog(config.path, msg);
        
        runningServers.delete(config.id);
        io.emit('status-change', { id: config.id, status: 'stopped' });
    });

    runningServers.set(config.id, serverProcess);
    runtimeStats.set(config.id, { count: 0 });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      appendLog(config.path, msg);
      io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: msg });

      // Detect RCON ready
      if (msg.includes('RCON running on')) {
           // Initialize RCON connection
           const props = readProperties(config.path);
           const rconPort = parseInt(props['rcon.port']);
           const rconPass = props['rcon.password'];
           if(rconPort && rconPass) {
               const client = new RconClient('localhost', rconPort, rconPass);
               client.connect().then(() => {
                   console.log(`RCON connected for ${config.name}`);
                   rconClients.set(config.id, client);
               }).catch(e => console.error(`RCON connection failed for ${config.name}:`, e.message));
           }
      }

      // Detect startup done
      if (msg.includes('Done') || msg.includes('For help, type')) {
        io.emit('status-change', { id: config.id, status: 'running' });
      }

      // Player join/leave detection
      if (msg.includes('joined the game')) {
         const parts = msg.split(' ');
         const joinedIndex = parts.indexOf('joined');
         if(joinedIndex > 0) {
             const name = parts[joinedIndex - 1];
             updatePlayerHistory(config.id, name, 'join', serverDir);
             
             const stats = runtimeStats.get(config.id);
             if(stats) { stats.count++; io.emit('player-count', { id: config.id, count: stats.count }); }
         }
      }
      
      const ipMatch = msg.match(/(\w+)\[\/([0-9\.:]+)\] logged in/);
      if (ipMatch) {
          const name = ipMatch[1];
          const ip = ipMatch[2].split(':')[0]; // remove port
          updatePlayerHistory(config.id, name, 'join', serverDir, ip);
      }

      if (msg.includes('left the game')) {
         const parts = msg.split(' ');
         const nameIndex = parts.indexOf('left') - 1;
         if(nameIndex >= 0) {
             const name = parts[nameIndex];
             updatePlayerHistory(config.id, name, 'leave', serverDir);
             
             const stats = runtimeStats.get(config.id);
             if(stats) { stats.count = Math.max(0, stats.count - 1); io.emit('player-count', { id: config.id, count: stats.count }); }
         }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      appendLog(config.path, `[ERR] ${msg}`);
      io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: `[ERR] ${msg}` });
    });

    serverProcess.on('close', (code) => {
      console.log(`Server ${config.id} stopped with code ${code}`);
      runningServers.delete(config.id);
      runtimeStats.delete(config.id);
      serverTaskState.delete(config.id);
      
      const rcon = rconClients.get(config.id);
      if(rcon) { rcon.disconnect(); rconClients.delete(config.id); }

      io.emit('status-change', { id: config.id, status: 'stopped' });
      appendLog(config.path, `--- SERVER STOPPED (Code: ${code}) ---`);
      
      // Explicitly notify console of Stop
      io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: `--- SERVER STOPPED (Code: ${code}) ---` });
      
      const tunnel = tunnelProcesses.get(config.id);
      if(tunnel) { tunnel.kill(); tunnelProcesses.delete(config.id); }

      // CHECK RESTART FLAG
      if (restartingServers.has(config.id)) {
        console.log(`Restart flag detected for ${config.id}. Restarting in 5s...`);
        const restartConfig = restartingServers.get(config.id);
        restartingServers.delete(config.id);
        
        io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: '[NodeStack] Waiting 5 seconds for port release...' });
        
        setTimeout(() => {
           io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: '[NodeStack] Starting server...' });
           startServerInstance(restartConfig);
        }, 5000); // 5 seconds delay for port release
      }
    });
};

// --- ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.6', endpoints: ['/api/plugins/installed', '/api/plugins/search'] });
});

app.get('/api/minecraft/versions', async (req, res) => {
    try {
        const { software } = req.query;
        let versions = [];
        if (software === 'paper') {
            const data = JSON.parse(await fetchExternal('https://api.papermc.io/v2/projects/paper'));
            versions = data.versions.reverse(); 
        } else {
            const data = JSON.parse(await fetchExternal('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
            versions = data.versions.filter(v => v.type === 'release').map(v => v.id);
        }
        res.json({ versions });
    } catch (e) {
        console.error("Version Fetch Error (using fallback):", e.message);
        res.json({ versions: FALLBACK_VERSIONS });
    }
});

// MAP INFO ROUTE
app.post('/api/server/map-info', (req, res) => {
  try {
    const { path: serverPathStr } = req.body;
    if (!serverPathStr) return res.json({ type: null, port: null, requiresConfigUpdate: false, pluginFile: null });
    
    const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
    const serverDir = path.join(DATA_DIR, cleanPath);
    const pluginsDir = path.join(serverDir, 'plugins');
    
    if (!fs.existsSync(pluginsDir)) return res.json({ type: null, port: null, requiresConfigUpdate: false, pluginFile: null });
    
    const files = fs.readdirSync(pluginsDir);
    const dynmapJar = files.find(f => f.toLowerCase().includes('dynmap') && f.endsWith('.jar'));
    const bluemapJar = files.find(f => f.toLowerCase().includes('bluemap') && f.endsWith('.jar'));
    
    let result = { type: null, port: null, requiresConfigUpdate: false, pluginFile: null };
    
    if (bluemapJar) {
        const webConfPath = path.join(pluginsDir, 'BlueMap', 'webserver.conf');
        const coreConfPath = path.join(pluginsDir, 'BlueMap', 'core.conf');
        let port = 8100;

        // Check Port
        if (fs.existsSync(webConfPath)) {
            const content = fs.readFileSync(webConfPath, 'utf-8');
            const match = content.match(/port\s*:\s*(\d+)/);
            if (match) port = parseInt(match[1]);
        }
        
        // Check if config needs EULA/Download acceptance
        let requiresUpdate = false;
        if (fs.existsSync(coreConfPath)) {
            const coreContent = fs.readFileSync(coreConfPath, 'utf-8');
            // BlueMap defaults to false and needs manual true
            if (coreContent.includes('accept-download: false') || coreContent.includes('accept-download:false')) {
                requiresUpdate = true;
            }
        }
        
        result = { type: 'bluemap', port, requiresConfigUpdate: requiresUpdate, pluginFile: bluemapJar };

    } else if (dynmapJar) {
        const confPath = path.join(pluginsDir, 'dynmap', 'configuration.txt');
        let port = 8123;
        if (fs.existsSync(confPath)) {
            const content = fs.readFileSync(confPath, 'utf-8');
            const match = content.match(/webserver-port:\s*(\d+)/);
            if (match) port = parseInt(match[1]);
        }
        result = { type: 'dynmap', port, requiresConfigUpdate: false, pluginFile: dynmapJar };
    }
    
    res.json(result);
  } catch (e) {
    // Return explicit JSON error structure instead of leaking 500 HTML
    res.status(500).json({ error: e.message, type: null, port: null, requiresConfigUpdate: false, pluginFile: null });
  }
});

// FIX BLUEMAP CONFIG
app.post('/api/server/fix-bluemap', (req, res) => {
    try {
        const { path: serverPathStr } = req.body;
        const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
        const coreConfPath = path.join(DATA_DIR, cleanPath, 'plugins', 'BlueMap', 'core.conf');
        
        if (fs.existsSync(coreConfPath)) {
            let content = fs.readFileSync(coreConfPath, 'utf-8');
            content = content.replace(/accept-download:\s*false/g, 'accept-download: true');
            fs.writeFileSync(coreConfPath, content);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Config file not found. Restart server first to generate it." });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// PLUGIN ROUTES
app.post('/api/plugins/search', async (req, res) => {
    try {
        const { query, version } = req.body;
        
        let searchVersion = version;
        if (!searchVersion || searchVersion.toLowerCase() === 'latest') {
             searchVersion = '1.20.4'; 
        }

        let cleanVersion = searchVersion.split('-')[0];

        const facets = JSON.stringify([
            ["project_type:mod", "project_type:plugin"],
            [`versions:${cleanVersion}`],
            ["categories:paper", "categories:spigot", "categories:bukkit"]
        ]);

        const apiUrl = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(facets)}&limit=20`;
        const respRaw = await fetchExternal(apiUrl);
        const resp = JSON.parse(respRaw);
        
        res.json({ hits: resp.hits || [] });
    } catch(e) {
        console.error("Plugin Search Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/plugins/installed', (req, res) => {
    try {
        const { path: serverPath } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const pluginsDir = path.join(DATA_DIR, cleanServerPath, 'plugins');
        if(!fs.existsSync(pluginsDir)) return res.json({ plugins: [] });
        const files = fs.readdirSync(pluginsDir);
        const jars = files.filter(f => f.endsWith('.jar')).map(f => ({ name: f }));
        res.json({ plugins: jars });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/plugins/install', async (req, res) => {
    try {
        const { path: serverPath, projectId, version } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const pluginsDir = path.join(DATA_DIR, cleanServerPath, 'plugins');
        if(!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        let targetVersionStr = version;
        if (!targetVersionStr || targetVersionStr.toLowerCase() === 'latest') targetVersionStr = '1.20.4'; 
        
        targetVersionStr = targetVersionStr.split('-')[0];

        // 1. Try Specific Search
        let versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=["paper","spigot","bukkit"]&game_versions=["${targetVersionStr}"]`;
        let versionsRaw = await fetchExternal(versionsUrl);
        let versions = [];
        try { versions = JSON.parse(versionsRaw); } catch(e) { versions = []; }

        // 2. Fallback: Generic Search (if strict version match failed)
        if (!versions || versions.length === 0) {
            console.log(`[Plugin Install] No direct match for ${targetVersionStr}, searching generic...`);
            // Search without game_versions constraint
            versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=["paper","spigot","bukkit"]`;
            versionsRaw = await fetchExternal(versionsUrl);
            try { versions = JSON.parse(versionsRaw); } catch(e) { versions = []; }
            
            // Prefer 'release' channel if available
            if (versions && versions.length > 0) {
                 const release = versions.find(v => v.version_type === 'release');
                 if (release) versions = [release]; 
                 // If no release, we just take the first one (beta/alpha)
            }
        }

        if(!versions || versions.length === 0) return res.status(404).json({ error: "No compatible version found for this server version." });
        
        const targetVersion = versions[0]; 
        const primaryFile = targetVersion.files.find(f => f.primary) || targetVersion.files[0];
        
        if(!primaryFile) return res.status(404).json({ error: "No download file found in Modrinth response." });

        console.log(`Installing Plugin: ${primaryFile.filename} from ${primaryFile.url}`);
        await downloadFile(primaryFile.url, path.join(pluginsDir, primaryFile.filename));
        res.json({ success: true, fileName: primaryFile.filename });
    } catch(e) {
        console.error("Plugin Install Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/plugins/delete', (req, res) => {
    try {
        const { path: serverPath, fileName } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(DATA_DIR, cleanServerPath, 'plugins', fileName);
        if(fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "File not found" });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// BACKUP & SAVE ROUTES
app.post('/api/server/save', (req, res) => {
    try {
        const { id } = req.body;
        const process = runningServers.get(id);
        if (process) {
            process.stdin.write('save-all\n');
            io.to(`server-${id}`).emit('console-log', { id, message: '[NodeStack] Saving world...' });
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Server not running" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/server/backup/create', (req, res) => {
    try {
        const { id, path: serverPath } = req.body;
        createBackup(id, serverPath);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/server/backup/list', (req, res) => {
    try {
        const { path: serverPath } = req.body;
        const cleanPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const backupsDir = path.join(DATA_DIR, cleanPath, 'backups');
        
        if (!fs.existsSync(backupsDir)) {
            return res.json({ backups: [] });
        }
        
        const files = fs.readdirSync(backupsDir);
        const backups = files
            .filter(f => f.endsWith('.tar.gz'))
            .map(f => {
                const stat = fs.statSync(path.join(backupsDir, f));
                return {
                    name: f,
                    createdAt: stat.birthtimeMs,
                    size: stat.size,
                    path: path.join('backups', f) // relative path for download
                };
            })
            .sort((a, b) => b.createdAt - a.createdAt);
            
        res.json({ backups });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/server/backup/delete', (req, res) => {
    try {
        const { path: serverPath, filename } = req.body;
        const cleanPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const backupFile = path.join(DATA_DIR, cleanPath, 'backups', filename);
        
        if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Backup not found" });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// FILE ROUTES
app.post('/api/files/list', (req, res) => {
  try {
    const { path: serverPath, subPath = '' } = req.body;
    if(!serverPath) return res.status(400).json({ error: 'Missing path' });
    const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
    const cleanSubPath = subPath ? subPath.replace(/^(\.\.(\/|\\|$))+/, '') : '';
    const serverRoot = path.join(DATA_DIR, 'servers');
    const targetDir = path.resolve(DATA_DIR, cleanServerPath, cleanSubPath);
    if (!targetDir.startsWith(serverRoot)) return res.status(403).json({ error: 'Access Denied' });
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return res.json([]); 
    const files = fs.readdirSync(targetDir);
    const fileList = files.map(f => {
       try {
         const fullPath = path.join(targetDir, f);
         const stats = fs.statSync(fullPath);
         return { name: f, isDirectory: stats.isDirectory(), size: stats.size, lastModified: stats.mtimeMs, path: path.join(subPath, f).replace(/\\/g, '/') };
       } catch(e) { return null; }
    }).filter(f => f !== null);
    fileList.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
    });
    res.json(fileList);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/files/delete', (req, res) => {
    try {
        const { path: serverPath, subPath } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const cleanSubPath = subPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const serverRoot = path.join(DATA_DIR, 'servers');
        const target = path.resolve(DATA_DIR, cleanServerPath, cleanSubPath);
        if (!target.startsWith(serverRoot)) return res.status(403).json({ error: 'Access Denied' });
        if(fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
            res.json({ success: true });
        } else { res.status(404).json({ error: 'File not found' }); }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/files/upload', (req, res) => {
    try {
        const { path: serverPath, subPath, name, contentBase64 } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const cleanSubPath = subPath ? subPath.replace(/^(\.\.(\/|\\|$))+/, '') : '';
        const serverRoot = path.join(DATA_DIR, 'servers');
        const targetDir = path.resolve(DATA_DIR, cleanServerPath, cleanSubPath);
        if (!targetDir.startsWith(serverRoot)) return res.status(403).json({ error: 'Access Denied' });
        if(!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const filePath = path.join(targetDir, name);
        fs.writeFileSync(filePath, Buffer.from(contentBase64, 'base64'));
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/files/zip', (req, res) => {
    try {
        const { path: serverPath } = req.body;
        const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const serverRoot = path.join(DATA_DIR, 'servers');
        const targetDir = path.resolve(DATA_DIR, cleanServerPath);
        if (!targetDir.startsWith(serverRoot)) return res.status(403).json({ error: 'Access Denied' });
        const zipName = `server-files-${Date.now()}.tar.gz`;
        exec(`tar -czf "${zipName}" .`, { cwd: targetDir }, (err) => {
            if (err) return res.status(500).json({ error: 'Compression failed.' });
            res.json({ success: true, downloadUrl: `/api/files/download-zip?path=${serverPath}&file=${zipName}` });
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/files/download-zip', (req, res) => {
    const { path: serverPath, file } = req.query;
    if (!serverPath || !file) return res.status(400).send("Missing parameters");
    const cleanServerPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
    const cleanFile = file.replace(/^(\.\.(\/|\\|$))+/, '');
    const serverRoot = path.join(DATA_DIR, 'servers');
    const filePath = path.resolve(DATA_DIR, cleanServerPath, cleanFile);
    if (!filePath.startsWith(serverRoot)) return res.status(403).send("Access Denied");
    if (fs.existsSync(filePath)) {
        res.download(filePath, file, (err) => {
            // Optional: delete after download if it's a temp file, but for backups we keep them
            // if(!err) try { fs.unlinkSync(filePath); } catch(e){}
        });
    } else { res.status(404).send("File not found"); }
});

// SERVER MANAGEMENT ROUTES
app.post('/api/create-server', async (req, res) => {
  try {
    const data = req.body;
    const serverId = Math.random().toString(36).substring(2, 10);
    const safeName = data.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderName = `${safeName}-${serverId}`;
    const serverPath = path.join(SERVERS_DIR, folderName);
    fs.mkdirSync(serverPath);
    
    let resolvedVersion = data.version;
    if (!resolvedVersion || resolvedVersion === 'latest') {
        try {
            if (data.software === 'paper') {
                const projectData = JSON.parse(await fetchExternal('https://api.papermc.io/v2/projects/paper'));
                resolvedVersion = projectData.versions[projectData.versions.length - 1];
            } else {
                const manifestRaw = await fetchExternal('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                const manifest = JSON.parse(manifestRaw);
                resolvedVersion = manifest.latest.release;
            }
        } catch(e) {
            console.error("Failed to resolve latest version, defaulting to 1.20.4. Error:", e.message);
            resolvedVersion = "1.20.4";
        }
    }

    // ENABLE RCON BY DEFAULT
    // Random port for RCON to avoid conflicts (Range 20000-30000)
    const rconPort = 20000 + Math.floor(Math.random() * 10000);
    const props = `#Minecraft server properties\n#Generated by NodeStack\nserver-port=${data.port}\nmax-players=${data.maxPlayers}\nmotd=${data.motd.replace(/\n/g, ' ')}\nview-distance=10\nonline-mode=true\ndifficulty=normal\ngamemode=survival\npvp=true\nenable-rcon=true\nrcon.password=nodestack${serverId}\nrcon.port=${rconPort}\n`;
    
    fs.writeFileSync(path.join(serverPath, 'server.properties'), props);
    fs.writeFileSync(path.join(serverPath, 'eula.txt'), "eula=true");
    fs.writeFileSync(path.join(serverPath, 'logs.txt'), '');
    
    const serverConfig = {
        id: serverId, name: data.name, 
        version: resolvedVersion,
        software: data.software || 'vanilla',
        memory: data.memory, port: data.port, maxPlayers: data.maxPlayers, motd: data.motd,
        eulaAccepted: data.eula, status: 'created', createdAt: Date.now(),
        path: `servers/${folderName}`, 
        logHistoryLimit: 100, 
        autoBackup: { enabled: false, interval: 60 },
        autoSave: { enabled: true, interval: 10 }
    };
    fs.writeFileSync(path.join(serverPath, 'nodestack.json'), JSON.stringify(serverConfig, null, 2));
    
    let downloadUrl = '';
    try {
        if (data.software === 'paper') downloadUrl = await resolvePaperUrl(resolvedVersion);
        else downloadUrl = await resolveVanillaUrl(resolvedVersion);
        
        console.log(`Downloading ${data.software} (${resolvedVersion}) from: ${downloadUrl}`);
        await downloadFile(downloadUrl, path.join(serverPath, 'server.jar'));
        serverConfig.status = 'ready';
        fs.writeFileSync(path.join(serverPath, 'nodestack.json'), JSON.stringify(serverConfig, null, 2));
        res.json({ success: true, id: serverId, path: `servers/${folderName}`, server: serverConfig });
    } catch (dlError) {
        console.error("Download Error:", dlError);
        try { fs.rmSync(serverPath, { recursive: true, force: true }); } catch(e){}
        res.status(500).json({ success: false, error: 'Failed to download server jar: ' + dlError.message });
    }
  } catch (error) { 
      console.error("Create Server Error:", error);
      res.status(500).json({ success: false, error: error.message }); 
  }
});

app.get('/api/servers', (req, res) => {
  try {
    const servers = [];
    if (!fs.existsSync(SERVERS_DIR)) return res.json([]);
    const files = fs.readdirSync(SERVERS_DIR);
    for (const file of files) {
      const fullPath = path.join(SERVERS_DIR, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const configFile = path.join(fullPath, 'nodestack.json');
        if (fs.existsSync(configFile)) {
          try {
            const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
            if (runningServers.has(config.id)) {
                config.status = 'running';
                const stats = runtimeStats.get(config.id);
                if(stats) config.activePlayers = stats.count;
            } else if (config.status !== 'created') {
                config.status = 'stopped';
            }
            servers.push(config);
          } catch (e) {}
        }
      }
    }
    servers.sort((a, b) => b.createdAt - a.createdAt);
    res.json(servers);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/delete-server', (req, res) => {
  try {
    const { path: serverPathStr } = req.body;
    const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(DATA_DIR, cleanPath);
    if (!fullPath.startsWith(path.join(DATA_DIR, 'servers'))) return res.status(403).json({ error: 'Forbidden' });
    if (fs.existsSync(fullPath)) {
       fs.rmSync(fullPath, { recursive: true, force: true });
       res.json({ success: true });
    } else { res.status(404).json({ error: 'Not found' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/update-server', (req, res) => {
    try {
        const { id, path: serverPath, updates } = req.body;
        const cleanPath = serverPath.replace(/^(\.\.(\/|\\|$))+/, '');
        const fullPath = path.join(DATA_DIR, cleanPath, 'nodestack.json');
        if(fs.existsSync(fullPath)) {
            const current = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            const newConfig = { ...current, ...updates };
            fs.writeFileSync(fullPath, JSON.stringify(newConfig, null, 2));
            res.json({ success: true, server: newConfig });
        } else { res.status(404).json({ error: 'Server config not found' }); }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/read-file', (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath || filePath.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const fullPath = path.join(DATA_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.json({ content });
    } else {
      if (filePath.endsWith('.json')) res.json({ content: '[]' });
      else res.json({ content: '' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/read-nbt', (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath || filePath.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const fullPath = path.join(DATA_DIR, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    const fileBuffer = fs.readFileSync(fullPath);
    if (fileBuffer.length > 2 && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b) {
        try {
            const unzipped = zlib.gunzipSync(fileBuffer);
            const reader = new NbtReader(unzipped);
            const data = reader.parse();
            res.json({ content: JSON.stringify(data, (key, value) => {
                if (typeof value === 'bigint') return value.toString();
                return value;
            }, 2) });
        } catch (e) { res.status(500).json({ error: 'Failed to parse NBT: ' + e.message }); }
    } else { res.status(400).json({ error: 'Not a standard Gzipped NBT file' }); }
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/write-file', (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || filePath.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const fullPath = path.join(DATA_DIR, filePath);
    fs.writeFileSync(fullPath, content);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GLOBAL WAYPOINTS
app.post('/api/server/waypoints', (req, res) => {
    try {
        const { path: serverPathStr, action, waypoint, waypointId } = req.body;
        const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
        const waypointsFile = path.join(DATA_DIR, cleanPath, 'nodestack-waypoints.json');
        
        let waypoints = [];
        if(fs.existsSync(waypointsFile)) {
            try { waypoints = JSON.parse(fs.readFileSync(waypointsFile, 'utf-8')); } catch(e){}
        }

        if (action === 'add') {
             waypoints.push(waypoint);
        } else if (action === 'delete') {
             waypoints = waypoints.filter(w => w.id !== waypointId);
        }

        fs.writeFileSync(waypointsFile, JSON.stringify(waypoints, null, 2));
        res.json({ success: true, waypoints });

    } catch(e) {
        console.error("Server Waypoint Error:", e);
        res.status(500).json({error: e.message});
    }
});

// PLAYER HISTORY WAYPOINTS (Legacy/Player specific)
app.post('/api/players/waypoints', (req, res) => {
    try {
        const { path: serverPathStr, playerName, waypoint, action, waypointId } = req.body;
        const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
        const historyFile = path.join(DATA_DIR, cleanPath, 'nodestack-players.json');
        
        let history = [];
        if(fs.existsSync(historyFile)) {
            try { history = JSON.parse(fs.readFileSync(historyFile, 'utf-8')); } catch(e){}
        }

        const playerIdx = history.findIndex(p => p.name.toLowerCase() === playerName.toLowerCase());
        if(playerIdx === -1) return res.status(404).json({error: "Player not found in history"});

        if(action === 'add') {
             if(!history[playerIdx].waypoints) history[playerIdx].waypoints = [];
             history[playerIdx].waypoints.push(waypoint);
        } else if (action === 'delete') {
             if(history[playerIdx].waypoints) {
                 history[playerIdx].waypoints = history[playerIdx].waypoints.filter(w => w.id !== waypointId);
             }
        }

        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
        
        // Find server ID from path to emit update
        // servers/folder-id -> id is after last dash usually
        const match = cleanPath.match(/-([a-z0-9]+)$/);
        if(match) {
            const serverId = match[1];
            io.to(`server-${serverId}`).emit('player-history-update', { history });
        }

        res.json({ success: true, waypoints: history[playerIdx].waypoints });

    } catch(e) {
        console.error("Waypoint Error:", e);
        res.status(500).json({error: e.message});
    }
});

app.post('/api/players/get-offline-pos', async (req, res) => {
    try {
        const { path: serverPathStr, uuid } = req.body;
        if(!uuid) return res.status(400).json({error: "UUID required"});
        
        const cleanPath = serverPathStr.replace(/^(\.\.(\/|\\|$))+/, '');
        const serverDir = path.join(DATA_DIR, cleanPath);
        
        // Find world name
        const props = readProperties(cleanPath);
        const levelName = props['level-name'] || 'world';
        
        const playerDataPath = path.join(serverDir, levelName, 'playerdata', `${uuid}.dat`);
        
        if (!fs.existsSync(playerDataPath)) return res.status(404).json({error: "Player data file not found"});

        const fileBuffer = fs.readFileSync(playerDataPath);
        const unzipped = zlib.gunzipSync(fileBuffer);
        const reader = new NbtReader(unzipped);
        const data = reader.parse();
        
        if(data && data.Pos && data.Pos.length >= 3) {
            res.json({ pos: { x: data.Pos[0], y: data.Pos[1], z: data.Pos[2] }, dimension: data.Dimension || 'minecraft:overworld' });
        } else {
            res.status(404).json({error: "Position data not found in NBT"});
        }

    } catch(e) {
        console.error("Offline Pos Error:", e);
        res.status(500).json({error: e.message});
    }
});


app.get('/api/lookup-uuid', async (req, res) => {
    try {
        const { username } = req.query;
        const respRaw = await fetchExternal(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        const data = JSON.parse(respRaw);
        if(data.id) {
            const raw = data.id;
            const formatted = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
            res.json({ id: formatted, name: data.name });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SOCKET.IO ---

const getProcessStats = (pid) => {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      const cmd = `powershell -Command "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter 'IDProcess=${pid}' | Select-Object PercentProcessorTime, WorkingSetPrivate"`;
      exec(cmd, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = stdout.trim().split('\n');
        const dataLine = lines.find(line => line.match(/^\s*\d+\s+\d+\s*$/));
        if (dataLine) {
           const [cpuStr, memStr] = dataLine.trim().split(/\s+/);
           resolve({ cpu: parseFloat(cpuStr), memory: parseInt(memStr) });
        } else { resolve(null); }
      });
    } else {
      exec(`ps -p ${pid} -o %cpu,rss`, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return resolve(null);
        const [cpu, rss] = lines[1].trim().split(/\s+/);
        resolve({ cpu: parseFloat(cpu), memory: parseInt(rss) * 1024 });
      });
    }
  });
};

setInterval(() => {
  runningServers.forEach(async (process, id) => {
    if (!process.pid || process.killed) return;
    const stats = await getProcessStats(process.pid);
    if (stats) {
      io.to(`server-${id}`).emit('stats-update', { id, stats });
    }
  });
}, 2000);

// --- Java Utils ---
const getInstalledJavaVersion = () => {
  return new Promise((resolve) => {
    exec('java -version', (err, stdout, stderr) => {
      const output = stderr || stdout || '';
      const match = output.match(/version "(\d+)(\.(\d+))?.*"/);
      if (match) {
        let major = parseInt(match[1]);
        if (major === 1 && match[3]) major = parseInt(match[3]);
        resolve(major);
      } else {
        const altMatch = output.match(/(openjdk|java) (\d+)/i);
        resolve(altMatch ? parseInt(altMatch[2]) : 0);
      }
    });
  });
};

const getRequiredJavaVersion = (mcVersion) => {
    if (mcVersion === 'Latest' || mcVersion === 'latest') return 21;
    const parts = mcVersion.split('.');
    if(parts.length < 2) return 8;
    const minor = parseInt(parts[1]);
    if (minor >= 20) {
        if (minor === 20 && (parts[2] ? parseInt(parts[2]) : 0) < 5) return 17;
        return 21;
    }
    if (minor >= 18) return 17;
    if (minor === 17) return 16;
    return 8;
};

const updatePlayerHistory = (serverId, playerName, action, serverPath, ip = null) => {
  try {
    const historyFile = path.join(serverPath, 'nodestack-players.json');
    let history = [];
    if (fs.existsSync(historyFile)) {
      try { history = JSON.parse(fs.readFileSync(historyFile, 'utf-8')); } catch (e) {}
    }
    const now = Date.now();
    let player = history.find(p => p.name.toLowerCase() === playerName.toLowerCase());

    if (!player) {
      player = { name: playerName, uuid: null, firstJoined: now, lastSeen: now, totalJoins: 0, isOnline: false, lastIp: ip };
      history.push(player);
    }

    if (action === 'join') {
      player.isOnline = true;
      player.lastSeen = now;
      player.totalJoins += 1;
      if (ip) player.lastIp = ip;
      
      try {
        const userCachePath = path.join(serverPath, 'usercache.json');
        if (fs.existsSync(userCachePath)) {
          const cache = JSON.parse(fs.readFileSync(userCachePath, 'utf-8'));
          const cachedEntry = cache.find(c => c.name.toLowerCase() === playerName.toLowerCase());
          if (cachedEntry) player.uuid = cachedEntry.uuid;
        }
      } catch(e) {}
    } else if (action === 'leave') {
      player.isOnline = false;
      player.lastSeen = now;
    }

    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    io.to(`server-${serverId}`).emit('player-history-update', { history });
  } catch (e) { console.error("Error updating player history:", e); }
};

io.on('connection', (socket) => {
  socket.on('join-server', (serverId) => {
    socket.join(`server-${serverId}`);
    const process = runningServers.get(serverId);
    if (process) {
      socket.emit('status-change', { id: serverId, status: 'running' });
      const stats = runtimeStats.get(serverId);
      if (stats) socket.emit('player-count', { id: serverId, count: stats.count });
    } else {
      socket.emit('status-change', { id: serverId, status: 'stopped' });
    }
    const tunnel = tunnelProcesses.get(serverId);
    if (tunnel) socket.emit('tunnel-status', { id: serverId, active: true, url: tunnel.cachedUrl || null });
    else socket.emit('tunnel-status', { id: serverId, active: false });

    const files = fs.readdirSync(SERVERS_DIR);
    let serverPathStr = null;
    let logLimit = 100;
    for(const f of files) {
      if(f.includes(serverId)) {
        serverPathStr = `servers/${f}`;
        try {
           const confPath = path.join(SERVERS_DIR, f, 'nodestack.json');
           if(fs.existsSync(confPath)) {
               const conf = JSON.parse(fs.readFileSync(confPath));
               if(conf.logHistoryLimit) logLimit = conf.logHistoryLimit;
           }
        } catch(e){}
        break;
      }
    }
    if (serverPathStr) socket.emit('log-history', { id: serverId, logs: getRecentLogs(serverPathStr, logLimit) });
  });

  socket.on('request-status-refresh', () => {
    runningServers.forEach((proc, id) => {
      socket.emit('status-change', { id, status: 'running' });
      const stats = runtimeStats.get(id);
      if (stats) socket.emit('player-count', { id, count: stats.count });
    });
  });
  
  socket.on('start-tunnel', ({ id, port, password, username }) => {
    if (tunnelProcesses.has(id)) return;
    
    console.log(`Starting tunnel for ${id} on port ${port} using python wrapper`);

    // Using the python wrapper script for more robust handling
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
    
    const passArg = password || "null";
    const userArg = username || "null";

    // Use current directory for script location if in exe, or __dirname in dev
    const scriptBase = process.pkg ? path.dirname(process.execPath) : __dirname;
    let scriptPath = path.join(scriptBase, 'startpinggy_tcp.py');

    // PKG COMPATIBILITY FIX: Extract script to filesystem if running in PKG and file missing
    if (process.pkg && !fs.existsSync(scriptPath)) {
        try {
            // Read from virtual asset inside snapshot
            const internalPath = path.join(__dirname, 'startpinggy_tcp.py');
            if (fs.existsSync(internalPath)) {
                 const content = fs.readFileSync(internalPath);
                 fs.writeFileSync(scriptPath, content);
                 console.log(`Extracted startpinggy_tcp.py for execution to ${scriptPath}`);
            } else {
                 console.error("Internal startpinggy_tcp.py not found in snapshot!");
            }
        } catch(e) {
            console.error("Failed to extract pinggy script:", e);
            // Fallback to internal, hoping python can read it (unlikely for virtual)
            scriptPath = path.join(__dirname, 'startpinggy_tcp.py');
        }
    } else if (!process.pkg) {
         // Dev mode
         if (!fs.existsSync(scriptPath)) scriptPath = path.join(__dirname, 'startpinggy_tcp.py');
    }

    const tunnel = spawn(pythonCmd, [scriptPath, String(port), passArg, userArg], { 
        stdio: ['pipe', 'pipe', 'pipe'] 
    });

    tunnel.cachedUrl = null;
    tunnelProcesses.set(id, tunnel);
    io.to(`server-${id}`).emit('tunnel-status', { id, active: true, url: null });
    
    const handleData = (data) => {
        const str = data.toString().trim();
        // Check for specific prefix from python script
        if (str.includes('PINGGY_URL=')) {
             const url = str.split('PINGGY_URL=')[1].trim();
             tunnel.cachedUrl = url;
             io.to(`server-${id}`).emit('tunnel-status', { id, active: true, url: url });
        }
    };

    tunnel.stdout.on('data', handleData);
    tunnel.stderr.on('data', (d) => {});
    
    tunnel.on('close', () => {
        tunnelProcesses.delete(id);
        io.to(`server-${id}`).emit('tunnel-status', { id, active: false });
    });
  });
  
  socket.on('stop-tunnel', ({ id }) => {
      const proc = tunnelProcesses.get(id);
      if(proc) proc.kill();
  });

  // Handle Requesting Real-time Player Data for Online Players
  socket.on('get-online-player-data', async ({ id, name }) => {
     // Use RCON if available and authenticated
     const rcon = rconClients.get(id);
     
     if(rcon && rcon.isAuthenticated) {
         try {
             const response = await rcon.sendCommand(`data get entity ${name}`);
             // Response usually matches format: "<name> has the following entity data: { ... }"
             const match = response.match(/has the following entity data: (\{.*\})/);
             if (match) {
                 const snbtData = match[1];
                 const jsonData = parseSNBT(snbtData);
                 if (jsonData) {
                    socket.emit('player-data-response', { id, name, data: jsonData });
                 } else {
                    socket.emit('player-data-response', { id, name, error: "Failed to parse player data (SNBT)." }); 
                 }
             } else {
                 socket.emit('player-data-response', { id, name, error: "Player not found or no data returned." });
             }
         } catch(e) {
             console.error(`RCON Error for ${id}:`, e.message);
             socket.emit('player-data-response', { id, name, error: "RCON Communication Error" });
         }
     } else {
         socket.emit('player-data-response', { id, name, error: "RCON not connected. Ensure enable-rcon=true in settings." });
     }
  });

  socket.on('send-command', async ({ id, command }) => {
     const rcon = rconClients.get(id);
     if (rcon && rcon.isAuthenticated) {
         try {
             await rcon.sendCommand(command);
             appendLog(`servers/${id}`, `> ${command}`); // Log manual command
         } catch(e) {
             console.error(`RCON Cmd Failed:`, e);
             // Fallback to STDIN
             const process = runningServers.get(id);
             if (process) process.stdin.write(command + '\n');
         }
     } else {
        const process = runningServers.get(id);
        if (process) {
           process.stdin.write(command + '\n');
        }
     }
  });

  socket.on('start-server', async (config) => {
    // Calling internal function
    startServerInstance(config);
  });

  socket.on('stop-server', (id) => {
    const process = runningServers.get(id);
    if (process) {
      process.stdin.write('stop\n');
      setTimeout(() => {
         if(runningServers.has(id)) {
             process.kill();
         }
      }, 10000);
    }
  });

  socket.on('kill-server', (id) => {
      const process = runningServers.get(id);
      if (process) {
          process.kill('SIGKILL');
      }
  });

  socket.on('restart-server', (config) => {
     const process = runningServers.get(config.id);
     if (process) {
         if(restartingServers.has(config.id)) return; // Already restarting

         // Mark as restarting - logic handled in process 'close' event
         restartingServers.set(config.id, config);
         
         io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: '[NodeStack] Restart sequence initiated...' });
         
         process.stdin.write('stop\n');
         
         // Fallback force kill if it hangs
         setTimeout(() => {
             if (runningServers.has(config.id) && restartingServers.has(config.id)) {
                 io.to(`server-${config.id}`).emit('console-log', { id: config.id, message: '[NodeStack] Server hang detected. Forcing kill...' });
                 console.log("Restart hanging, forcing kill...");
                 const p = runningServers.get(config.id);
                 if (p) p.kill();
             }
         }, 15000); // 15s timeout
     } else {
         // Not running, just start
         startServerInstance(config);
     }
  });
});

// --- SERVE STATIC FILES (REACT APP) ---
// This enables the exe to serve the dashboard without a separate frontend dev server
app.use(express.static(path.join(__dirname, 'dist')));

// SPA Fallback: Redirect any unknown request to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`NodeStack Backend running on http://localhost:${PORT}`);
  if (process.pkg) {
      console.log(`Running in Executable Mode. Data directory: ${DATA_DIR}`);
  }
});