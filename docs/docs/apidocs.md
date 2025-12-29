# Jamal Collab WebSocket API Specification

**Endpoint URL**: `wss://api.jamal.rplupiproject.com/collab`
**Protocol**: Socket.IO

## Authentication (Optional)

- **Auth Handshake (Socket.IO Option)**:
  ```json
  {
    "auth": {
      "apiKey": "YOUR_SECRET_KEY"
    }
  }
  ```
- **Query Parameter** (Alternatif):
  `ws://api.jamal.rplupiproject.com/collab?apiKey=YOUR_SECRET_KEY`

## 1. Client Mengirim (Publish)

Event yang dikirim dari Frontend ke Backend.

### `join`

Bergabung ke dalam room (workspace).

- **Payload (JSON)**:
  ```json
  {
    "roomId": "uuid-string"
  }
  ```

### `store:get`

Meminta data state terbaru dari server (snapshot).

- **Payload (JSON)**:
  ```json
  {
    "roomId": "uuid-string"
  }
  ```

### `store:set`

Mengganti seluruh data store (Full Sync). Hati-hati, ini menimpa data.

- **Payload (JSON)**:
  ```json
  {
    "roomId": "uuid-string",
    "version": 1,
    "store": {
      "schemaVersion": 1,
      "records": {}
    }
  }
  ```

### `store:patch`

Mengirim perubahan inkremental (tldraw changes).

- **Payload (JSON)**:
  ```json
  {
    "roomId": "uuid-string",
    "baseVersion": 1,
    "changes": {
      "put": [{ "id": "shape:1", "typeName": "shape", "x": 10, "y": 10 }],
      "update": [{ "id": "shape:2", "after": { "x": 20 } }],
      "remove": [{ "id": "shape:3" }]
    }
  }
  ```

---

## 2. Client Menerima (Subscribe)

Event yang dikirim dari Backend ke Frontend.

### `connected`

Diterima saat koneksi berhasil.

- **Response (JSON)**:
  ```json
  {
    "ok": true
  }
  ```

### `store:state`

Diterima sebagai balasan dari `join` atau `store:get`. Berisi full snapshot.

- **Response (JSON)**:
  ```json
  {
    "roomId": "uuid-string",
    "version": 10,
    "store": {
      "schemaVersion": 1,
      "records": { ... }
    }
  }
  ```

### `store:updated`

Broadcast ke semua client di room saat ada yang melakukan update/patch.

- **Response (JSON)**:
  ```json
  {
    "roomId": "uuid-string",
    "version": 11,
    "store": { ... }
  }
  ```

### `error`

Pesan error jika terjadi kesalahan (misal: versi konflik, payload invalid).

- **Response (JSON)**:
  ```json
  {
    "code": "VERSION_CONFLICT",
    "message": "Version conflict. current=10, base=9"
  }
  ```