'use strict';

// Main chess application controller

class ChessApp {
  constructor() {
    this.engine = new ChessEngine();
    this.renderer = null;
    this.mp = new MultiplayerManager();

    this.selectedSquare = null;   // {r, c}
    this.validMoves = [];

    // Piece color settings (CSS hex strings → converted to THREE hex)
    this.pieceColorCSS = {
      white: '#e8d5b7',
      black: '#2c3e50'
    };
    this.gameMode = 'local'; // 'local' | 'online'

    this._initUI();
    this._initMultiplayer();
  }

  // ─── UI Initialization ────────────────────────────────────────────────────

  _initUI() {
    // Mode buttons
    document.getElementById('btn-local').addEventListener('click', () => {
      this.gameMode = 'local';
      this._setActiveMode('local');
      this.mp.setLocalMode();
    });
    document.getElementById('btn-create').addEventListener('click', () => {
      this.gameMode = 'online';
      this._setActiveMode('online-create');
    });
    document.getElementById('btn-join').addEventListener('click', () => {
      this.gameMode = 'online';
      this._setActiveMode('online-join');
    });

    // Color presets
    document.querySelectorAll('.color-preset').forEach(btn => {
      btn.addEventListener('click', e => {
        const target = btn.dataset.target;
        const color = btn.dataset.color;
        this.pieceColorCSS[target] = color;
        document.getElementById(`custom-${target}`).value = color;
        this._updateColorPreview(target, color);
        document.querySelectorAll(`.color-preset[data-target="${target}"]`)
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('custom-white').addEventListener('input', e => {
      this.pieceColorCSS.white = e.target.value;
      this._updateColorPreview('white', e.target.value);
      document.querySelectorAll('.color-preset[data-target="white"]')
        .forEach(b => b.classList.remove('active'));
    });
    document.getElementById('custom-black').addEventListener('input', e => {
      this.pieceColorCSS.black = e.target.value;
      this._updateColorPreview('black', e.target.value);
      document.querySelectorAll('.color-preset[data-target="black"]')
        .forEach(b => b.classList.remove('active'));
    });

    // Start button
    document.getElementById('btn-start').addEventListener('click', () => {
      this._startGame();
    });

    // Game controls
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this._newGame();
    });
    document.getElementById('btn-flip').addEventListener('click', () => {
      this._flipBoard();
    });

    // Close promotion dialog
    document.querySelectorAll('.promo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.piece;
        this._doPromotion(type, true);
      });
    });

