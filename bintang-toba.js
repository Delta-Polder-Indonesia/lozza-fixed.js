/*
  Bintang Toba Chess Engine v2.0 (Web Worker)
  Fixed & optimized version.
*/

(() => {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const EMPTY = 0;
  const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
  const BP = 9, BN = 10, BB = 11, BR = 12, BQ = 13, BK = 14;

  const WHITE = 0;
  const BLACK = 1;

  const INF = 30000;
  const MATE = 29000;

  const FLAG_CAPTURE = 1;
  const FLAG_EP      = 2;
  const FLAG_CASTLE  = 4;
  const FLAG_PROMO   = 8;

  const KNIGHT_DIR = [31, 33, 14, -14, 18, -18, -31, -33];
  const BISHOP_DIR = [15, 17, -15, -17];
  const ROOK_DIR   = [1, -1, 16, -16];
  const KING_DIR   = [1, -1, 16, -16, 15, 17, -15, -17];

  const PIECE_VALUE = {
    [WP]: 100, [WN]: 320, [WB]: 330, [WR]: 500, [WQ]: 900, [WK]: 0,
    [BP]: 100, [BN]: 320, [BB]: 330, [BR]: 500, [BQ]: 900, [BK]: 0,
  };

  const PIECE_CH = {
    [WP]:'P',[WN]:'N',[WB]:'B',[WR]:'R',[WQ]:'Q',[WK]:'K',
    [BP]:'p',[BN]:'n',[BB]:'b',[BR]:'r',[BQ]:'q',[BK]:'k',
  };

  const CH_PIECE = {
    P:WP,N:WN,B:WB,R:WR,Q:WQ,K:WK,
    p:BP,n:BN,b:BB,r:BR,q:BQ,k:BK,
  };

  function isWhite(p)    { return p >= WP && p <= WK; }
  function isBlack(p)    { return p >= BP && p <= BK; }
  function colorOf(p)    { return isWhite(p) ? WHITE : BLACK; }
  function opponent(c)   { return c ^ 1; }
  function onBoard(sq)   { return (sq & 0x88) === 0; }

  /* ── Piece-square tables (white view, rank-8 first in array = rank index 7) ── */
  const PST_PAWN = [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ];
  const PST_KNIGHT = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ];
  const PST_BISHOP = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ];
  const PST_ROOK = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ];
  const PST_QUEEN = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ];
  const PST_KING_MG = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ];

  /* ────────────────────────────────────────────────────────── */

  class RNG {
    constructor(seed = 0x9e3779b1) { this.s = seed >>> 0; }
    next() {
      let x = this.s;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.s = x >>> 0;
      return this.s;
    }
  }

  /* ── Fixed-size TT using flat typed arrays ── */
  const TT_SIZE   = 1 << 20;   // 1 M slots (power-of-2 for fast mod)
  const TT_MASK   = TT_SIZE - 1;
  const TT_DEPTH  = 0;         // byte offsets into each slot (Uint32 view)
  const TT_FLAG   = 1;
  const TT_SCORE  = 2;
  const TT_HASH   = 3;
  const TT_BEST   = 4;         // best-move encoded as uint32
  const TT_WORDS  = 5;         // words per slot

  class TranspositionTable {
    constructor() {
      this.data = new Int32Array(TT_SIZE * TT_WORDS);
    }
    clear() { this.data.fill(0); }

    _idx(hash) { return ((hash >>> 0) & TT_MASK) * TT_WORDS; }

    probe(hash, depth, alpha, beta) {
      const i = this._idx(hash);
      if (this.data[i + TT_HASH] !== ((hash >>> 0) | 0)) return null;
      if (this.data[i + TT_DEPTH] < depth) return null;
      const score = this.data[i + TT_SCORE];
      const flag  = this.data[i + TT_FLAG];
      if (flag === 0)  return score;              // exact
      if (flag === -1 && score <= alpha) return score; // upper
      if (flag === 1  && score >= beta)  return score; // lower
      return null;
    }

    getBestMove(hash) {
      const i = this._idx(hash);
      if (this.data[i + TT_HASH] !== ((hash >>> 0) | 0)) return 0;
      return this.data[i + TT_BEST];
    }

    store(hash, depth, score, flag, bestEncoded) {
      const i = this._idx(hash);
      // Always-replace: simple, effective at low memory.
      this.data[i + TT_HASH]  = (hash >>> 0) | 0;
      this.data[i + TT_DEPTH] = depth;
      this.data[i + TT_SCORE] = score;
      this.data[i + TT_FLAG]  = flag;
      this.data[i + TT_BEST]  = bestEncoded | 0;
    }

    /* Encode / decode a move as a single int32 for TT storage */
    static encodeMove(m) {
      if (!m) return 0;
      return (m.from) | (m.to << 8) | ((m.promo || 0) << 16) | ((m.flags || 0) << 24);
    }
    static decodeMove(v) {
      if (!v) return null;
      return {
        from:    v & 0xff,
        to:     (v >>> 8)  & 0xff,
        promo:  (v >>> 16) & 0xff,
        flags:  (v >>> 24) & 0xff,
        piece: EMPTY, capture: EMPTY, // filled in by findMoveByEncoded
      };
    }
  }

  /* ────────────────────────────────────────────────────────── */

  function sqToUci(sq) {
    return FILES[sq & 7] + ((sq >> 4) + 1);
  }
  function uciToSq(uci) {
    if (!uci || uci.length < 2) return -1;
    const f = FILES.indexOf(uci[0]);
    const r = Number(uci[1]) - 1;
    if (f < 0 || r < 0 || r > 7) return -1;
    return (r << 4) | f;
  }

  /* Pre-compute common squares */
  const SQ = {};
  ['a1','b1','c1','d1','e1','f1','g1','h1',
   'a8','b8','c8','d8','e8','f8','g8','h8'].forEach(n => { SQ[n] = uciToSq(n); });

  /* ────────────────────────────────────────────────────────── */

  class Engine {
    constructor() {
      this.name   = 'Bintang Toba 2.0';
      this.author = 'Bintang Team';

      this.options = { Hash: 4, MultiPV: 1 };

      this.stop      = false;
      this.nodes     = 0;
      this.selDepth  = 0;
      this.startTime = 0;
      this.moveTime  = 0;

      /* Board state */
      this.board    = new Uint8Array(128);
      this.side     = WHITE;
      this.castle   = 0;
      this.ep       = -1;
      this.halfmove = 0;
      this.fullmove = 1;

      /* King square cache */
      this.kingPos  = [SQ['e1'], SQ['e8']];

      /* History stack */
      this.history  = [];
      this.hashStack = [];

      /* Killer moves [ply][0..1] */
      this.killers  = Array.from({length: 128}, () => [0, 0]);

      /* History heuristic [piece][to] */
      this.histTable = new Int32Array(15 * 128);

      /* Zobrist */
      this.Z = this._initZobrist();

      /* Transposition table */
      this.tt = new TranspositionTable();

      this.bestMove  = null;

      this.setFen(START_FEN);
    }

    /* ── Zobrist ── */
    _initZobrist() {
      const rng   = new RNG(0x12345678);
      const piece = Array.from({length: 15}, () => {
        const a = new Uint32Array(128);
        for (let sq = 0; sq < 128; sq++) a[sq] = onBoard(sq) ? rng.next() : 0;
        return a;
      });
      const side   = rng.next();
      const castle = new Uint32Array(16);
      for (let i = 0; i < 16; i++) castle[i] = rng.next();
      const ep = new Uint32Array(128);
      for (let i = 0; i < 128; i++) ep[i] = onBoard(i) ? rng.next() : 0;
      return { piece, side, castle, ep };
    }

    /* ── Communication ── */
    send(...parts) { postMessage(parts.join(' ').trim()); }

    /* ── FEN ── */
    clearBoard() {
      this.board.fill(0);
      this.side = WHITE; this.castle = 0; this.ep = -1;
      this.halfmove = 0; this.fullmove = 1;
      this.history.length = 0; this.hashStack.length = 0;
      this.kingPos[WHITE] = -1; this.kingPos[BLACK] = -1;
    }

    setFen(fen) {
      this.clearBoard();
      const parts = fen.trim().split(/\s+/);
      const rows  = parts[0].split('/');
      let r = 7;
      for (const row of rows) {
        let f = 0;
        for (const ch of row) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const sq = (r << 4) | f;
          const p  = CH_PIECE[ch] || EMPTY;
          this.board[sq] = p;
          if (p === WK) this.kingPos[WHITE] = sq;
          if (p === BK) this.kingPos[BLACK] = sq;
          f++;
        }
        r--;
      }
      this.side     = parts[1] === 'b' ? BLACK : WHITE;
      const cstr    = parts[2] || '-';
      this.castle   = 0;
      if (cstr.includes('K')) this.castle |= 1;
      if (cstr.includes('Q')) this.castle |= 2;
      if (cstr.includes('k')) this.castle |= 4;
      if (cstr.includes('q')) this.castle |= 8;
      this.ep       = (parts[3] && parts[3] !== '-') ? uciToSq(parts[3]) : -1;
      this.halfmove = +(parts[4] || 0);
      this.fullmove = +(parts[5] || 1);
      this._recomputeHash();
      this.hashStack.push(this.hash);
    }

    getFen() {
      const rows = [];
      for (let rk = 7; rk >= 0; rk--) {
        let row = ''; let emp = 0;
        for (let fl = 0; fl < 8; fl++) {
          const p = this.board[(rk << 4) | fl];
          if (!p) { emp++; continue; }
          if (emp) { row += emp; emp = 0; }
          row += PIECE_CH[p];
        }
        if (emp) row += emp;
        rows.push(row);
      }
      const c = this.castle
        ? `${this.castle&1?'K':''}${this.castle&2?'Q':''}${this.castle&4?'k':''}${this.castle&8?'q':''}`
        : '-';
      return `${rows.join('/')} ${this.side===WHITE?'w':'b'} ${c} ${this.ep===-1?'-':sqToUci(this.ep)} ${this.halfmove} ${this.fullmove}`;
    }

    /* ── Incremental Zobrist ── */
    _recomputeHash() {
      let h = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (p) h ^= this.Z.piece[p][sq];
      }
      h ^= this.Z.castle[this.castle];
      if (this.ep !== -1) h ^= this.Z.ep[this.ep];
      if (this.side === BLACK) h ^= this.Z.side;
      this.hash = h >>> 0;
    }

    /* ── Attack detection ── */
    isAttacked(sq, byColor) {
      const board = this.board;
      /* Pawn */
      if (byColor === WHITE) {
        if (onBoard(sq-15) && board[sq-15] === WP) return true;
        if (onBoard(sq-17) && board[sq-17] === WP) return true;
      } else {
        if (onBoard(sq+15) && board[sq+15] === BP) return true;
        if (onBoard(sq+17) && board[sq+17] === BP) return true;
      }
      /* Knight */
      const kn = byColor === WHITE ? WN : BN;
      for (const d of KNIGHT_DIR) {
        const to = sq + d;
        if (onBoard(to) && board[to] === kn) return true;
      }
      /* Sliders */
      const bi = byColor === WHITE ? WB : BB;
      const ro = byColor === WHITE ? WR : BR;
      const qu = byColor === WHITE ? WQ : BQ;
      for (const d of BISHOP_DIR) {
        let to = sq + d;
        while (onBoard(to)) {
          const p = board[to]; if (p) { if (p===bi||p===qu) return true; break; }
          to += d;
        }
      }
      for (const d of ROOK_DIR) {
        let to = sq + d;
        while (onBoard(to)) {
          const p = board[to]; if (p) { if (p===ro||p===qu) return true; break; }
          to += d;
        }
      }
      /* King */
      const ki = byColor === WHITE ? WK : BK;
      for (const d of KING_DIR) {
        const to = sq + d;
        if (onBoard(to) && board[to] === ki) return true;
      }
      return false;
    }

    inCheck(color) { return this.isAttacked(this.kingPos[color], opponent(color)); }

    /* ── Make / Undo ── */
    makeMove(m) {
      const oldCastle = this.castle;
      const oldEp     = this.ep;
      const oldHash   = this.hash;

      /* Save state */
      this.history.push({
        from: m.from, to: m.to, piece: m.piece, capture: m.capture,
        promo: m.promo, flags: m.flags,
        castle: oldCastle, ep: oldEp,
        halfmove: this.halfmove,
        fullmove: this.fullmove,
        hash: oldHash,
        kingW: this.kingPos[WHITE],
        kingB: this.kingPos[BLACK],
      });

      /* Incremental hash: remove moving piece from source */
      let h = oldHash;
      h ^= this.Z.piece[m.piece][m.from];
      h ^= this.Z.castle[oldCastle];
      if (oldEp !== -1) h ^= this.Z.ep[oldEp];

      /* Halfmove */
      this.halfmove++;
      if (m.piece === WP || m.piece === BP || m.capture) this.halfmove = 0;

      /* Remove piece from source */
      this.board[m.from] = EMPTY;

      /* Capture */
      if (m.capture && !(m.flags & FLAG_EP)) {
        h ^= this.Z.piece[m.capture][m.to];
      }

      /* Place piece (or promotion) on destination */
      const placed = m.promo || m.piece;
      this.board[m.to] = placed;
      h ^= this.Z.piece[placed][m.to];

      /* Update king cache */
      if (m.piece === WK) this.kingPos[WHITE] = m.to;
      if (m.piece === BK) this.kingPos[BLACK] = m.to;

      /* En passant capture */
      this.ep = -1;
      if (m.flags & FLAG_EP) {
        const capSq = this.side === WHITE ? m.to - 16 : m.to + 16;
        h ^= this.Z.piece[this.board[capSq]][capSq];
        this.board[capSq] = EMPTY;
      }

      /* Castling rook move */
      if (m.flags & FLAG_CASTLE) {
        const [rs, rd] = this._castleRookSquares(m.to);
        const rook = this.board[rs];
        h ^= this.Z.piece[rook][rs];
        h ^= this.Z.piece[rook][rd];
        this.board[rd] = rook;
        this.board[rs] = EMPTY;
      }

      /* Castle rights */
      if (m.piece === WK) this.castle &= ~3;
      if (m.piece === BK) this.castle &= ~12;
      if (m.from === SQ['a1'] || m.to === SQ['a1']) this.castle &= ~2;
      if (m.from === SQ['h1'] || m.to === SQ['h1']) this.castle &= ~1;
      if (m.from === SQ['a8'] || m.to === SQ['a8']) this.castle &= ~8;
      if (m.from === SQ['h8'] || m.to === SQ['h8']) this.castle &= ~4;

      /* New en passant square */
      if (m.piece === WP && m.to - m.from === 32) this.ep = m.from + 16;
      if (m.piece === BP && m.from - m.to === 32) this.ep = m.from - 16;

      /* Finalize hash */
      h ^= this.Z.castle[this.castle];
      if (this.ep !== -1) h ^= this.Z.ep[this.ep];
      h ^= this.Z.side;
      this.hash = h >>> 0;

      if (this.side === BLACK) this.fullmove++;
      this.side = opponent(this.side);
      this.hashStack.push(this.hash);
    }

    _castleRookSquares(kingTo) {
      /* returns [rookSrc, rookDest] */
      if (kingTo === SQ['g1']) return [SQ['h1'], SQ['f1']];
      if (kingTo === SQ['c1']) return [SQ['a1'], SQ['d1']];
      if (kingTo === SQ['g8']) return [SQ['h8'], SQ['f8']];
      /* c8 */                  return [SQ['a8'], SQ['d8']];
    }

    undoMove() {
      const st = this.history.pop();
      if (!st) return;

      this.hashStack.pop();
      this.side     = opponent(this.side);
      this.castle   = st.castle;
      this.ep       = st.ep;
      this.halfmove = st.halfmove;
      this.fullmove = st.fullmove;
      this.hash     = st.hash;
      this.kingPos[WHITE] = st.kingW;
      this.kingPos[BLACK] = st.kingB;

      this.board[st.from] = st.piece;
      this.board[st.to]   = st.capture || EMPTY;

      if (st.flags & FLAG_EP) {
        const capSq = this.side === WHITE ? st.to - 16 : st.to + 16;
        this.board[capSq] = this.side === WHITE ? BP : WP;
        this.board[st.to] = EMPTY;
      }

      if (st.flags & FLAG_CASTLE) {
        const [rs, rd] = this._castleRookSquares(st.to);
        this.board[rs] = this.board[rd];
        this.board[rd] = EMPTY;
      }
    }

    /* ── Null move ── */
    makeNullMove() {
      const oldEp = this.ep;
      this.history.push({
        from:-1, to:-1, piece:0, capture:0, promo:0, flags:0,
        castle: this.castle, ep: oldEp,
        halfmove: this.halfmove, fullmove: this.fullmove,
        hash: this.hash,
        kingW: this.kingPos[WHITE], kingB: this.kingPos[BLACK],
        isNull: true,
      });
      let h = this.hash;
      if (oldEp !== -1) h ^= this.Z.ep[oldEp];
      this.ep = -1;
      h ^= this.Z.side;
      this.hash = h >>> 0;
      this.halfmove++;
      if (this.side === BLACK) this.fullmove++;
      this.side = opponent(this.side);
      this.hashStack.push(this.hash);
    }

    undoNullMove() { this.undoMove(); }

    /* ── Draw detection ── */
    isDraw() {
      if (this.halfmove >= 100) return true;
      const cur = this.hash;
      let reps = 0;
      /* Walk back — stop early on captures/pawn moves (halfmove resets) */
      const limit = Math.max(0, this.hashStack.length - this.halfmove - 1);
      for (let i = this.hashStack.length - 1; i >= limit; i--) {
        if (this.hashStack[i] === cur) { if (++reps >= 2) return true; }
      }
      return false;
    }

    isInsufficientMaterial() {
      let wn=0,wb=0,bn=0,bb=0;
      for (let sq=0;sq<128;sq++) {
        if (!onBoard(sq)){sq+=7;continue;}
        const p=this.board[sq];
        if (!p) continue;
        if (p===WP||p===BP||p===WR||p===BR||p===WQ||p===BQ) return false;
        if (p===WN) wn++;
        if (p===WB) wb++;
        if (p===BN) bn++;
        if (p===BB) bb++;
      }
      if (wn+wb+bn+bb===0) return true;
      if (wn+wb<=1&&bn+bb===0) return true;
      if (bn+bb<=1&&wn+wb===0) return true;
      return false;
    }

    /* ── Move generation ── */
    genMoves(capturesOnly = false) {
      const moves = [];
      const us    = this.side;
      const board = this.board;

      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = board[sq];
        if (!p) continue;
        if (us === WHITE ? !isWhite(p) : !isBlack(p)) continue;

        if (p === WP || p === BP) {
          this._genPawnMoves(sq, p, us, moves, capturesOnly);
          continue;
        }
        if (p === WN || p === BN) {
          for (const d of KNIGHT_DIR) {
            const to = sq + d;
            if (!onBoard(to)) continue;
            const tp = board[to];
            if (!tp) { if (!capturesOnly) moves.push(this._mk(sq,to,p,EMPTY,0,0)); }
            else if (colorOf(tp) !== us) moves.push(this._mk(sq,to,p,tp,0,FLAG_CAPTURE));
          }
          continue;
        }
        if (p === WB || p === BB) { this._addSlider(sq,p,us,BISHOP_DIR,moves,capturesOnly); continue; }
        if (p === WR || p === BR) { this._addSlider(sq,p,us,ROOK_DIR,  moves,capturesOnly); continue; }
        if (p === WQ || p === BQ) {
          this._addSlider(sq,p,us,BISHOP_DIR,moves,capturesOnly);
          this._addSlider(sq,p,us,ROOK_DIR,  moves,capturesOnly);
          continue;
        }
        if (p === WK || p === BK) { this._genKingMoves(sq,p,us,moves,capturesOnly); }
      }

      /* Legal filter */
      const legal = [];
      for (const m of moves) {
        this.makeMove(m);
        if (!this.inCheck(us)) legal.push(m);
        this.undoMove();
      }
      return legal;
    }

    _mk(from,to,piece,capture,promo,flags) {
      return {from,to,piece,capture,promo,flags};
    }

    _genPawnMoves(sq,p,us,moves,capturesOnly) {
      const board   = this.board;
      const up      = p===WP ? 16 : -16;
      const rank    = sq >> 4;
      const sRank   = p===WP ? 1 : 6;
      const pRank   = p===WP ? 6 : 1;
      const promos  = p===WP ? [WQ,WR,WB,WN] : [BQ,BR,BB,BN];
      const capDirs = p===WP ? [15,17] : [-15,-17];

      if (!capturesOnly) {
        const one = sq + up;
        if (onBoard(one) && !board[one]) {
          if (rank === pRank) {
            for (const pr of promos) moves.push(this._mk(sq,one,p,EMPTY,pr,FLAG_PROMO));
          } else {
            moves.push(this._mk(sq,one,p,EMPTY,0,0));
            if (rank === sRank) {
              const two = sq + up + up;
              if (!board[two]) moves.push(this._mk(sq,two,p,EMPTY,0,0));
            }
          }
        }
      }

      for (const d of capDirs) {
        const to = sq + d;
        if (!onBoard(to)) continue;
        const tp = board[to];
        if (tp && colorOf(tp) !== us) {
          if (rank === pRank) {
            for (const pr of promos) moves.push(this._mk(sq,to,p,tp,pr,FLAG_CAPTURE|FLAG_PROMO));
          } else {
            moves.push(this._mk(sq,to,p,tp,0,FLAG_CAPTURE));
          }
        }
        if (to === this.ep) {
          const epCap = p===WP ? BP : WP;
          moves.push(this._mk(sq,to,p,epCap,0,FLAG_CAPTURE|FLAG_EP));
        }
      }
    }

    _addSlider(sq,p,us,dirs,moves,capturesOnly) {
      const board = this.board;
      for (const d of dirs) {
        let to = sq + d;
        while (onBoard(to)) {
          const tp = board[to];
          if (!tp) {
            if (!capturesOnly) moves.push(this._mk(sq,to,p,EMPTY,0,0));
          } else {
            if (colorOf(tp) !== us) moves.push(this._mk(sq,to,p,tp,0,FLAG_CAPTURE));
            break;
          }
          to += d;
        }
      }
    }

    _genKingMoves(sq,p,us,moves,capturesOnly) {
      const board = this.board;
      const opp   = opponent(us);
      for (const d of KING_DIR) {
        const to = sq + d;
        if (!onBoard(to)) continue;
        const tp = board[to];
        if (!tp) { if (!capturesOnly) moves.push(this._mk(sq,to,p,EMPTY,0,0)); }
        else if (colorOf(tp) !== us) moves.push(this._mk(sq,to,p,tp,0,FLAG_CAPTURE));
      }
      if (capturesOnly) return;
      /* Castling */
      const inChk = this.inCheck(us);
      if (!inChk) {
        if (us === WHITE && sq === SQ['e1']) {
          if ((this.castle&1)&&!board[SQ['f1']]&&!board[SQ['g1']]&&
              !this.isAttacked(SQ['f1'],opp)&&!this.isAttacked(SQ['g1'],opp))
            moves.push(this._mk(sq,SQ['g1'],p,EMPTY,0,FLAG_CASTLE));
          if ((this.castle&2)&&!board[SQ['d1']]&&!board[SQ['c1']]&&!board[SQ['b1']]&&
              !this.isAttacked(SQ['d1'],opp)&&!this.isAttacked(SQ['c1'],opp))
            moves.push(this._mk(sq,SQ['c1'],p,EMPTY,0,FLAG_CASTLE));
        }
        if (us === BLACK && sq === SQ['e8']) {
          if ((this.castle&4)&&!board[SQ['f8']]&&!board[SQ['g8']]&&
              !this.isAttacked(SQ['f8'],opp)&&!this.isAttacked(SQ['g8'],opp))
            moves.push(this._mk(sq,SQ['g8'],p,EMPTY,0,FLAG_CASTLE));
          if ((this.castle&8)&&!board[SQ['d8']]&&!board[SQ['c8']]&&!board[SQ['b8']]&&
              !this.isAttacked(SQ['d8'],opp)&&!this.isAttacked(SQ['c8'],opp))
            moves.push(this._mk(sq,SQ['c8'],p,EMPTY,0,FLAG_CASTLE));
        }
      }
    }

    /* ── Move helpers ── */
    moveToUci(m) {
      if (!m) return '0000';
      const base = sqToUci(m.from) + sqToUci(m.to);
      return (m.flags & FLAG_PROMO) ? base + (PIECE_CH[m.promo]||'q').toLowerCase() : base;
    }

    findMoveByUci(uci) {
      const moves = this.genMoves(false);
      for (const m of moves) {
        if (this.moveToUci(m) === uci) return m;
        if ((m.flags & FLAG_PROMO) && uci.length === 4 && this.moveToUci(m).slice(0,4) === uci) return m;
      }
      return null;
    }

    findMoveByEncoded(enc) {
      if (!enc) return null;
      const dec = TranspositionTable.decodeMove(enc);
      if (!dec) return null;
      const moves = this.genMoves(false);
      for (const m of moves) {
        if (m.from === dec.from && m.to === dec.to &&
           (m.promo || 0) === (dec.promo || 0)) return m;
      }
      return null;
    }

    /* ── Evaluation ── */
    sq128To64(sq) { return ((sq >> 4) << 3) | (sq & 7); }
    mirror64(i)   { return ((7-(i>>3))<<3)|(i&7); }

    _pst(p, sq) {
      const i = this.sq128To64(sq);
      const j = isWhite(p) ? i : this.mirror64(i);
      if (p===WP||p===BP) return PST_PAWN[j];
      if (p===WN||p===BN) return PST_KNIGHT[j];
      if (p===WB||p===BB) return PST_BISHOP[j];
      if (p===WR||p===BR) return PST_ROOK[j];
      if (p===WQ||p===BQ) return PST_QUEEN[j];
      if (p===WK||p===BK) return PST_KING_MG[j];
      return 0;
    }

    evaluate() {
      if (this.isInsufficientMaterial()) return 0;
      let score = 0;
      const board = this.board;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = board[sq];
        if (!p) continue;
        const v = (PIECE_VALUE[p]||0) + this._pst(p,sq);
        score += isWhite(p) ? v : -v;
      }
      /* Tempo bonus */
      score += this.side === WHITE ? 10 : -10;
      return this.side === WHITE ? score : -score;
    }

    /* ── Move ordering ── */
    _moveScore(m, ttBestEnc, ply) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc === ttBestEnc) return 2000000;
      if (m.flags & FLAG_CAPTURE) {
        const gain = (PIECE_VALUE[m.capture]||0) - (PIECE_VALUE[m.piece]||0);
        return 1000000 + gain;
      }
      if (m.flags & FLAG_PROMO) return 900000;
      const killers = this.killers[ply] || [];
      if (enc === killers[0]) return 800000;
      if (enc === killers[1]) return 700000;
      return this.histTable[(m.piece << 7) | m.to] | 0;
    }

    orderMoves(moves, ttBestEnc, ply) {
      for (const m of moves) m._score = this._moveScore(m, ttBestEnc, ply);
      moves.sort((a, b) => b._score - a._score);
    }

    storeKiller(m, ply) {
      const enc = TranspositionTable.encodeMove(m);
      const k   = this.killers[ply];
      if (enc !== k[0]) { k[1] = k[0]; k[0] = enc; }
    }

    updateHistory(m, depth) {
      const idx = (m.piece << 7) | m.to;
      this.histTable[idx] = Math.min(this.histTable[idx] + depth * depth, 20000);
    }

    hasNonPawnMaterial(color) {
      const lo = color === WHITE ? WN : BN;
      const hi = color === WHITE ? WQ : BQ;
      for (let sq=0;sq<128;sq++) {
        if (!onBoard(sq)){sq+=7;continue;}
        const p=this.board[sq];
        if (p>=lo&&p<=hi) return true;
      }
      return false;
    }

    /* ── Quiescence ── */
    qsearch(alpha, beta, ply) {
      if (this.stop) return alpha;
      this._checkTime();
      if (this.stop) return alpha;
      if (this.isDraw()||this.isInsufficientMaterial()) return 0;

      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);

      const stand = this.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;

      const moves = this.genMoves(true);
      const ttBest = this.tt.getBestMove(this.hash);
      this.orderMoves(moves, ttBest, ply);

      for (const m of moves) {
        /* Delta pruning */
        const gain = (PIECE_VALUE[m.capture]||0) + (m.promo ? PIECE_VALUE[m.promo]||0 : 0);
        if (stand + gain + 200 < alpha) continue;

        this.makeMove(m);
        const score = -this.qsearch(-beta, -alpha, ply+1);
        this.undoMove();
        if (this.stop) return alpha;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    /* ── Negamax + PVS ── */
    negamax(depth, alpha, beta, ply, allowNull = true) {
      if (this.stop) return 0;
      this._checkTime();
      if (this.stop) return 0;

      const isPV = beta - alpha > 1;
      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);

      if (this.isDraw()||this.isInsufficientMaterial()) return 0;

      const inChk = this.inCheck(this.side);

      /* Check extension */
      if (inChk) depth++;

      if (depth <= 0) return this.qsearch(alpha, beta, ply);

      /* Mate distance pruning */
      const mateVal = MATE - ply;
      if (alpha < -mateVal) alpha = -mateVal;
      if (beta  >  mateVal) beta  =  mateVal;
      if (alpha >= beta) return alpha;

      /* TT probe */
      const ttScore = this.tt.probe(this.hash, depth, alpha, beta);
      if (!isPV && ttScore !== null) return ttScore;
      const ttBestEnc = this.tt.getBestMove(this.hash);

      /* Null-move pruning */
      if (allowNull && !isPV && depth >= 3 && !inChk && this.hasNonPawnMaterial(this.side)) {
        const R = depth >= 6 ? 4 : 3;
        this.makeNullMove();
        const nmScore = -this.negamax(depth - 1 - R, -beta, -beta+1, ply+1, false);
        this.undoNullMove();
        if (this.stop) return 0;
        if (nmScore >= beta) return beta;
      }

      /* Razoring */
      if (!isPV && !inChk && depth <= 2) {
        const razor = this.evaluate() + 300 * depth;
        if (razor < alpha) {
          const q = this.qsearch(alpha, beta, ply);
          if (q < alpha) return alpha;
        }
      }

      const moves = this.genMoves(false);
      if (moves.length === 0) return inChk ? -MATE + ply : 0;

      this.orderMoves(moves, ttBestEnc, ply);

      const alpha0 = alpha;
      let bestScore = -INF;
      let bestMove  = null;
      let legalIdx  = 0;

      for (const m of moves) {
        this.makeMove(m);
        let score;

        if (legalIdx === 0) {
          /* PV node: full-window */
          score = -this.negamax(depth-1, -beta, -alpha, ply+1, true);
        } else {
          /* LMR */
          let newDepth = depth - 1;
          let doLMR    = false;
          if (depth >= 3 && legalIdx >= 3 && !inChk &&
              !(m.flags & (FLAG_CAPTURE|FLAG_PROMO|FLAG_EP))) {
            doLMR    = true;
            newDepth = Math.max(1, depth - 1 - Math.floor(Math.sqrt(legalIdx)));
          }

          /* Zero-window search */
          score = -this.negamax(newDepth, -alpha-1, -alpha, ply+1, true);

          /* Re-search if LMR failed high */
          if (!this.stop && doLMR && score > alpha) {
            score = -this.negamax(depth-1, -alpha-1, -alpha, ply+1, true);
          }

          /* Re-search full window for PV */
          if (!this.stop && score > alpha && score < beta) {
            score = -this.negamax(depth-1, -beta, -alpha, ply+1, true);
          }
        }

        this.undoMove();
        if (this.stop) return 0;

        legalIdx++;

        if (score > bestScore) {
          bestScore = score;
          bestMove  = m;
        }
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            /* Beta cutoff */
            if (!(m.flags & FLAG_CAPTURE)) {
              this.storeKiller(m, ply);
              this.updateHistory(m, depth);
            }
            break;
          }
        }
      }

      /* TT store */
      let flag = 0;                          // exact
      if (bestScore <= alpha0) flag = -1;    // upper bound
      else if (bestScore >= beta) flag = 1;  // lower bound
      this.tt.store(this.hash, depth, bestScore, flag,
        TranspositionTable.encodeMove(bestMove));

      return bestScore;
    }

    /* ── Time management ── */
    _checkTime() {
      if ((this.nodes & 4095) === 0) {
        if (Date.now() - this.startTime >= this.moveTime) this.stop = true;
      }
    }

    calcMoveTime(spec) {
      if (spec.moveTime) return spec.moveTime;
      const t   = this.side === WHITE ? (spec.wtime||0) : (spec.btime||0);
      const inc = this.side === WHITE ? (spec.winc||0)  : (spec.binc||0);
      const mtg = spec.movestogo || 30;
      if (!t) return 5000;
      return Math.max(50, Math.floor(t / Math.max(5, mtg) + inc * 0.75));
    }

    /* ── PV extraction ── */
    pvLine(depth) {
      const line = [];
      const seen  = new Set();
      for (let i = 0; i < depth; i++) {
        const enc = this.tt.getBestMove(this.hash);
        if (!enc) break;
        const m = this.findMoveByEncoded(enc);
        if (!m) break;
        const key = this.hash + ':' + enc;
        if (seen.has(key)) break;
        seen.add(key);
        line.push(this.moveToUci(m));
        this.makeMove(m);
      }
      for (let i = 0; i < line.length; i++) this.undoMove();
      return line;
    }

    /* ── Root search (iterative deepening) ── */
    search(spec) {
      this.stop      = false;
      this.nodes     = 0;
      this.selDepth  = 0;
      this.startTime = Date.now();
      this.moveTime  = this.calcMoveTime(spec);

      /* Reset history heuristic and killers each search */
      this.histTable.fill(0);
      for (const k of this.killers) { k[0] = 0; k[1] = 0; }

      const depthLimit = Math.max(1, Math.min(64, spec.depth || 64));
      const multiPV    = Math.max(1, Math.min(8, (spec.multiPV || this.options.MultiPV) | 0));

      let rootMoves    = this.genMoves(false);
      if (rootMoves.length === 0) {
        this.send('bestmove 0000');
        return;
      }

      let bestMove     = rootMoves[0];
      let bestScore    = -INF;
      let prevScore    = -INF;

      for (let d = 1; d <= depthLimit; d++) {
        if (this.stop) break;

        /* Aspiration window */
        let asp   = d > 1 ? 25 : INF;
        let lo    = d > 1 ? Math.max(-INF, prevScore - asp) : -INF;
        let hi    = d > 1 ? Math.min( INF, prevScore + asp) : INF;

        const scored = [];

        /* ---- aspiration loop ---- */
        aspirationLoop:
        while (true) {
          scored.length = 0;
          let alpha = lo;

          /* Order root moves: best move first */
          const ttEnc = this.tt.getBestMove(this.hash);
          this.orderMoves(rootMoves, ttEnc, 0);

          let moveIdx = 0;
          for (const m of rootMoves) {
            if (this.stop) break;

            this.makeMove(m);
            let score;

            if (moveIdx === 0) {
              score = -this.negamax(d-1, -hi, -alpha, 1, true);
            } else {
              score = -this.negamax(d-1, -alpha-1, -alpha, 1, true);
              if (!this.stop && score > alpha && score < hi) {
                score = -this.negamax(d-1, -hi, -alpha, 1, true);
              }
            }

            this.undoMove();
            if (this.stop) break;

            scored.push({ m, score });

            if (score > alpha) {
              alpha = score;
              if (alpha >= hi) {
                /* Fail high: widen upper bound */
                asp = Math.min(asp * 2, INF);
                hi  = Math.min(INF, alpha + asp);
                lo  = Math.max(-INF, alpha - asp);
                continue aspirationLoop;
              }
            }
            moveIdx++;
          }

          if (scored.length && scored[0].score <= lo && lo > -INF + 1) {
            /* Fail low: widen lower bound */
            asp = Math.min(asp * 2, INF);
            lo  = Math.max(-INF, scored[0].score - asp);
            hi  = Math.min(INF, scored[0].score + asp);
            continue aspirationLoop;
          }
          break;
        }
        /* ---- end aspiration loop ---- */

        if (!scored.length) break;

        /* Sort final results */
        scored.sort((a, b) => b.score - a.score);
        bestMove  = scored[0].m;
        bestScore = scored[0].score;
        prevScore = bestScore;

        /* Re-order rootMoves to match scored order for next iteration */
        rootMoves = scored.map(x => x.m);

        const elapsed = Date.now() - this.startTime;
        const nps     = elapsed > 0 ? Math.floor(this.nodes * 1000 / elapsed) : this.nodes;
        const hashfull = 0; // typed-array TT doesn't track fill easily

        /* Report MultiPV lines */
        for (let i = 0; i < Math.min(multiPV, scored.length); i++) {
          const { m, score } = scored[i];
          this.makeMove(m);
          const pv = [this.moveToUci(m), ...this.pvLine(Math.max(0, d-1))].join(' ');
          this.undoMove();

          /* evalbar: 0-100, 50 = equal */
          const evalBar = Math.max(0, Math.min(100, 50 + Math.round(score / 20)));

          if (Math.abs(score) >= MATE - 200) {
            const mate = score > 0
              ? Math.ceil((MATE - score) / 2)
              : -Math.ceil((MATE + score) / 2);
            this.send('info depth', d, 'seldepth', this.selDepth,
              'multipv', i+1, 'score mate', mate,
              'nodes', this.nodes, 'nps', nps,
              'hashfull', hashfull, 'time', elapsed, 'pv', pv);
          } else {
            this.send('info depth', d, 'seldepth', this.selDepth,
              'multipv', i+1, 'score cp', score,
              'nodes', this.nodes, 'nps', nps,
              'hashfull', hashfull, 'time', elapsed, 'pv', pv);
          }
          this.send('info string evalbar', evalBar);
        }
      }

      this.bestMove = bestMove;
      this.send('bestmove', this.moveToUci(bestMove));
    }

    /* ── UCI command handlers ── */
    handlePosition(tokens) {
      let i = 1;
      if (tokens[i] === 'startpos') {
        this.setFen(START_FEN); i++;
      } else if (tokens[i] === 'fen') {
        i++;
        const fp = [];
        while (i < tokens.length && tokens[i] !== 'moves') fp.push(tokens[i++]);
        this.setFen(fp.join(' '));
      }
      if (tokens[i] === 'moves') {
        i++;
        while (i < tokens.length) {
          const m = this.findMoveByUci(tokens[i++]);
          if (!m) break;
          this.makeMove(m);
        }
      }
    }

    handleGo(tokens) {
      const spec = {
        depth:0, moveTime:0,
        wtime:0, btime:0, winc:0, binc:0, movestogo:30,
        multiPV:0, infinite:false,
      };
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i], v = Number(tokens[i+1]);
        if (t==='infinite')   { spec.infinite=true; }
        if (t==='depth')      { spec.depth=v; }
        if (t==='movetime')   { spec.moveTime=v; }
        if (t==='wtime')      { spec.wtime=v; }
        if (t==='btime')      { spec.btime=v; }
        if (t==='winc')       { spec.winc=v; }
        if (t==='binc')       { spec.binc=v; }
        if (t==='movestogo')  { spec.movestogo=v; }
        if (t==='multipv')    { spec.multiPV=v; }
      }
      if (spec.infinite && !spec.moveTime) spec.moveTime = 24 * 3600 * 1000;
      if (!spec.depth) spec.depth = 64;
      this.search(spec);
    }

    handleSetOption(tokens) {
      const ni = tokens.indexOf('name');
      const vi = tokens.indexOf('value');
      if (ni < 0) return;
      const name  = tokens.slice(ni+1, vi>-1?vi:tokens.length).join(' ');
      const value = vi>-1 ? tokens.slice(vi+1).join(' ') : '';
      if (name==='MultiPV') this.options.MultiPV = Math.max(1,Math.min(8,+value||1));
    }

    command(line) {
      const tokens = line.trim().split(/\s+/);
      if (!tokens[0]) return;
      switch (tokens[0]) {
        case 'uci':
          this.send('id name', this.name);
          this.send('id author', this.author);
          this.send('option name MultiPV type spin default 1 min 1 max 8');
          this.send('option name Threads type spin default 1 min 1 max 1');
          this.send('option name Ponder type check default false');
          this.send('uciok');
          break;
        case 'isready':
          this.send('readyok');
          break;
        case 'ucinewgame':
          this.tt.clear();
          this.histTable.fill(0);
          for (const k of this.killers) { k[0]=0; k[1]=0; }
          this.setFen(START_FEN);
          break;
        case 'position':
          this.handlePosition(tokens);
          break;
        case 'go':
          this.handleGo(tokens);
          break;
        case 'stop':
          this.stop = true;
          break;
        case 'setoption':
          this.handleSetOption(tokens);
          break;
        case 'd':
        case 'fen':
          this.send('info string', this.getFen());
          break;
        case 'quit':
          this.stop = true;
          break;
      }
    }
  }

  /* ── Bootstrap ── */
  const engine = new Engine();
  self.onmessage = (e) => {
    const lines = String(e.data||'').split(/\r?\n/);
    for (const ln of lines) { const l=ln.trim(); if (l) engine.command(l); }
  };

})();
