import { createHash } from 'node:crypto';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function createAcceptValue(key) {
  return createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64');
}

function encodeFrame(opcode, payload = '') {
  const data = Buffer.from(payload);
  const length = data.length;

  if (length >= 65536) {
    throw new Error('frame too large for scaffold websocket transport');
  }

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, length]), data]);
  }

  const header = Buffer.alloc(4);
  header[0] = 0x80 | opcode;
  header[1] = 126;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, data]);
}

function decodeFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) === 0x80;
  let payloadLength = second & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    throw new Error('64-bit websocket frames are unsupported in scaffold transport');
  }

  const maskLength = masked ? 4 : 0;
  const frameLength = offset + maskLength + payloadLength;
  if (buffer.length < frameLength) {
    return null;
  }

  let payload = buffer.subarray(offset + maskLength, frameLength);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    const decoded = Buffer.alloc(payloadLength);
    for (let index = 0; index < payloadLength; index += 1) {
      decoded[index] = payload[index] ^ mask[index % 4];
    }
    payload = decoded;
  }

  return {
    frame: {
      opcode,
      fin: (first & 0x80) === 0x80,
      payload: payload.toString('utf8')
    },
    bytesConsumed: frameLength
  };
}

class WebSocketConnection {
  constructor(socket, { onTerminate } = {}) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.messageHandlers = [];
    this.closeHandlers = [];
    this.onTerminate = onTerminate;

    socket.on('data', (chunk) => this.#handleData(chunk));
    socket.on('close', () => this.#handleClose());
    socket.on('end', () => this.#handleClose());
    socket.on('error', () => this.#handleClose());
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  onClose(handler) {
    this.closeHandlers.push(handler);
  }

  send(value) {
    if (this.closed) {
      return;
    }
    this.socket.write(encodeFrame(0x1, value));
  }

  close(code = 1000, reason = 'normal') {
    if (this.closed) {
      return;
    }

    const reasonBuffer = Buffer.from(reason);
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.socket.write(encodeFrame(0x8, payload));
    this.socket.end();
  }

  terminate() {
    if (this.closed) {
      return;
    }
    this.socket.destroy();
  }

  #handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const decoded = decodeFrame(this.buffer);
      if (!decoded) {
        return;
      }

      this.buffer = this.buffer.subarray(decoded.bytesConsumed);
      const { opcode, payload } = decoded.frame;

      if (opcode === 0x8) {
        this.close();
        return;
      }

      if (opcode === 0x9) {
        this.socket.write(encodeFrame(0xA, payload));
        continue;
      }

      if (opcode === 0x1) {
        for (const handler of this.messageHandlers) {
          handler(payload);
        }
      }
    }
  }

  #handleClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.onTerminate?.(this);
    for (const handler of this.closeHandlers) {
      handler();
    }
  }
}

export function attachWebSocketServer(server, { path = '/ws', onConnection }) {
  const connections = new Set();

  server.on('upgrade', (request, socket) => {
    if (request.url !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptValue = createAcceptValue(key);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptValue}`,
      '\r\n'
    ];

    socket.write(headers.join('\r\n'));
    const connection = new WebSocketConnection(socket, {
      onTerminate(closedConnection) {
        connections.delete(closedConnection);
      }
    });
    connections.add(connection);
    onConnection(connection, request);
  });

  return {
    closeAll(reason = 'server shutdown') {
      for (const connection of [...connections]) {
        connection.close(1001, reason);
        connection.terminate();
      }
      connections.clear();
    },
    connectionCount() {
      return connections.size;
    }
  };
}