    // Copy room code
    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = document.getElementById('room-code-display').textContent;
      navigator.clipboard.writeText(code).catch(() => {});
      document.getElementById('btn-copy-code').textContent = 'Copied!';
      setTimeout(() => {
        document.getElementById('btn-copy-code').textContent = 'Copy';
      }, 2000);
    });

    // Initialize color previews
    this._updateColorPreview('white', this.pieceColorCSS.white);
    this._updateColorPreview('black', this.pieceColorCSS.black);
    document.getElementById('custom-white').value = this.pieceColorCSS.white;
    document.getElementById('custom-black').value = this.pieceColorCSS.black;
  }

  _setActiveMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const panels = document.querySelectorAll('.online-panel');
    panels.forEach(p => p.classList.add('hidden'));

    if (mode === 'local') {
      document.getElementById('btn-local').classList.add('active');
    } else if (mode === 'online-create') {
      document.getElementById('btn-create').classList.add('active');
      document.getElementById('panel-create').classList.remove('hidden');
    } else if (mode === 'online-join') {
      document.getElementById('btn-join').classList.add('active');
      document.getElementById('panel-join').classList.remove('hidden');
    }
  }

  _updateColorPreview(target, color) {
    const preview = document.getElementById(`preview-${target}`);
    if (preview) preview.style.backgroundColor = color;
  }

  // ─── Multiplayer Setup ────────────────────────────────────────────────────

  _initMultiplayer() {
    this.mp.onWaiting = (roomId) => {
      document.getElementById('room-code-display').textContent = roomId;
      document.getElementById('room-code-area').classList.remove('hidden');
      this._showStatus('Waiting for opponent to join...', 'info');
    };

    this.mp.onConnected = (myColor) => {
      this._showStatus(`Connected as ${myColor}!`, 'success');
      this._startGameOnline(myColor);
    };

    this.mp.onMove = (fr, fc, tr, tc, promotion) => {
      this._applyMove(fr, fc, tr, tc, promotion);
    };

    this.mp.onPromotion = (pieceType) => {
      this._applyPromotion(pieceType);
    };

    this.mp.onReset = () => {
      this._resetGameState();
    };

    this.mp.onDisconnected = () => {
      this._showStatus('Opponent disconnected.', 'error');
    };

    this.mp.onError = (msg) => {
      this._showStatus(msg, 'error');
    };
  }

  // ─── Game Start ───────────────────────────────────────────────────────────

  _startGame() {
    if (this.gameMode === 'local') {
      this.mp.setLocalMode();
      this._launchGame(false);
    } else if (this.gameMode === 'online') {
      // Check if create or join
      const createPanel = document.getElementById('panel-create');
      const joinPanel   = document.getElementById('panel-join');

      if (!createPanel.classList.contains('hidden')) {
        // Host mode
        this.mp.createOnlineGame();
        // Game will start when onConnected fires
      } else if (!joinPanel.classList.contains('hidden')) {
        const codeInput = document.getElementById('join-code-input').value.trim();
        if (!codeInput) {
          this._showStatus('Please enter a room code.', 'error');
          return;
        }
        this.mp.joinOnlineGame(codeInput);
        this._showStatus('Connecting to host...', 'info');
      } else {
        this._showStatus('Please choose Create or Join.', 'error');
      }
    }
  }

  _startGameOnline(myColor) {
    const flipped = (myColor === 'black');
    this._launchGame(flipped);
  }

  _launchGame(flipped) {
    // Switch screens
    document.getElementById('screen-setup').classList.add('hidden');
    document.getElementById('screen-game').classList.remove('hidden');

    // Init engine
    this.engine.reset();

    // Init or re-init renderer
    if (!this.renderer) {
      this.renderer = new ChessRenderer3D('canvas-container');
      this.renderer.onSquareClick = (r, c) => this._onSquareClick(r, c);
    }

    const whiteHex = this._cssToHex(this.pieceColorCSS.white);
    const blackHex = this._cssToHex(this.pieceColorCSS.black);
    this.renderer.pieceColors.white = whiteHex;
    this.renderer.pieceColors.black = blackHex;

    this.renderer.flipped = flipped;
    this.renderer.setFlipped(flipped);
    this.renderer.resetCamera(flipped);
    this.renderer.initPieces(this.engine.board);
    this.renderer.setBoardRef(this.engine.board);

    this.selectedSquare = null;
    this.validMoves = [];
    this.renderer.clearHighlights();
    this.renderer.clearLastMove();

    this._updateInfoPanel();
    this._clearMoveLog();
  }

  _newGame() {
    if (this.mp.mode === MP_MODE.ONLINE) {
      this.mp.sendReset();
    }
    this._resetGameState();
  }

  _resetGameState() {
    this.engine.reset();
    if (this.renderer) {
      this.renderer.initPieces(this.engine.board);
      this.renderer.setBoardRef(this.engine.board);
      this.renderer.clearHighlights();
      this.renderer.clearLastMove();
    }
    this.selectedSquare = null;
    this.validMoves = [];
    this._updateInfoPanel();
    this._clearMoveLog();
  }

  _flipBoard() {
    if (this.renderer) {
      const newFlip = !this.renderer.flipped;
      this.renderer.setFlipped(newFlip);
      this.renderer.resetCamera(newFlip);
      this.renderer.clearHighlights();
      this.selectedSquare = null;
      this.validMoves = [];
    }
  }

  // ─── Click Handling ───────────────────────────────────────────────────────

  _onSquareClick(r, c) {
    if (this.engine.isOver()) return;
    if (this.engine.promotion) return; // waiting for promotion

    // Check if it's this player's turn (online mode)
    if (!this.mp.isMyTurn(this.engine.turn)) {
      this._showStatus("It's not your turn.", 'info');
      return;
    }

    const piece = this.engine.at(r, c);

    if (this.selectedSquare) {
      const { r: fr, c: fc } = this.selectedSquare;

      if (fr === r && fc === c) {
        // Deselect
        this.selectedSquare = null;
        this.validMoves = [];
        this.renderer.clearHighlights();
        return;
      }

      // Check if clicking a valid move target
      const isValidTarget = this.validMoves.some(m => m.r === r && m.c === c);

      if (isValidTarget) {
        this._executeMove(fr, fc, r, c);
      } else if (piece && piece.color === this.engine.turn) {
        // Select different piece
        this._selectPiece(r, c);
      } else {
        // Deselect
        this.selectedSquare = null;
        this.validMoves = [];
        this.renderer.clearHighlights();
      }
    } else {
      if (piece && piece.color === this.engine.turn) {
        this._selectPiece(r, c);
      }
    }
  }

  _selectPiece(r, c) {
    this.selectedSquare = { r, c };
    this.validMoves = this.engine.getValidMoves(r, c);
    this._drawHighlights(r, c);
  }

  _drawHighlights(selR, selC) {
    this.renderer.clearHighlights();
    this.renderer.highlightSelected(selR, selC);

    const squares = this.validMoves.map(m => {
      const hasEnemy = this.engine.at(m.r, m.c) !== null;
      const isEnPassant = m.special === 'enpassant';
      return {
        r: m.r,
        c: m.c,
        color: (hasEnemy || isEnPassant)
          ? this.renderer.highlightColor.capture
          : this.renderer.highlightColor.move
      };
    });
    this.renderer.highlightSquares(squares);
  }

  _executeMove(fr, fc, tr, tc, remotePromotion) {
    const result = this.engine.move(fr, fc, tr, tc, remotePromotion || null);
    if (!result.ok) return;

    // Update visuals
    if (result.special === 'enpassant') {
      this.renderer.removeEnPassant(fr, tc);
    }
    if (result.special === 'castle-k') {
      this.renderer.castleRookMove(this.engine.turn === 'white' ? 'black' : 'white', true);
    }
    if (result.special === 'castle-q') {
      this.renderer.castleRookMove(this.engine.turn === 'white' ? 'black' : 'white', false);
    }

    this.renderer.movePiece(fr, fc, tr, tc);
    this.renderer.showLastMove(fr, fc, tr, tc);
    this.renderer.clearHighlights();
    this.selectedSquare = null;
    this.validMoves = [];

    // Send move to opponent (online)
    this.mp.sendMove(fr, fc, tr, tc, remotePromotion || null);

    // Log
    this._logMove(this.engine.getLastMoveNotation());

    if (result.needsPromotion) {
      this._showPromotionDialog(tr, tc);
    } else {
      this._updateInfoPanel();
      this._checkGameOver();
    }
  }

  _applyMove(fr, fc, tr, tc, promotion) {
    // Remote move received (online mode)
    // Temporarily allow the move by overriding turn check
    const savedTurn = this.engine.turn;
    const oppColor = this.mp.myColor === 'white' ? 'black' : 'white';
    this.engine.turn = oppColor; // let engine accept opponent's move

    const result = this.engine.move(fr, fc, tr, tc, promotion || null);
    if (!result.ok) {
      this.engine.turn = savedTurn;
      return;
    }

    if (result.special === 'enpassant') {
      this.renderer.removeEnPassant(fr, tc);
    }
    if (result.special === 'castle-k') {
      this.renderer.castleRookMove(oppColor, true);
    }
    if (result.special === 'castle-q') {
      this.renderer.castleRookMove(oppColor, false);
    }

    this.renderer.movePiece(fr, fc, tr, tc);
    this.renderer.showLastMove(fr, fc, tr, tc);
    this.renderer.clearHighlights();
    this.selectedSquare = null;
    this.validMoves = [];

    this._logMove(this.engine.getLastMoveNotation());

    if (result.needsPromotion) {
      // Opponent promotes; show dialog so they can see but we handle via onPromotion callback
      this._showPromotionDialog(tr, tc);
    } else {
      this._updateInfoPanel();
      this._checkGameOver();
    }
  }

  _applyPromotion(pieceType) {
    this._doPromotion(pieceType, false);
  }

  // ─── Promotion ────────────────────────────────────────────────────────────

  _showPromotionDialog(r, c) {
    document.getElementById('promotion-dialog').classList.remove('hidden');
    // Store pending coords
    this._promotionCoords = { r, c };
  }

  _doPromotion(pieceType, sendToOpponent) {
    document.getElementById('promotion-dialog').classList.add('hidden');

    this.engine.promote(pieceType);

    // Update the piece visual
    const { r, c } = this._promotionCoords || {};
    if (r !== undefined) {
      const color = this.renderer.pieceMeshes[`${r},${c}`]
        ? (this.renderer._boardRef && this.renderer._boardRef[r][c]
            ? this.renderer._boardRef[r][c].color
            : null)
        : null;
      // Rebuild piece mesh for promoted piece
      if (this.engine.board[r][c]) {
        const p = this.engine.board[r][c];
        this.renderer.placePiece(r, c, p.type, p.color);
      }
    }

    if (sendToOpponent) {
      this.mp.sendPromotion(pieceType);
    }

    this._updateInfoPanel();
    this._checkGameOver();
  }

  // ─── Info Panel ───────────────────────────────────────────────────────────

  _updateInfoPanel() {
    const turnEl = document.getElementById('current-turn');
    const statusEl = document.getElementById('game-status');

    if (this.engine.isOver()) {
      const winner = this.engine.winner();
      turnEl.textContent = '–';
      if (winner) {
        statusEl.textContent = `Checkmate! ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins! 🏆`;
        statusEl.className = 'status-badge status-checkmate';
      } else {
        statusEl.textContent = 'Stalemate – Draw!';
        statusEl.className = 'status-badge status-stalemate';
      }
    } else {
      const turn = this.engine.turn;
      turnEl.textContent = turn.charAt(0).toUpperCase() + turn.slice(1);

      const colorDot = document.getElementById('turn-dot');
      colorDot.style.backgroundColor = this.pieceColorCSS[turn];

      if (this.engine.status === 'check') {
        statusEl.textContent = 'Check! ⚠️';
        statusEl.className = 'status-badge status-check';

        // Highlight king in check
        this._highlightKingInCheck();
      } else {
        statusEl.textContent = 'Playing';
        statusEl.className = 'status-badge status-playing';
      }
    }

    // Online: show which color you are
    if (this.mp.mode === MP_MODE.ONLINE && this.mp.myColor) {
      document.getElementById('your-color').textContent =
        'You are: ' + this.mp.myColor.charAt(0).toUpperCase() + this.mp.myColor.slice(1);
    } else {
      document.getElementById('your-color').textContent = '';
    }

    this._updateScoreBar();
  }

  _highlightKingInCheck() {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.engine.board[r][c];
        if (p && p.type === 'king' && p.color === this.engine.turn) {
          const geo = new THREE.RingGeometry(0.35, 0.48, 20);
          const mat = new THREE.MeshBasicMaterial({
            color: this.renderer.highlightColor.check,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
          });
          const mesh = new THREE.Mesh(geo, mat);
          const pos = this.renderer._boardTo3D(r, c);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(pos.x, 0.10, pos.z);
          this.renderer.scene.add(mesh);
          this.renderer.highlights.push(mesh);
          return;
        }
      }
    }
  }

  _checkGameOver() {
    if (this.engine.isOver()) {
      this._updateInfoPanel();
      setTimeout(() => {
        const winner = this.engine.winner();
        if (winner) {
          this._showStatus(`Checkmate! ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins! 🏆`, 'success');
        } else {
          this._showStatus('Stalemate – it\'s a draw!', 'info');
        }
      }, 300);
    }
  }

  _logMove(notation) {
    if (!notation) return;
    const log = document.getElementById('move-log');
    const moveNum = this.engine.history.length;
    const isWhiteMove = (moveNum % 2 === 1); // 1st, 3rd, 5th... are white's
    const span = document.createElement('span');
    span.className = 'move-entry';

    if (isWhiteMove) {
      const numSpan = document.createElement('span');
      numSpan.className = 'move-num';
      numSpan.textContent = Math.ceil(moveNum / 2) + '. ';
      log.appendChild(numSpan);
    }
    span.textContent = notation + ' ';
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
  }

  _clearMoveLog() {
    document.getElementById('move-log').innerHTML = '';
  }

  _showStatus(msg, type) {
    const el = document.getElementById('status-message');
    el.textContent = msg;
    el.className = 'status-message show ' + type;
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 4000);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  _cssToHex(cssColor) {
    // Convert "#rrggbb" to 0xRRGGBB
    const hex = cssColor.replace('#', '');
    return parseInt(hex, 16);
  }

  // Calculate material balance (positive = white ahead)
  _computeScore() {
    const values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
    let white = 0, black = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.engine.board[r][c];
        if (p) {
          if (p.color === 'white') white += values[p.type];
          else black += values[p.type];
        }
      }
    }
    return white - black;
  }

  // Update the evaluation bar with current material score
  _updateScoreBar() {
    const fill = document.getElementById('eval-fill');
    const label = document.getElementById('eval-label');
    if (!fill || !label) return;

    const score = this._computeScore();
    // Clamp to ±10 for display range
    const clamped = Math.max(-10, Math.min(10, score));
    // White fills from bottom: neutral=50%, white +10=100%, black +10=0%
    const whitePct = 50 + (clamped / 10) * 50;
    fill.style.height = whitePct + '%';

    if (score !== 0) {
      label.textContent = (score > 0 ? '+' : '') + score;
      // Position label near the dividing line
      const borderPct = 100 - whitePct;
      label.style.top = borderPct + '%';
    } else {
      label.textContent = '';
    }
  }
}

// Boot the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ChessApp();
});
