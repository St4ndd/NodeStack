const zlib = require('zlib');

class NbtReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }
    readByte() { return this.buffer.readInt8(this.offset++); }
    readShort() { const v = this.buffer.readInt16BE(this.offset); this.offset += 2; return v; }
    readInt() { const v = this.buffer.readInt32BE(this.offset); this.offset += 4; return v; }
    readLong() { 
        const high = this.buffer.readInt32BE(this.offset);
        const low = this.buffer.readInt32BE(this.offset + 4);
        this.offset += 8;
        return (BigInt(high) << 32n) | BigInt(low >>> 0);
    }
    readFloat() { const v = this.buffer.readFloatBE(this.offset); this.offset += 4; return v; }
    readDouble() { const v = this.buffer.readDoubleBE(this.offset); this.offset += 8; return v; }
    readString() {
        const len = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        const str = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += len;
        return str;
    }
    readTag(type) {
        switch (type) {
            case 0: return null;
            case 1: return this.readByte();
            case 2: return this.readShort();
            case 3: return this.readInt();
            case 4: return Number(this.readLong());
            case 5: return this.readFloat();
            case 6: return this.readDouble();
            case 7: {
                const len = this.readInt();
                const arr = [];
                for(let i=0; i<len; i++) arr.push(this.readByte());
                return arr;
            }
            case 8: return this.readString();
            case 9: {
                const itemType = this.readByte();
                const len = this.readInt();
                const list = [];
                for(let i=0; i<len; i++) list.push(this.readTag(itemType));
                return list;
            }
            case 10: {
                const obj = {};
                while(true) {
                    const tagType = this.readByte();
                    if(tagType === 0) break;
                    const name = this.readString();
                    obj[name] = this.readTag(tagType);
                }
                return obj;
            }
            case 11: {
                const len = this.readInt();
                const arr = [];
                for(let i=0; i<len; i++) arr.push(this.readInt());
                return arr;
            }
            case 12: {
                const len = this.readInt();
                const arr = [];
                for(let i=0; i<len; i++) arr.push(Number(this.readLong()));
                return arr;
            }
            default: throw new Error(`Unknown Tag Type: ${type}`);
        }
    }
    parse() {
        const type = this.readByte();
        if (type === 0) return null;
        const name = this.readString();
        return this.readTag(type);
    }
}

// Converts Minecraft text output (like /data get) into JSON
const parseSNBT = (snbt) => {
    try {
        if (!snbt) return null;
        let jsonStr = snbt;

        // 0. Handle Single Quoted Strings
        jsonStr = jsonStr.replace(/(?<!\\)'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
            const clean = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
            return `"${clean}"`;
        });

        // 1. Remove Array Type indicators
        jsonStr = jsonStr.replace(/\[[IBL];\s*/g, '[');

        // 2. Quote unquoted keys (handle dots, colons in keys)
        // Uses a callback to only quote if it looks like a key (followed by :)
        // We match "word:" or "word.word:" etc.
        jsonStr = jsonStr.replace(/(?:^|{|,)\s*([a-zA-Z0-9_.\-:]+)\s*:/g, (match, key) => {
            // Reconstruct the match but with quoted key
            const prefix = match.substring(0, match.lastIndexOf(key));
            return `${prefix}"${key}":`;
        });

        // 3. Clean Numbers (Suffixes)
        // Be very careful about order.
        // Floats/Doubles with suffix d/f/D/F
        // We look for numbers followed by suffix, then a separator
        jsonStr = jsonStr.replace(/(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[dfDF](?=[,\]}\s])/g, '$1');
        
        // Integers with suffix b/s/L/B/S
        jsonStr = jsonStr.replace(/(-?\d+)[bsLBS](?=[,\]}\s])/g, '$1');

        // 4. Quote unquoted string values
        // If a value is NOT: a number, boolean, null, object start {, array start [, or string start "
        // Then assume it is a string.
        // Note: We check what's AFTER the colon.
        // Regex lookbehind is not widely supported in all environments, so we use replace with callback/groups or carefully constructed lookaheads.
        // We match ": VALUE" where VALUE is unquoted.
        jsonStr = jsonStr.replace(/:\s*(?!(?:true|false|null|-?\d|\[|\{|"))([a-zA-Z0-9_.:\-\+]+)(?=\s*[,}\]])/g, ': "$1"');

        // 5. Quote unquoted string values in Arrays
        // Comma followed by unquoted string, followed by comma or bracket
        jsonStr = jsonStr.replace(/(?<=[\[,]\s*)(?!(?:true|false|null|-?\d|\[|\{|"))([a-zA-Z0-9_.:\-\+]+)(?=\s*[,\]])/g, '"$1"');

        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("SNBT Parse Error:", e.message);
        // Smart Debugging: Show context around error position
        const posMatch = e.message.match(/position (\d+)/);
        if (posMatch && snbt) {
            const pos = parseInt(posMatch[1]);
            const start = Math.max(0, pos - 50);
            const end = Math.min(snbt.length, pos + 50);
            console.error("Context:", snbt.substring(start, end));
            console.error("Marker :", " ".repeat(Math.max(0, pos - start)) + "^");
        } else {
            console.error("Failed SNBT (Partial):", snbt ? snbt.substring(0, 200) : 'null');
        }
        return null;
    }
};

module.exports = { NbtReader, parseSNBT };