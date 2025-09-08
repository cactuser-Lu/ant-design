// Jest setup file for site tests to polyfill Web APIs
const { TextEncoder, TextDecoder } = require('util');

// Polyfill File API for cheerio/undici compatibility
global.File = class MockFile {
  constructor(bits, filename, options = {}) {
    this.bits = bits;
    this.name = filename;
    this.type = options.type || '';
    this.lastModified = options.lastModified || Date.now();
    this.size = bits.reduce((size, bit) => {
      if (typeof bit === 'string') {
        return size + new TextEncoder().encode(bit).length;
      }
      return size + bit.byteLength;
    }, 0);
  }

  async text() {
    return this.bits.join('');
  }

  async arrayBuffer() {
    const encoder = new TextEncoder();
    const buffers = this.bits.map(bit =>
      typeof bit === 'string' ? encoder.encode(bit) : bit
    );
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new ArrayBuffer(totalLength);
    const view = new Uint8Array(result);
    let offset = 0;
    for (const buffer of buffers) {
      view.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    return result;
  }

  stream() {
    // Mock ReadableStream
    return {
      getReader() {
        let done = false;
        return {
          async read() {
            if (done) return { done: true };
            done = true;
            return {
              done: false,
              value: new TextEncoder().encode(this.bits.join(''))
            };
          }
        };
      }
    };
  }
};

// Polyfill FormData if needed
if (!global.FormData) {
  global.FormData = class MockFormData {
    constructor() {
      this._data = new Map();
    }

    append(name, value) {
      if (!this._data.has(name)) {
        this._data.set(name, []);
      }
      this._data.get(name).push(value);
    }

    get(name) {
      const values = this._data.get(name);
      return values ? values[0] : null;
    }

    getAll(name) {
      return this._data.get(name) || [];
    }

    has(name) {
      return this._data.has(name);
    }

    delete(name) {
      this._data.delete(name);
    }

    set(name, value) {
      this._data.set(name, [value]);
    }

    entries() {
      return this._data.entries();
    }

    keys() {
      return this._data.keys();
    }

    values() {
      return Array.from(this._data.values()).flat();
    }
  };
}

// Polyfill TextEncoder/TextDecoder if not available
if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

console.log('Site test environment setup complete with Web API polyfills');
