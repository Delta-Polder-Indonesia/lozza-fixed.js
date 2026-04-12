/*
  Bintang Toba Chess Engine v2.1 (Web Worker)
  Fully revised version with all review recommendations applied.
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
  const MATE_BOUND = MATE - 200;
  const DEFAULT_HASH_MB = 16;
  const MIN_HASH_MB = 1;
  const MAX_HASH_MB = 256;
  const BOOL_RE = /^(true|1|on)$/i;

  const FLAG_CAPTURE = 1;
  const FLAG_EP      = 2;
  const FLAG_CASTLE  = 4;
  const FLAG_PROMO   = 8;

  const MAX_PLY     = 128;
  const MAX_MOVES   = 256;
  const TEMPO_MG    = 12;
  const TEMPO_EG    = 6;

  /* ── Directions ── */
  const KNIGHT_DIR = [31, 33, 14, -14, 18, -18, -31, -33];
  const BISHOP_DIR = [15, 17, -15, -17];
  const ROOK_DIR   = [1, -1, 16, -16];
  const KING_DIR   = [1, -1, 16, -16, 15, 17, -15, -17];

  /* ── Material values ── */
  const PIECE_VALUE = new Int16Array(16);
  PIECE_VALUE[WP] = 100; PIECE_VALUE[WN] = 300; PIECE_VALUE[WB] = 310;
  PIECE_VALUE[WR] = 500; PIECE_VALUE[WQ] = 900; PIECE_VALUE[WK] = 0;
  PIECE_VALUE[BP] = 100; PIECE_VALUE[BN] = 300; PIECE_VALUE[BB] = 310;
  PIECE_VALUE[BR] = 500; PIECE_VALUE[BQ] = 900; PIECE_VALUE[BK] = 0;

  const PIECE_CH = { [WP]:'P',[WN]:'N',[WB]:'B',[WR]:'R',[WQ]:'Q',[WK]:'K',
                      [BP]:'p',[BN]:'n',[BB]:'b',[BR]:'r',[BQ]:'q',[BK]:'k' };
  const CH_PIECE = { P:WP,N:WN,B:WB,R:WR,Q:WQ,K:WK,
                     p:BP,n:BN,b:BB,r:BR,q:BQ,k:BK };

  function isWhite(p)  { return p >= WP && p <= WK; }
  function isBlack(p)  { return p >= BP && p <= BK; }
  function colorOf(p)  { return isWhite(p) ? WHITE : BLACK; }
  function opponent(c) { return c ^ 1; }
  function onBoard(sq) { return (sq & 0x88) === 0; }
  function pieceType(p){ return p & 7; }

  /* ── PST tables (white view, a8=index 0) ── */
  const PST_PAWN_MG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ]);
  const PST_PAWN_EG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
     70, 70, 70, 70, 70, 70, 70, 70,
     30, 30, 35, 40, 40, 35, 30, 30,
     15, 15, 20, 30, 30, 20, 15, 15,
      5,  5, 10, 20, 20, 10,  5,  5,
      0,  0,  0,  5,  5,  0,  0,  0,
     -5, -5, -5,-10,-10, -5, -5, -5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ]);
  const PST_KNIGHT_MG = new Int16Array([
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ]);
  const PST_KNIGHT_EG = new Int16Array([
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 20, 25, 25, 20,  5,-30,
    -30,  0, 20, 25, 25, 20,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ]);
  const PST_BISHOP_MG = new Int16Array([
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ]);
  const PST_BISHOP_EG = new Int16Array([
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  5, 10, 15, 15, 10,  5,-10,
    -10,  5, 15, 20, 20, 15,  5,-10,
    -10,  5, 15, 20, 20, 15,  5,-10,
    -10,  5, 10, 15, 15, 10,  5,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ]);
  const PST_ROOK_MG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ]);
  const PST_ROOK_EG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
      5,  5,  5,  5,  5,  5,  5,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  5,  5,  0,  0,  0,
  ]);
  const PST_QUEEN_MG = new Int16Array([
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ]);
  const PST_QUEEN_EG = new Int16Array([
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  5, 10, 10, 10, 10,  5,-10,
     -5,  5, 10, 15, 15, 10,  5, -5,
     -5,  5, 10, 15, 15, 10,  5, -5,
    -10,  5, 10, 10, 10, 10,  5,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ]);
  const PST_KING_MG = new Int16Array([
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ]);
  const PST_KING_EG = new Int16Array([
    -50,-30,-30,-30,-30,-30,-30,-50,
    -30,-20,-10,-10,-10,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ]);

  /* PST lookup tables indexed by piece type (1-6) */
  const PST_MG = [null, PST_PAWN_MG, PST_KNIGHT_MG, PST_BISHOP_MG, PST_ROOK_MG, PST_QUEEN_MG, PST_KING_MG];
  const PST_EG = [null, PST_PAWN_EG, PST_KNIGHT_EG, PST_BISHOP_EG, PST_ROOK_EG, PST_QUEEN_EG, PST_KING_EG];

  const PHASE_WEIGHT = new Int8Array(16);
  PHASE_WEIGHT[WN] = 1; PHASE_WEIGHT[WB] = 1; PHASE_WEIGHT[WR] = 2; PHASE_WEIGHT[WQ] = 4;
  PHASE_WEIGHT[BN] = 1; PHASE_WEIGHT[BB] = 1; PHASE_WEIGHT[BR] = 2; PHASE_WEIGHT[BQ] = 4;
  const MAX_PHASE = 24;

  const MVV_LVA = (() => {
    const t = Array.from({ length: 7 }, () => new Int16Array(7));
    for (let v = 1; v <= 6; v++)
      for (let a = 1; a <= 6; a++)
        t[v][a] = v * 16 - a;
    return t;
  })();

  /* Passed pawn advancement bonus (index = rank for white 1-7, 0 unused) */
  const PAWN_PASSED = [0, 0, 0, 0.1, 0.3, 0.7, 1.2, 2.0];

  /* Attack weight by attacker count */
  const ATT_W = new Float64Array([0,0.01,0.42,0.78,1.11,1.52,1,1,1,1,1,1,1,1,1,1,1]);

  /* Mobility weights */
  const MOBN_S = 4,  MOBN_E = -5, MOBN_S0 = -9,  MOBN_E0 = -73;
  const MOBB_S = 7,  MOBB_E =  2, MOBB_S0 = -10, MOBB_E0 = -48;
  const MOBR_S = 5,  MOBR_E =  2, MOBR_S0 = -2,  MOBR_E0 = -50;
  const MOBQ_S = 3,  MOBQ_E =  6, MOBQ_S0 = 6,   MOBQ_E0 = 0;

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

  /* Pawn structure weights */
  const DOUBLED_MG = 11, DOUBLED_EG = 3;
  const ISOLATED_MG = 13, ISOLATED_EG = 12;
  const CONNECTED_BONUS = 8;
  const BLOCKED_PAWN_MG = 8, BLOCKED_PAWN_EG = 12;

  /* King safety weights */
  const KSAFETY_SHELTER = 5, KSAFETY_SHELTER_EG = 2;
  const KSAFETY_STORM = 4, KSAFETY_STORM_EG = 2;
  const KSAFETY_OPEN = 8, KSAFETY_OPEN_EG_DIV = 2;
  const KSAFETY_ATTACK = 7, KSAFETY_ATTACK_EG = 3;
  const KSAFETY_SAFE_BONUS = 10;

  /* WDL model constants */
  const WDL_DRAW_COEFF = 220;
  const WDL_DRAW_SCALE = 280;
  const WDL_WIN_SCALE  = 180;

  /* ── Bench positions ── */
  const BENCH_FENS = [
    START_FEN,
    'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7',
    'r3r1k1/pp1n1pp1/2p2q1p/3p4/3P4/2N1PN2/PPQ2PPP/2R2RK1 w - - 0 16',
    '2r2rk1/1bq1bppp/p2ppn2/1p6/3NP3/1BN1B3/PPP2PPP/2RQ1RK1 w - - 2 13',
    '8/2p5/2P1k3/3pP3/3P4/4K3/8/8 w - - 0 1',
    'r4rk1/1pp1qppp/p1np1n2/4p3/2BPP3/2N2N2/PPP2PPP/R1BQR1K1 w - - 3 11',
  ];

  const PERFT_SUITE = [
    { name:'startpos', fen:START_FEN, expected:{1:20,2:400,3:8902,4:197281} },
    { name:'kiwipete', fen:'r3k2r/p1ppqpb1/bn2pnp1/2P5/1p2P3/2N2N2/PPQ1BPPP/R3K2R w KQkq - 0 1',
      expected:{1:48,2:2039,3:97862,4:4085603} },
  ];

  /* ──────────────────────────────────────────────── */
  /* ── 64-bit Zobrist using two 32-bit halves     ── */
  /* ──────────────────────────────────────────────── */

  class RNG {
    constructor(seed = 0x9e3779b1) { this.s = seed >>> 0; }
    next() {
      let x = this.s;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.s = x >>> 0;
      return this.s;
    }
  }

  /**
   * 64-bit hash stored as { lo: uint32, hi: uint32 }
   * XOR operations on both halves.
   */
  function hashXor(a, b) {
    return { lo: (a.lo ^ b.lo) >>> 0, hi: (a.hi ^ b.hi) >>> 0 };
  }
  function hashEq(a, b) { return a.lo === b.lo && a.hi === b.hi; }
  const HASH_ZERO = { lo: 0, hi: 0 };

  function initZobrist() {
    const rng = new RNG(0x12345678);
    const next64 = () => ({ lo: rng.next(), hi: rng.next() });

    const piece = Array.from({ length: 16 }, () => {
      const a = new Array(128);
      for (let sq = 0; sq < 128; sq++) a[sq] = onBoard(sq) ? next64() : HASH_ZERO;
      return a;
    });
    const side = next64();
    const castle = new Array(16);
    for (let i = 0; i < 16; i++) castle[i] = next64();
    const ep = new Array(128);
    for (let i = 0; i < 128; i++) ep[i] = onBoard(i) ? next64() : HASH_ZERO;
    return { piece, side, castle, ep };
  }

  /* ──────────────────────────────────────────────── */
  /* ── Transposition Table with 64-bit keys        ── */
  /* ──────────────────────────────────────────────── */

  /*
    Each TT entry = 7 Int32 words:
      [0] hash_lo  [1] hash_hi  [2] depth  [3] flag  [4] score  [5] best_lo  [6] best_hi(unused, reserved)
    We pack bestmove into word 5 only (32 bits is enough for from|to|promo|flags).
    Word 6 reserved for future.
  */
  const TT_HASHLO = 0;
  const TT_HASHHI = 1;
  const TT_DEPTH  = 2;
  const TT_FLAG   = 3;
  const TT_SCORE  = 4;
  const TT_BEST   = 5;
  const TT_WORDS  = 6;

  function ttSlotsFromMb(mb) {
    const clamped = Math.max(MIN_HASH_MB, Math.min(MAX_HASH_MB, mb | 0));
    const bytes = clamped * 1024 * 1024;
    const entryBytes = TT_WORDS * 4;
    let slots = 1;
    while ((slots << 1) * entryBytes <= bytes) slots <<= 1;
    return slots;
  }

  class TranspositionTable {
    constructor(hashMb = DEFAULT_HASH_MB) { this.resize(hashMb); }

    resize(hashMb) {
      this.size = ttSlotsFromMb(hashMb);
      this.mask = this.size - 1;
      this.data = new Int32Array(this.size * TT_WORDS);
      this.ages = new Uint16Array(this.size);
      this.epoch = 1;
    }

    clear() { this.data.fill(0); this.ages.fill(0); this.epoch = 1; }

    nextEpoch() {
      this.epoch = (this.epoch + 1) & 0xffff;
      if (this.epoch === 0) this.epoch = 1;
    }

    _slot(hash) { return (hash.lo & this.mask); }
    _idx(hash)  { return this._slot(hash) * TT_WORDS; }

    _keysMatch(i, hash) {
      return this.data[i + TT_HASHLO] === (hash.lo | 0) &&
             this.data[i + TT_HASHHI] === (hash.hi | 0);
    }

    probe(hash, depth, alpha, beta) {
      const i = this._idx(hash);
      if (!this._keysMatch(i, hash)) return null;
      if (this.data[i + TT_DEPTH] < depth) return null;
      const score = this.data[i + TT_SCORE];
      const flag  = this.data[i + TT_FLAG];
      if (flag === 0)  return score;
      if (flag === -1 && score <= alpha) return score;
      if (flag === 1  && score >= beta)  return score;
      return null;
    }

    getBestMove(hash) {
      const i = this._idx(hash);
      if (!this._keysMatch(i, hash)) return 0;
      return this.data[i + TT_BEST];
    }

    store(hash, depth, score, flag, bestEncoded) {
      const i = this._idx(hash);
      const slot = this._slot(hash);
      const oldMatch = this._keysMatch(i, hash);
      const oldDepth = this.data[i + TT_DEPTH];
      const oldFlag  = this.data[i + TT_FLAG];
      const age = this.data[i + TT_HASHLO] || this.data[i + TT_HASHHI]
        ? ((this.epoch - this.ages[slot]) & 0xffff) : 0xffff;

      if (!oldMatch && oldDepth > depth && age <= 1) return;
      if (!oldMatch && oldDepth > depth + 2 && age <= 4) return;
      if (oldMatch && oldDepth === depth && oldFlag === 0 && flag !== 0 && age <= 2) return;

      const best = bestEncoded
        ? (bestEncoded | 0)
        : (oldMatch ? this.data[i + TT_BEST] : 0);

      this.data[i + TT_HASHLO] = hash.lo | 0;
      this.data[i + TT_HASHHI] = hash.hi | 0;
      this.data[i + TT_DEPTH]  = depth;
      this.data[i + TT_SCORE]  = score;
      this.data[i + TT_FLAG]   = flag;
      this.data[i + TT_BEST]   = best;
      this.ages[slot] = this.epoch;
    }

    hashfull() {
      const sample = Math.min(1024, this.size);
      if (!sample) return 0;
      const step = Math.max(1, (this.size / sample) | 0);
      let used = 0, seen = 0;
      for (let slot = 0; slot < this.size && seen < sample; slot += step, seen++) {
        const i = slot * TT_WORDS;
        if (this.data[i + TT_HASHLO] || this.data[i + TT_HASHHI]) used++;
      }
      return Math.max(0, Math.min(1000, Math.floor((used * 1000) / Math.max(1, seen))));
    }

    static encodeMove(m) {
      if (!m) return 0;
      return (m.from) | (m.to << 8) | ((m.promo || 0) << 16) | ((m.flags || 0) << 24);
    }
    static decodeMove(v) {
      if (!v) return null;
      return {
        from:  v & 0xff,
        to:   (v >>> 8)  & 0xff,
        promo:(v >>> 16) & 0xff,
        flags:(v >>> 24) & 0xff,
        piece:EMPTY, capture:EMPTY,
      };
    }
  }

  /* ──────────────────────────────────────────────── */
  /* ── Pre-computed square mappings                ── */
  /* ──────────────────────────────────────────────── */

  function sqToUci(sq) { return FILES[sq & 7] + ((sq >> 4) + 1); }
  function uciToSq(uci) {
    if (!uci || uci.length < 2) return -1;
    const f = FILES.indexOf(uci[0]);
    const r = Number(uci[1]) - 1;
    if (f < 0 || r < 0 || r > 7) return -1;
    return (r << 4) | f;
  }

  const SQ = {};
  ['a1','b1','c1','d1','e1','f1','g1','h1',
   'a8','b8','c8','d8','e8','f8','g8','h8'].forEach(n => { SQ[n] = uciToSq(n); });

  /* 0x88 square -> 64 index */
  function sq128To64(sq) { return ((sq >> 4) << 3) | (sq & 7); }
  function mirror64(i)   { return ((7 - (i >> 3)) << 3) | (i & 7); }

  /* ──────────────────────────────────────────────── */
  /* ── Move Pool (avoid GC pressure)              ── */
  /* ──────────────────────────────────────────────── */

  class MovePool {
    constructor(capacity = 4096) {
      this.cap = capacity;
      this.from    = new Uint8Array(capacity);
      this.to      = new Uint8Array(capacity);
      this.piece   = new Uint8Array(capacity);
      this.capture = new Uint8Array(capacity);
      this.promo   = new Uint8Array(capacity);
      this.flags   = new Uint8Array(capacity);
      this.score   = new Int32Array(capacity);
      this.see     = new Int16Array(capacity);
      this.size = 0;
    }

    reset() { this.size = 0; }

    add(from, to, piece, capture, promo, flags) {
      const i = this.size;
      if (i >= this.cap) return i; // safety
      this.from[i]    = from;
      this.to[i]      = to;
      this.piece[i]   = piece;
      this.capture[i] = capture;
      this.promo[i]   = promo;
      this.flags[i]   = flags;
      this.score[i]   = 0;
      this.see[i]     = 0;
      this.size++;
      return i;
    }

    swap(a, b) {
      if (a === b) return;
      let t;
      t = this.from[a];    this.from[a]    = this.from[b];    this.from[b]    = t;
      t = this.to[a];      this.to[a]      = this.to[b];      this.to[b]      = t;
      t = this.piece[a];   this.piece[a]   = this.piece[b];   this.piece[b]   = t;
      t = this.capture[a]; this.capture[a] = this.capture[b]; this.capture[b] = t;
      t = this.promo[a];   this.promo[a]   = this.promo[b];   this.promo[b]   = t;
      t = this.flags[a];   this.flags[a]   = this.flags[b];   this.flags[b]   = t;
      t = this.score[a];   this.score[a]   = this.score[b];   this.score[b]   = t;
      t = this.see[a];     this.see[a]     = this.see[b];     this.see[b]     = t;
    }

    getObj(i) {
      return {
        from:    this.from[i],
        to:      this.to[i],
        piece:   this.piece[i],
        capture: this.capture[i],
        promo:   this.promo[i],
        flags:   this.flags[i],
        _score:  this.score[i],
        _see:    this.see[i],
      };
    }

    encode(i) {
      return (this.from[i]) | (this.to[i] << 8) | (this.promo[i] << 16) | (this.flags[i] << 24);
    }
  }

  /* ──────────────────────────────────────────────── */
  /* ── Piece List                                  ── */
  /* ──────────────────────────────────────────────── */

  class PieceList {
    constructor() {
      /* pieces[color] = array of { sq, piece } */
      this.pieces = [[], []];
      /* quick lookup: sqIndex[sq] = index into pieces[color] or -1 */
      this.sqIndex = new Int16Array(128).fill(-1);
    }

    clear() {
      this.pieces[WHITE].length = 0;
      this.pieces[BLACK].length = 0;
      this.sqIndex.fill(-1);
    }

    add(sq, piece) {
      const color = colorOf(piece);
      const idx = this.pieces[color].length;
      this.pieces[color].push({ sq, piece });
      this.sqIndex[sq] = idx;
    }

    remove(sq, color) {
      const idx = this.sqIndex[sq];
      if (idx < 0) return;
      const list = this.pieces[color];
      const last = list.length - 1;
      if (idx !== last) {
        list[idx] = list[last];
        this.sqIndex[list[idx].sq] = idx;
      }
      list.length = last;
      this.sqIndex[sq] = -1;
    }

    move(fromSq, toSq, newPiece) {
      const idx = this.sqIndex[fromSq];
      if (idx < 0) return;
      const color = colorOf(newPiece);
      const entry = this.pieces[color][idx];
      entry.sq = toSq;
      entry.piece = newPiece;
      this.sqIndex[fromSq] = -1;
      this.sqIndex[toSq] = idx;
    }

    forEach(color, fn) {
      const list = this.pieces[color];
      for (let i = 0, len = list.length; i < len; i++) {
        fn(list[i].sq, list[i].piece);
      }
    }

    count(color, pieceType) {
      let c = 0;
      const list = this.pieces[color];
      for (let i = 0, len = list.length; i < len; i++) {
        if ((list[i].piece & 7) === pieceType) c++;
      }
      return c;
    }

    hasPieceType(color, pt) {
      const list = this.pieces[color];
      for (let i = 0, len = list.length; i < len; i++) {
        if ((list[i].piece & 7) === pt) return true;
      }
      return false;
    }

    hasNonPawnMaterial(color) {
      const list = this.pieces[color];
      for (let i = 0, len = list.length; i < len; i++) {
        const pt = list[i].piece & 7;
        if (pt >= 2 && pt <= 5) return true;
      }
      return false;
    }
  }

  /* ──────────────────────────────────────────────── */
  /* ── Pawn Hash Table                             ── */
  /* ──────────────────────────────────────────────── */

  class PawnHashTable {
    constructor(sizeBits = 12) {
      this.size = 1 << sizeBits;
      this.mask = this.size - 1;
      this.keys_lo = new Int32Array(this.size);
      this.keys_hi = new Int32Array(this.size);
      this.mg = new Int16Array(this.size);
      this.eg = new Int16Array(this.size);
      this.valid = new Uint8Array(this.size);
    }

    clear() {
      this.valid.fill(0);
    }

    probe(hash) {
      const idx = hash.lo & this.mask;
      if (!this.valid[idx]) return null;
      if (this.keys_lo[idx] !== (hash.lo | 0) || this.keys_hi[idx] !== (hash.hi | 0)) return null;
      return { mg: this.mg[idx], eg: this.eg[idx] };
    }

    store(hash, mg, eg) {
      const idx = hash.lo & this.mask;
      this.keys_lo[idx] = hash.lo | 0;
      this.keys_hi[idx] = hash.hi | 0;
      this.mg[idx] = mg;
      this.eg[idx] = eg;
      this.valid[idx] = 1;
    }
  }

  /* ──────────────────────────────────────────────── */
  /* ── Engine                                      ── */
  /* ──────────────────────────────────────────────── */

  class Engine {
    constructor() {
      this.name   = 'Bintang Toba 2.1';
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
      this.kingPos = [-1, -1];

      /* Piece list */
      this.plist = new PieceList();

      /* History stack */
      this.history  = [];
      this.hashStack = [];

      /* Killers [ply][0..1] */
      this.killers = Array.from({ length: MAX_PLY }, () => [0, 0]);

      /* History heuristic [piece][to] */
      this.histTable = new Int32Array(16 * 128);

      /* Continuation history [prevIndex][curIndex] — use smaller tables */
      this.contHistSize = 16 * 128; // 2048
      this.contHist = new Int16Array(this.contHistSize * this.contHistSize);

      /* Static eval trace for improving detection */
      this.evalTrace = new Int32Array(MAX_PLY + 8);

      /* Zobrist */
      this.Z = initZobrist();

      /* Pawn Zobrist (separate keys for pawn hash) */
      this.pawnZ = this._initPawnZobrist();

      /* Transposition table */
      this.tt = new TranspositionTable(this.options.Hash);

      /* Pawn hash table */
      this.pawnHash = new PawnHashTable(12);

      /* Move pool for generation (reusable) */
      this.movePool = new MovePool(4096);

      /* SEE occupancy buffer (reusable) */
      this.seeOcc = new Uint8Array(128);

      this.bestMove = null;
      this.hash = HASH_ZERO;
      this.pHash = HASH_ZERO;

      this.setFen(START_FEN);
    }

    /* ── Pawn-only Zobrist ── */
    _initPawnZobrist() {
      const rng = new RNG(0xABCDEF01);
      const next64 = () => ({ lo: rng.next(), hi: rng.next() });
      const table = {};
      table[WP] = new Array(128);
      table[BP] = new Array(128);
      for (let sq = 0; sq < 128; sq++) {
        table[WP][sq] = onBoard(sq) ? next64() : HASH_ZERO;
        table[BP][sq] = onBoard(sq) ? next64() : HASH_ZERO;
      }
      return table;
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
      this.plist.clear();
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
          if (p) this.plist.add(sq, p);
          f++;
        }
        r--;
      }
      this.side     = parts[1] === 'b' ? BLACK : WHITE;
      const cstr    = parts[2] || '-';
      this.castle   = 0;

      /* Validate castle rights against piece placement */
      if (cstr.includes('K') && this.board[SQ['e1']] === WK && this.board[SQ['h1']] === WR) this.castle |= 1;
      if (cstr.includes('Q') && this.board[SQ['e1']] === WK && this.board[SQ['a1']] === WR) this.castle |= 2;
      if (cstr.includes('k') && this.board[SQ['e8']] === BK && this.board[SQ['h8']] === BR) this.castle |= 4;
      if (cstr.includes('q') && this.board[SQ['e8']] === BK && this.board[SQ['a8']] === BR) this.castle |= 8;

      this.ep       = (parts[3] && parts[3] !== '-') ? uciToSq(parts[3]) : -1;
      this.halfmove = +(parts[4] || 0);
      this.fullmove = +(parts[5] || 1);
      this._recomputeHash();
      this._recomputePawnHash();
      this.hashStack.push({ lo: this.hash.lo, hi: this.hash.hi });
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

    /* ── Hash computation ── */
    _recomputeHash() {
      let h = HASH_ZERO;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (p) h = hashXor(h, this.Z.piece[p][sq]);
      }
      h = hashXor(h, this.Z.castle[this.castle]);
      if (this.ep !== -1) h = hashXor(h, this.Z.ep[this.ep]);
      if (this.side === BLACK) h = hashXor(h, this.Z.side);
      this.hash = h;
    }

    _recomputePawnHash() {
      let h = HASH_ZERO;
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) { sq += 7; continue; }
        const p = this.board[sq];
        if (p === WP || p === BP) h = hashXor(h, this.pawnZ[p][sq]);
      }
      this.pHash = h;
    }

    /* ── Attack detection ── */
    isAttacked(sq, byColor) {
      const board = this.board;
      if (byColor === WHITE) {
        if (onBoard(sq-15) && board[sq-15] === WP) return true;
        if (onBoard(sq-17) && board[sq-17] === WP) return true;
      } else {
        if (onBoard(sq+15) && board[sq+15] === BP) return true;
        if (onBoard(sq+17) && board[sq+17] === BP) return true;
      }
      const kn = byColor === WHITE ? WN : BN;
      for (let di = 0; di < 8; di++) {
        const to = sq + KNIGHT_DIR[di];
        if (onBoard(to) && board[to] === kn) return true;
      }
      const bi = byColor === WHITE ? WB : BB;
      const qu = byColor === WHITE ? WQ : BQ;
      for (let di = 0; di < 4; di++) {
        const d = BISHOP_DIR[di];
        let to = sq + d;
        while (onBoard(to)) {
          const p = board[to]; if (p) { if (p===bi||p===qu) return true; break; }
          to += d;
        }
      }
      const ro = byColor === WHITE ? WR : BR;
      for (let di = 0; di < 4; di++) {
        const d = ROOK_DIR[di];
        let to = sq + d;
        while (onBoard(to)) {
          const p = board[to]; if (p) { if (p===ro||p===qu) return true; break; }
          to += d;
        }
      }
      const ki = byColor === WHITE ? WK : BK;
      for (let di = 0; di < 8; di++) {
        const to = sq + KING_DIR[di];
        if (onBoard(to) && board[to] === ki) return true;
      }
      return false;
    }

    inCheck(color) { return this.isAttacked(this.kingPos[color], opponent(color)); }

    isSquareAttackedByPawn(sq, byColor) {
      const board = this.board;
      if (byColor === WHITE) {
        return (onBoard(sq-15) && board[sq-15] === WP) ||
               (onBoard(sq-17) && board[sq-17] === WP);
      }
      return (onBoard(sq+15) && board[sq+15] === BP) ||
             (onBoard(sq+17) && board[sq+17] === BP);
    }

    /* ── Make / Undo ── */
    makeMove(m) {
      const oldCastle = this.castle;
      const oldEp     = this.ep;
      const oldHash   = this.hash;
      const oldPHash  = this.pHash;

      this.history.push({
        from: m.from, to: m.to, piece: m.piece, capture: m.capture,
        promo: m.promo, flags: m.flags,
        castle: oldCastle, ep: oldEp,
        halfmove: this.halfmove, fullmove: this.fullmove,
        hash: oldHash, pHash: oldPHash,
        kingW: this.kingPos[WHITE], kingB: this.kingPos[BLACK],
      });

      let h = oldHash;
      let ph = oldPHash;
      h = hashXor(h, this.Z.piece[m.piece][m.from]);
      h = hashXor(h, this.Z.castle[oldCastle]);
      if (oldEp !== -1) h = hashXor(h, this.Z.ep[oldEp]);

      /* Pawn hash: remove pawn from source */
      if (m.piece === WP || m.piece === BP) {
        ph = hashXor(ph, this.pawnZ[m.piece][m.from]);
      }

      this.halfmove++;
      if (m.piece === WP || m.piece === BP || m.capture) this.halfmove = 0;

      this.board[m.from] = EMPTY;
      this.plist.remove(m.from, colorOf(m.piece));

      /* Capture */
      if (m.capture && !(m.flags & FLAG_EP)) {
        h = hashXor(h, this.Z.piece[m.capture][m.to]);
        this.plist.remove(m.to, colorOf(m.capture));
        if (m.capture === WP || m.capture === BP) {
          ph = hashXor(ph, this.pawnZ[m.capture][m.to]);
        }
      }

      const placed = m.promo || m.piece;
      this.board[m.to] = placed;
      h = hashXor(h, this.Z.piece[placed][m.to]);
      this.plist.add(m.to, placed);

      /* Pawn hash: add pawn at destination (only if still a pawn) */
      if (placed === WP || placed === BP) {
        ph = hashXor(ph, this.pawnZ[placed][m.to]);
      }

      if (m.piece === WK) this.kingPos[WHITE] = m.to;
      if (m.piece === BK) this.kingPos[BLACK] = m.to;

      this.ep = -1;
      if (m.flags & FLAG_EP) {
        /* Side that made the move is still this.side (not yet flipped) */
        const capSq = this.side === WHITE ? m.to - 16 : m.to + 16;
        const epPawn = this.board[capSq];
        h = hashXor(h, this.Z.piece[epPawn][capSq]);
        ph = hashXor(ph, this.pawnZ[epPawn][capSq]);
        this.plist.remove(capSq, colorOf(epPawn));
        this.board[capSq] = EMPTY;
      }

      if (m.flags & FLAG_CASTLE) {
        const [rs, rd] = this._castleRookSquares(m.to);
        const rook = this.board[rs];
        h = hashXor(h, this.Z.piece[rook][rs]);
        h = hashXor(h, this.Z.piece[rook][rd]);
        this.plist.remove(rs, colorOf(rook));
        this.board[rd] = rook;
        this.board[rs] = EMPTY;
        this.plist.add(rd, rook);
      }

      if (m.piece === WK) this.castle &= ~3;
      if (m.piece === BK) this.castle &= ~12;
      if (m.from === SQ['a1'] || m.to === SQ['a1']) this.castle &= ~2;
      if (m.from === SQ['h1'] || m.to === SQ['h1']) this.castle &= ~1;
      if (m.from === SQ['a8'] || m.to === SQ['a8']) this.castle &= ~8;
      if (m.from === SQ['h8'] || m.to === SQ['h8']) this.castle &= ~4;

      if (m.piece === WP && m.to - m.from === 32) this.ep = m.from + 16;
      if (m.piece === BP && m.from - m.to === 32) this.ep = m.from - 16;

      h = hashXor(h, this.Z.castle[this.castle]);
      if (this.ep !== -1) h = hashXor(h, this.Z.ep[this.ep]);
      h = hashXor(h, this.Z.side);
      this.hash = h;
      this.pHash = ph;

      if (this.side === BLACK) this.fullmove++;
      this.side = opponent(this.side);
      this.hashStack.push({ lo: this.hash.lo, hi: this.hash.hi });
    }

    _castleRookSquares(kingTo) {
      if (kingTo === SQ['g1']) return [SQ['h1'], SQ['f1']];
      if (kingTo === SQ['c1']) return [SQ['a1'], SQ['d1']];
      if (kingTo === SQ['g8']) return [SQ['h8'], SQ['f8']];
      return [SQ['a8'], SQ['d8']];
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
      this.pHash    = st.pHash;
      this.kingPos[WHITE] = st.kingW;
      this.kingPos[BLACK] = st.kingB;

      /* Remove placed piece from destination */
      const placed = st.promo || st.piece;
      this.plist.remove(st.to, colorOf(placed));

      /* Restore piece at source */
      this.board[st.from] = st.piece;
      this.plist.add(st.from, st.piece);

      /* Restore capture */
      if (st.flags & FLAG_EP) {
        /* The side that made the move is now this.side (already flipped back) */
        const capSq = this.side === WHITE ? st.to - 16 : st.to + 16;
        const epPawn = this.side === WHITE ? BP : WP;
        this.board[capSq] = epPawn;
        this.plist.add(capSq, epPawn);
        this.board[st.to] = EMPTY;
      } else {
        this.board[st.to] = st.capture || EMPTY;
        if (st.capture) this.plist.add(st.to, st.capture);
      }

      if (st.flags & FLAG_CASTLE) {
        const [rs, rd] = this._castleRookSquares(st.to);
        const rook = this.board[rd];
        this.plist.remove(rd, colorOf(rook));
        this.board[rs] = rook;
        this.board[rd] = EMPTY;
        this.plist.add(rs, rook);
      }
    }

    /* ── Null move ── */
    makeNullMove() {
      const oldEp = this.ep;
      this.history.push({
        from: -1, to: -1, piece: 0, capture: 0, promo: 0, flags: 0,
        castle: this.castle, ep: oldEp,
        halfmove: this.halfmove, fullmove: this.fullmove,
        hash: this.hash, pHash: this.pHash,
        kingW: this.kingPos[WHITE], kingB: this.kingPos[BLACK],
        isNull: true,
      });
      let h = this.hash;
      if (oldEp !== -1) h = hashXor(h, this.Z.ep[oldEp]);
      this.ep = -1;
      h = hashXor(h, this.Z.side);
      this.hash = h;
      this.halfmove++;
      if (this.side === BLACK) this.fullmove++;
      this.side = opponent(this.side);
      this.hashStack.push({ lo: this.hash.lo, hi: this.hash.hi });
    }

    undoNullMove() { this.undoMove(); }

    /* ── Draw detection ── */
    /**
     * Twofold repetition during search (standard heuristic).
     * For root/game play, we require threefold (2 prior occurrences).
     * The `forRoot` parameter controls this.
     */
    isDraw(forRoot = false) {
      if (this.halfmove >= 100) return true;
      const cur = this.hash;
      let reps = 0;
      const threshold = forRoot ? 2 : 1; // threefold at root, twofold in search
      const limit = Math.max(0, this.hashStack.length - this.halfmove - 1);
      /* Skip last entry (current position) */
      for (let i = this.hashStack.length - 2; i >= limit; i--) {
        if (hashEq(this.hashStack[i], cur)) {
          if (++reps >= threshold) return true;
        }
      }
      return false;
    }

    isInsufficientMaterial() {
      let wn = 0, wb = 0, bn = 0, bb = 0;
      this.plist.forEach(WHITE, (sq, p) => {
        const pt = p & 7;
        if (pt === 1 || pt === 4 || pt === 5) { wn = 99; return; }
        if (pt === 2) wn++;
        if (pt === 3) wb++;
      });
      if (wn >= 2 || wb >= 2) return false; // enough material for white
      this.plist.forEach(BLACK, (sq, p) => {
        const pt = p & 7;
        if (pt === 1 || pt === 4 || pt === 5) { bn = 99; return; }
        if (pt === 2) bn++;
        if (pt === 3) bb++;
      });
      if (wn + wb + bn + bb === 0) return true;
      if (wn + wb <= 1 && bn + bb === 0) return true;
      if (bn + bb <= 1 && wn + wb === 0) return true;
      return false;
    }

    /* ── Move generation ── */
    genMoves(capturesOnly = false) {
      const pool = this.movePool;
      pool.reset();
      const us    = this.side;
      const board = this.board;

      this.plist.forEach(us, (sq, p) => {
        const pt = p & 7;
        if (pt === 1) { this._genPawnMoves(sq, p, us, pool, capturesOnly); return; }
        if (pt === 2) { this._genKnightMoves(sq, p, us, pool, capturesOnly); return; }
        if (pt === 3) { this._addSlider(sq, p, us, BISHOP_DIR, pool, capturesOnly); return; }
        if (pt === 4) { this._addSlider(sq, p, us, ROOK_DIR, pool, capturesOnly); return; }
        if (pt === 5) {
          this._addSlider(sq, p, us, BISHOP_DIR, pool, capturesOnly);
          this._addSlider(sq, p, us, ROOK_DIR, pool, capturesOnly);
          return;
        }
        if (pt === 6) { this._genKingMoves(sq, p, us, pool, capturesOnly); }
      });

      /* Legal filter */
      const legalMoves = [];
      for (let i = 0; i < pool.size; i++) {
        const m = pool.getObj(i);
        this.makeMove(m);
        if (!this.inCheck(us)) legalMoves.push(m);
        this.undoMove();
      }
      return legalMoves;
    }

    _genKnightMoves(sq, p, us, pool, capturesOnly) {
      const board = this.board;
      for (let di = 0; di < 8; di++) {
        const to = sq + KNIGHT_DIR[di];
        if (!onBoard(to)) continue;
        const tp = board[to];
        if (!tp) { if (!capturesOnly) pool.add(sq, to, p, EMPTY, 0, 0); }
        else if (colorOf(tp) !== us) pool.add(sq, to, p, tp, 0, FLAG_CAPTURE);
      }
    }

    _genPawnMoves(sq, p, us, pool, capturesOnly) {
      const board   = this.board;
      const up      = p === WP ? 16 : -16;
      const rank    = sq >> 4;
      const sRank   = p === WP ? 1 : 6;
      const pRank   = p === WP ? 6 : 1;
      const promos  = p === WP ? [WQ, WR, WB, WN] : [BQ, BR, BB, BN];
      const capDirs = p === WP ? [15, 17] : [-15, -17];

      if (!capturesOnly) {
        const one = sq + up;
        if (onBoard(one) && !board[one]) {
          if (rank === pRank) {
            for (const pr of promos) pool.add(sq, one, p, EMPTY, pr, FLAG_PROMO);
          } else {
            pool.add(sq, one, p, EMPTY, 0, 0);
            if (rank === sRank) {
              const two = sq + up + up;
              if (!board[two]) pool.add(sq, two, p, EMPTY, 0, 0);
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
            for (const pr of promos) pool.add(sq, to, p, tp, pr, FLAG_CAPTURE | FLAG_PROMO);
          } else {
            pool.add(sq, to, p, tp, 0, FLAG_CAPTURE);
          }
        }
        if (to === this.ep) {
          const epCap = p === WP ? BP : WP;
          pool.add(sq, to, p, epCap, 0, FLAG_CAPTURE | FLAG_EP);
        }
      }
    }

    _addSlider(sq, p, us, dirs, pool, capturesOnly) {
      const board = this.board;
      for (let di = 0, len = dirs.length; di < len; di++) {
        const d = dirs[di];
        let to = sq + d;
        while (onBoard(to)) {
          const tp = board[to];
          if (!tp) {
            if (!capturesOnly) pool.add(sq, to, p, EMPTY, 0, 0);
          } else {
            if (colorOf(tp) !== us) pool.add(sq, to, p, tp, 0, FLAG_CAPTURE);
            break;
          }
          to += d;
        }
      }
    }

    _genKingMoves(sq, p, us, pool, capturesOnly) {
      const board = this.board;
      const opp   = opponent(us);
      for (let di = 0; di < 8; di++) {
        const to = sq + KING_DIR[di];
        if (!onBoard(to)) continue;
        const tp = board[to];
        if (!tp) { if (!capturesOnly) pool.add(sq, to, p, EMPTY, 0, 0); }
        else if (colorOf(tp) !== us) pool.add(sq, to, p, tp, 0, FLAG_CAPTURE);
      }
      if (capturesOnly) return;
      const inChk = this.inCheck(us);
      if (!inChk) {
        if (us === WHITE && sq === SQ['e1']) {
          if ((this.castle & 1) && board[SQ['h1']] === WR &&
              !board[SQ['f1']] && !board[SQ['g1']] &&
              !this.isAttacked(SQ['f1'], opp) && !this.isAttacked(SQ['g1'], opp))
            pool.add(sq, SQ['g1'], p, EMPTY, 0, FLAG_CASTLE);
          if ((this.castle & 2) && board[SQ['a1']] === WR &&
              !board[SQ['d1']] && !board[SQ['c1']] && !board[SQ['b1']] &&
              !this.isAttacked(SQ['d1'], opp) && !this.isAttacked(SQ['c1'], opp))
            pool.add(sq, SQ['c1'], p, EMPTY, 0, FLAG_CASTLE);
        }
        if (us === BLACK && sq === SQ['e8']) {
          if ((this.castle & 4) && board[SQ['h8']] === BR &&
              !board[SQ['f8']] && !board[SQ['g8']] &&
              !this.isAttacked(SQ['f8'], opp) && !this.isAttacked(SQ['g8'], opp))
            pool.add(sq, SQ['g8'], p, EMPTY, 0, FLAG_CASTLE);
          if ((this.castle & 8) && board[SQ['a8']] === BR &&
              !board[SQ['d8']] && !board[SQ['c8']] && !board[SQ['b8']] &&
              !this.isAttacked(SQ['d8'], opp) && !this.isAttacked(SQ['c8'], opp))
            pool.add(sq, SQ['c8'], p, EMPTY, 0, FLAG_CASTLE);
        }
      }
    }

    /* ── Move helpers ── */
    moveToUci(m) {
      if (!m) return '0000';
      const base = sqToUci(m.from) + sqToUci(m.to);
      return (m.flags & FLAG_PROMO) ? base + (PIECE_CH[m.promo] || 'q').toLowerCase() : base;
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
        const same = moves.filter(x =>
          x.to === m.to && x.piece === m.piece &&
          !(x.from === m.from && (x.promo || 0) === (m.promo || 0)));
        if (same.length) {
          const fromFile = m.from & 7;
          const fromRank = m.from >> 4;
          let fileConflict = false, rankConflict = false;
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
        if ((m.flags & FLAG_PROMO) && uci.length === 4 && this.moveToUci(m).slice(0, 4) === uci) return m;
      }
      return null;
    }

    findMoveByEncoded(enc) {
      if (!enc) return null;
      const dec = TranspositionTable.decodeMove(enc);
      if (!dec) return null;
      const moves = this.genMoves(false);
      for (const m of moves) {
        if (m.from === dec.from && m.to === dec.to && (m.promo || 0) === (dec.promo || 0)) return m;
      }
      return null;
    }

    /* ──────────────────────────────────────────── */
    /* ── SEE (improved: trace rays from target)  ── */
    /* ──────────────────────────────────────────── */

    _seeAttackers(to, side, occ) {
      /* Find all attackers of `to` from `side` on `occ` board, return sorted by value (ascending). */
      const attackers = [];
      const board = occ;

      /* Pawns */
      const pawn = side === WHITE ? WP : BP;
      const pawnDirs = side === WHITE ? [-15, -17] : [15, 17];
      for (const d of pawnDirs) {
        const sq = to + d;
        if (onBoard(sq) && board[sq] === pawn) {
          attackers.push({ sq, piece: pawn, val: 100 });
        }
      }

      /* Knights */
      const knight = side === WHITE ? WN : BN;
      for (let di = 0; di < 8; di++) {
        const sq = to + KNIGHT_DIR[di];
        if (onBoard(sq) && board[sq] === knight) {
          attackers.push({ sq, piece: knight, val: 300 });
        }
      }

      /* Bishops / Queens (diagonal) */
      const bishop = side === WHITE ? WB : BB;
      const queen  = side === WHITE ? WQ : BQ;
      for (let di = 0; di < 4; di++) {
        const d = BISHOP_DIR[di];
        let sq = to + d;
        while (onBoard(sq)) {
          const p = board[sq];
          if (p) {
            if (p === bishop) attackers.push({ sq, piece: p, val: 310 });
            else if (p === queen) attackers.push({ sq, piece: p, val: 900 });
            break;
          }
          sq += d;
        }
      }

      /* Rooks / Queens (straight) */
      const rook = side === WHITE ? WR : BR;
      for (let di = 0; di < 4; di++) {
        const d = ROOK_DIR[di];
        let sq = to + d;
        while (onBoard(sq)) {
          const p = board[sq];
          if (p) {
            if (p === rook) attackers.push({ sq, piece: p, val: 500 });
            else if (p === queen && !attackers.find(a => a.sq === sq)) {
              attackers.push({ sq, piece: p, val: 900 });
            }
            break;
          }
          sq += d;
        }
      }

      /* King */
      const king = side === WHITE ? WK : BK;
      for (let di = 0; di < 8; di++) {
        const sq = to + KING_DIR[di];
        if (onBoard(sq) && board[sq] === king) {
          attackers.push({ sq, piece: king, val: 20000 });
        }
      }

      /* Sort by value ascending */
      attackers.sort((a, b) => a.val - b.val);
      return attackers;
    }

    _findNewSliderAttacker(to, removedSq, side, occ) {
      /* After removing a piece at removedSq, check if a slider behind it now attacks `to`. */
      const df = (to & 7) - (removedSq & 7);
      const dr = (to >> 4) - (removedSq >> 4);

      let dir = 0;
      if (df === 0) dir = dr > 0 ? -16 : 16;
      else if (dr === 0) dir = df > 0 ? -1 : 1;
      else if (Math.abs(df) === Math.abs(dr)) {
        dir = (df > 0 ? -1 : 1) + (dr > 0 ? -16 : 16);
      } else {
        return null; // Knight direction, no X-ray
      }

      const isDiag = Math.abs(dir) === 15 || Math.abs(dir) === 17;
      const bishop = side === WHITE ? WB : BB;
      const rook   = side === WHITE ? WR : BR;
      const queen  = side === WHITE ? WQ : BQ;

      let sq = removedSq + dir;
      // Trace in the direction away from `to`
      // Actually, we need to trace from `to` through `removedSq` outward
      const awayDir = -dir; // direction from to through removedSq
      sq = removedSq + awayDir;
      while (onBoard(sq)) {
        const p = occ[sq];
        if (p) {
          if (colorOf(p) === side) {
            if (isDiag && (p === bishop || p === queen)) return { sq, piece: p, val: PIECE_VALUE[p] };
            if (!isDiag && (p === rook || p === queen)) return { sq, piece: p, val: PIECE_VALUE[p] };
          }
          return null;
        }
        sq += awayDir;
      }
      return null;
    }

    see(m) {
      if (!(m.flags & FLAG_CAPTURE)) return 0;

      const occ = this.seeOcc;
      occ.set(this.board);

      const to = m.to;
      const from = m.from;
      const movedPiece = m.piece;
      const placedPiece = m.promo || movedPiece;

      let capturedValue = PIECE_VALUE[m.capture] || 0;
      if (m.flags & FLAG_EP) capturedValue = 100;

      occ[from] = EMPTY;
      if (m.flags & FLAG_EP) {
        const capSq = isWhite(m.piece) ? to - 16 : to + 16;
        occ[capSq] = EMPTY;
      }
      occ[to] = placedPiece;

      const gain = new Int16Array(32);
      gain[0] = capturedValue;

      let depth = 0;
      let side = opponent(this.side);
      let currentOnTo = placedPiece;

      while (depth < 31) {
        /* Find least valuable attacker for `side` */
        const attackers = this._seeAttackers(to, side, occ);
        if (!attackers.length) break;

        /* Check for X-ray discovery from previous removal — simplified by re-scanning */
        const att = attackers[0];

        depth++;
        gain[depth] = (PIECE_VALUE[currentOnTo] || 0) - gain[depth - 1];

        /* Prune if even the best case can't beat current balance */
        if (Math.max(-gain[depth - 1], gain[depth]) < 0 && depth > 1) break;

        occ[att.sq] = EMPTY;
        currentOnTo = att.piece;
        occ[to] = att.piece;
        side = opponent(side);
      }

      while (--depth > -1) {
        gain[depth] = -Math.max(-gain[depth], gain[depth + 1]);
      }
      return gain[0];
    }

    /* ──────────────────────────────────────────── */
    /* ── Evaluation                              ── */
    /* ──────────────────────────────────────────── */

    _pst(p, sq, table) {
      const i64 = sq128To64(sq);
      const j = isWhite(p) ? i64 : mirror64(i64);
      return table[j];
    }

    _pawnStructureEval() {
      /* Check pawn hash first */
      const cached = this.pawnHash.probe(this.pHash);
      if (cached) return cached;

      const board = this.board;
      const whiteFiles = new Int8Array(8);
      const blackFiles = new Int8Array(8);
      let mg = 0, eg = 0;

      /* Collect file counts */
      this.plist.forEach(WHITE, (sq, p) => {
        if (p === WP) whiteFiles[sq & 7]++;
      });
      this.plist.forEach(BLACK, (sq, p) => {
        if (p === BP) blackFiles[sq & 7]++;
      });

      /* Doubled & isolated pawns */
      for (let f = 0; f < 8; f++) {
        if (whiteFiles[f] > 1) { mg -= DOUBLED_MG * (whiteFiles[f] - 1); eg -= DOUBLED_EG * (whiteFiles[f] - 1); }
        if (blackFiles[f] > 1) { mg += DOUBLED_MG * (blackFiles[f] - 1); eg += DOUBLED_EG * (blackFiles[f] - 1); }

        const wIsolated = whiteFiles[f] && (f === 0 ? !whiteFiles[1] : (f === 7 ? !whiteFiles[6] : !whiteFiles[f-1] && !whiteFiles[f+1]));
        const bIsolated = blackFiles[f] && (f === 0 ? !blackFiles[1] : (f === 7 ? !blackFiles[6] : !blackFiles[f-1] && !blackFiles[f+1]));
        if (wIsolated) { mg -= ISOLATED_MG * whiteFiles[f]; eg -= ISOLATED_EG * whiteFiles[f]; }
        if (bIsolated) { mg += ISOLATED_MG * blackFiles[f]; eg += ISOLATED_EG * blackFiles[f]; }
      }

      /* Per-pawn evaluation: passed, connected, blocked */
      this.plist.forEach(WHITE, (sq, p) => {
        if (p !== WP) return;
        const f = sq & 7;
        const r = sq >> 4; // 0-based rank

        /* Passed pawn */
        let passed = true;
        for (let rr = r + 1; rr < 8 && passed; rr++) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (board[(rr << 4) | ff] === BP) { passed = false; break; }
          }
        }
        if (passed && r >= 1 && r <= 6) {
          const adv = PAWN_PASSED[r] || 0;
          mg += Math.round(25 + 8 * adv);
          eg += Math.round(35 + 78 * adv);
        }

        /* Connected */
        if ((onBoard(sq - 15) && board[sq - 15] === WP) ||
            (onBoard(sq - 17) && board[sq - 17] === WP)) {
          mg += CONNECTED_BONUS; eg += CONNECTED_BONUS;
        }

        /* Blocked */
        const ahead = sq + 16;
        if (onBoard(ahead) && board[ahead] !== EMPTY) {
          mg -= BLOCKED_PAWN_MG; eg -= BLOCKED_PAWN_EG;
        }
      });

      this.plist.forEach(BLACK, (sq, p) => {
        if (p !== BP) return;
        const f = sq & 7;
        const r = sq >> 4;

        let passed = true;
        for (let rr = r - 1; rr >= 0 && passed; rr--) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (board[(rr << 4) | ff] === WP) { passed = false; break; }
          }
        }
        if (passed && r >= 1 && r <= 6) {
          const adv = PAWN_PASSED[7 - r] || 0;
          mg -= Math.round(25 + 8 * adv);
          eg -= Math.round(35 + 78 * adv);
        }

        if ((onBoard(sq + 15) && board[sq + 15] === BP) ||
            (onBoard(sq + 17) && board[sq + 17] === BP)) {
          mg -= CONNECTED_BONUS; eg -= CONNECTED_BONUS;
        }

        const ahead = sq - 16;
        if (onBoard(ahead) && board[ahead] !== EMPTY) {
          mg += BLOCKED_PAWN_MG; eg += BLOCKED_PAWN_EG;
        }
      });

      const result = { mg, eg };
      this.pawnHash.store(this.pHash, mg, eg);
      return result;
    }

    _inKingZone(sq, kingSq) {
      return Math.abs((sq & 7) - (kingSq & 7)) <= 1 &&
             Math.abs((sq >> 4) - (kingSq >> 4)) <= 1;
    }

    _activityEval() {
      const board = this.board;
      const whiteKingSq = this.kingPos[WHITE];
      const blackKingSq = this.kingPos[BLACK];
      let mg = 0, eg = 0;
      let wAttackN = 0, wAttackV = 0;
      let bAttackN = 0, bAttackV = 0;
      let wRookFiles = 0, bRookFiles = 0;

      /* White files / black files for rook eval */
      const wPawnFiles = new Int8Array(8);
      const bPawnFiles = new Int8Array(8);
      this.plist.forEach(WHITE, (sq, p) => { if (p === WP) wPawnFiles[sq & 7]++; });
      this.plist.forEach(BLACK, (sq, p) => { if (p === BP) bPawnFiles[sq & 7]++; });

      const evalPiece = (sq, p, us) => {
        const pt = p & 7;
        if (pt === 1 || pt === 6) return; // pawns & kings handled elsewhere

        const file = sq & 7;
        const rank = sq >> 4;
        const oppKingSq = us === WHITE ? blackKingSq : whiteKingSq;
        const sign = us === WHITE ? 1 : -1;

        let mob = 0, tight = 0, tense = 0, zoneHit = 0;

        if (pt === 2) { // Knight
          for (let di = 0; di < 8; di++) {
            const to = sq + KNIGHT_DIR[di];
            if (!onBoard(to)) continue;
            const tp = board[to];
            if (!tp) mob++;
            else if (colorOf(tp) !== us) { mob++; tense++; }
            else tight++;
            if (this._inKingZone(to, oppKingSq)) zoneHit = 1;
          }
          const s = mob ? mob * MOBN_S : MOBN_S0;
          const e = mob ? mob * MOBN_E : MOBN_E0;
          mg += sign * (s + tight * TIGHT_NS + tense * TENSE_NS);
          eg += sign * (e + tight * TIGHT_NE + tense * TENSE_NE);
          if (zoneHit) { if (us === WHITE) { wAttackN++; wAttackV += ATT_N; } else { bAttackN++; bAttackV += ATT_N; } }
          return;
        }

        /* Slider helper (inline) */
        const slideDirs = pt === 3 ? BISHOP_DIR : (pt === 4 ? ROOK_DIR : null);
        if (pt === 3 || pt === 4) {
          for (let di = 0, len = slideDirs.length; di < len; di++) {
            const d = slideDirs[di];
            let to = sq + d;
            while (onBoard(to)) {
              const tp = board[to];
              if (!tp) { mob++; if (this._inKingZone(to, oppKingSq)) zoneHit = 1; to += d; continue; }
              if (colorOf(tp) !== us) { mob++; tense++; if (this._inKingZone(to, oppKingSq)) zoneHit = 1; }
              else tight++;
              break;
            }
          }
        }

        if (pt === 5) { // Queen
          for (const dirs of [BISHOP_DIR, ROOK_DIR]) {
            for (let di = 0, len = dirs.length; di < len; di++) {
              const d = dirs[di];
              let to = sq + d;
              while (onBoard(to)) {
                const tp = board[to];
                if (!tp) { mob++; if (this._inKingZone(to, oppKingSq)) zoneHit = 1; to += d; continue; }
                if (colorOf(tp) !== us) { mob++; tense++; if (this._inKingZone(to, oppKingSq)) zoneHit = 1; }
                else tight++;
                break;
              }
            }
          }
        }

        /* Apply mobility/tension/tightness weights */
        let mobS, mobE, ts, te;
        if (pt === 3) { // Bishop
          mobS = mob ? mob * MOBB_S : MOBB_S0; mobE = mob ? mob * MOBB_E : MOBB_E0;
          ts = tight * TIGHT_BS + tense * TENSE_BS; te = tight * TIGHT_BE + tense * TENSE_BE;
        } else if (pt === 4) { // Rook
          mobS = mob ? mob * MOBR_S : MOBR_S0; mobE = mob ? mob * MOBR_E : MOBR_E0;
          ts = tight * TIGHT_RS + tense * TENSE_RS; te = tight * TIGHT_RE + tense * TENSE_RE;
        } else { // Queen
          mobS = mob ? mob * MOBQ_S : MOBQ_S0; mobE = mob ? mob * MOBQ_E : MOBQ_E0;
          ts = tight * TIGHT_QS + tense * TENSE_QS; te = tight * TIGHT_QE + tense * TENSE_QE;
        }

        mg += sign * (mobS + ts);
        eg += sign * (mobE + te);

        if (zoneHit) {
          const attVal = pt === 3 ? ATT_B : (pt === 4 ? ATT_R : ATT_Q);
          if (us === WHITE) { wAttackN++; wAttackV += attVal; } else { bAttackN++; bAttackV += attVal; }
        }

        /* Rook bonuses */
        if (pt === 4) {
          const ownPawnFiles = us === WHITE ? wPawnFiles : bPawnFiles;
          const oppPawnFiles = us === WHITE ? bPawnFiles : wPawnFiles;
          const rookMask = us === WHITE ? wRookFiles : bRookFiles;

          if (us === WHITE) {
            if (rank === 6 && ((blackKingSq >> 4) === 7 || bPawnFiles[file] > 0)) { mg += ROOK7TH_S; eg += ROOK7TH_E; }
            if (!ownPawnFiles[file]) { mg += ROOKOPEN_S; eg += ROOKOPEN_E; if (!oppPawnFiles[file]) { mg += ROOKOPEN_S; eg += ROOKOPEN_E; } }
            if (wRookFiles & (1 << file)) { mg += ROOK_DOUBLED_S; eg += ROOK_DOUBLED_E; }
            wRookFiles |= (1 << file);
          } else {
            if (rank === 1 && ((whiteKingSq >> 4) === 0 || wPawnFiles[file] > 0)) { mg -= ROOK7TH_S; eg -= ROOK7TH_E; }
            if (!ownPawnFiles[file]) { mg -= ROOKOPEN_S; eg -= ROOKOPEN_E; if (!oppPawnFiles[file]) { mg -= ROOKOPEN_S; eg -= ROOKOPEN_E; } }
            if (bRookFiles & (1 << file)) { mg -= ROOK_DOUBLED_S; eg -= ROOK_DOUBLED_E; }
            bRookFiles |= (1 << file);
          }
        }

        /* Queen on 7th */
        if (pt === 5) {
          if (us === WHITE && rank === 6 && (blackKingSq >> 4) === 7) { mg += QUEEN7TH_S; eg += QUEEN7TH_E; }
          if (us === BLACK && rank === 1 && (whiteKingSq >> 4) === 0) { mg -= QUEEN7TH_S; eg -= QUEEN7TH_E; }
        }
      };

      this.plist.forEach(WHITE, (sq, p) => evalPiece(sq, p, WHITE));
      this.plist.forEach(BLACK, (sq, p) => evalPiece(sq, p, BLACK));

      mg += Math.round(wAttackV * ATT_W[Math.min(16, wAttackN)]);
      mg -= Math.round(bAttackV * ATT_W[Math.min(16, bAttackN)]);

      return { mg, eg };
    }

    _kingSafetyEval() {
      const board = this.board;
      const wPawnFiles = new Int8Array(8);
      const bPawnFiles = new Int8Array(8);
      this.plist.forEach(WHITE, (sq, p) => { if (p === WP) wPawnFiles[sq & 7]++; });
      this.plist.forEach(BLACK, (sq, p) => { if (p === BP) bPawnFiles[sq & 7]++; });

      const evalSide = (kingSq, us) => {
        const f = kingSq & 7;
        const r = kingSq >> 4;
        const ownPawn = us === WHITE ? WP : BP;
        const oppColor = opponent(us);
        const forward = us === WHITE ? 1 : -1;
        const ownFiles = us === WHITE ? wPawnFiles : bPawnFiles;
        const oppFiles = us === WHITE ? bPawnFiles : wPawnFiles;

        let shelter = 0, storm = 0;
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

        let openPenalty = 0;
        for (let df = -1; df <= 1; df++) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          if (ownFiles[ff] === 0) openPenalty += KSAFETY_OPEN;
          if (ownFiles[ff] === 0 && oppFiles[ff] === 0) openPenalty += 4;
        }

        let attackCount = 0;
        for (let di = 0; di < 8; di++) {
          const to = kingSq + KING_DIR[di];
          if (onBoard(to) && this.isAttacked(to, oppColor)) attackCount++;
        }
        if (this.isAttacked(kingSq, oppColor)) attackCount++;

        const safeBonus = shelter >= 16 && attackCount <= 2 ? KSAFETY_SAFE_BONUS : 0;
        const mgVal = (shelter * KSAFETY_SHELTER) - (storm * KSAFETY_STORM) - openPenalty - (attackCount * KSAFETY_ATTACK) + safeBonus;
        const egVal = (shelter * KSAFETY_SHELTER_EG) - (storm * KSAFETY_STORM_EG) - Math.floor(openPenalty / KSAFETY_OPEN_EG_DIV) - (attackCount * KSAFETY_ATTACK_EG);
        return { mg: mgVal, eg: egVal };
      };

      const w = evalSide(this.kingPos[WHITE], WHITE);
      const b = evalSide(this.kingPos[BLACK], BLACK);
      return { mg: w.mg - b.mg, eg: w.eg - b.eg };
    }

    evaluate() {
      if (this.isInsufficientMaterial()) return 0;

      let mgScore = 0, egScore = 0, phase = 0;
      let whiteBishops = 0, blackBishops = 0;

      /* Material + PST using piece lists */
      this.plist.forEach(WHITE, (sq, p) => {
        const pt = p & 7;
        const mat = PIECE_VALUE[p];
        const pstMg = PST_MG[pt] ? this._pst(p, sq, PST_MG[pt]) : 0;
        const pstEg = PST_EG[pt] ? this._pst(p, sq, PST_EG[pt]) : 0;
        mgScore += mat + pstMg;
        egScore += mat + pstEg;
        phase += PHASE_WEIGHT[p];
        if (p === WB) whiteBishops++;
      });

      this.plist.forEach(BLACK, (sq, p) => {
        const pt = p & 7;
        const mat = PIECE_VALUE[p];
        const pstMg = PST_MG[pt] ? this._pst(p, sq, PST_MG[pt]) : 0;
        const pstEg = PST_EG[pt] ? this._pst(p, sq, PST_EG[pt]) : 0;
        mgScore -= mat + pstMg;
        egScore -= mat + pstEg;
        phase += PHASE_WEIGHT[p];
        if (p === BB) blackBishops++;
      });

      if (whiteBishops >= 2) { mgScore += TWOBISHOPS_S; egScore += TWOBISHOPS_E; }
      if (blackBishops >= 2) { mgScore -= TWOBISHOPS_S; egScore -= TWOBISHOPS_E; }

      /* Pawn structure (cached) */
      const pawnStruct = this._pawnStructureEval();
      mgScore += pawnStruct.mg;
      egScore += pawnStruct.eg;

      /* Piece activity & mobility */
      const activity = this._activityEval();
      mgScore += activity.mg;
      egScore += activity.eg;

      /* King safety */
      const kingSafety = this._kingSafetyEval();
      mgScore += kingSafety.mg;
      egScore += kingSafety.eg;

      /* Tapered eval */
      const phaseClamped = Math.max(0, Math.min(MAX_PHASE, phase));
      let score = Math.round((mgScore * phaseClamped + egScore * (MAX_PHASE - phaseClamped)) / MAX_PHASE);

      /* Check penalty */
      if (this.inCheck(this.side)) {
        score += this.side === WHITE ? -20 : 20;
      }

      /* Tempo bonus (phase-dependent) */
      const tempoBonus = Math.round((TEMPO_MG * phaseClamped + TEMPO_EG * (MAX_PHASE - phaseClamped)) / MAX_PHASE);
      score += this.side === WHITE ? tempoBonus : -tempoBonus;

      return this.side === WHITE ? score : -score;
    }

    /* ── Move ordering ── */
    _moveScore(m, ttBestEnc, ply) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc === ttBestEnc) return 2000000;
      if (m.flags & FLAG_CAPTURE) {
        const victim   = pieceType(m.capture) || 0;
        const attacker = pieceType(m.piece) || 0;
        const mvv = MVV_LVA[victim] ? (MVV_LVA[victim][attacker] || 0) : 0;
        const seeVal = m._see || 0;
        const movingQueen = pieceType(m.piece) === 5;
        if (movingQueen && victim !== 5 && seeVal < 250) return 120000 + mvv + seeVal;
        if (seeVal < 0) return 250000 + mvv + seeVal;
        return 1500000 + mvv + Math.min(200, seeVal);
      }
      if (m.flags & FLAG_PROMO) return 1100000 + (pieceType(m.promo) || 0);
      const killers = this.killers[ply] || [];
      if (enc === killers[0]) return 800000;
      if (enc === killers[1]) return 700000;
      let quiet = (this.histTable[(m.piece << 7) | m.to] | 0) + this._getContinuationBonus(m);
      if (pieceType(m.piece) === 5) {
        const them = opponent(this.side);
        if (this.isAttacked(m.to, them)) quiet -= 220;
        if (this.isSquareAttackedByPawn(m.to, them)) quiet -= 180;
      }
      return quiet;
    }

    scoreMoves(moves, ttBestEnc, ply) {
      for (const m of moves) {
        if (m.flags & FLAG_CAPTURE) {
          const victimVal   = PIECE_VALUE[m.capture] || 0;
          const attackerVal = PIECE_VALUE[m.piece] || 0;
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
        if (moves[i]._score > bestScore) {
          bestScore = moves[i]._score;
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
      const k = this.killers[ply];
      if (enc !== k[0]) { k[1] = k[0]; k[0] = enc; }
    }

    isKillerMove(m, ply) {
      const enc = TranspositionTable.encodeMove(m);
      const k = this.killers[ply] || [0, 0];
      return enc === k[0] || enc === k[1];
    }

    _getContinuationBonus(m) {
      const curIdx = (m.piece << 7) | m.to;
      const prev = this.history[this.history.length - 1];
      if (!prev || prev.from < 0 || !prev.piece) return 0;
      const prevIdx = (prev.piece << 7) | prev.to;
      if (prevIdx >= this.contHistSize || curIdx >= this.contHistSize) return 0;
      return this.contHist[prevIdx * this.contHistSize + curIdx] | 0;
    }

    updateHistory(m, depth) {
      const idx = (m.piece << 7) | m.to;
      this.histTable[idx] = Math.min(this.histTable[idx] + depth * depth, 20000);

      const prev = this.history[this.history.length - 1];
      if (!prev || prev.from < 0 || !prev.piece) return;
      const prevIdx = (prev.piece << 7) | prev.to;
      if (prevIdx >= this.contHistSize || idx >= this.contHistSize) return;
      const cidx = prevIdx * this.contHistSize + idx;
      this.contHist[cidx] = Math.max(-20000, Math.min(20000, (this.contHist[cidx] | 0) + depth * depth));
    }

    hasNonPawnMaterial(color) {
      return this.plist.hasNonPawnMaterial(color);
    }

    /* ── Quiescence ── */
    qsearch(alpha, beta, ply) {
      if (this.stop) return alpha;
      this._checkTime();
      if (this.stop) return alpha;
      if (this.isDraw() || this.isInsufficientMaterial()) return 0;
      if (this.selDepthHard > 0 && ply >= this.selDepthHard) return this.evaluate();

      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);
      if (ply >= MAX_PLY - 2) return this.evaluate();

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
        const gain = (PIECE_VALUE[m.capture] || 0) + (m.promo ? PIECE_VALUE[m.promo] || 0 : 0);
        if (stand + gain + 200 < alpha) continue;
        if ((m.flags & FLAG_CAPTURE) && !(m.flags & FLAG_PROMO) && (m._see || 0) < 0) continue;

        this.makeMove(m);
        const score = -this.qsearch(-beta, -alpha, ply + 1);
        this.undoMove();
        if (this.stop) return alpha;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    /* ── Singular Extension Verification ── */
    _singularExtension(m, depth, beta, ply, ttBestEnc) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc !== ttBestEnc) return 0;
      if (depth < 8) return 0;

      /* Check that the TT score is a lower bound and close to beta */
      const i = this.tt._idx(this.hash);
      if (!this.tt._keysMatch(i, this.hash)) return 0;
      const ttDepth = this.tt.data[i + TT_DEPTH];
      const ttScore = this.tt.data[i + TT_SCORE];
      const ttFlag  = this.tt.data[i + TT_FLAG];
      if (ttDepth < depth - 3) return 0;
      if (ttFlag === -1) return 0; // upper bound, not reliable
      if (ttScore < beta - 80) return 0;

      /* Reduced search excluding TT move to verify singularity */
      const rBeta = Math.max(-INF, ttScore - 2 * depth);
      const rDepth = Math.max(1, (depth - 1) / 2 | 0);

      const moves = this.genMoves(false);
      this.scoreMoves(moves, 0, ply); // no TT priority

      for (let mi = 0; mi < moves.length; mi++) {
        const other = this.pickNextMove(moves, mi);
        if (other.from === m.from && other.to === m.to && (other.promo || 0) === (m.promo || 0)) continue;
        this.makeMove(other);
        const score = -this.negamax(rDepth, -rBeta - 1, -rBeta, ply + 1, false);
        this.undoMove();
        if (this.stop) return 0;
        if (score > rBeta) return 0; // not singular
      }
      return 1; // TT move is singular, extend
    }

    /* ── Negamax + PVS ── */
    negamax(depth, alpha, beta, ply, allowNull = true) {
      if (this.stop) return 0;
      this._checkTime();
      if (this.stop) return 0;
      if (ply >= MAX_PLY - 2) return this.evaluate();

      const isPV = beta - alpha > 1;
      this.nodes++;
      this.selDepth = Math.max(this.selDepth, ply);

      if (this.isDraw() || this.isInsufficientMaterial()) return 0;

      const inChk = this.inCheck(this.side);

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

      /* Null-move pruning with verification */
      if (allowNull && !isPV && depth >= 3 && !inChk && this.hasNonPawnMaterial(this.side)) {
        const R = depth >= 6 ? 4 : 3;
        this.makeNullMove();
        let nmScore = -this.negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        this.undoNullMove();
        if (this.stop) return 0;

        if (nmScore >= beta) {
          /* Verification search at reduced depth to guard against zugzwang */
          if (depth >= 8) {
            const verScore = this.negamax(depth - 1 - R, beta - 1, beta, ply, false);
            if (this.stop) return 0;
            if (verScore >= beta) return beta;
          } else {
            return beta;
          }
        }
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

        /* Late move pruning */
        if (!isPV && !inChk && quietMove && depth <= 3) {
          const limit = depth === 1 ? 6 : (depth === 2 ? 10 : 16);
          if (moveTried >= limit) continue;
        }

        /* Node futility pruning */
        if (!isPV && !inChk && quietMove && depth <= 2) {
          if (staticEval + 120 * depth <= alpha) continue;
        }

        this.makeMove(m);
        const givesCheck = this.inCheck(this.side);

        /* Singular extension (verified) */
        let extension = 0;
        if (!isPV && !inChk && ttBestEnc && legalIdx === 0 && depth >= 8) {
          this.undoMove();
          extension = this._singularExtension(m, depth, beta, ply, ttBestEnc);
          this.makeMove(m);
          if (this.stop) { this.undoMove(); return 0; }
        }

        let score;
        if (legalIdx === 0) {
          score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply + 1, true);
        } else {
          let reduction = 0;
          if (!isPV && depth >= 3 && legalIdx >= 3 && !inChk && quietMove && !givesCheck && !killerMove) {
            const dTerm = Math.floor(Math.log2(Math.max(2, depth)));
            const mTerm = Math.floor(Math.log2(legalIdx + 1));
            reduction = Math.max(1, Math.floor((dTerm * mTerm) / 2));
            if (improving) reduction = Math.max(1, reduction - 1);
            reduction = Math.min(reduction, depth - 2);
          }
          const newDepth = depth - 1 - reduction + extension;
          score = -this.negamax(newDepth, -alpha - 1, -alpha, ply + 1, true);
          if (!this.stop && reduction > 0 && score > alpha) {
            score = -this.negamax(depth - 1 + extension, -alpha - 1, -alpha, ply + 1, true);
          }
          if (!this.stop && score > alpha && score < beta) {
            score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply + 1, true);
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
            if (!(m.flags & FLAG_CAPTURE)) {
              this.storeKiller(m, ply);
              this.updateHistory(m, depth);
            }
            break;
          }
        }
      }

      let flag = 0;
      if (bestScore <= alpha0) flag = -1;
      else if (bestScore >= beta) flag = 1;
      this.tt.store(this.hash, depth, bestScore, flag, TranspositionTable.encodeMove(bestMove));

      return bestScore;
    }

    /* ── Time management ── */
    _checkTime() {
      if ((this.nodes & 2047) === 0) {
        if (this.moveTime > 0 && Date.now() - this.startTime >= this.moveTime) this.stop = true;
        if (this.maxNodes > 0 && this.nodes >= this.maxNodes) this.stop = true;
      }
    }

    _strengthProfileFromElo(elo) {
      const e = Math.max(800, Math.min(2800, elo | 0));
      const t = (e - 800) / 2000;
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
        const t = skill / 20;
        const softDepthCap = Math.max(2, Math.round(2 + t * 14));
        const softNodeCap = Math.max(1500, Math.round(2500 + t * t * 600000));
        depthCap = Math.min(depthCap, softDepthCap);
        nodeCap = nodeCap > 0 ? Math.min(nodeCap, softNodeCap) : softNodeCap;
      }

      return { skill, depthCap, nodeCap };
    }

    applyStrengthPreset(name) {
      const key = String(name || '').trim().toLowerCase();
      if (!key || key === 'custom') { this.options.StrengthPreset = 'Custom'; return; }

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
        'elo', this.options.UCI_Elo, 'skill', this.options.SkillLevel);
    }

    calcMoveTime(spec) {
      if (spec.moveTime) return Math.max(1, spec.moveTime - this.options.MoveOverhead);
      const t   = this.side === WHITE ? (spec.wtime || 0) : (spec.btime || 0);
      const inc = this.side === WHITE ? (spec.winc || 0)  : (spec.binc || 0);
      const mtg = spec.movestogo || 30;
      if (!t) return 5000;

      const overhead = this.options.MoveOverhead | 0;
      const base = t / Math.max(10, mtg + 2) + inc * 0.6;
      const emergency = t < 10000 ? t * 0.08 : t * 0.035;
      let alloc = Math.max(base, emergency) - overhead;
      const hardCap = t < 3000 ? t * 0.25 : t * 0.45;
      alloc = Math.min(alloc, hardCap);
      return Math.max(1, Math.floor(alloc));
    }

    describeScore(score) {
      if (Math.abs(score) >= MATE_BOUND) {
        const mate = score > 0
          ? Math.ceil((MATE - score) / 2)
          : -Math.ceil((MATE + score) / 2);
        return { units: 'mate', value: mate };
      }
      return { units: 'cp', value: score | 0 };
    }

    scoreToWDL(score) {
      if (score >= MATE_BOUND) return { win: 1000, draw: 0, loss: 0 };
      if (score <= -MATE_BOUND) return { win: 0, draw: 0, loss: 1000 };
      const draw = Math.max(0, Math.min(1000, Math.round(WDL_DRAW_COEFF * Math.exp(-Math.abs(score) / WDL_DRAW_SCALE))));
      const decisive = Math.max(0, 1000 - draw);
      const winRatio = 1 / (1 + Math.exp(-score / WDL_WIN_SCALE));
      const win = Math.round(decisive * winRatio);
      const loss = decisive - win;
      return { win, draw, loss };
    }

    estimateACPL(rootLines) {
      if (!rootLines || rootLines.length < 2) return 0;
      const best = rootLines[0].score;
      if (Math.abs(best) >= MATE_BOUND) return 0;
      let total = 0, count = 0;
      for (let i = 1; i < rootLines.length; i++) {
        const s = rootLines[i].score;
        if (Math.abs(s) >= MATE_BOUND) continue;
        total += Math.max(0, best - s);
        count++;
      }
      return count ? Math.round(total / count) : 0;
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
        const gap = bestScore - scoredMoves[i].score;
        if (gap <= maxDrop) candidates.push(scoredMoves[i]);
      }
      if (!candidates.length) return scoredMoves[0].m;

      const temp = Math.max(0.25, (20 - skill) / 8);
      const base = 35 + skill * 5;
      let total = 0;
      for (const c of candidates) {
        c._w = Math.exp(-(Math.max(0, bestScore - c.score) / base) * temp);
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

      for (const line of scoredMoves) {
        line._hardUnsafe = false;
        const m = line.m;
        if (Math.abs(line.score) >= MATE_BOUND) { hasSafeAlt = true; continue; }
        if (pieceType(m.piece) !== 5) { hasSafeAlt = true; continue; }

        const seeVal = this.see(m);
        const them = opponent(this.side);

        if (m.flags & FLAG_CAPTURE) {
          const victimType = pieceType(m.capture) || 0;
          const hardSee = ultraSafe ? 480 : 280;
          const hardGap = ultraSafe ? 20 : 40;
          if (victimType !== 5 && seeVal < hardSee && line.score < rawBest - hardGap) line._hardUnsafe = true;
          else hasSafeAlt = true;
        } else {
          const quietGap = ultraSafe ? 10 : 30;
          if (this.isSquareAttackedByPawn(m.to, them) && this.isAttacked(m.to, them) && line.score < rawBest - quietGap)
            line._hardUnsafe = true;
          else hasSafeAlt = true;
        }

        if (ultraSafe && (m.flags & FLAG_CAPTURE) && seeVal <= -500 && line.score < rawBest - 15)
          line._hardUnsafe = true;
      }

      for (const line of scoredMoves) {
        let penalty = 0;
        const m = line.m;
        if (Math.abs(line.score) < MATE_BOUND) {
          const seeVal = this.see(m);
          if (seeVal <= -700) penalty += ultraSafe ? 420 : 220;
          else if (seeVal <= -350) penalty += ultraSafe ? 180 : 90;

          const moving = m.promo || m.piece;
          if (pieceType(moving) === 5 && seeVal < 0) penalty += ultraSafe ? 260 : 140;

          if (pieceType(m.piece) === 5 && (m.flags & FLAG_CAPTURE)) {
            const victimType = pieceType(m.capture) || 0;
            if (victimType !== 5) {
              if (seeVal < (ultraSafe ? 420 : 250)) penalty += ultraSafe ? 460 : 260;
              else if (seeVal < (ultraSafe ? 560 : 400)) penalty += ultraSafe ? 220 : 120;
            }
          }

          if (pieceType(m.piece) === 5 && !(m.flags & FLAG_CAPTURE)) {
            const them = opponent(this.side);
            if (this.isAttacked(m.to, them)) penalty += ultraSafe ? 260 : 120;
            if (this.isSquareAttackedByPawn(m.to, them)) penalty += ultraSafe ? 320 : 140;
          }
        }
        if (hasSafeAlt && line._hardUnsafe) penalty += ultraSafe ? 200000 : 100000;
        line.pickScore = line.score - penalty;
      }

      scoredMoves.sort((a, b) => (b.pickScore | 0) - (a.pickScore | 0) || (b.score | 0) - (a.score | 0));
    }

    sendRootInfo(rootLines, depth, elapsed, nps, hashfull, multiPV) {
      const limit = Math.min(multiPV, rootLines.length);
      for (let i = 0; i < limit; i++) {
        const line = rootLines[i];
        const score = this.describeScore(line.score);
        const parts = ['info', 'depth', depth, 'seldepth', this.selDepth, 'multipv', i + 1,
                        'score', score.units, score.value];
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
      const seen = new Set();
      for (let i = 0; i < depth; i++) {
        const enc = this.tt.getBestMove(this.hash);
        if (!enc) break;
        const m = this.findMoveByEncoded(enc);
        if (!m) break;
        const key = `${this.hash.lo}:${this.hash.hi}:${enc}`;
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
      this.pawnHash.clear();

      const strength = this._resolveSearchStrength(spec);
      this.maxNodes = strength.nodeCap;
      this.effectiveSkillLevel = strength.skill;

      this.histTable.fill(0);
      this.contHist.fill(0);
      for (const k of this.killers) { k[0] = 0; k[1] = 0; }

      const depthLimit = Math.max(1, Math.min(strength.depthCap, Math.min(64, spec.depth || 64)));
      const multiPV    = Math.max(1, Math.min(12, (spec.multiPV || this.options.MultiPV) | 0));
      const outFmt     = this.options.PVFormat === 'san' ? 'san' : 'uci';

      let rootMoves = this.genMoves(false);
      if (spec.searchMoves && spec.searchMoves.length) {
        const wanted = new Set(spec.searchMoves);
        rootMoves = rootMoves.filter(m => wanted.has(this.moveToUci(m)));
      }
      if (rootMoves.length === 0) {
        this.send('bestmove 0000');
        return;
      }

      let bestMove    = rootMoves[0];
      let bestScore   = -INF;
      let prevScore   = -INF;
      let finalScored = null;
      let panicUsed   = false;

      for (let d = 1; d <= depthLimit; d++) {
        if (this.stop) break;

        let asp = d > 1 ? 25 : INF;
        let lo  = d > 1 ? Math.max(-INF, prevScore - asp) : -INF;
        let hi  = d > 1 ? Math.min(INF, prevScore + asp) : INF;

        let scored = [];
        let prevWindowScored = null;

        let aspTries = 0;
        aspirationLoop:
        while (true) {
          if (++aspTries > 12) { lo = -INF; hi = INF; }
          scored = [];
          let alpha = lo;
          let bestInWindow = -INF;

          const ttEnc = this.tt.getBestMove(this.hash);
          this.scoreMoves(rootMoves, ttEnc, 0);

          for (let moveIdx = 0; moveIdx < rootMoves.length; moveIdx++) {
            const m = this.pickNextMove(rootMoves, moveIdx);
            if (this.stop) break;

            this.makeMove(m);
            let score;

            if (moveIdx === 0) {
              score = -this.negamax(d - 1, -hi, -alpha, 1, true);
            } else {
              score = -this.negamax(d - 1, -alpha - 1, -alpha, 1, true);
              if (!this.stop && score > alpha && score < hi) {
                score = -this.negamax(d - 1, -hi, -alpha, 1, true);
              }
            }

            this.undoMove();
            if (this.stop) break;

            scored.push({ m, score });
            if (score > bestInWindow) bestInWindow = score;

            if (score > alpha) {
              alpha = score;
              if (alpha >= hi) {
                /* Fail high: preserve partial results and widen */
                prevWindowScored = scored.slice();
                asp = Math.min(asp * 2, INF);
                hi  = Math.min(INF, alpha + asp);
                lo  = Math.max(-INF, alpha - asp);
                continue aspirationLoop;
              }
            }
          }

          if (scored.length && bestInWindow <= lo && lo > -INF + 1) {
            prevWindowScored = scored.slice();
            asp = Math.min(asp * 2, INF);
            lo  = Math.max(-INF, bestInWindow - asp);
            hi  = Math.min(INF, bestInWindow + asp);
            continue aspirationLoop;
          }
          break;
        }

        /* If search was interrupted and we have no complete results, use previous window's data */
        if (!scored.length && prevWindowScored && prevWindowScored.length) {
          scored = prevWindowScored;
        }
        if (!scored.length) break;

        scored.sort((a, b) => b.score - a.score);
        this.applyRootBlunderGuard(scored, d);
        finalScored = scored;
        bestMove  = scored[0].m;
        bestScore = scored[0].score;

        /* Panic time */
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
                this.send('info string panic_time drop', drop, 'new_movetime', this.moveTime);
              }
            }
          }
        }
        prevScore = bestScore;
        rootMoves = scored.map(x => x.m);

        const elapsed  = Date.now() - this.startTime;
        const nps      = elapsed > 0 ? Math.floor(this.nodes * 1000 / elapsed) : this.nodes;
        const hashfull = this.tt.hashfull();

        const rootLines = [];
        for (let i = 0; i < scored.length; i++) {
          const { m, score } = scored[i];
          const first = this.formatMove(m, outFmt);
          this.makeMove(m);
          const pv = [first, ...this.pvLine(Math.max(0, d - 1), outFmt)].join(' ');
          this.undoMove();
          rootLines.push({ move: m, score, pv });
        }

        this.sendRootInfo(rootLines, d, elapsed, nps, hashfull, multiPV);

        for (let i = 0; i < Math.min(multiPV, rootLines.length); i++) {
          const evalBar = Math.max(0, Math.min(100, 50 + Math.round(rootLines[i].score / 20)));
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

    /* ── Bench ── */
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
        this.pawnHash.clear();
        this.histTable.fill(0);
        this.contHist.fill(0);
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
            if (score > bestScore) { bestScore = score; bestMove = m; }
            if (score > alpha) alpha = score;
          }

          const bi = rootMoves.indexOf(bestMove);
          if (bi > 0) { const t = rootMoves[0]; rootMoves[0] = rootMoves[bi]; rootMoves[bi] = t; }
        }

        const posTime = Math.max(1, Date.now() - this.startTime);
        totalNodes += this.nodes;
        this.send('info string benchpos', i + 1, 'nodes', this.nodes, 'time', posTime,
          'nps', Math.floor(this.nodes * 1000 / posTime), 'bestmove', this.moveToUci(bestMove));
      }

      const totalTime = Math.max(1, Date.now() - benchStart);
      this.send('info string bench total nodes', totalNodes, 'time', totalTime,
        'nps', Math.floor(totalNodes * 1000 / totalTime), 'depth', d, 'positions', BENCH_FENS.length);

      this.setFen(savedFen);
      this.options.UCI_AnalyseMode = savedAnalyze;
    }

    /* ── Perft ── */
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
        depth: 0, moveTime: 0,
        wtime: 0, btime: 0, winc: 0, binc: 0, movestogo: 30,
        multiPV: 0, infinite: false, ponder: false,
        maxNodes: 0, selDepth: 0, searchMoves: [],
      };
      const stopWords = new Set(['searchmoves','ponder','wtime','btime','winc','binc','movestogo',
                                  'depth','nodes','mate','movetime','infinite','multipv','seldepth']);
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i], v = Number(tokens[i + 1]);
        if (t === 'infinite')  spec.infinite = true;
        if (t === 'ponder')    spec.ponder = true;
        if (t === 'depth')     spec.depth = v;
        if (t === 'movetime')  spec.moveTime = v;
        if (t === 'nodes')     spec.maxNodes = v;
        if (t === 'seldepth')  spec.selDepth = v;
        if (t === 'wtime')     spec.wtime = v;
        if (t === 'btime')     spec.btime = v;
        if (t === 'winc')      spec.winc = v;
        if (t === 'binc')      spec.binc = v;
        if (t === 'movestogo') spec.movestogo = v;
        if (t === 'multipv')   spec.multiPV = v;
        if (t === 'searchmoves') {
          let j = i + 1;
          while (j < tokens.length && !stopWords.has(tokens[j])) spec.searchMoves.push(tokens[j++]);
          i = j - 1;
        }
      }
      if (spec.infinite && !spec.moveTime) spec.moveTime = 24 * 3600 * 1000;
      if (spec.ponder && !spec.moveTime) spec.moveTime = 24 * 3600 * 1000;
      if (this.options.UCI_AnalyseMode && !spec.moveTime) spec.moveTime = 0;
      if (!spec.depth) spec.depth = 64;
      this.lastGoSpec = spec;
      this.pondering = !!spec.ponder;

      /* Use MessageChannel for minimal-latency async dispatch */
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (typeof MessageChannel !== 'undefined') {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => {
          try { this.search(spec); }
          catch (err) {
            this.send('info string error search', err && err.message ? err.message : String(err));
            this.send('bestmove 0000');
          }
        };
        ch.port2.postMessage(null);
      } else {
        this.searchTimer = setTimeout(() => {
          this.searchTimer = null;
          try { this.search(spec); }
          catch (err) {
            this.send('info string error search', err && err.message ? err.message : String(err));
            this.send('bestmove 0000');
          }
        }, 0);
      }
    }

    handleSetOption(tokens) {
      const ni = tokens.indexOf('name');
      const vi = tokens.indexOf('value');
      if (ni < 0) return;
      const name  = tokens.slice(ni + 1, vi > -1 ? vi : tokens.length).join(' ');
      const value = vi > -1 ? tokens.slice(vi + 1).join(' ') : '';

      switch (name) {
        case 'MultiPV':
          this.options.MultiPV = Math.max(1, Math.min(12, +value || 1)); break;
        case 'Skill Level':
          this.options.SkillLevel = Math.max(0, Math.min(20, +value | 0)); break;
        case 'Strength Preset':
          this.applyStrengthPreset(value); break;
        case 'Ponder':
          this.options.Ponder = BOOL_RE.test(value.trim()); break;
        case 'Move Overhead':
          this.options.MoveOverhead = Math.max(0, Math.min(10000, +value || 0)); break;
        case 'UCI_AnalyseMode':
          this.options.UCI_AnalyseMode = BOOL_RE.test(value.trim()); break;
        case 'UCI_LimitStrength':
          this.options.UCI_LimitStrength = BOOL_RE.test(value.trim()); break;
        case 'UCI_Elo':
          this.options.UCI_Elo = Math.max(800, Math.min(2800, +value || 2000)); break;
        case 'UCI_ShowWDL':
          this.options.UCI_ShowWDL = BOOL_RE.test(value.trim()); break;
        case 'UCI_ShowACPL':
          this.options.UCI_ShowACPL = BOOL_RE.test(value.trim()); break;
        case 'PVFormat':
          this.options.PVFormat = String(value).trim().toLowerCase() === 'san' ? 'san' : 'uci'; break;
        case 'Clear Hash':
          this.tt.clear(); this.pawnHash.clear(); break;
        case 'Hash': {
          const mb = Math.max(MIN_HASH_MB, Math.min(MAX_HASH_MB, +value || DEFAULT_HASH_MB));
          this.options.Hash = mb;
          this.tt.resize(mb);
          break;
        }
      }
    }

    command(line) {
      const tokens = line.trim().split(/\s+/);
      if (!tokens[0]) return;
      let cmd = tokens[0];

      /* Short aliases */
      const aliases = { u:'ucinewgame', q:'quit', b:'board', e:'eval' };
      if (aliases[cmd]) cmd = aliases[cmd];
      if (cmd === 'p') { cmd = 'position'; if (tokens[1] === 's') tokens[1] = 'startpos'; }
      if (cmd === 'g') { cmd = 'go'; if (tokens[1] === 'd') tokens[1] = 'depth'; }

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
          this.pawnHash.clear();
          this.histTable.fill(0);
          this.contHist.fill(0);
          for (const k of this.killers) { k[0] = 0; k[1] = 0; }
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
          if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null; }
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
          let d = 4, divide = false;
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
    const lines = String(e.data || '').split(/\r?\n/);
    for (const ln of lines) {
      const l = ln.trim();
      if (!l) continue;
      try {
        engine.command(l);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const stack = err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : '';
        engine.send('info string error command', msg, stack ? ('trace: ' + stack) : '', 'line', l);
      }
    }
  };

})();
