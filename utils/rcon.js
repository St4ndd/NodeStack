const net = require('net');

class RconClient {
    constructor(host, port, password) {
        this.host = host;
        this.port = port;
        this.password = password;
        this.socket = null;
        this.requestId = 1;
        this.isAuthenticated = false;
        this.queue = new Map(); // id -> {resolve, reject, timeout}
        this.buffer = Buffer.alloc(0);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.setTimeout(5000);
            
            this.socket.on('data', (data) => this.handleData(data));
            this.socket.on('error', (err) => { 
                // console.error('RCON Error:', err.message); 
                reject(err); 
            });
            this.socket.on('close', () => { 
                this.isAuthenticated = false; 
                this.socket = null;
            });

            this.socket.connect(this.port, this.host, () => {
                this.send(3, this.password) // Auth packet
                    .then(() => {
                        this.isAuthenticated = true;
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    send(type, body) {
        return new Promise((resolve, reject) => {
            if (!this.socket) return reject(new Error('Not connected'));
            
            const id = this.requestId++;
            const bodyBuf = Buffer.from(body, 'utf8');
            const len = 10 + bodyBuf.length; // 4+4+4+body+2
            
            const buf = Buffer.alloc(len + 4);
            buf.writeInt32LE(len, 0);
            buf.writeInt32LE(id, 4);
            buf.writeInt32LE(type, 8);
            bodyBuf.copy(buf, 12);
            buf[len + 2] = 0; // null terminator body
            buf[len + 3] = 0; // null terminator pad

            // Timeout request after 5s
            const timeout = setTimeout(() => {
                if(this.queue.has(id)) {
                    this.queue.delete(id);
                    reject(new Error('RCON Timeout'));
                }
            }, 5000);

            this.queue.set(id, { resolve, reject, timeout });
            this.socket.write(buf);
        });
    }

    handleData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= 12) { // Min packet size
            const len = this.buffer.readInt32LE(0);
            if (this.buffer.length < len + 4) break; // Wait for more data

            const packet = this.buffer.subarray(0, len + 4);
            this.buffer = this.buffer.subarray(len + 4);

            const id = packet.readInt32LE(4);
            const type = packet.readInt32LE(8);
            const body = packet.toString('utf8', 12, packet.length - 2);

            if (this.queue.has(id)) {
                const { resolve, timeout } = this.queue.get(id);
                clearTimeout(timeout);
                this.queue.delete(id);
                
                if (id === -1) { 
                    // Auth fail return ID -1
                    // Actually auth response id is usually the request id, but if auth fails it sends -1
                }
                resolve(body);
            } else if (id === -1) {
                // Auth failed packet
                // If we are waiting for auth (type 3), the first request in queue is auth
                // Find pending auth request?
                // Just find first pending?
            }
        }
    }
    
    sendCommand(cmd) {
        return this.send(2, cmd);
    }
    
    disconnect() {
        if(this.socket) {
            this.socket.end();
            this.socket.destroy();
        }
    }
}

module.exports = { RconClient };