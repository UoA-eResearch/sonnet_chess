'use strict';

// Multiplayer manager: local pass-and-play OR online via PeerJS (WebRTC)

const MP_MODE = { LOCAL: 'local', ONLINE: 'online' };

class MultiplayerManager {
  constructor() {
    this.mode = MP_MODE.LOCAL;
    this.peer = null;
    this.conn = null;
    this.myColor = null;   // 'white' | 'black' (online only)
    this.peerId = null;

    // Callbacks (set by app)
    this.onMove = null;
    this.onPromotion = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onError = null;
    this.onWaiting = null;   // called with roomId when host is waiting
  }

  setLocalMode() {
    this.mode = MP_MODE.LOCAL;
    this._destroyPeer();
    this.myColor = null;
  }

  // Host creates a new online game and gets a room code
  createOnlineGame() {
    this.mode = MP_MODE.ONLINE;
    this.myColor = 'white';
    this._destroyPeer();

    try {
      this.peer = new Peer(undefined, { debug: 1 });
    } catch (e) {
      if (this.onError) this.onError('PeerJS not available. Check your connection.');
      return;
    }

    this.peer.on('open', id => {
      this.peerId = id;
      if (this.onWaiting) this.onWaiting(id);
    });

    this.peer.on('connection', conn => {
      this.conn = conn;
      this._setupConn(conn);
    });

    this.peer.on('error', err => {
      if (this.onError) this.onError('Connection error: ' + err.type);
    });
  }

  // Guest joins an existing game by entering the host's room code
  joinOnlineGame(hostId) {
    this.mode = MP_MODE.ONLINE;
    this.myColor = 'black';
    this._destroyPeer();

    try {
      this.peer = new Peer(undefined, { debug: 1 });
    } catch (e) {
      if (this.onError) this.onError('PeerJS not available. Check your connection.');
      return;
    }

    this.peer.on('open', () => {
      try {
        const conn = this.peer.connect(hostId.trim(), { reliable: true });
        this.conn = conn;
        this._setupConn(conn);
      } catch (e) {
        if (this.onError) this.onError('Failed to connect to host.');
      }
    });

    this.peer.on('error', err => {
      if (this.onError) this.onError('Connection error: ' + err.type);
    });
  }

  _setupConn(conn) {
    conn.on('open', () => {
      if (this.onConnected) this.onConnected(this.myColor);
    });

    conn.on('data', data => {
      if (!data || !data.type) return;
      switch (data.type) {
        case 'move':
          if (this.onMove) this.onMove(data.fr, data.fc, data.tr, data.tc, data.promotion);
          break;
        case 'promotion':
          if (this.onPromotion) this.onPromotion(data.pieceType);
          break;
        case 'reset':
          if (this.onReset) this.onReset();
          break;
      }
    });

    conn.on('close', () => {
      if (this.onDisconnected) this.onDisconnected();
    });

    conn.on('error', err => {
      if (this.onError) this.onError('Peer connection error: ' + err);
    });
  }

  sendMove(fr, fc, tr, tc, promotion) {
    if (this.mode === MP_MODE.ONLINE && this.conn && this.conn.open) {
      this.conn.send({ type: 'move', fr, fc, tr, tc, promotion: promotion || null });
    }
  }

  sendPromotion(pieceType) {
    if (this.mode === MP_MODE.ONLINE && this.conn && this.conn.open) {
      this.conn.send({ type: 'promotion', pieceType });
    }
  }

  sendReset() {
    if (this.mode === MP_MODE.ONLINE && this.conn && this.conn.open) {
      this.conn.send({ type: 'reset' });
    }
  }

  // Is it currently this client's turn?
  isMyTurn(currentTurn) {
    if (this.mode === MP_MODE.LOCAL) return true;
    return currentTurn === this.myColor;
  }

  _destroyPeer() {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null;
    }
    this.conn = null;
    this.peerId = null;
  }

  destroy() {
    this._destroyPeer();
  }
}
