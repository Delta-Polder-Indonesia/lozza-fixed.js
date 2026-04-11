/*
  Bintang Toba Chess Engine (Web Worker)
  Modern lightweight UCI-like engine for browser workers.
*/

(() => {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Piece encoding
  const EMPTY = 0;
  const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
  const BP = 9, BN = 10, BB = 11, BR = 12, BQ = 13, BK = 14;

  const WHITE = 0;
  const BLACK = 1;

  const INF = 30000;
  const MATE = 29000;

  const FLAG_CAPTURE = 1;
  const FLAG_EP = 2;
  const FLAG_CASTLE = 4;
  const FLAG_PROMO = 8;

  const KNIGHT_DIR = [31, 33, 14, -14, 18, -18, -31, -33];
  const BISHOP_DIR = [15, 17, -15, -17];
  const ROOK_DIR = [1, -1, 16, -16];
  const KING_DIR = [1, -1, 16, -16, 15, 17, -15, -17];

  const PIECE_VALUE = {
    [WP]: 100, [WN]: 320, [WB]: 330, [WR]: 500, [WQ]: 900, [WK]: 0,
    [BP]: 100, [BN]: 320, [BB]: 330, [BR]: 500, [BQ]: 900, [BK]: 0,
  };

  const PIECE_CH = {
    [WP]: 'P', [WN]: 'N', [WB]: 'B', [WR]: 'R', [WQ]: 'Q', [WK]: 'K',
    [BP]: 'p', [BN]: 'n', [BB]: 'b', [BR]: 'r', [BQ]: 'q', [BK]: 'k',
  };

  const CH_PIECE = {
    P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK,
    p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK,
  };

  function isWhite(p) { return p >= WP && p <= WK; }
  function isBlack(p) { return p >= BP && p <= BK; }
  function colorOf(p) { return isWhite(p) ? WHITE : BLACK; }
  function opponent(c) { return c ^ 1; }
  function onBoard(sq) { return (sq & 0x88) === 0; }

  // Simple PSTs (white perspective); black uses mirrored squares.
  const PST_PAWN = [
      0,  0,  0,  0,  0,  0,  0,  0,
      6, 10, 10,-14,-14, 10, 10,  6,
      4,  6,  8, 18, 18,  8,  6,  4,
      2,  4,  6, 16, 16,  6,  4,  2,
      1,  2,  4, 14, 14,  4,  2,  1,
      2,  2,  2,  8,  8,  2,  2,  2,
      8, 10, 10,-10,-10, 10, 10,  8,
      0,  0,  0,  0,  0,  0,  0,  0,
  ];
  const PST_KNIGHT = [
    -30,-20,-10,-10,-10,-10,-20,-30,
    -20, -6,  0,  2,  2,  0, -6,-20,
    -10,  0,  8, 10, 10,  8,  0,-10,
    -10,  2, 10, 16, 16, 10,  2,-10,
    -10,  2, 10, 16, 16, 10,  2,-10,
    -10,  0,  8, 10, 10,  8,  0,-10,
    -20, -6,  0,  2,  2,  0, -6,-20,
    -30,-20,-10,-10,-10,-10,-20,-30,
  ];

  function sqToUci(sq) {
    const file = sq & 7;
    const rank = (sq >> 4) + 1;
    return FILES[file] + rank;
  }

  function uciToSq(uci) {
    if (!uci || uci.length < 2) return -1;
    const file = FILES.indexOf(uci[0]);
    const rank = Number(uci[1]) - 1;
    if (file < 0 || rank < 0 || rank > 7) return -1;
    return (rank << 4) | file;
  }

  class RNG {
    constructor(seed = 0x9e3779b1) { this.s = seed >>> 0; }
    next() {
      let x = this.s;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.s = x >>> 0;
      return this.s;
    }
  }

  class Engine {
    constructor() {
      this.name = 'Bintang Toba 1.0';
      this.author = 'Bintang Team';

      this.options = {
        Hash: 16,
        MultiPV: 1,
      };

      this.stop = false;
      this.searchId = 0;
      this.tt = new Map();
      this.maxTT = 250000;

      this.nodes = 0;
      this.selDepth = 0;
      this.startTime = 0;
      this.moveTime = 0;

      this.history = [];
      this.board = new Array(128).fill(EMPTY);
      this.side = WHITE;
      this.castle = 0; // 1 WK, 2 WQ, 4 BK, 8 BQ
      this.ep = -1;
      this.halfmove = 0;
      this.fullmove = 1;

      this.bestMove = null;
      this.rootPV = [];
      this.hashStack = [];

      this.zobrist = this.initZobrist();
      this.hash = 0;

      this.setFen(START_FEN);
    }

    initZobrist() {
      const rng = new RNG(0x12345678);
      const piece = Array.from({ length: 15 }, () => new Uint32Array(128));
      for (let p = 0; p < 15; p++) {
        for (let sq = 0; sq < 128; sq++) {
          piece[p][sq] = onBoard(sq) ? rng.next() : 0;
        }
      }
      const side = rng.next();
      const castle = new Uint32Array(16);
      for (let i = 0; i < 16; i++) castle[i] = rng.next();
      const ep = new Uint32Array(128);
      for (let i = 0; i < 128; i++) ep[i] = onBoard(i) ? rng.next() : 0;
      return { piece, side, castle, ep };
    }

    send(...parts) {
      postMessage(parts.join(' ').trim());
    }

    recomputeHash() {
      let h = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (p) h ^= this.zobrist.piece[p][sq];
      }
      h ^= this.zobrist.castle[this.castle];
      if (this.ep !== -1) h ^= this.zobrist.ep[this.ep];
      if (this.side === BLACK) h ^= this.zobrist.side;
      this.hash = h >>> 0;
    }

    clearBoard() {
      this.board.fill(EMPTY);
      this.side = WHITE;
      this.castle = 0;
      this.ep = -1;
      this.halfmove = 0;
      this.fullmove = 1;
      this.history.length = 0;
    }

    setFen(fen) {
      this.clearBoard();
      const parts = fen.trim().split(/\s+/);
      const rows = parts[0].split('/');
      let r = 7;
      for (const row of rows) {
        let f = 0;
        for (const ch of row) {
          if (ch >= '1' && ch <= '8') {
            f += Number(ch);
          } else {
            const sq = (r << 4) | f;
            this.board[sq] = CH_PIECE[ch] || EMPTY;
            f++;
          }
        }
        r--;
      }
      this.side = parts[1] === 'b' ? BLACK : WHITE;
      this.castle = 0;
      if ((parts[2] || '').includes('K')) this.castle |= 1;
      if ((parts[2] || '').includes('Q')) this.castle |= 2;
      if ((parts[2] || '').includes('k')) this.castle |= 4;
      if ((parts[2] || '').includes('q')) this.castle |= 8;
      this.ep = parts[3] && parts[3] !== '-' ? uciToSq(parts[3]) : -1;
      this.halfmove = Number(parts[4] || 0);
      this.fullmove = Number(parts[5] || 1);
      this.recomputeHash();
      this.hashStack = [this.hash];
    }

    getFen() {
      const rows = [];
      for (let r = 7; r >= 0; r--) {
        let row = '';
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const sq = (r << 4) | f;
          const p = this.board[sq];
          if (!p) empty++;
          else {
            if (empty) row += empty;
            empty = 0;
            row += PIECE_CH[p] || '1';
          }
        }
        if (empty) row += empty;
        rows.push(row);
      }
      const c = this.castle
        ? `${this.castle & 1 ? 'K' : ''}${this.castle & 2 ? 'Q' : ''}${this.castle & 4 ? 'k' : ''}${this.castle & 8 ? 'q' : ''}`
        : '-';
      return `${rows.join('/')} ${this.side === WHITE ? 'w' : 'b'} ${c} ${this.ep === -1 ? '-' : sqToUci(this.ep)} ${this.halfmove} ${this.fullmove}`;
    }

    kingSq(color) {
      const king = color === WHITE ? WK : BK;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        if (this.board[sq] === king) return sq;
      }
      return -1;
    }

    isAttacked(sq, byColor) {
      if (byColor === WHITE) {
        const a = sq - 15, b = sq - 17;
        if (onBoard(a) && this.board[a] === WP) return true;
        if (onBoard(b) && this.board[b] === WP) return true;
      } else {
        const a = sq + 15, b = sq + 17;
        if (onBoard(a) && this.board[a] === BP) return true;
        if (onBoard(b) && this.board[b] === BP) return true;
      }

      const n = byColor === WHITE ? WN : BN;
      for (const d of KNIGHT_DIR) {
        const to = sq + d;
        if (onBoard(to) && this.board[to] === n) return true;
      }

      const b = byColor === WHITE ? WB : BB;
      const r = byColor === WHITE ? WR : BR;
      const q = byColor === WHITE ? WQ : BQ;
      const k = byColor === WHITE ? WK : BK;

      for (const d of BISHOP_DIR) {
        let to = sq + d;
        while (onBoard(to)) {
          const p = this.board[to];
          if (p) {
            if (p === b || p === q) return true;
            break;
          }
          to += d;
        }
      }
      for (const d of ROOK_DIR) {
        let to = sq + d;
        while (onBoard(to)) {
          const p = this.board[to];
          if (p) {
            if (p === r || p === q) return true;
            break;
          }
          to += d;
        }
      }

      for (const d of KING_DIR) {
        const to = sq + d;
        if (onBoard(to) && this.board[to] === k) return true;
      }

      return false;
    }

    inCheck(color) {
      const ksq = this.kingSq(color);
      return this.isAttacked(ksq, opponent(color));
    }

    makeMove(m) {
      const st = {
        from: m.from, to: m.to, piece: m.piece, capture: m.capture,
        promo: m.promo || 0, flags: m.flags || 0,
        castle: this.castle, ep: this.ep,
        halfmove: this.halfmove, fullmove: this.fullmove,
        hash: this.hash,
      };
      this.history.push(st);

      this.ep = -1;
      this.halfmove++;
      if (m.piece === WP || m.piece === BP || m.capture) this.halfmove = 0;

      this.board[m.to] = m.promo || m.piece;
      this.board[m.from] = EMPTY;

      if (m.flags & FLAG_EP) {
        const capSq = this.side === WHITE ? m.to - 16 : m.to + 16;
        this.board[capSq] = EMPTY;
      }

      if (m.flags & FLAG_CASTLE) {
        if (m.to === uciToSq('g1')) {
          this.board[uciToSq('f1')] = WR;
          this.board[uciToSq('h1')] = EMPTY;
        } else if (m.to === uciToSq('c1')) {
          this.board[uciToSq('d1')] = WR;
          this.board[uciToSq('a1')] = EMPTY;
        } else if (m.to === uciToSq('g8')) {
          this.board[uciToSq('f8')] = BR;
          this.board[uciToSq('h8')] = EMPTY;
        } else if (m.to === uciToSq('c8')) {
          this.board[uciToSq('d8')] = BR;
          this.board[uciToSq('a8')] = EMPTY;
        }
      }

      if (m.piece === WK) this.castle &= ~3;
      if (m.piece === BK) this.castle &= ~12;
      if (m.from === uciToSq('a1') || m.to === uciToSq('a1')) this.castle &= ~2;
      if (m.from === uciToSq('h1') || m.to === uciToSq('h1')) this.castle &= ~1;
      if (m.from === uciToSq('a8') || m.to === uciToSq('a8')) this.castle &= ~8;
      if (m.from === uciToSq('h8') || m.to === uciToSq('h8')) this.castle &= ~4;

      if (m.piece === WP && m.to - m.from === 32) this.ep = m.from + 16;
      if (m.piece === BP && m.from - m.to === 32) this.ep = m.from - 16;

      if (this.side === BLACK) this.fullmove++;
      this.side = opponent(this.side);
      this.recomputeHash();
      this.hashStack.push(this.hash);
    }

    undoMove() {
      const st = this.history.pop();
      if (!st) return;

      this.side = opponent(this.side);
      this.castle = st.castle;
      this.ep = st.ep;
      this.halfmove = st.halfmove;
      this.fullmove = st.fullmove;

      this.board[st.from] = st.piece;
      this.board[st.to] = st.capture || EMPTY;

      if (st.flags & FLAG_EP) {
        const capSq = this.side === WHITE ? st.to - 16 : st.to + 16;
        this.board[capSq] = this.side === WHITE ? BP : WP;
        this.board[st.to] = EMPTY;
      }

      if (st.flags & FLAG_CASTLE) {
        if (st.to === uciToSq('g1')) {
          this.board[uciToSq('h1')] = WR;
          this.board[uciToSq('f1')] = EMPTY;
        } else if (st.to === uciToSq('c1')) {
          this.board[uciToSq('a1')] = WR;
          this.board[uciToSq('d1')] = EMPTY;
        } else if (st.to === uciToSq('g8')) {
          this.board[uciToSq('h8')] = BR;
          this.board[uciToSq('f8')] = EMPTY;
        } else if (st.to === uciToSq('c8')) {
          this.board[uciToSq('a8')] = BR;
          this.board[uciToSq('d8')] = EMPTY;
        }
      }

      this.hash = st.hash;
      this.hashStack.pop();
    }

    mirror64(idx64) {
      const r = idx64 >> 3;
      const f = idx64 & 7;
      return ((7 - r) << 3) | f;
    }

    sq128To64(sq) {
      return ((sq >> 4) << 3) | (sq & 7);
    }

    isDraw() {
      if (this.halfmove >= 100) return true;
      const cur = this.hash;
      let reps = 0;
      for (let i = this.hashStack.length - 1; i >= 0; i--) {
        if (this.hashStack[i] === cur) reps++;
      }
      return reps >= 3;
    }

    genMoves(capturesOnly = false) {
      const moves = [];
      const us = this.side;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (!p) continue;
        if (us === WHITE && !isWhite(p)) continue;
        if (us === BLACK && !isBlack(p)) continue;

        if (p === WP || p === BP) {
          const up = p === WP ? 16 : -16;
          const startRank = p === WP ? 1 : 6;
          const promoRank = p === WP ? 6 : 1;
          const rank = sq >> 4;

          const one = sq + up;
          if (!capturesOnly && onBoard(one) && this.board[one] === EMPTY) {
            if (rank === promoRank) {
              const promos = p === WP ? [WQ, WR, WB, WN] : [BQ, BR, BB, BN];
              for (const pr of promos) moves.push({ from: sq, to: one, piece: p, capture: EMPTY, promo: pr, flags: FLAG_PROMO });
            } else {
              moves.push({ from: sq, to: one, piece: p, capture: EMPTY, promo: 0, flags: 0 });
              const two = sq + up + up;
              if ((sq >> 4) === startRank && this.board[two] === EMPTY) {
                moves.push({ from: sq, to: two, piece: p, capture: EMPTY, promo: 0, flags: 0 });
              }
            }
          }

          const caps = p === WP ? [15, 17] : [-15, -17];
          for (const d of caps) {
            const to = sq + d;
            if (!onBoard(to)) continue;
            const tp = this.board[to];
            if (tp && colorOf(tp) !== us) {
              if (rank === promoRank) {
                const promos = p === WP ? [WQ, WR, WB, WN] : [BQ, BR, BB, BN];
                for (const pr of promos) moves.push({ from: sq, to, piece: p, capture: tp, promo: pr, flags: FLAG_CAPTURE | FLAG_PROMO });
              } else {
                moves.push({ from: sq, to, piece: p, capture: tp, promo: 0, flags: FLAG_CAPTURE });
              }
            }
            if (to === this.ep) {
              moves.push({ from: sq, to, piece: p, capture: p === WP ? BP : WP, promo: 0, flags: FLAG_CAPTURE | FLAG_EP });
            }
          }
          continue;
        }

        const addSlider = (dirs) => {
          for (const d of dirs) {
            let to = sq + d;
            while (onBoard(to)) {
              const tp = this.board[to];
              if (!tp) {
                if (!capturesOnly) moves.push({ from: sq, to, piece: p, capture: EMPTY, promo: 0, flags: 0 });
              } else {
                if (colorOf(tp) !== us) moves.push({ from: sq, to, piece: p, capture: tp, promo: 0, flags: FLAG_CAPTURE });
                break;
              }
              to += d;
            }
          }
        };

        if (p === WN || p === BN) {
          for (const d of KNIGHT_DIR) {
            const to = sq + d;
            if (!onBoard(to)) continue;
            const tp = this.board[to];
            if (!tp) {
              if (!capturesOnly) moves.push({ from: sq, to, piece: p, capture: EMPTY, promo: 0, flags: 0 });
            } else if (colorOf(tp) !== us) {
              moves.push({ from: sq, to, piece: p, capture: tp, promo: 0, flags: FLAG_CAPTURE });
            }
          }
        } else if (p === WB || p === BB) {
          addSlider(BISHOP_DIR);
        } else if (p === WR || p === BR) {
          addSlider(ROOK_DIR);
        } else if (p === WQ || p === BQ) {
          addSlider(BISHOP_DIR);
          addSlider(ROOK_DIR);
        } else if (p === WK || p === BK) {
          for (const d of KING_DIR) {
            const to = sq + d;
            if (!onBoard(to)) continue;
            const tp = this.board[to];
            if (!tp) {
              if (!capturesOnly) moves.push({ from: sq, to, piece: p, capture: EMPTY, promo: 0, flags: 0 });
            } else if (colorOf(tp) !== us) {
              moves.push({ from: sq, to, piece: p, capture: tp, promo: 0, flags: FLAG_CAPTURE });
            }
          }

          if (!capturesOnly) {
            if (us === WHITE && sq === uciToSq('e1') && !this.inCheck(WHITE)) {
              if ((this.castle & 1) && !this.board[uciToSq('f1')] && !this.board[uciToSq('g1')] &&
                  !this.isAttacked(uciToSq('f1'), BLACK) && !this.isAttacked(uciToSq('g1'), BLACK)) {
                moves.push({ from: sq, to: uciToSq('g1'), piece: WK, capture: EMPTY, promo: 0, flags: FLAG_CASTLE });
              }
              if ((this.castle & 2) && !this.board[uciToSq('d1')] && !this.board[uciToSq('c1')] && !this.board[uciToSq('b1')] &&
                  !this.isAttacked(uciToSq('d1'), BLACK) && !this.isAttacked(uciToSq('c1'), BLACK)) {
                moves.push({ from: sq, to: uciToSq('c1'), piece: WK, capture: EMPTY, promo: 0, flags: FLAG_CASTLE });
              }
            }
            if (us === BLACK && sq === uciToSq('e8') && !this.inCheck(BLACK)) {
              if ((this.castle & 4) && !this.board[uciToSq('f8')] && !this.board[uciToSq('g8')] &&
                  !this.isAttacked(uciToSq('f8'), WHITE) && !this.isAttacked(uciToSq('g8'), WHITE)) {
                moves.push({ from: sq, to: uciToSq('g8'), piece: BK, capture: EMPTY, promo: 0, flags: FLAG_CASTLE });
              }
              if ((this.castle & 8) && !this.board[uciToSq('d8')] && !this.board[uciToSq('c8')] && !this.board[uciToSq('b8')] &&
                  !this.isAttacked(uciToSq('d8'), WHITE) && !this.isAttacked(uciToSq('c8'), WHITE)) {
                moves.push({ from: sq, to: uciToSq('c8'), piece: BK, capture: EMPTY, promo: 0, flags: FLAG_CASTLE });
              }
            }
          }
        }
      }

      // legal filter
      const legal = [];
      const usCheck = this.side;
      for (const m of moves) {
        this.makeMove(m);
        if (!this.inCheck(usCheck)) legal.push(m);
        this.undoMove();
      }
      return legal;
    }

    moveToUci(m) {
      if (!m) return '0000';
      const base = sqToUci(m.from) + sqToUci(m.to);
      if (!(m.flags & FLAG_PROMO)) return base;
      const ch = PIECE_CH[m.promo] || 'q';
      return base + ch.toLowerCase();
    }

    evaluate() {
      let score = 0;
      let whiteMob = 0;
      let blackMob = 0;

      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (!p) continue;
        const v = PIECE_VALUE[p] || 0;
        const idx64 = this.sq128To64(sq);
        let pst = 0;
        if (p === WP || p === BP) pst = PST_PAWN[isWhite(p) ? idx64 : this.mirror64(idx64)];
        else if (p === WN || p === BN) pst = PST_KNIGHT[isWhite(p) ? idx64 : this.mirror64(idx64)];

        score += isWhite(p) ? (v + pst) : -(v + pst);

        // very light mobility bonus to stabilize quiet choices
        if (p === WN || p === WB || p === WR || p === WQ) whiteMob++;
        if (p === BN || p === BB || p === BR || p === BQ) blackMob++;
      }
      score += (whiteMob - blackMob) * 2;
      return this.side === WHITE ? score : -score;
    }

    orderMoves(moves) {
      moves.sort((a, b) => {
        const av = (a.capture ? (10 * (PIECE_VALUE[a.capture] - PIECE_VALUE[a.piece])) : 0) + ((a.flags & FLAG_PROMO) ? 800 : 0);
        const bv = (b.capture ? (10 * (PIECE_VALUE[b.capture] - PIECE_VALUE[b.piece])) : 0) + ((b.flags & FLAG_PROMO) ? 800 : 0);
        return bv - av;
      });
    }

    qsearch(alpha, beta, ply) {
      if (this.stop) return alpha;
      if (Date.now() - this.startTime > this.moveTime) {
        this.stop = true;
        return alpha;
      }
      if (this.isDraw()) return 0;

      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);
      const stand = this.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;

      const moves = this.genMoves(true);
      this.orderMoves(moves);
      for (const m of moves) {
        this.makeMove(m);
        const score = -this.qsearch(-beta, -alpha, ply + 1);
        this.undoMove();
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    probeTT(depth, alpha, beta) {
      const e = this.tt.get(this.hash);
      if (!e || e.depth < depth) return null;
      if (e.flag === 0) return e.score;
      if (e.flag === -1 && e.score <= alpha) return e.score;
      if (e.flag === 1 && e.score >= beta) return e.score;
      return null;
    }

    storeTT(depth, score, flag, best) {
      if (this.tt.size > this.maxTT) this.tt.clear();
      this.tt.set(this.hash, { depth, score, flag, best: best ? this.moveToUci(best) : '0000' });
    }

    negamax(depth, alpha, beta, ply) {
      if (this.stop) return 0;
      if (Date.now() - this.startTime > this.moveTime) {
        this.stop = true;
        return 0;
      }

      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);

      if (this.isDraw()) return 0;

      const inChk = this.inCheck(this.side);
      if (depth <= 0) return this.qsearch(alpha, beta, ply);

      const ttScore = this.probeTT(depth, alpha, beta);
      if (ttScore !== null) return ttScore;

      const moves = this.genMoves(false);
      if (moves.length === 0) return inChk ? -MATE + ply : 0;

      this.orderMoves(moves);
      const alpha0 = alpha;
      let best = null;

      for (const m of moves) {
        this.makeMove(m);
        const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        this.undoMove();
        if (this.stop) return 0;
        if (score > alpha) {
          alpha = score;
          best = m;
          if (alpha >= beta) break;
        }
      }

      let flag = 0;
      if (alpha <= alpha0) flag = -1;
      else if (alpha >= beta) flag = 1;
      this.storeTT(depth, alpha, flag, best);
      return alpha;
    }

    pvLine(depth) {
      const line = [];
      const seen = new Set();
      for (let i = 0; i < depth; i++) {
        const e = this.tt.get(this.hash);
        if (!e || !e.best || e.best === '0000') break;
        const m = this.findMoveByUci(e.best);
        if (!m) break;
        const key = this.hash + ':' + e.best;
        if (seen.has(key)) break;
        seen.add(key);
        line.push(e.best);
        this.makeMove(m);
      }
      for (let i = 0; i < line.length; i++) this.undoMove();
      return line;
    }

    findMoveByUci(uci) {
      const moves = this.genMoves(false);
      for (const m of moves) {
        if (this.moveToUci(m) === uci) return m;
      }
      return null;
    }

    search(spec) {
      this.stop = false;
      this.searchId++;
      this.nodes = 0;
      this.selDepth = 0;
      this.startTime = Date.now();

      const depthLimit = spec.depth || 10;
      this.moveTime = Math.max(20, spec.moveTime || this.calcMoveTime(spec));
      const multiPV = Math.max(1, Math.min(8, (spec.multiPV || this.options.MultiPV) | 0));

      let best = null;
      let bestScore = -INF;

      for (let d = 1; d <= depthLimit; d++) {
        const rootMoves = this.genMoves(false);
        this.orderMoves(rootMoves);
        const scored = [];

        for (const m of rootMoves) {
          if (this.stop) break;
          this.makeMove(m);
          const score = -this.negamax(d - 1, -INF, INF, 1);
          this.undoMove();
          scored.push({ m, score });
        }

        scored.sort((a, b) => b.score - a.score);
        if (scored.length) {
          best = scored[0].m;
          bestScore = scored[0].score;
        }

        const elapsed = Date.now() - this.startTime;
        const nps = elapsed > 0 ? Math.floor((this.nodes * 1000) / elapsed) : this.nodes;
        const hashfull = Math.min(1000, Math.floor((this.tt.size / this.maxTT) * 1000));

        for (let i = 0; i < Math.min(multiPV, scored.length); i++) {
          const entry = scored[i];
          this.makeMove(entry.m);
          const pv = [this.moveToUci(entry.m), ...this.pvLine(Math.max(0, d - 1))].join(' ');
          this.undoMove();
          const cp = entry.score;
            const evalBar = Math.max(0, Math.min(100, 50 + Math.round(cp / 20)));
            if (Math.abs(cp) > MATE - 200) {
            const mate = cp > 0 ? Math.floor((MATE - cp + 1) / 2) : -Math.floor((MATE + cp + 1) / 2);
            this.send('info depth', d, 'seldepth', this.selDepth, 'multipv', i + 1, 'score mate', mate,
              'nodes', this.nodes, 'nps', nps, 'hashfull', hashfull, 'time', elapsed, 'pv', pv);
              this.send('info string evalbar', evalBar);
          } else {
            this.send('info depth', d, 'seldepth', this.selDepth, 'multipv', i + 1, 'score cp', cp,
              'nodes', this.nodes, 'nps', nps, 'hashfull', hashfull, 'time', elapsed, 'pv', pv);
              this.send('info string evalbar', evalBar);
          }
        }

        if (this.stop) break;
      }

      this.bestMove = best;
      this.send('bestmove', this.moveToUci(best));
    }

    calcMoveTime(spec) {
      if (spec.moveTime) return spec.moveTime;
      const t = this.side === WHITE ? (spec.wtime || 0) : (spec.btime || 0);
      const inc = this.side === WHITE ? (spec.winc || 0) : (spec.binc || 0);
      const mtg = spec.movestogo || 30;
      if (!t) return 1000;
      return Math.floor(t / Math.max(10, mtg) + inc * 0.8);
    }

    handlePosition(tokens) {
      let i = 1;
      if (tokens[i] === 'startpos') {
        this.setFen(START_FEN);
        i++;
      } else if (tokens[i] === 'fen') {
        i++;
        const fenParts = [];
        while (i < tokens.length && tokens[i] !== 'moves') fenParts.push(tokens[i++]);
        this.setFen(fenParts.join(' '));
      }
      if (tokens[i] === 'moves') {
        i++;
        while (i < tokens.length) {
          const u = tokens[i++];
          const m = this.findMoveByUci(u);
          if (!m) break;
          this.makeMove(m);
        }
      }
    }

    handleGo(tokens) {
      const spec = {
        depth: 10,
        moveTime: 0,
        wtime: 0,
        btime: 0,
        winc: 0,
        binc: 0,
        movestogo: 30,
        multiPV: 0,
      };
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const v = Number(tokens[i + 1]);
        if (t === 'depth') spec.depth = v;
        if (t === 'movetime') spec.moveTime = v;
        if (t === 'wtime') spec.wtime = v;
        if (t === 'btime') spec.btime = v;
        if (t === 'winc') spec.winc = v;
        if (t === 'binc') spec.binc = v;
        if (t === 'movestogo') spec.movestogo = v;
        if (t === 'multipv') spec.multiPV = v;
      }
      this.search(spec);
    }

    handleSetOption(tokens) {
      const nameIdx = tokens.indexOf('name');
      const valueIdx = tokens.indexOf('value');
      if (nameIdx < 0) return;
      const name = tokens.slice(nameIdx + 1, valueIdx > -1 ? valueIdx : tokens.length).join(' ');
      const value = valueIdx > -1 ? tokens.slice(valueIdx + 1).join(' ') : '';
      if (name === 'Hash') {
        this.options.Hash = Math.max(1, Math.min(512, Number(value) || 16));
        this.maxTT = Math.max(10000, this.options.Hash * 15000);
        this.tt.clear();
      }
      if (name === 'MultiPV') {
        this.options.MultiPV = Math.max(1, Math.min(8, Number(value) || 1));
      }
    }

    command(line) {
      const tokens = line.trim().split(/\s+/);
      if (!tokens[0]) return;
      const cmd = tokens[0];

      if (cmd === 'uci') {
        this.send('id name', this.name);
        this.send('id author', this.author);
        this.send('option name Hash type spin default 16 min 1 max 512');
        this.send('option name MultiPV type spin default 1 min 1 max 8');
        this.send('option name Ponder type check default false');
        this.send('uciok');
        return;
      }
      if (cmd === 'isready') {
        this.send('readyok');
        return;
      }
      if (cmd === 'ucinewgame') {
        this.tt.clear();
        this.setFen(START_FEN);
        return;
      }
      if (cmd === 'position') {
        this.handlePosition(tokens);
        return;
      }
      if (cmd === 'go') {
        this.handleGo(tokens);
        return;
      }
      if (cmd === 'stop') {
        this.stop = true;
        return;
      }
      if (cmd === 'setoption') {
        this.handleSetOption(tokens);
        return;
      }
      if (cmd === 'd' || cmd === 'fen') {
        this.send('info string', this.getFen());
        return;
      }
      if (cmd === 'quit') {
        this.stop = true;
      }
    }
  }

  const engine = new Engine();

  function handleInput(data) {
    const text = String(data || '');
    const lines = text.split(/\r?\n/);
    for (const ln of lines) {
      const line = ln.trim();
      if (line) engine.command(line);
    }
  }

  self.onmessage = (e) => handleInput(e.data);
})();
