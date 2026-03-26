'use strict';

const PIECE = {
  KING: 'king',
  QUEEN: 'queen',
  ROOK: 'rook',
  BISHOP: 'bishop',
  KNIGHT: 'knight',
  PAWN: 'pawn'
};

const COLOR = {
  WHITE: 'white',
  BLACK: 'black'
};

class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = this._initBoard();
    this.turn = COLOR.WHITE;
    this.enPassant = null; // {r, c} square where en passant capture lands
    this.castling = {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true }
    };
    this.history = [];
    this.status = 'playing'; // playing | check | checkmate | stalemate
    this.promotion = null;   // {r, c} when awaiting promotion choice
  }

  _initBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const order = [PIECE.ROOK, PIECE.KNIGHT, PIECE.BISHOP, PIECE.QUEEN,
                   PIECE.KING, PIECE.BISHOP, PIECE.KNIGHT, PIECE.ROOK];
    for (let c = 0; c < 8; c++) {
      b[0][c] = { type: order[c], color: COLOR.BLACK };
      b[1][c] = { type: PIECE.PAWN, color: COLOR.BLACK };
      b[6][c] = { type: PIECE.PAWN, color: COLOR.WHITE };
      b[7][c] = { type: order[c], color: COLOR.WHITE };
    }
    return b;
  }

  at(r, c) {
    return (r >= 0 && r < 8 && c >= 0 && c < 8) ? this.board[r][c] : null;
  }

  // Returns all legal moves for piece at (r,c)
  getValidMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece || piece.color !== this.turn) return [];
    return this._pseudo(r, c).filter(m => !this._inCheckAfter(r, c, m));
  }

  _pseudo(r, c) {
    const p = this.board[r][c];
    if (!p) return [];
    switch (p.type) {
      case PIECE.PAWN:   return this._pawnMoves(r, c, p.color);
      case PIECE.ROOK:   return this._slide(r, c, p.color, [[0,1],[0,-1],[1,0],[-1,0]]);
      case PIECE.BISHOP: return this._slide(r, c, p.color, [[1,1],[1,-1],[-1,1],[-1,-1]]);
      case PIECE.QUEEN:  return this._slide(r, c, p.color,
        [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);
      case PIECE.KNIGHT: return this._jump(r, c, p.color,
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]);
      case PIECE.KING:   return this._kingMoves(r, c, p.color);
      default: return [];
    }
  }

  _slide(r, c, color, dirs) {
    const moves = [];
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const t = this.board[nr][nc];
        if (t) {
          if (t.color !== color) moves.push({ r: nr, c: nc });
          break;
        }
        moves.push({ r: nr, c: nc });
      }
    }
    return moves;
  }

  _jump(r, c, color, offsets) {
    return offsets
      .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
      .filter(({ r: nr, c: nc }) =>
        nr >= 0 && nr < 8 && nc >= 0 && nc < 8 &&
        (!this.board[nr][nc] || this.board[nr][nc].color !== color));
  }

  _pawnMoves(r, c, color) {
    const moves = [];
    const d = color === COLOR.WHITE ? -1 : 1;
    const startRow = color === COLOR.WHITE ? 6 : 1;
    const nr = r + d;
    if (nr < 0 || nr > 7) return moves;

    // Forward one
    if (!this.board[nr][c]) {
      moves.push({ r: nr, c, special: 'pawn' });
      // Forward two from start
      const nr2 = r + 2 * d;
      if (r === startRow && !this.board[nr2][c]) {
        moves.push({ r: nr2, c, special: 'pawn2' });
      }
    }
    // Diagonal captures
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (nc < 0 || nc > 7) continue;
      const t = this.board[nr][nc];
      if (t && t.color !== color) {
        moves.push({ r: nr, c: nc, special: 'capture' });
      }
      if (this.enPassant && this.enPassant.r === nr && this.enPassant.c === nc) {
        moves.push({ r: nr, c: nc, special: 'enpassant' });
      }
    }
    return moves;
  }

  _kingMoves(r, c, color) {
    const moves = this._jump(r, c, color,
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);

    const homeRow = color === COLOR.WHITE ? 7 : 0;
    const rights = this.castling[color];

    if (r === homeRow && c === 4 && !this._attacked(r, c, color)) {
      if (rights.kingSide &&
          !this.board[homeRow][5] && !this.board[homeRow][6] &&
          !this._attacked(homeRow, 5, color) && !this._attacked(homeRow, 6, color)) {
        moves.push({ r: homeRow, c: 6, special: 'castle-k' });
      }
      if (rights.queenSide &&
          !this.board[homeRow][3] && !this.board[homeRow][2] && !this.board[homeRow][1] &&
          !this._attacked(homeRow, 3, color) && !this._attacked(homeRow, 2, color)) {
        moves.push({ r: homeRow, c: 2, special: 'castle-q' });
      }
    }
    return moves;
  }

  // Is (r,c) attacked by opponent of 'color'?
  _attacked(r, c, color) {
    const opp = color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
    for (let ar = 0; ar < 8; ar++) {
      for (let ac = 0; ac < 8; ac++) {
        const p = this.board[ar][ac];
        if (p && p.color === opp && this._attacksSquare(ar, ac, p, r, c)) return true;
      }
    }
    return false;
  }

  _attacksSquare(pr, pc, piece, tr, tc) {
    const dr = tr - pr, dc = tc - pc;
    switch (piece.type) {
      case PIECE.PAWN: {
        const d = piece.color === COLOR.WHITE ? -1 : 1;
        return dr === d && Math.abs(dc) === 1;
      }
      case PIECE.KNIGHT:
        return (Math.abs(dr) === 2 && Math.abs(dc) === 1) ||
               (Math.abs(dr) === 1 && Math.abs(dc) === 2);
      case PIECE.KING:
        return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0);
      case PIECE.ROOK:
        return (dr === 0 || dc === 0) && this._clearLine(pr, pc, tr, tc);
      case PIECE.BISHOP:
        return Math.abs(dr) === Math.abs(dc) && this._clearLine(pr, pc, tr, tc);
      case PIECE.QUEEN:
        return (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) &&
               this._clearLine(pr, pc, tr, tc);
    }
    return false;
  }

  _clearLine(r1, c1, r2, c2) {
    const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
    let r = r1 + dr, c = c1 + dc;
    while (r !== r2 || c !== c2) {
      if (this.board[r][c]) return false;
      r += dr; c += dc;
    }
    return true;
  }

  _inCheckAfter(fr, fc, move) {
    const savedBoard = JSON.parse(JSON.stringify(this.board));
    const savedEP = this.enPassant;
    const piece = this.board[fr][fc];

    this.board[move.r][move.c] = { ...piece };
    this.board[fr][fc] = null;

    if (move.special === 'enpassant') {
      this.board[fr][move.c] = null;
    }
    if (move.special === 'castle-k') {
      const row = piece.color === COLOR.WHITE ? 7 : 0;
      this.board[row][5] = this.board[row][7];
      this.board[row][7] = null;
    }
    if (move.special === 'castle-q') {
      const row = piece.color === COLOR.WHITE ? 7 : 0;
      this.board[row][3] = this.board[row][0];
      this.board[row][0] = null;
    }

    let kr = -1, kc = -1;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === PIECE.KING && p.color === piece.color) {
          kr = r; kc = c; break outer;
        }
      }
    }

    const inCheck = kr >= 0 && this._attacked(kr, kc, piece.color);
    this.board = savedBoard;
    this.enPassant = savedEP;
    return inCheck;
  }

  // Execute a move. Returns result object.
  move(fr, fc, tr, tc, promotion) {
    const piece = this.board[fr][fc];
    if (!piece || piece.color !== this.turn) return { ok: false, reason: 'not your piece' };

    const moves = this.getValidMoves(fr, fc);
    const m = moves.find(mv => mv.r === tr && mv.c === tc);
    if (!m) return { ok: false, reason: 'illegal move' };

    const captured = this.board[tr][tc];

    // Update en passant state
    this.enPassant = null;
    if (m.special === 'pawn2') {
      this.enPassant = { r: (fr + tr) / 2, c: tc };
    }

    // Handle specials before moving
    if (m.special === 'enpassant') {
      this.board[fr][tc] = null;
    }
    if (m.special === 'castle-k') {
      const row = piece.color === COLOR.WHITE ? 7 : 0;
      this.board[row][5] = { ...this.board[row][7] };
      this.board[row][7] = null;
    }
    if (m.special === 'castle-q') {
      const row = piece.color === COLOR.WHITE ? 7 : 0;
      this.board[row][3] = { ...this.board[row][0] };
      this.board[row][0] = null;
    }

    this.board[tr][tc] = { ...piece };
    this.board[fr][fc] = null;

    // Update castling rights
    if (piece.type === PIECE.KING) {
      this.castling[piece.color] = { kingSide: false, queenSide: false };
    }
    if (piece.type === PIECE.ROOK) {
      const homeRow = piece.color === COLOR.WHITE ? 7 : 0;
      if (fr === homeRow && fc === 0) this.castling[piece.color].queenSide = false;
      if (fr === homeRow && fc === 7) this.castling[piece.color].kingSide = false;
    }
    // If rook captured on its home square
    if (captured && captured.type === PIECE.ROOK) {
      const oppHomeRow = piece.color === COLOR.WHITE ? 0 : 7;
      if (tr === oppHomeRow && tc === 0) this.castling[captured.color].queenSide = false;
      if (tr === oppHomeRow && tc === 7) this.castling[captured.color].kingSide = false;
    }

    // Pawn promotion
    const promRow = piece.color === COLOR.WHITE ? 0 : 7;
    let needsPromotion = false;
    if (piece.type === PIECE.PAWN && tr === promRow) {
      if (promotion) {
        this.board[tr][tc].type = promotion;
      } else {
        this.promotion = { r: tr, c: tc };
        needsPromotion = true;
      }
    }

    this.history.push({
      fr, fc, tr, tc,
      piece: { ...piece },
      captured: captured ? { ...captured } : null,
      special: m.special
    });

    if (!needsPromotion) {
      this._nextTurn();
    }

    return { ok: true, special: m.special, captured, needsPromotion };
  }

  promote(type) {
    if (!this.promotion) return false;
    this.board[this.promotion.r][this.promotion.c].type = type;
    this.promotion = null;
    this._nextTurn();
    return true;
  }

  _nextTurn() {
    this.turn = this.turn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
    this._updateStatus();
  }

  _updateStatus() {
    let kr = -1, kc = -1;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === PIECE.KING && p.color === this.turn) {
          kr = r; kc = c; break outer;
        }
      }
    }

    const inCheck = this._attacked(kr, kc, this.turn);
    const hasMoves = this._hasAnyMoves();

    if (!hasMoves) {
      this.status = inCheck ? 'checkmate' : 'stalemate';
    } else {
      this.status = inCheck ? 'check' : 'playing';
    }
  }

  _hasAnyMoves() {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.color === this.turn && this.getValidMoves(r, c).length > 0) return true;
      }
    }
    return false;
  }

  isOver() {
    return this.status === 'checkmate' || this.status === 'stalemate';
  }

  winner() {
    if (this.status === 'checkmate') {
      return this.turn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
    }
    return null; // stalemate = draw
  }

  // Returns a human-readable move notation for the last move
  getLastMoveNotation() {
    if (this.history.length === 0) return '';
    const mv = this.history[this.history.length - 1];
    const files = 'abcdefgh';
    const ranks = '87654321';
    const from = files[mv.fc] + ranks[mv.fr];
    const to = files[mv.tc] + ranks[mv.tr];
    let s = '';
    if (mv.special === 'castle-k') return 'O-O';
    if (mv.special === 'castle-q') return 'O-O-O';
    const pieceSymbols = { king:'K', queen:'Q', rook:'R', bishop:'B', knight:'N', pawn:'' };
    s = pieceSymbols[mv.piece.type] + (mv.captured ? `${from}x` : from) + to;
    return s;
  }
}
