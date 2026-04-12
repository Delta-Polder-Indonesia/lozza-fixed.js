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
  const DEFAULT_HASH_MB = 16;
  const MIN_HASH_MB = 1;
  const MAX_HASH_MB = 256;
  const BOOL_RE = /^(true|1|on)$/i;

  const FLAG_CAPTURE = 1;
  const FLAG_EP      = 2;
  const FLAG_CASTLE  = 4;
  const FLAG_PROMO   = 8;

  const KNIGHT_DIR = [31, 33, 14, -14, 18, -18, -31, -33];
  const BISHOP_DIR = [15, 17, -15, -17];
  const ROOK_DIR   = [1, -1, 16, -16];
  const KING_DIR   = [1, -1, 16, -16, 15, 17, -15, -17];

  const PIECE_VALUE = {
    [WP]: 100, [WN]: 300, [WB]: 300, [WR]: 500, [WQ]: 900, [WK]: 0,
    [BP]: 100, [BN]: 300, [BB]: 300, [BR]: 500, [BQ]: 900, [BK]: 0,
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
  const PST_KING_EG = [
    -50,-30,-30,-30,-30,-30,-30,-50,
    -30,-20,-10,-10,-10,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ];

  const PHASE_WEIGHT = {
    [WP]: 0, [WN]: 1, [WB]: 1, [WR]: 2, [WQ]: 4, [WK]: 0,
    [BP]: 0, [BN]: 1, [BB]: 1, [BR]: 2, [BQ]: 4, [BK]: 0,
  };
  const MAX_PHASE = 24;
  const MVV_LVA = (() => {
    const t = Array.from({ length: 7 }, () => new Int16Array(7));
    for (let victim = 1; victim <= 6; victim++) {
      for (let attacker = 1; attacker <= 6; attacker++) {
        t[victim][attacker] = victim * 16 - attacker;
      }
    }
    return t;
  })();
  const PAWN_PASSED = [0, 0, 0, 0, 0.1, 0.3, 0.7, 1.2, 0];
  const ATT_W = [0, 0.01, 0.42, 0.78, 1.11, 1.52, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  const MOBN_S = 4, MOBN_E = -5, MOBN_S0 = -9,  MOBN_E0 = -73;
  const MOBB_S = 7, MOBB_E =  2, MOBB_S0 = -10, MOBB_E0 = -48;
  const MOBR_S = 5, MOBR_E =  2, MOBR_S0 = -2,  MOBR_E0 = -50;
  const MOBQ_S = 3, MOBQ_E =  6, MOBQ_S0 = 6,   MOBQ_E0 = 0;

  const TIGHT_NS = 4,   TIGHT_NE = -4;
  const TIGHT_BS = 10,  TIGHT_BE = 9;
  const TIGHT_RS = 4,   TIGHT_RE = 6;
  const TIGHT_QS = -148, TIGHT_QE = -162;

  const TENSE_NS = 53,  TENSE_NE = 24;
  const TENSE_BS = 36,  TENSE_BE = 40;
  const TENSE_RS = 103, TENSE_RE = -18;
  const TENSE_QS = -4,  TENSE_QE = 23;

  const ATT_N = 27, ATT_B = 9, ATT_R = 44, ATT_Q = 49;
  const TWOBISHOPS_S = 35, TWOBISHOPS_E = 59;
  const ROOK7TH_S = -28, ROOK7TH_E = 33;
  const ROOKOPEN_S = 21, ROOKOPEN_E = -3;
  const ROOK_DOUBLED_S = 27, ROOK_DOUBLED_E = -3;
  const QUEEN7TH_S = -75, QUEEN7TH_E = 55;

  // Opening book removed. GUI-side books can be used instead.

  const BENCH_FENS = [
    START_FEN,
    'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7',
    'r3r1k1/pp1n1pp1/2p2q1p/3p4/3P4/2N1PN2/PPQ2PPP/2R2RK1 w - - 0 16',
    '2r2rk1/1bq1bppp/p2ppn2/1p6/3NP3/1BN1B3/PPP2PPP/2RQ1RK1 w - - 2 13',
    '8/2p5/2P1k3/3pP3/3P4/4K3/8/8 w - - 0 1',
    'r4rk1/1pp1qppp/p1np1n2/4p3/2BPP3/2N2N2/PPP2PPP/R1BQR1K1 w - - 3 11',
  ];

  const PERFT_SUITE = [
    {
      name: 'startpos',
      fen: START_FEN,
      expected: { 1: 20, 2: 400, 3: 8902, 4: 197281 },
    },
    {
      name: 'kiwipete',
      fen: 'r3k2r/p1ppqpb1/bn2pnp1/2P5/1p2P3/2N2N2/PPQ1BPPP/R3K2R w KQkq - 0 1',
      expected: { 1: 48, 2: 2039, 3: 97862, 4: 4085603 },
    },
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

  /* ── TT using flat typed arrays ── */
  const TT_DEPTH  = 0;         // byte offsets into each slot (Uint32 view)
  const TT_FLAG   = 1;
  const TT_SCORE  = 2;
  const TT_HASH   = 3;
  const TT_BEST   = 4;         // best-move encoded as uint32
  const TT_WORDS  = 5;         // words per slot

  function ttSlotsFromMb(mb) {
    const clamped = Math.max(MIN_HASH_MB, Math.min(MAX_HASH_MB, mb | 0));
    const bytes = clamped * 1024 * 1024;
    const entryBytes = TT_WORDS * 4;
    let slots = 1;
    while ((slots << 1) * entryBytes <= bytes) slots <<= 1;
    return slots;
  }

  class TranspositionTable {
    constructor(hashMb = DEFAULT_HASH_MB) {
      this.resize(hashMb);
    }

    resize(hashMb) {
      this.size = ttSlotsFromMb(hashMb);
      this.mask = this.size - 1;
      this.data = new Int32Array(this.size * TT_WORDS);
      this.ages = new Uint16Array(this.size);
      this.epoch = 1;
    }

    clear() {
      this.data.fill(0);
      this.ages.fill(0);
      this.epoch = 1;
    }

    nextEpoch() {
      this.epoch = (this.epoch + 1) & 0xffff;
      if (this.epoch === 0) this.epoch = 1;
    }

    _idx(hash) { return ((hash >>> 0) & this.mask) * TT_WORDS; }

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
      const slot = (i / TT_WORDS) | 0;
      const key = (hash >>> 0) | 0;
      const oldKey = this.data[i + TT_HASH];
      const oldDepth = this.data[i + TT_DEPTH];
      const oldFlag = this.data[i + TT_FLAG];
      const age = oldKey ? ((this.epoch - this.ages[slot]) & 0xffff) : 0xffff;

      // Depth-preferred replacement with aging:
      // keep deeper entries if they are recent, but allow stale replacement.
      if (oldKey !== 0 && oldDepth > depth && age <= 1) {
        return;
      }
      if (oldKey !== 0 && oldDepth > depth + 2 && age <= 4) {
        return;
      }

      // If same depth, keep exact entries over bounds.
      if (oldKey !== 0 && oldDepth === depth) {
        if (oldFlag === 0 && flag !== 0 && age <= 2) return;
      }

      // Preserve previous best move when a bound update has no move.
      const best = bestEncoded ? (bestEncoded | 0) : (oldKey === key ? this.data[i + TT_BEST] : 0);

      this.data[i + TT_HASH]  = key;
      this.data[i + TT_DEPTH] = depth;
      this.data[i + TT_SCORE] = score;
      this.data[i + TT_FLAG]  = flag;
      this.data[i + TT_BEST]  = best;
      this.ages[slot] = this.epoch;
    }

    hashfull() {
      // UCI hashfull scale: 0..1000. Sample up to 1024 slots for speed.
      const sample = Math.min(1024, this.size);
      if (!sample) return 0;
      const step = Math.max(1, (this.size / sample) | 0);
      let used = 0;
      let seen = 0;
      for (let slot = 0; slot < this.size && seen < sample; slot += step, seen++) {
        if (this.data[slot * TT_WORDS + TT_HASH] !== 0) used++;
      }
      return Math.max(0, Math.min(1000, Math.floor((used * 1000) / Math.max(1, seen))));
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

      this.options = {
        Hash: DEFAULT_HASH_MB,
        MultiPV: 1,
        Ponder: false,
        StrengthPreset: 'Custom',
        SkillLevel: 20,
        UCI_LimitStrength: false,
        UCI_Elo: 2000,
        MoveOverhead: 0,
        UCI_AnalyseMode: false,
        UCI_ShowWDL: false,
        UCI_ShowACPL: false,
        PVFormat: 'uci',
      };

      this.stop      = false;
      this.nodes     = 0;
      this.selDepth  = 0;
      this.startTime = 0;
      this.moveTime  = 0;
      this.maxNodes  = 0;
      this.selDepthHard = 0;
      this.effectiveSkillLevel = 20;
      this.pondering = false;
      this.lastGoSpec = null;
      this.searchTimer = null;

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

      /* Continuation history [prevMoveIndex][curMoveIndex] */
      this.contHist = new Int16Array((15 * 128) * (15 * 128));

      /* Static eval trace for improving/non-improving decisions */
      this.evalTrace = new Int32Array(256);

      /* Zobrist */
      this.Z = this._initZobrist();

      /* Transposition table */
      this.tt = new TranspositionTable(this.options.Hash);

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

    isSquareAttackedByPawn(sq, byColor) {
      const board = this.board;
      if (byColor === WHITE) {
        return (onBoard(sq - 15) && board[sq - 15] === WP) ||
               (onBoard(sq - 17) && board[sq - 17] === WP);
      }
      return (onBoard(sq + 15) && board[sq + 15] === BP) ||
             (onBoard(sq + 17) && board[sq + 17] === BP);
    }

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
          if ((this.castle&1) && board[SQ['h1']] === WR && !board[SQ['f1']]&&!board[SQ['g1']]&&
              !this.isAttacked(SQ['f1'],opp)&&!this.isAttacked(SQ['g1'],opp))
            moves.push(this._mk(sq,SQ['g1'],p,EMPTY,0,FLAG_CASTLE));
          if ((this.castle&2) && board[SQ['a1']] === WR && !board[SQ['d1']]&&!board[SQ['c1']]&&!board[SQ['b1']]&&
              !this.isAttacked(SQ['d1'],opp)&&!this.isAttacked(SQ['c1'],opp))
            moves.push(this._mk(sq,SQ['c1'],p,EMPTY,0,FLAG_CASTLE));
        }
        if (us === BLACK && sq === SQ['e8']) {
          if ((this.castle&4) && board[SQ['h8']] === BR && !board[SQ['f8']]&&!board[SQ['g8']]&&
              !this.isAttacked(SQ['f8'],opp)&&!this.isAttacked(SQ['g8'],opp))
            moves.push(this._mk(sq,SQ['g8'],p,EMPTY,0,FLAG_CASTLE));
          if ((this.castle&8) && board[SQ['a8']] === BR && !board[SQ['d8']]&&!board[SQ['c8']]&&!board[SQ['b8']]&&
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

    moveToSan(m) {
      if (!m) return '0000';
      if (m.flags & FLAG_CASTLE) {
        return (m.to === SQ['g1'] || m.to === SQ['g8']) ? 'O-O' : 'O-O-O';
      }

      const piece = m.piece;
      const toSq = sqToUci(m.to);
      const isCapture = !!(m.flags & (FLAG_CAPTURE | FLAG_EP));
      let san = '';

      if (piece === WP || piece === BP) {
        if (isCapture) san += FILES[m.from & 7] + 'x';
        san += toSq;
      } else {
        san += (PIECE_CH[piece] || '').toUpperCase();

        const moves = this.genMoves(false);
        const same = moves.filter((x) =>
          x.to === m.to &&
          x.piece === m.piece &&
          !(x.from === m.from && (x.promo || 0) === (m.promo || 0)),
        );
        if (same.length) {
          const fromFile = m.from & 7;
          const fromRank = m.from >> 4;
          let fileConflict = false;
          let rankConflict = false;
          for (const x of same) {
            if ((x.from & 7) === fromFile) fileConflict = true;
            if ((x.from >> 4) === fromRank) rankConflict = true;
          }
          if (!fileConflict) san += FILES[fromFile];
          else if (!rankConflict) san += String(fromRank + 1);
          else san += FILES[fromFile] + String(fromRank + 1);
        }

        if (isCapture) san += 'x';
        san += toSq;
      }

      if (m.flags & FLAG_PROMO) san += '=' + (PIECE_CH[m.promo] || 'Q').toUpperCase();

      this.makeMove(m);
      const inCheck = this.inCheck(this.side);
      if (inCheck) san += this.genMoves(false).length ? '+' : '#';
      this.undoMove();

      return san;
    }

    formatMove(m, fmt = 'uci') {
      return fmt === 'san' ? this.moveToSan(m) : this.moveToUci(m);
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

    _pawnStructure(whiteFiles, blackFiles, wpSquares, bpSquares) {

      let mg = 0;
      let eg = 0;

      for (let f = 0; f < 8; f++) {
        if (whiteFiles[f] > 1) { mg -= 11 * (whiteFiles[f] - 1); eg -= 3 * (whiteFiles[f] - 1); }
        if (blackFiles[f] > 1) { mg += 11 * (blackFiles[f] - 1); eg += 3 * (blackFiles[f] - 1); }

        if (whiteFiles[f] && (f === 0 ? whiteFiles[1] === 0 : (f === 7 ? whiteFiles[6] === 0 : whiteFiles[f - 1] === 0 && whiteFiles[f + 1] === 0))) {
          mg -= 13 * whiteFiles[f];
          eg -= 12 * whiteFiles[f];
        }
        if (blackFiles[f] && (f === 0 ? blackFiles[1] === 0 : (f === 7 ? blackFiles[6] === 0 : blackFiles[f - 1] === 0 && blackFiles[f + 1] === 0))) {
          mg += 13 * blackFiles[f];
          eg += 12 * blackFiles[f];
        }
      }

      const board = this.board;

      for (const sq of wpSquares) {
        const f = sq & 7;
        const r = sq >> 4;
        let passed = true;
        for (let rr = r + 1; rr < 8 && passed; rr++) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (board[(rr << 4) | ff] === BP) { passed = false; break; }
          }
        }
        if (passed) {
          const adv = PAWN_PASSED[r + 1] || 0;
          mg += Math.round(25 + 8 * adv);
          eg += Math.round(35 + 78 * adv);
        }
        if ((onBoard(sq - 15) && board[sq - 15] === WP) || (onBoard(sq - 17) && board[sq - 17] === WP)) {
          mg += 8;
          eg += 8;
        }
      }

      for (const sq of bpSquares) {
        const f = sq & 7;
        const r = sq >> 4;
        let passed = true;
        for (let rr = r - 1; rr >= 0 && passed; rr--) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (board[(rr << 4) | ff] === WP) { passed = false; break; }
          }
        }
        if (passed) {
          const adv = PAWN_PASSED[8 - r] || 0;
          mg -= Math.round(25 + 8 * adv);
          eg -= Math.round(35 + 78 * adv);
        }
        if ((onBoard(sq + 15) && board[sq + 15] === BP) || (onBoard(sq + 17) && board[sq + 17] === BP)) {
          mg -= 8;
          eg -= 8;
        }
      }

      return { mg, eg, whiteFiles, blackFiles };
    }

    _inKingZone(sq, kingSq) {
      const rf = Math.abs((sq & 7) - (kingSq & 7));
      const rr = Math.abs((sq >> 4) - (kingSq >> 4));
      return rf <= 1 && rr <= 1;
    }

    _activityEval(whiteKingSq, blackKingSq, whiteFiles, blackFiles) {
      let mg = 0;
      let eg = 0;
      let wAttackN = 0, wAttackV = 0;
      let bAttackN = 0, bAttackV = 0;
      let wRookMask = 0;
      let bRookMask = 0;

      const board = this.board;

      const addSlider = (sq, p, dirs, us) => {
        let mob = 0;
        let tight = 0;
        let tense = 0;
        let zoneHit = 0;
        for (const d of dirs) {
          let to = sq + d;
          while (onBoard(to)) {
            const tp = board[to];
            const inZone = this._inKingZone(to, us === WHITE ? blackKingSq : whiteKingSq);
            if (!tp) {
              mob++;
              if (inZone) zoneHit = 1;
              to += d;
              continue;
            }
            if (colorOf(tp) !== us) {
              mob++;
              tense++;
              if (inZone) zoneHit = 1;
            } else {
              tight++;
            }
            break;
          }
        }
        return { mob, tight, tense, zoneHit };
      };

      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = board[sq];
        if (!p || p === WP || p === BP || p === WK || p === BK) continue;

        const us = colorOf(p);
        const file = sq & 7;
        const rank = sq >> 4;
        let mob = 0;
        let tight = 0;
        let tense = 0;
        let zoneHit = 0;

        if (p === WN || p === BN) {
          for (const d of KNIGHT_DIR) {
            const to = sq + d;
            if (!onBoard(to)) continue;
            const tp = board[to];
            if (!tp) mob++;
            else if (colorOf(tp) !== us) { mob++; tense++; }
            else tight++;
            if (this._inKingZone(to, us === WHITE ? blackKingSq : whiteKingSq)) zoneHit = 1;
          }
          const s = mob ? mob * MOBN_S : MOBN_S0;
          const e = mob ? mob * MOBN_E : MOBN_E0;
          const ts = tight * TIGHT_NS + tense * TENSE_NS;
          const te = tight * TIGHT_NE + tense * TENSE_NE;
          if (us === WHITE) { mg += s + ts; eg += e + te; if (zoneHit) { wAttackN++; wAttackV += ATT_N; } }
          else { mg -= s + ts; eg -= e + te; if (zoneHit) { bAttackN++; bAttackV += ATT_N; } }
          continue;
        }

        if (p === WB || p === BB) {
          ({ mob, tight, tense, zoneHit } = addSlider(sq, p, BISHOP_DIR, us));
          const s = mob ? mob * MOBB_S : MOBB_S0;
          const e = mob ? mob * MOBB_E : MOBB_E0;
          const ts = tight * TIGHT_BS + tense * TENSE_BS;
          const te = tight * TIGHT_BE + tense * TENSE_BE;
          if (us === WHITE) { mg += s + ts; eg += e + te; if (zoneHit) { wAttackN++; wAttackV += ATT_B; } }
          else { mg -= s + ts; eg -= e + te; if (zoneHit) { bAttackN++; bAttackV += ATT_B; } }
          continue;
        }

        if (p === WR || p === BR) {
          ({ mob, tight, tense, zoneHit } = addSlider(sq, p, ROOK_DIR, us));
          const s = mob ? mob * MOBR_S : MOBR_S0;
          const e = mob ? mob * MOBR_E : MOBR_E0;
          const ts = tight * TIGHT_RS + tense * TENSE_RS;
          const te = tight * TIGHT_RE + tense * TENSE_RE;
          if (us === WHITE) {
            mg += s + ts;
            eg += e + te;
            if (zoneHit) { wAttackN++; wAttackV += ATT_R; }
            if (rank === 6 && ((blackKingSq >> 4) === 7 || blackFiles[file] > 0)) { mg += ROOK7TH_S; eg += ROOK7TH_E; }
            if (!whiteFiles[file]) { mg += ROOKOPEN_S; eg += ROOKOPEN_E; if (!blackFiles[file]) { mg += ROOKOPEN_S; eg += ROOKOPEN_E; } }
            if (wRookMask & (1 << file)) { mg += ROOK_DOUBLED_S; eg += ROOK_DOUBLED_E; }
            wRookMask |= (1 << file);
          } else {
            mg -= s + ts;
            eg -= e + te;
            if (zoneHit) { bAttackN++; bAttackV += ATT_R; }
            if (rank === 1 && ((whiteKingSq >> 4) === 0 || whiteFiles[file] > 0)) { mg -= ROOK7TH_S; eg -= ROOK7TH_E; }
            if (!blackFiles[file]) { mg -= ROOKOPEN_S; eg -= ROOKOPEN_E; if (!whiteFiles[file]) { mg -= ROOKOPEN_S; eg -= ROOKOPEN_E; } }
            if (bRookMask & (1 << file)) { mg -= ROOK_DOUBLED_S; eg -= ROOK_DOUBLED_E; }
            bRookMask |= (1 << file);
          }
          continue;
        }

        if (p === WQ || p === BQ) {
          const a = addSlider(sq, p, BISHOP_DIR, us);
          const bq = addSlider(sq, p, ROOK_DIR, us);
          mob = a.mob + bq.mob;
          tight = a.tight + bq.tight;
          tense = a.tense + bq.tense;
          zoneHit = a.zoneHit || bq.zoneHit ? 1 : 0;
          const s = mob ? mob * MOBQ_S : MOBQ_S0;
          const e = mob ? mob * MOBQ_E : MOBQ_E0;
          const ts = tight * TIGHT_QS + tense * TENSE_QS;
          const te = tight * TIGHT_QE + tense * TENSE_QE;
          if (us === WHITE) {
            mg += s + ts;
            eg += e + te;
            if (zoneHit) { wAttackN++; wAttackV += ATT_Q; }
            if (rank === 6 && (blackKingSq >> 4) === 7) { mg += QUEEN7TH_S; eg += QUEEN7TH_E; }
          } else {
            mg -= s + ts;
            eg -= e + te;
            if (zoneHit) { bAttackN++; bAttackV += ATT_Q; }
            if (rank === 1 && (whiteKingSq >> 4) === 0) { mg -= QUEEN7TH_S; eg -= QUEEN7TH_E; }
          }
        }
      }

      mg += Math.round(wAttackV * ATT_W[Math.min(16, wAttackN)]);
      mg -= Math.round(bAttackV * ATT_W[Math.min(16, bAttackN)]);

      return { mg, eg };
    }

    _kingSafetyEval(whiteFiles, blackFiles) {
      const board = this.board;
      const zoneSquares = (kingSq, us) => {
        const z = [];
        const push = us === WHITE ? 16 : -16;
        z.push(kingSq);
        for (const d of KING_DIR) {
          const to = kingSq + d;
          if (onBoard(to)) z.push(to);
        }
        const front = kingSq + push;
        if (onBoard(front)) {
          z.push(front);
          if (onBoard(front - 1)) z.push(front - 1);
          if (onBoard(front + 1)) z.push(front + 1);
        }
        return z;
      };

      const evalSide = (kingSq, us, ownFiles, oppFiles) => {
        const f = kingSq & 7;
        const r = kingSq >> 4;
        const ownPawn = us === WHITE ? WP : BP;
        const oppColor = opponent(us);
        const forward = us === WHITE ? 1 : -1;

        let shelter = 0;
        let storm = 0;

        // Pawn shield and storm in front of king.
        for (let df = -1; df <= 1; df++) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          for (let step = 1; step <= 2; step++) {
            const rr = r + forward * step;
            if (rr < 0 || rr > 7) continue;
            const sq = (rr << 4) | ff;
            const p = board[sq];
            if (p === ownPawn) shelter += 12 - step * 3;
            else if (p !== EMPTY) storm += 8 - step;
          }
        }

        // Penalize open / semi-open files around king.
        let openPenalty = 0;
        for (let df = -1; df <= 1; df++) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          if (ownFiles[ff] === 0) openPenalty += 8;
          if (ownFiles[ff] === 0 && oppFiles[ff] === 0) openPenalty += 4;
        }

        // Count enemy attacks near king as danger metric.
        const zone = zoneSquares(kingSq, us);
        let attackCount = 0;
        for (const sq of zone) {
          if (this.isAttacked(sq, oppColor)) attackCount++;
        }

        // Bonus when king is clearly safe.
        const safeBonus = shelter >= 16 && attackCount <= 2 ? 10 : 0;

        const mg = (shelter * 5) - (storm * 4) - openPenalty - (attackCount * 7) + safeBonus;
        const eg = (shelter * 2) - (storm * 2) - Math.floor(openPenalty / 2) - (attackCount * 3);
        return { mg, eg };
      };

      const w = evalSide(this.kingPos[WHITE], WHITE, whiteFiles, blackFiles);
      const b = evalSide(this.kingPos[BLACK], BLACK, blackFiles, whiteFiles);
      return { mg: w.mg - b.mg, eg: w.eg - b.eg };
    }

    evaluate() {
      if (this.isInsufficientMaterial()) return 0;
      let mgScore = 0;
      let egScore = 0;
      let phase = 0;
      let whiteBishops = 0;
      let blackBishops = 0;
      const whiteFiles = new Int8Array(8);
      const blackFiles = new Int8Array(8);
      const wpSquares = [];
      const bpSquares = [];
      const board = this.board;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = board[sq];
        if (!p) continue;
        const mat = PIECE_VALUE[p] || 0;
        const pstMg = this._pst(p, sq);
        const i = this.sq128To64(sq);
        const j = isWhite(p) ? i : this.mirror64(i);
        const pstEg = (p === WK || p === BK) ? PST_KING_EG[j] : pstMg;

        if (isWhite(p)) {
          mgScore += mat + pstMg;
          egScore += mat + pstEg;
          if (p === WB) whiteBishops++;
          if (p === WP) {
            whiteFiles[sq & 7]++;
            wpSquares.push(sq);
          }
        } else {
          mgScore -= mat + pstMg;
          egScore -= mat + pstEg;
          if (p === BB) blackBishops++;
          if (p === BP) {
            blackFiles[sq & 7]++;
            bpSquares.push(sq);
          }
        }

        phase += PHASE_WEIGHT[p] || 0;
      }

      if (whiteBishops >= 2) { mgScore += TWOBISHOPS_S; egScore += TWOBISHOPS_E; }
      if (blackBishops >= 2) { mgScore -= TWOBISHOPS_S; egScore -= TWOBISHOPS_E; }

      const pawnStruct = this._pawnStructure(whiteFiles, blackFiles, wpSquares, bpSquares);
      mgScore += pawnStruct.mg;
      egScore += pawnStruct.eg;

      const activity = this._activityEval(this.kingPos[WHITE], this.kingPos[BLACK], pawnStruct.whiteFiles, pawnStruct.blackFiles);
      mgScore += activity.mg;
      egScore += activity.eg;

      const kingSafety = this._kingSafetyEval(pawnStruct.whiteFiles, pawnStruct.blackFiles);
      mgScore += kingSafety.mg;
      egScore += kingSafety.eg;

      const phaseClamped = Math.max(0, Math.min(MAX_PHASE, phase));
      let score = Math.round((mgScore * phaseClamped + egScore * (MAX_PHASE - phaseClamped)) / MAX_PHASE);

      if (this.inCheck(this.side)) {
        score += this.side === WHITE ? -20 : 20;
      }

      /* Tempo bonus */
      score += this.side === WHITE ? 10 : -10;
      return this.side === WHITE ? score : -score;
    }

    _attacksSquareOnOcc(from, to, piece, occ) {
      const type = piece & 7;
      if (type === 1) {
        if (isWhite(piece)) return from + 15 === to || from + 17 === to;
        return from - 15 === to || from - 17 === to;
      }
      if (type === 2) {
        for (const d of KNIGHT_DIR) {
          if (from + d === to) return true;
        }
        return false;
      }
      if (type === 3 || type === 5) {
        for (const d of BISHOP_DIR) {
          let sq = from + d;
          while (onBoard(sq)) {
            if (sq === to) return true;
            if (occ[sq] !== EMPTY) break;
            sq += d;
          }
        }
        if (type === 3) return false;
      }
      if (type === 4 || type === 5) {
        for (const d of ROOK_DIR) {
          let sq = from + d;
          while (onBoard(sq)) {
            if (sq === to) return true;
            if (occ[sq] !== EMPTY) break;
            sq += d;
          }
        }
        if (type === 4) return false;
      }
      if (type === 6) {
        for (const d of KING_DIR) {
          if (from + d === to) return true;
        }
      }
      return false;
    }

    _leastValuableAttacker(to, side, occ) {
      let bestSq = -1;
      let bestPiece = EMPTY;
      let bestVal = INF;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = occ[sq];
        if (!p) continue;
        if (colorOf(p) !== side) continue;
        if (!this._attacksSquareOnOcc(sq, to, p, occ)) continue;
        const v = PIECE_VALUE[p] || 0;
        if (v < bestVal) {
          bestVal = v;
          bestSq = sq;
          bestPiece = p;
        }
      }
      if (bestSq === -1) return null;
      return { sq: bestSq, piece: bestPiece };
    }

    see(m) {
      if (!(m.flags & FLAG_CAPTURE)) return 0;

      const occ = new Uint8Array(128);
      occ.set(this.board);

      const from = m.from;
      const to = m.to;
      const movedPiece = m.piece;
      const placedPiece = m.promo || movedPiece;

      let capturedValue = PIECE_VALUE[m.capture] || 0;
      if (m.flags & FLAG_EP) capturedValue = PIECE_VALUE[isWhite(m.piece) ? BP : WP];

      const gain = new Int16Array(32);
      gain[0] = capturedValue;

      occ[from] = EMPTY;
      if (m.flags & FLAG_EP) {
        const capSq = isWhite(m.piece) ? to - 16 : to + 16;
        occ[capSq] = EMPTY;
      }
      occ[to] = placedPiece;

      let depth = 0;
      let side = opponent(this.side);
      while (true) {
        const att = this._leastValuableAttacker(to, side, occ);
        if (!att) break;
        depth++;
        gain[depth] = (PIECE_VALUE[att.piece] || 0) - gain[depth - 1];
        occ[att.sq] = EMPTY;
        side = opponent(side);
      }

      while (--depth > -1) {
        gain[depth] = -Math.max(-gain[depth], gain[depth + 1]);
      }
      return gain[0];
    }

    /* ── Move ordering ── */
    _moveScore(m, ttBestEnc, ply) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc === ttBestEnc) return 2000000;
      if (m.flags & FLAG_CAPTURE) {
        const victim = (m.capture & 7) || 0;
        const attacker = (m.piece & 7) || 0;
        const mvv = MVV_LVA[victim][attacker] || 0;
        const see = m._see || 0;
        const movingQueen = m.piece === WQ || m.piece === BQ;
        // Strongly discourage queen trades down unless there is clear tactical compensation.
        if (movingQueen && victim !== 5 && see < 250) return 120000 + mvv + see;
        if (see < 0) return 250000 + mvv + see;
        return 1500000 + mvv + Math.min(200, see);
      }
      if (m.flags & FLAG_PROMO) return 1100000 + ((m.promo & 7) || 0);
      const killers = this.killers[ply] || [];
      if (enc === killers[0]) return 800000;
      if (enc === killers[1]) return 700000;
      let quiet = (this.histTable[(m.piece << 7) | m.to] | 0) + this.getContinuationBonus(m);
      if (m.piece === WQ || m.piece === BQ) {
        const them = opponent(this.side);
        if (this.isAttacked(m.to, them)) quiet -= 220;
        if (this.isSquareAttackedByPawn(m.to, them)) quiet -= 180;
      }
      return quiet;
    }

    scoreMoves(moves, ttBestEnc, ply) {
      for (const m of moves) {
        if (m.flags & FLAG_CAPTURE) {
          const victimVal = PIECE_VALUE[m.capture] || 0;
          const attackerVal = PIECE_VALUE[m.piece] || 0;
          // Fast path: obvious favorable captures skip expensive SEE.
          m._see = victimVal >= attackerVal ? (victimVal - attackerVal) : this.see(m);
        } else {
          m._see = 0;
        }
        m._score = this._moveScore(m, ttBestEnc, ply);
      }
    }

    pickNextMove(moves, startIdx) {
      let bestIdx = startIdx;
      let bestScore = moves[startIdx]._score;
      for (let i = startIdx + 1; i < moves.length; i++) {
        const s = moves[i]._score;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
      if (bestIdx !== startIdx) {
        const tmp = moves[startIdx];
        moves[startIdx] = moves[bestIdx];
        moves[bestIdx] = tmp;
      }
      return moves[startIdx];
    }

    storeKiller(m, ply) {
      const enc = TranspositionTable.encodeMove(m);
      const k   = this.killers[ply];
      if (enc !== k[0]) { k[1] = k[0]; k[0] = enc; }
    }

    isKillerMove(m, ply) {
      const enc = TranspositionTable.encodeMove(m);
      const k = this.killers[ply] || [0, 0];
      return enc === k[0] || enc === k[1];
    }

    getContinuationBonus(m) {
      const curIdx = (m.piece << 7) | m.to;
      const prev = this.history[this.history.length - 1];
      if (!prev || prev.from < 0 || !prev.piece) return 0;
      const prevIdx = (prev.piece << 7) | prev.to;
      return this.contHist[prevIdx * (15 * 128) + curIdx] | 0;
    }

    updateHistory(m, depth) {
      const idx = (m.piece << 7) | m.to;
      this.histTable[idx] = Math.min(this.histTable[idx] + depth * depth, 20000);

      const prev = this.history[this.history.length - 1];
      if (!prev || prev.from < 0 || !prev.piece) return;
      const prevIdx = (prev.piece << 7) | prev.to;
      const cidx = prevIdx * (15 * 128) + idx;
      this.contHist[cidx] = Math.max(-20000, Math.min(20000, (this.contHist[cidx] | 0) + depth * depth));
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
      if (this.selDepthHard > 0 && ply >= this.selDepthHard) return this.evaluate();

      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);
      if (ply >= 120) return this.evaluate();

      const inChk = this.inCheck(this.side);

      if (inChk) {
        const evasions = this.genMoves(false);
        if (evasions.length === 0) return -MATE + ply;
        const ttBest = this.tt.getBestMove(this.hash);
        this.scoreMoves(evasions, ttBest, ply);
        for (let i = 0; i < evasions.length; i++) {
          const m = this.pickNextMove(evasions, i);
          this.makeMove(m);
          const score = -this.qsearch(-beta, -alpha, ply + 1);
          this.undoMove();
          if (this.stop) return alpha;
          if (score >= beta) return beta;
          if (score > alpha) alpha = score;
        }
        return alpha;
      }

      const stand = this.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;

      const moves = this.genMoves(true);
      const ttBest = this.tt.getBestMove(this.hash);
      this.scoreMoves(moves, ttBest, ply);

      for (let i = 0; i < moves.length; i++) {
        const m = this.pickNextMove(moves, i);
        /* Delta pruning */
        const gain = (PIECE_VALUE[m.capture]||0) + (m.promo ? PIECE_VALUE[m.promo]||0 : 0);
        if (stand + gain + 200 < alpha) continue;
        if ((m.flags & FLAG_CAPTURE) && !(m.flags & FLAG_PROMO) && (m._see || 0) < 0) continue;

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
      if (this.selDepthHard > 0 && ply >= this.selDepthHard) return this.evaluate();

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

      let staticEval = 0;
      if (!inChk) staticEval = this.evaluate();
      this.evalTrace[ply] = inChk ? this.evalTrace[Math.max(0, ply - 2)] : staticEval;
      const improving = !inChk && ply >= 2 && staticEval > this.evalTrace[ply - 2];

      /* Reverse futility pruning */
      if (!isPV && !inChk && depth <= 3) {
        const margin = 100 * depth;
        if (staticEval - margin >= beta) return staticEval - margin;
      }

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
        const razor = staticEval + 300 * depth;
        if (razor < alpha) {
          const q = this.qsearch(alpha, beta, ply);
          if (q < alpha) return alpha;
        }
      }

      const moves = this.genMoves(false);
      if (moves.length === 0) return inChk ? -MATE + ply : 0;

      this.scoreMoves(moves, ttBestEnc, ply);

      const alpha0 = alpha;
      let bestScore = -INF;
      let bestMove  = null;
      let legalIdx  = 0;
      let moveTried = 0;

      for (let i = 0; i < moves.length; i++) {
        const m = this.pickNextMove(moves, i);
        moveTried++;
        const quietMove = (m.flags & (FLAG_CAPTURE | FLAG_PROMO | FLAG_EP)) === 0;
        const killerMove = quietMove && this.isKillerMove(m, ply);

        /* Late move pruning for quiet moves in low depth */
        if (!isPV && !inChk && quietMove && depth <= 3) {
          const limit = depth === 1 ? 6 : (depth === 2 ? 10 : 16);
          if (moveTried >= limit) continue;
        }

        /* Node futility pruning for quiet moves */
        if (!isPV && !inChk && quietMove && depth <= 2) {
          const futMargin = 120 * depth;
          if (staticEval + futMargin <= alpha) {
            continue;
          }
        }

        this.makeMove(m);
        const givesCheck = this.inCheck(this.side);
        let score;

        const isSingularCandidate = !isPV && !inChk && depth >= 7 &&
          ttBestEnc && (TranspositionTable.encodeMove(m) === ttBestEnc) && legalIdx === 0;
        let extension = 0;
        if (isSingularCandidate) {
          // Lightweight singular extension for strongly preferred TT moves.
          extension = 1;
        }

        if (legalIdx === 0) {
          /* PV node: full-window */
          score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply+1, true);
        } else {
          /* Adaptive LMR: no reduction for captures, checking, and killer moves */
          let reduction = 0;
          if (!isPV && depth >= 3 && legalIdx >= 3 && !inChk && quietMove && !givesCheck && !killerMove) {
            const dTerm = Math.floor(Math.log2(Math.max(2, depth)));
            const mTerm = Math.floor(Math.log2(legalIdx + 1));
            reduction = Math.max(1, Math.floor((dTerm * mTerm) / 2));
            if (improving) reduction = Math.max(1, reduction - 1);
            reduction = Math.min(reduction, depth - 2);
          }
          const newDepth = depth - 1 - reduction + extension;

          /* Zero-window search */
          score = -this.negamax(newDepth, -alpha-1, -alpha, ply+1, true);

          /* Re-search if LMR failed high */
          if (!this.stop && reduction > 0 && score > alpha) {
            score = -this.negamax(depth - 1 + extension, -alpha-1, -alpha, ply+1, true);
          }

          /* Re-search full window for PV */
          if (!this.stop && score > alpha && score < beta) {
            score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply+1, true);
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
      if ((this.nodes & 1023) === 0) {
        if (this.moveTime > 0 && Date.now() - this.startTime >= this.moveTime) this.stop = true;
        if (this.maxNodes > 0 && this.nodes >= this.maxNodes) this.stop = true;
      }
    }

    _strengthProfileFromElo(elo) {
      const e = Math.max(800, Math.min(2800, elo | 0));
      const t = (e - 800) / 2000; // 0..1
      const skill = Math.max(0, Math.min(20, Math.round(t * 20)));
      const depthCap = Math.max(1, Math.min(64, Math.round(2 + t * 16)));
      const nodeCap = Math.max(800, Math.round(1500 + t * t * 800000));
      return { skill, depthCap, nodeCap };
    }

    _resolveSearchStrength(spec) {
      let skill = Math.max(0, Math.min(20, this.options.SkillLevel | 0));
      let depthCap = 64;
      let nodeCap = Math.max(0, spec.maxNodes | 0);

      if (this.options.UCI_LimitStrength) {
        const prof = this._strengthProfileFromElo(this.options.UCI_Elo | 0);
        skill = prof.skill;
        depthCap = Math.min(depthCap, prof.depthCap);
        nodeCap = nodeCap > 0 ? Math.min(nodeCap, prof.nodeCap) : prof.nodeCap;
      } else if (skill < 20) {
        // Make SkillLevel effective even without UCI_LimitStrength.
        // This keeps compatibility with GUIs that only expose "Skill Level".
        const t = skill / 20; // 0..1
        const softDepthCap = Math.max(2, Math.round(2 + t * 14));
        const softNodeCap = Math.max(1500, Math.round(2500 + t * t * 600000));
        depthCap = Math.min(depthCap, softDepthCap);
        nodeCap = nodeCap > 0 ? Math.min(nodeCap, softNodeCap) : softNodeCap;
      }

      return { skill, depthCap, nodeCap };
    }

    applyStrengthPreset(name) {
      const key = String(name || '').trim().toLowerCase();
      if (!key || key === 'custom') {
        this.options.StrengthPreset = 'Custom';
        return;
      }

      const map = {
        elo1200: { elo: 1200, skill: 11 },
        elo1500: { elo: 1500, skill: 14 },
        elo1800: { elo: 1800, skill: 17 },
        elo2200: { elo: 2200, skill: 20 },
        max: { elo: 2800, skill: 20, full: true },
      };

      const p = map[key];
      if (!p) return;

      if (p.full) {
        this.options.UCI_LimitStrength = false;
        this.options.UCI_Elo = 2800;
        this.options.SkillLevel = 20;
        this.options.StrengthPreset = 'Max';
      } else {
        this.options.UCI_LimitStrength = true;
        this.options.UCI_Elo = p.elo;
        this.options.SkillLevel = p.skill;
        this.options.StrengthPreset = `Elo${p.elo}`;
      }

      this.send('info string preset', this.options.StrengthPreset,
        'limit', this.options.UCI_LimitStrength ? 'on' : 'off',
        'elo', this.options.UCI_Elo,
        'skill', this.options.SkillLevel);
    }

    runBench(depth = 6) {
      const d = Math.max(1, Math.min(12, depth | 0));
      const savedFen = this.getFen();
      const savedAnalyze = this.options.UCI_AnalyseMode;

      this.options.UCI_AnalyseMode = true;
      let totalNodes = 0;
      const benchStart = Date.now();

      for (let i = 0; i < BENCH_FENS.length; i++) {
        this.setFen(BENCH_FENS[i]);
        this.stop = false;
        this.nodes = 0;
        this.selDepth = 0;
        this.startTime = Date.now();
        this.moveTime = 0;
        this.maxNodes = 0;
        this.selDepthHard = 0;
        this.evalTrace.fill(0);
        this.tt.nextEpoch();
        this.histTable.fill(0);
        for (const k of this.killers) { k[0] = 0; k[1] = 0; }

        let rootMoves = this.genMoves(false);
        if (!rootMoves.length) {
          this.send('info string benchpos', i + 1, 'no legal move');
          continue;
        }

        let bestMove = rootMoves[0];
        for (let curDepth = 1; curDepth <= d; curDepth++) {
          let alpha = -INF;
          const beta = INF;
          let bestScore = -INF;
          const ttEnc = this.tt.getBestMove(this.hash);
          this.scoreMoves(rootMoves, ttEnc, 0);

          for (let mi = 0; mi < rootMoves.length; mi++) {
            const m = this.pickNextMove(rootMoves, mi);
            this.makeMove(m);
            const score = -this.negamax(curDepth - 1, -beta, -alpha, 1, true);
            this.undoMove();
            if (score > bestScore) {
              bestScore = score;
              bestMove = m;
            }
            if (score > alpha) alpha = score;
          }

          const bi = rootMoves.indexOf(bestMove);
          if (bi > 0) {
            const t = rootMoves[0];
            rootMoves[0] = rootMoves[bi];
            rootMoves[bi] = t;
          }
        }

        const posTime = Math.max(1, Date.now() - this.startTime);
        totalNodes += this.nodes;
        this.send('info string benchpos', i + 1,
          'nodes', this.nodes,
          'time', posTime,
          'nps', Math.floor(this.nodes * 1000 / posTime),
          'bestmove', this.moveToUci(bestMove));
      }

      const totalTime = Math.max(1, Date.now() - benchStart);
      this.send('info string bench total', 'nodes', totalNodes,
        'time', totalTime,
        'nps', Math.floor(totalNodes * 1000 / totalTime),
        'depth', d,
        'positions', BENCH_FENS.length);

      this.setFen(savedFen);
      this.options.UCI_AnalyseMode = savedAnalyze;
    }

    perft(depth) {
      if (depth <= 0) return 1;
      const moves = this.genMoves(false);
      if (depth === 1) return moves.length;
      let nodes = 0;
      for (const m of moves) {
        this.makeMove(m);
        nodes += this.perft(depth - 1);
        this.undoMove();
      }
      return nodes;
    }

    runPerft(depth = 4, divide = false) {
      const d = Math.max(1, Math.min(8, depth | 0));
      const start = Date.now();
      const moves = this.genMoves(false);
      let total = 0;

      if (d === 1) {
        total = moves.length;
      } else {
        for (const m of moves) {
          this.makeMove(m);
          const n = this.perft(d - 1);
          this.undoMove();
          total += n;
          if (divide) this.send('info string perft', this.moveToUci(m), n);
        }
      }

      const t = Math.max(1, Date.now() - start);
      this.send('info string perft total', total, 'depth', d, 'time', t, 'nps', Math.floor(total * 1000 / t));
      return total;
    }

    runPerftSuite(maxDepth = 4) {
      const depth = Math.max(1, Math.min(5, maxDepth | 0));
      const oldFen = this.getFen();
      let allOk = true;
      const suiteStart = Date.now();

      for (const test of PERFT_SUITE) {
        this.setFen(test.fen);
        for (let d = 1; d <= depth; d++) {
          if (!(d in test.expected)) continue;
          const got = this.runPerft(d, false);
          const exp = test.expected[d];
          const ok = got === exp;
          if (!ok) allOk = false;
          this.send('info string perftsuite', test.name, 'depth', d, 'got', got, 'expected', exp, ok ? 'ok' : 'FAIL');
        }
      }

      this.setFen(oldFen);
      this.send('info string perftsuite result', allOk ? 'PASS' : 'FAIL', 'time', Math.max(1, Date.now() - suiteStart));
    }

    calcMoveTime(spec) {
      if (spec.moveTime) {
        return Math.max(1, spec.moveTime - this.options.MoveOverhead);
      }
      const t   = this.side === WHITE ? (spec.wtime||0) : (spec.btime||0);
      const inc = this.side === WHITE ? (spec.winc||0)  : (spec.binc||0);
      const mtg = spec.movestogo || 30;
      if (!t) return 5000;

      // Stable time allocation with emergency floor and hard upper cap.
      const overhead = this.options.MoveOverhead | 0;
      const base = t / Math.max(10, mtg + 2) + inc * 0.6;
      const emergency = t < 10000 ? t * 0.08 : t * 0.035;
      let alloc = Math.max(base, emergency) - overhead;

      const hardCap = t < 3000 ? t * 0.25 : t * 0.45;
      alloc = Math.min(alloc, hardCap);
      return Math.max(1, Math.floor(alloc));
    }

    describeScore(score) {
      if (Math.abs(score) >= MATE - 200) {
        const mate = score > 0
          ? Math.ceil((MATE - score) / 2)
          : -Math.ceil((MATE + score) / 2);
        return { units: 'mate', value: mate };
      }
      return { units: 'cp', value: score | 0 };
    }

    scoreToWDL(score) {
      if (score >= MATE - 200) return { win: 1000, draw: 0, loss: 0 };
      if (score <= -MATE + 200) return { win: 0, draw: 0, loss: 1000 };

      const draw = Math.max(0, Math.min(1000, Math.round(220 * Math.exp(-Math.abs(score) / 280))));
      const decisive = Math.max(0, 1000 - draw);
      const winRatio = 1 / (1 + Math.exp(-score / 180));
      const win = Math.round(decisive * winRatio);
      const loss = decisive - win;
      return { win, draw, loss };
    }

    estimateACPL(rootLines) {
      if (!rootLines || rootLines.length < 2) return 0;
      const best = rootLines[0].score;
      if (Math.abs(best) >= MATE - 200) return 0;
      let total = 0;
      let count = 0;
      for (let i = 1; i < rootLines.length; i++) {
        const s = rootLines[i].score;
        if (Math.abs(s) >= MATE - 200) continue;
        total += Math.max(0, best - s);
        count++;
      }
      return count ? Math.round(total / count) : 0;
    }

    getPonderMove(rootLines) {
      if (!rootLines || !rootLines.length || !rootLines[0].pv) return '';
      const pv = rootLines[0].pv.trim().split(/\s+/);
      return pv.length >= 2 ? pv[1] : '';
    }

    pickSkillMove(scoredMoves) {
      if (!scoredMoves || !scoredMoves.length) return null;
      const skill = Math.max(0, Math.min(20, this.effectiveSkillLevel | 0));
      if (skill >= 20 || scoredMoves.length === 1) return scoredMoves[0].m;

      const bestScore = scoredMoves[0].score;
      const maxDrop = 20 + (20 - skill) * 18;
      const maxCount = Math.min(scoredMoves.length, 2 + Math.floor((20 - skill) / 3));

      const candidates = [];
      for (let i = 0; i < maxCount; i++) {
        const line = scoredMoves[i];
        const gap = bestScore - line.score;
        if (gap <= maxDrop) candidates.push(line);
      }
      if (!candidates.length) return scoredMoves[0].m;

      // Temperature-like sampling: lower skill explores more suboptimal but still reasonable moves.
      const temp = Math.max(0.25, (20 - skill) / 8);
      const base = 35 + skill * 5;
      let total = 0;
      for (const c of candidates) {
        const gap = Math.max(0, bestScore - c.score);
        c._w = Math.exp(-(gap / base) * temp);
        total += c._w;
      }

      let r = Math.random() * total;
      for (const c of candidates) {
        r -= c._w;
        if (r <= 0) return c.m;
      }
      return candidates[0].m;
    }

    applyRootBlunderGuard(scoredMoves, depth) {
      if (!scoredMoves || !scoredMoves.length) return;
      if (depth > 6) {
        for (const line of scoredMoves) line.pickScore = line.score;
        return;
      }

      const rawBest = scoredMoves[0].score;
      const ultraSafe = depth <= 5;
      let hasSafeAlt = false;

      // Semi-forced queen safety rule at shallow root:
      // if there are safe alternatives, strongly demote suspicious queen moves.
      for (const line of scoredMoves) {
        line._hardUnsafe = false;
        const m = line.m;
        if (Math.abs(line.score) >= MATE - 500) { hasSafeAlt = true; continue; }
        if (!(m.piece === WQ || m.piece === BQ)) { hasSafeAlt = true; continue; }

        const see = this.see(m);
        const them = opponent(this.side);

        if (m.flags & FLAG_CAPTURE) {
          const victimType = (m.capture & 7) || 0;
          // Queen-for-rook/minor/pawn with poor SEE is usually a practical blunder.
          const hardSee = ultraSafe ? 480 : 280;
          const hardGap = ultraSafe ? 20 : 40;
          if (victimType !== 5 && see < hardSee && line.score < rawBest - hardGap) {
            line._hardUnsafe = true;
          } else {
            hasSafeAlt = true;
          }
        } else {
          // Quiet queen move into pawn-attacked square is suspicious unless it is clearly best.
          const quietGap = ultraSafe ? 10 : 30;
          if (this.isSquareAttackedByPawn(m.to, them) && this.isAttacked(m.to, them) && line.score < rawBest - quietGap) {
            line._hardUnsafe = true;
          } else {
            hasSafeAlt = true;
          }
        }

        // Super-aggressive shallow safety: avoid obviously losing exchanges when alternatives exist.
        if (ultraSafe && (m.flags & FLAG_CAPTURE) && see <= -500 && line.score < rawBest - 15) {
          line._hardUnsafe = true;
        }
      }

      for (const line of scoredMoves) {
        let penalty = 0;
        const m = line.m;
        if (Math.abs(line.score) < MATE - 500) {
          const see = this.see(m);
          if (see <= -700) penalty += ultraSafe ? 420 : 220;
          else if (see <= -350) penalty += ultraSafe ? 180 : 90;

          const moving = m.promo || m.piece;
          if ((moving === WQ || moving === BQ) && see < 0) penalty += ultraSafe ? 260 : 140;

          // Extra root safety: avoid queen-for-rook/minor/pawn trades unless clearly justified.
          if ((m.piece === WQ || m.piece === BQ) && (m.flags & FLAG_CAPTURE)) {
            const victimType = (m.capture & 7) || 0;
            if (victimType !== 5) {
              if (see < (ultraSafe ? 420 : 250)) penalty += ultraSafe ? 460 : 260;
              else if (see < (ultraSafe ? 560 : 400)) penalty += ultraSafe ? 220 : 120;
            }
          }

          // Discourage quiet queen moves into attacked squares at shallow root depths.
          if ((m.piece === WQ || m.piece === BQ) && !(m.flags & FLAG_CAPTURE)) {
            const them = opponent(this.side);
            if (this.isAttacked(m.to, them)) penalty += ultraSafe ? 260 : 120;
            if (this.isSquareAttackedByPawn(m.to, them)) penalty += ultraSafe ? 320 : 140;
          }
        }
        if (hasSafeAlt && line._hardUnsafe) penalty += ultraSafe ? 200000 : 100000;
        line.pickScore = line.score - penalty;
      }

      scoredMoves.sort((a, b) => {
        const d = (b.pickScore | 0) - (a.pickScore | 0);
        if (d !== 0) return d;
        return (b.score | 0) - (a.score | 0);
      });
    }

    sendRootInfo(rootLines, depth, elapsed, nps, hashfull, multiPV) {
      const limit = Math.min(multiPV, rootLines.length);
      for (let i = 0; i < limit; i++) {
        const line = rootLines[i];
        const score = this.describeScore(line.score);
        const parts = [
          'info',
          'depth', depth,
          'seldepth', this.selDepth,
          'multipv', i + 1,
          'score', score.units, score.value,
        ];

        if (this.options.UCI_ShowWDL) {
          const wdl = this.scoreToWDL(line.score);
          parts.push('wdl', wdl.win, wdl.draw, wdl.loss);
        }

        parts.push('nodes', this.nodes, 'nps', nps, 'hashfull', hashfull, 'time', elapsed, 'pv', line.pv);
        this.send(...parts);
      }

      if (this.options.UCI_ShowACPL) {
        this.send('info string acpl', this.estimateACPL(rootLines), 'depth', depth);
      }
    }

    /* ── PV extraction ── */
    pvLine(depth, fmt = 'uci') {
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
        line.push(this.formatMove(m, fmt));
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
      this.selDepthHard = Math.max(0, spec.selDepth | 0);
      this.evalTrace.fill(0);
      this.tt.nextEpoch();

      const strength = this._resolveSearchStrength(spec);
      this.maxNodes = strength.nodeCap;
      this.effectiveSkillLevel = strength.skill;

      /* Reset history heuristic and killers each search */
      this.histTable.fill(0);
      this.contHist.fill(0);
      for (const k of this.killers) { k[0] = 0; k[1] = 0; }

      const depthLimit = Math.max(1, Math.min(strength.depthCap, Math.min(64, spec.depth || 64)));
      const multiPV    = Math.max(1, Math.min(12, (spec.multiPV || this.options.MultiPV) | 0));
      const outFmt     = this.options.PVFormat === 'san' ? 'san' : 'uci';

      let rootMoves    = this.genMoves(false);
      if (spec.searchMoves && spec.searchMoves.length) {
        const wanted = new Set(spec.searchMoves);
        rootMoves = rootMoves.filter((m) => wanted.has(this.moveToUci(m)));
      }
      if (rootMoves.length === 0) {
        this.send('bestmove 0000');
        return;
      }

      let bestMove     = rootMoves[0];
      let bestScore    = -INF;
      let prevScore    = -INF;
      let finalScored  = null;
      let panicUsed    = false;

      for (let d = 1; d <= depthLimit; d++) {
        if (this.stop) break;

        /* Aspiration window */
        let asp   = d > 1 ? 25 : INF;
        let lo    = d > 1 ? Math.max(-INF, prevScore - asp) : -INF;
        let hi    = d > 1 ? Math.min( INF, prevScore + asp) : INF;

        const scored = [];

        /* ---- aspiration loop ---- */
        let aspTries = 0;
        aspirationLoop:
        while (true) {
          if (++aspTries > 12) {
            // Safety guard to avoid pathological re-search loops.
            lo = -INF;
            hi = INF;
          }
          scored.length = 0;
          let alpha = lo;
          let bestInWindow = -INF;

          /* Order root moves: best move first */
          const ttEnc = this.tt.getBestMove(this.hash);
          this.scoreMoves(rootMoves, ttEnc, 0);

          for (let moveIdx = 0; moveIdx < rootMoves.length; moveIdx++) {
            const m = this.pickNextMove(rootMoves, moveIdx);
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
            if (score > bestInWindow) bestInWindow = score;

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
          }

          if (scored.length && bestInWindow <= lo && lo > -INF + 1) {
            /* Fail low: widen lower bound */
            asp = Math.min(asp * 2, INF);
            lo  = Math.max(-INF, bestInWindow - asp);
            hi  = Math.min(INF, bestInWindow + asp);
            continue aspirationLoop;
          }
          break;
        }
        /* ---- end aspiration loop ---- */

        if (!scored.length) break;

        /* Sort final results, then apply a shallow root blunder guard. */
        scored.sort((a, b) => b.score - a.score);
        this.applyRootBlunderGuard(scored, d);
        finalScored = scored;
        bestMove  = scored[0].m;
        bestScore = scored[0].score;

        // Panic time manager: if eval collapses on deeper iteration, think longer once.
        if (!panicUsed && !spec.moveTime && this.moveTime > 0 && d >= 4 && prevScore > -INF + 1) {
          const drop = prevScore - bestScore;
          if (drop >= 80) {
            const elapsedNow = Date.now() - this.startTime;
            if (elapsedNow < this.moveTime * 0.7) {
              const sideTime = this.side === WHITE ? (spec.wtime || 0) : (spec.btime || 0);
              const maxBudget = sideTime > 0 ? Math.floor(sideTime * 0.8) : Math.floor(this.moveTime * 2);
              const boosted = Math.min(maxBudget, Math.floor(this.moveTime * 1.35));
              if (boosted > this.moveTime) {
                this.moveTime = boosted;
                panicUsed = true;
                this.send('info string panic_time', 'drop', drop, 'new_movetime', this.moveTime);
              }
            }
          }
        }
        prevScore = bestScore;

        /* Re-order rootMoves to match scored order for next iteration */
        rootMoves = scored.map(x => x.m);

        const elapsed = Date.now() - this.startTime;
        const nps     = elapsed > 0 ? Math.floor(this.nodes * 1000 / elapsed) : this.nodes;
        const hashfull = this.tt.hashfull();

        /* Build root lines with PV */
        const rootLines = [];
        for (let i = 0; i < scored.length; i++) {
          const { m, score } = scored[i];
          const first = this.formatMove(m, outFmt);
          this.makeMove(m);
          const pv = [first, ...this.pvLine(Math.max(0, d-1), outFmt)].join(' ');
          this.undoMove();
          rootLines.push({ move: m, score, pv });
        }

        this.sendRootInfo(rootLines, d, elapsed, nps, hashfull, multiPV);

        /* Keep simple evalbar stream for UI integrations that depend on it */
        for (let i = 0; i < Math.min(multiPV, rootLines.length); i++) {
          const score = rootLines[i].score;
          /* evalbar: 0-100, 50 = equal */
          const evalBar = Math.max(0, Math.min(100, 50 + Math.round(score / 20)));
          this.send('info string evalbar', evalBar);
        }
      }

      const chosenMove = this.pickSkillMove(finalScored || [{ m: bestMove, score: bestScore }]) || bestMove;
      this.bestMove = chosenMove;
      const bestMoveUci = this.moveToUci(chosenMove);
      let ponder = '';
      if ((this.options.Ponder || spec.ponder) && chosenMove) {
        this.makeMove(chosenMove);
        const line = this.pvLine(1);
        this.undoMove();
        ponder = line[0] || '';
      }
      if (ponder) this.send('bestmove', bestMoveUci, 'ponder', ponder);
      else this.send('bestmove', bestMoveUci);
      this.pondering = false;
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
        multiPV:0, infinite:false, ponder:false,
        maxNodes:0, selDepth:0, searchMoves:[],
      };
      const stopWords = new Set(['searchmoves','ponder','wtime','btime','winc','binc','movestogo','depth','nodes','mate','movetime','infinite','multipv','seldepth']);
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i], v = Number(tokens[i+1]);
        if (t==='infinite')   { spec.infinite=true; }
        if (t==='ponder')     { spec.ponder=true; }
        if (t==='depth')      { spec.depth=v; }
        if (t==='movetime')   { spec.moveTime=v; }
        if (t==='nodes')      { spec.maxNodes=v; }
        if (t==='seldepth')   { spec.selDepth=v; }
        if (t==='wtime')      { spec.wtime=v; }
        if (t==='btime')      { spec.btime=v; }
        if (t==='winc')       { spec.winc=v; }
        if (t==='binc')       { spec.binc=v; }
        if (t==='movestogo')  { spec.movestogo=v; }
        if (t==='multipv')    { spec.multiPV=v; }
        if (t === 'searchmoves') {
          let j = i + 1;
          while (j < tokens.length && !stopWords.has(tokens[j])) {
            spec.searchMoves.push(tokens[j]);
            j++;
          }
          i = j - 1;
        }
      }
      if (spec.infinite && !spec.moveTime) spec.moveTime = 24 * 3600 * 1000;
      if (spec.ponder && !spec.moveTime) spec.moveTime = 24 * 3600 * 1000;
      if (this.options.UCI_AnalyseMode && !spec.moveTime) spec.moveTime = 0;
      if (!spec.depth) spec.depth = 64;
      this.lastGoSpec = spec;
      this.pondering = !!spec.ponder;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        this.search(spec);
      }, 0);
    }

    handleSetOption(tokens) {
      const ni = tokens.indexOf('name');
      const vi = tokens.indexOf('value');
      if (ni < 0) return;
      const name  = tokens.slice(ni+1, vi>-1?vi:tokens.length).join(' ');
      const value = vi>-1 ? tokens.slice(vi+1).join(' ') : '';
      if (name === 'MultiPV') {
        this.options.MultiPV = Math.max(1, Math.min(12, +value || 1));
        return;
      }
      if (name === 'Skill Level') {
        const parsed = Number(value);
        this.options.SkillLevel = Number.isFinite(parsed)
          ? Math.max(0, Math.min(20, parsed | 0))
          : 20;
        return;
      }
      if (name === 'Strength Preset') {
        this.applyStrengthPreset(value);
        return;
      }
      if (name === 'Ponder') {
        this.options.Ponder = BOOL_RE.test(value.trim());
        return;
      }
      if (name === 'Move Overhead') {
        this.options.MoveOverhead = Math.max(0, Math.min(10000, +value || 0));
        return;
      }
      if (name === 'UCI_AnalyseMode') {
        this.options.UCI_AnalyseMode = BOOL_RE.test(value.trim());
        return;
      }
      if (name === 'UCI_LimitStrength') {
        this.options.UCI_LimitStrength = BOOL_RE.test(value.trim());
        return;
      }
      if (name === 'UCI_Elo') {
        this.options.UCI_Elo = Math.max(800, Math.min(2800, +value || 2000));
        return;
      }
      if (name === 'UCI_ShowWDL') {
        this.options.UCI_ShowWDL = BOOL_RE.test(value.trim());
        return;
      }
      if (name === 'UCI_ShowACPL') {
        this.options.UCI_ShowACPL = BOOL_RE.test(value.trim());
        return;
      }
      if (name === 'PVFormat') {
        this.options.PVFormat = String(value).trim().toLowerCase() === 'san' ? 'san' : 'uci';
        return;
      }
      if (name === 'Clear Hash') {
        this.tt.clear();
        return;
      }
      if (name === 'Hash') {
        const mb = Math.max(MIN_HASH_MB, Math.min(MAX_HASH_MB, +value || DEFAULT_HASH_MB));
        this.options.Hash = mb;
        this.tt.resize(mb);
        return;
      }
    }

    command(line) {
      const tokens = line.trim().split(/\s+/);
      if (!tokens[0]) return;
      let cmd = tokens[0];
      if (cmd === 'u') cmd = 'ucinewgame';
      if (cmd === 'q') cmd = 'quit';
      if (cmd === 'b') cmd = 'board';
      if (cmd === 'e') cmd = 'eval';
      if (cmd === 'p') {
        cmd = 'position';
        if (tokens[1] === 's') tokens[1] = 'startpos';
      }
      if (cmd === 'g') {
        cmd = 'go';
        if (tokens[1] === 'd') tokens[1] = 'depth';
      }

      switch (cmd) {
        case 'uci':
          this.send('id name', this.name);
          this.send('id author', this.author);
          this.send('option name Clear Hash type button');
          this.send('option name Hash type spin default', DEFAULT_HASH_MB, 'min', MIN_HASH_MB, 'max', MAX_HASH_MB);
          this.send('option name MultiPV type spin default 1 min 1 max 12');
          this.send('option name Strength Preset type combo default Custom var Custom var Elo1200 var Elo1500 var Elo1800 var Elo2200 var Max');
          this.send('option name Skill Level type spin default 20 min 0 max 20');
          this.send('option name Threads type spin default 1 min 1 max 1');
          this.send('option name Ponder type check default false');
          this.send('option name Move Overhead type spin default 0 min 0 max 10000');
          this.send('option name UCI_AnalyseMode type check default false');
          this.send('option name UCI_LimitStrength type check default false');
          this.send('option name UCI_Elo type spin default 2000 min 800 max 2800');
          this.send('option name UCI_ShowWDL type check default false');
          this.send('option name UCI_ShowACPL type check default false');
          this.send('option name PVFormat type combo default uci var uci var san');
          this.send('uciok');
          break;
        case 'isready':
          this.send('readyok');
          break;
        case 'ucinewgame':
          this.tt.clear();
          this.histTable.fill(0);
          this.contHist.fill(0);
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
          if (this.searchTimer) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
          }
          break;
        case 'ponderhit':
          if (this.pondering && this.lastGoSpec) {
            this.startTime = Date.now();
            this.moveTime = this.calcMoveTime(this.lastGoSpec);
            this.pondering = false;
          }
          break;
        case 'setoption':
          this.handleSetOption(tokens);
          break;
        case 'ping':
          this.send('info string', this.name, 'is alive');
          break;
        case 'bench': {
          let d = 6;
          if (tokens[1] === 'depth' && tokens[2]) d = Number(tokens[2]) || 6;
          else if (tokens[1]) d = Number(tokens[1]) || 6;
          this.runBench(d);
          break;
        }
        case 'perft': {
          let d = 4;
          let divide = false;
          if (tokens[1] === 'depth' && tokens[2]) d = Number(tokens[2]) || 4;
          else if (tokens[1]) d = Number(tokens[1]) || 4;
          if (tokens.includes('divide')) divide = true;
          this.runPerft(d, divide);
          break;
        }
        case 'perftsuite': {
          let d = 4;
          if (tokens[1] === 'depth' && tokens[2]) d = Number(tokens[2]) || 4;
          else if (tokens[1]) d = Number(tokens[1]) || 4;
          this.runPerftSuite(d);
          break;
        }
        case 'board':
          this.send('info string board', this.getFen());
          break;
        case 'eval':
          this.send('info string eval cp', this.evaluate());
          break;
        case 'd':
        case 'fen':
          this.send('info string', this.getFen());
          break;
        case 'quit':
          this.stop = true;
          break;
        default:
          this.send('info string unknown command', cmd);
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
