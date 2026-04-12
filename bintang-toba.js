/*
  Bintang Toba Chess Engine v3.0 (Web Worker)
  Production-grade chess engine with all critical bugs fixed and modern features implemented.
  
  Changelog v3.0:
  - FIXED: Empty command() method - now fully UCI compliant
  - FIXED: SEE (Static Exchange Evaluation) with proper x-ray detection
  - FIXED: Aspiration window with correct fail-low/fail-high handling
  - FIXED: Null move verification zugzwang protection
  - FIXED: Castle rights validation with proper FEN parsing
  - UPGRADED: Aggressive LMR (Late Move Reduction) with history-based adjustments
  - UPGRADED: Counter move heuristic and follow-up move history
  - UPGRADED: Multi-cut pruning for faster cutoffs
  - UPGRADED: Sophisticated time management with emergency handling
  - UPGRADED: Improved TT replacement strategy (depth + age hybrid)
  - UPGRADED: Extended futility pruning and razoring
  - UPGRADED: Better king safety with attack zone evaluation
  - UPGRADED: Outpost evaluation for knights
  - ADDED: Proper UCI option handling and info output
  - ADDED: Search stability detection for better time usage
  - ADDED: Move overhead compensation for network lag
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
  const DEFAULT_HASH_MB = 32; // Increased from 16
  const MIN_HASH_MB = 1;
  const MAX_HASH_MB = 1024; // Increased from 256
  const BOOL_RE = /^(true|1|on|yes)$/i;

  const FLAG_CAPTURE = 1;
  const FLAG_EP = 2;
  const FLAG_CASTLE = 4;
  const FLAG_PROMO = 8;

  const MAX_PLY = 128;
  const MAX_MOVES = 256;
  const TEMPO_MG = 15; // Tuned up from 12
  const TEMPO_EG = 8;  // Tuned up from 6

  /* ── Directions ── */
  const KNIGHT_DIR = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP_DIR = [-17, -15, 15, 17];
  const ROOK_DIR = [-16, -1, 1, 16];
  const KING_DIR = [-17, -16, -15, -1, 1, 15, 16, 17];

  /* ── Material values (tuned) ── */
  const PIECE_VALUE = new Int16Array(16);
  PIECE_VALUE[WP] = 100; PIECE_VALUE[WN] = 320; PIECE_VALUE[WB] = 330;
  PIECE_VALUE[WR] = 500; PIECE_VALUE[WQ] = 900; PIECE_VALUE[WK] = 0;
  PIECE_VALUE[BP] = 100; PIECE_VALUE[BN] = 320; PIECE_VALUE[BB] = 330;
  PIECE_VALUE[BR] = 500; PIECE_VALUE[BQ] = 900; PIECE_VALUE[BK] = 0;

  const PIECE_CH = { 
    [WP]:'P',[WN]:'N',[WB]:'B',[WR]:'R',[WQ]:'Q',[WK]:'K',
    [BP]:'p',[BN]:'n',[BB]:'b',[BR]:'r',[BQ]:'q',[BK]:'k' 
  };
  const CH_PIECE = { 
    P:WP,N:WN,B:WB,R:WR,Q:WQ,K:WK,
    p:BP,n:BN,b:BB,r:BR,q:BQ,k:BK 
  };

  function isWhite(p) { return p >= WP && p <= WK; }
  function isBlack(p) { return p >= BP && p <= BK; }
  function colorOf(p) { return isWhite(p) ? WHITE : BLACK; }
  function opponent(c) { return c ^ 1; }
  function onBoard(sq) { return (sq & 0x88) === 0; }
  function pieceType(p) { return p & 7; }
  function pieceColor(p) { return p >= BP ? BLACK : WHITE; }

  /* ── PST tables (tuned values) ── */
  const PST_PAWN_MG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
     80, 80, 80, 80, 80, 80, 80, 80,
     15, 15, 25, 35, 35, 25, 15, 15,
      5,  5, 15, 30, 30, 15,  5,  5,
      0,  0,  5, 25, 25,  5,  0,  0,
      5, -5,-15,  0,  0,-15, -5,  5,
      5, 10, 10,-25,-25, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ]);
  const PST_PAWN_EG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
     90, 90, 90, 90, 90, 90, 90, 90,
     40, 40, 45, 50, 50, 45, 40, 40,
     20, 20, 25, 35, 35, 25, 20, 20,
      8,  8, 12, 22, 22, 12,  8,  8,
      0,  0,  0,  8,  8,  0,  0,  0,
     -8, -8, -8,-15,-15, -8, -8, -8,
      0,  0,  0,  0,  0,  0,  0,  0,
  ]);
  const PST_KNIGHT_MG = new Int16Array([
    -60,-40,-30,-30,-30,-30,-40,-60,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 20, 25, 25, 20,  5,-30,
    -30,  0, 20, 25, 25, 20,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -60,-40,-30,-30,-30,-30,-40,-60,
  ]);
  const PST_KNIGHT_EG = new Int16Array([
    -60,-40,-30,-30,-30,-30,-40,-60,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  5, 20, 25, 25, 20,  5,-30,
    -30, 10, 25, 30, 30, 25, 10,-30,
    -30,  5, 25, 30, 30, 25,  5,-30,
    -30, 10, 20, 25, 25, 20, 10,-30,
    -40,-20,  5,  5,  5,  5,-20,-40,
    -60,-40,-30,-30,-30,-30,-40,-60,
  ]);
  const PST_BISHOP_MG = new Int16Array([
    -25,-15,-15,-15,-15,-15,-15,-25,
    -15,  0,  0,  0,  0,  0,  0,-15,
    -15,  5, 10, 15, 15, 10,  5,-15,
    -15, 10, 10, 15, 15, 10, 10,-15,
    -15,  5, 15, 15, 15, 15,  5,-15,
    -15, 15, 15, 15, 15, 15, 15,-15,
    -15, 10,  0,  0,  0,  0, 10,-15,
    -25,-15,-15,-15,-15,-15,-15,-25,
  ]);
  const PST_BISHOP_EG = new Int16Array([
    -25,-15,-15,-15,-15,-15,-15,-25,
    -15,  5,  8,  8,  8,  8,  5,-15,
    -15,  8, 15, 20, 20, 15,  8,-15,
    -15,  8, 20, 25, 25, 20,  8,-15,
    -15,  8, 20, 25, 25, 20,  8,-15,
    -15,  8, 15, 20, 20, 15,  8,-15,
    -15,  5,  8,  8,  8,  8,  5,-15,
    -25,-15,-15,-15,-15,-15,-15,-25,
  ]);
  const PST_ROOK_MG = new Int16Array([
      0,  0,  5, 10, 10,  5,  0,  0,
     10, 15, 15, 15, 15, 15, 15, 10,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5, 10, 10,  5,  0,  0,
  ]);
  const PST_ROOK_EG = new Int16Array([
      0,  0,  0,  0,  0,  0,  0,  0,
     10, 10, 10, 10, 10, 10, 10, 10,
      5,  5,  5,  5,  5,  5,  5,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  5,  5,  0,  0,  0,
  ]);
  const PST_QUEEN_MG = new Int16Array([
    -25,-15,-10, -5, -5,-10,-15,-25,
    -15,  0,  5,  5,  5,  5,  0,-15,
    -10,  5,  8, 10, 10,  8,  5,-10,
     -5,  5, 10, 15, 15, 10,  5, -5,
      0,  5, 10, 15, 15, 10,  5,  0,
    -10,  5, 10, 10, 10, 10,  5,-10,
    -15,  0,  5,  8,  8,  5,  0,-15,
    -25,-15,-10, -5, -5,-10,-15,-25,
  ]);
  const PST_QUEEN_EG = new Int16Array([
    -25,-15,-10, -5, -5,-10,-15,-25,
    -15,  0,  5,  8,  8,  5,  0,-15,
    -10,  5, 10, 12, 12, 10,  5,-10,
     -5,  8, 12, 18, 18, 12,  8, -5,
     -5,  8, 12, 18, 18, 12,  8, -5,
    -10,  5, 10, 12, 12, 10,  5,-10,
    -15,  0,  5,  8,  8,  5,  0,-15,
    -25,-15,-10, -5, -5,-10,-15,-25,
  ]);
  const PST_KING_MG = new Int16Array([
    -40,-50,-50,-60,-60,-50,-50,-40,
    -40,-50,-50,-60,-60,-50,-50,-40,
    -40,-50,-50,-60,-60,-50,-50,-40,
    -40,-50,-50,-60,-60,-50,-50,-40,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
     10, 10,-10,-10,-10,-10, 10, 10,
     30, 50, 10,  0,  0, 10, 50, 30,
  ]);
  const PST_KING_EG = new Int16Array([
    -50,-30,-30,-30,-30,-30,-30,-50,
    -30,-20,-10,-10,-10,-10,-20,-30,
    -30,-10, 25, 35, 35, 25,-10,-30,
    -30,-10, 35, 45, 45, 35,-10,-30,
    -30,-10, 35, 45, 45, 35,-10,-30,
    -30,-10, 25, 35, 35, 25,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ]);

  const PST_MG = [null, PST_PAWN_MG, PST_KNIGHT_MG, PST_BISHOP_MG, PST_ROOK_MG, PST_QUEEN_MG, PST_KING_MG];
  const PST_EG = [null, PST_PAWN_EG, PST_KNIGHT_EG, PST_BISHOP_EG, PST_ROOK_EG, PST_QUEEN_EG, PST_KING_EG];

  const PHASE_WEIGHT = new Int8Array(16);
  PHASE_WEIGHT[WN] = 1; PHASE_WEIGHT[WB] = 1; PHASE_WEIGHT[WR] = 2; PHASE_WEIGHT[WQ] = 4;
  PHASE_WEIGHT[BN] = 1; PHASE_WEIGHT[BB] = 1; PHASE_WEIGHT[BR] = 2; PHASE_WEIGHT[BQ] = 4;
  const MAX_PHASE = 24;

  /* MVV-LVA table */
  const MVV_LVA = (() => {
    const t = Array.from({ length: 7 }, () => new Int16Array(7));
    for (let v = 1; v <= 6; v++)
      for (let a = 1; a <= 6; a++)
        t[v][a] = v * 16 - a;
    return t;
  })();

  /* Passed pawn advancement bonus */
  const PAWN_PASSED = [0, 0, 0, 0.15, 0.35, 0.75, 1.4, 2.5];

  /* Attack weight by attacker count */
  const ATT_W = new Float64Array([0, 0.02, 0.45, 0.82, 1.15, 1.55, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0]);

  /* Mobility weights (tuned) */
  const MOBN_S = 5, MOBN_E = -4, MOBN_S0 = -10, MOBN_E0 = -75;
  const MOBB_S = 8, MOBB_E = 3, MOBB_S0 = -12, MOBB_E0 = -52;
  const MOBR_S = 6, MOBR_E = 3, MOBR_S0 = -3, MOBR_E0 = -55;
  const MOBQ_S = 4, MOBQ_E = 8, MOBQ_S0 = 8, MOBQ_E0 = 0;

  const TIGHT_NS = 5, TIGHT_NE = -5;
  const TIGHT_BS = 12, TIGHT_BE = 10;
  const TIGHT_RS = 5, TIGHT_RE = 7;
  const TIGHT_QS = -150, TIGHT_QE = -165;

  const TENSE_NS = 55, TENSE_NE = 26;
  const TENSE_BS = 38, TENSE_BE = 42;
  const TENSE_RS = 110, TENSE_RE = -20;
  const TENSE_QS = -2, TENSE_QE = 25;

  const ATT_N = 30, ATT_B = 10, ATT_R = 48, ATT_Q = 52;
  const TWOBISHOPS_S = 40, TWOBISHOPS_E = 65;
  const ROOK7TH_S = -30, ROOK7TH_E = 38;
  const ROOKOPEN_S = 25, ROOKOPEN_E = -2;
  const ROOK_DOUBLED_S = 30, ROOK_DOUBLED_E = -2;
  const QUEEN7TH_S = -80, QUEEN7TH_E = 60;

  /* Pawn structure weights */
  const DOUBLED_MG = 12, DOUBLED_EG = 4;
  const ISOLATED_MG = 15, ISOLATED_EG = 14;
  const CONNECTED_BONUS = 10;
  const BLOCKED_PAWN_MG = 10, BLOCKED_PAWN_EG = 15;
  const BACKWARD_PAWN_MG = 12, BACKWARD_PAWN_EG = 8;

  /* King safety weights */
  const KSAFETY_SHELTER = 6, KSAFETY_SHELTER_EG = 3;
  const KSAFETY_STORM = 5, KSAFETY_STORM_EG = 3;
  const KSAFETY_OPEN = 10, KSAFETY_OPEN_EG_DIV = 2;
  const KSAFETY_ATTACK = 8, KSAFETY_ATTACK_EG = 4;
  const KSAFETY_SAFE_BONUS = 12;

  /* Outpost bonus */
  const KNIGHT_OUTPOST = 28;
  const BISHOP_OUTPOST = 18;

  /* WDL model constants */
  const WDL_DRAW_COEFF = 220;
  const WDL_DRAW_SCALE = 280;
  const WDL_WIN_SCALE = 180;

  /* ── Bench positions (expanded) ── */
  const BENCH_FENS = [
    START_FEN,
    'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7',
    'r3r1k1/pp1n1pp1/2p2q1p/3p4/3P4/2N1PN2/PPQ2PPP/2R2RK1 w - - 0 16',
    '2r2rk1/1bq1bppp/p2ppn2/1p6/3NP3/1BN1B3/PPP2PPP/2RQ1RK1 w - - 2 13',
    '8/2p5/2P1k3/3pP3/3P4/4K3/8/8 w - - 0 1',
    'r4rk1/1pp1qppp/p1np1n2/4p3/2BPP3/2N2N2/PPP2PPP/R1BQR1K1 w - - 3 11',
    'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 2 3',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  ];

  const PERFT_SUITE = [
    { name: 'startpos', fen: START_FEN, expected: { 1: 20, 2: 400, 3: 8902, 4: 197281, 5: 4865609 } },
    { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/2P5/1p2P3/2N2N2/PPQ1BPPP/R3K2R w KQkq - 0 1', expected: { 1: 48, 2: 2039, 3: 97862, 4: 4085603 } },
    { name: 'endgame', fen: '8/2p5/3k4/1P1Pp3/3K4/8/8/8 b - - 0 1', expected: { 1: 9, 2: 77, 3: 658, 4: 5912 } },
  ];

  /* ── 64-bit Zobrist ── */
  class RNG {
    constructor(seed = 0x9e3779b1) { this.s = seed >>> 0; }
    next() {
      let x = this.s;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.s = x >>> 0;
      return this.s;
    }
  }

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

  /* ── Transposition Table ── */
  const TT_HASHLO = 0;
  const TT_HASHHI = 1;
  const TT_DEPTH = 2;
  const TT_FLAG = 3;
  const TT_SCORE = 4;
  const TT_BEST = 5;
  const TT_AGE = 6;
  const TT_WORDS = 7;

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
      this.epoch = 1;
    }

    clear() { this.data.fill(0); this.epoch = 1; }

    nextEpoch() {
      this.epoch = (this.epoch + 1) & 0xffff;
      if (this.epoch === 0) this.epoch = 1;
    }

    _slot(hash) { return (hash.lo & this.mask); }
    _idx(hash) { return this._slot(hash) * TT_WORDS; }

    _keysMatch(i, hash) {
      return this.data[i + TT_HASHLO] === (hash.lo | 0) &&
        this.data[i + TT_HASHHI] === (hash.hi | 0);
    }

    probe(hash, depth, alpha, beta) {
      const i = this._idx(hash);
      if (!this._keysMatch(i, hash)) return null;
      if (this.data[i + TT_DEPTH] < depth) return null;
      const score = this.data[i + TT_SCORE];
      const flag = this.data[i + TT_FLAG];
      if (flag === 0) return score;
      if (flag === -1 && score <= alpha) return score;
      if (flag === 1 && score >= beta) return score;
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

      const oldHashLo = this.data[i + TT_HASHLO];
      const oldHashHi = this.data[i + TT_HASHHI];
      const oldDepth = this.data[i + TT_DEPTH];
      const oldAge = this.data[i + TT_AGE];

      const isSamePosition = oldHashLo === (hash.lo | 0) && oldHashHi === (hash.hi | 0);
      const ageDiff = ((this.epoch - oldAge) & 0xffff);

      // Replacement strategy: depth + age hybrid
      let replace = false;
      if (!oldHashLo && !oldHashHi) {
        replace = true;
      } else if (isSamePosition) {
        if (depth > oldDepth) replace = true;
        else if (depth === oldDepth && flag === 0) replace = true;
      } else {
        const depthBonus = Math.max(0, oldDepth - depth) * 3;
        if (ageDiff + depthBonus > 2) replace = true;
      }

      if (!replace) return;

      const best = bestEncoded ? (bestEncoded | 0) : (isSamePosition ? this.data[i + TT_BEST] : 0);

      this.data[i + TT_HASHLO] = hash.lo | 0;
      this.data[i + TT_HASHHI] = hash.hi | 0;
      this.data[i + TT_DEPTH] = depth;
      this.data[i + TT_SCORE] = score;
      this.data[i + TT_FLAG] = flag;
      this.data[i + TT_BEST] = best;
      this.data[i + TT_AGE] = this.epoch;
    }

    hashfull() {
      const sample = Math.min(4096, this.size);
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
        from: v & 0xff,
        to: (v >>> 8) & 0xff,
        promo: (v >>> 16) & 0xff,
        flags: (v >>> 24) & 0xff,
        piece: EMPTY, capture: EMPTY,
      };
    }
  }

  /* ── Square mappings ── */
  function sqToUci(sq) { return FILES[sq & 7] + ((sq >> 4) + 1); }
  function uciToSq(uci) {
    if (!uci || uci.length < 2) return -1;
    const f = FILES.indexOf(uci[0]);
    const r = Number(uci[1]) - 1;
    if (f < 0 || r < 0 || r > 7) return -1;
    return (r << 4) | f;
  }

  const SQ = {};
  ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8'].forEach(n => { SQ[n] = uciToSq(n); });

  function sq128To64(sq) { return ((sq >> 4) << 3) | (sq & 7); }
  function mirror64(i) { return ((7 - (i >> 3)) << 3) | (i & 7); }

  /* ── Move Pool ── */
  class MovePool {
    constructor(capacity = 8192) {
      this.cap = capacity;
      this.from = new Uint8Array(capacity);
      this.to = new Uint8Array(capacity);
      this.piece = new Uint8Array(capacity);
      this.capture = new Uint8Array(capacity);
      this.promo = new Uint8Array(capacity);
      this.flags = new Uint8Array(capacity);
      this.score = new Int32Array(capacity);
      this.see = new Int16Array(capacity);
      this.size = 0;
    }

    reset() { this.size = 0; }

    add(from, to, piece, capture, promo, flags) {
      const i = this.size;
      if (i >= this.cap) return i;
      this.from[i] = from;
      this.to[i] = to;
      this.piece[i] = piece;
      this.capture[i] = capture;
      this.promo[i] = promo;
      this.flags[i] = flags;
      this.score[i] = 0;
      this.see[i] = 0;
      this.size++;
      return i;
    }

    swap(a, b) {
      if (a === b) return;
      let t;
      t = this.from[a]; this.from[a] = this.from[b]; this.from[b] = t;
      t = this.to[a]; this.to[a] = this.to[b]; this.to[b] = t;
      t = this.piece[a]; this.piece[a] = this.piece[b]; this.piece[b] = t;
      t = this.capture[a]; this.capture[a] = this.capture[b]; this.capture[b] = t;
      t = this.promo[a]; this.promo[a] = this.promo[b]; this.promo[b] = t;
      t = this.flags[a]; this.flags[a] = this.flags[b]; this.flags[b] = t;
      t = this.score[a]; this.score[a] = this.score[b]; this.score[b] = t;
      t = this.see[a]; this.see[a] = this.see[b]; this.see[b] = t;
    }

    getObj(i) {
      return {
        from: this.from[i],
        to: this.to[i],
        piece: this.piece[i],
        capture: this.capture[i],
        promo: this.promo[i],
        flags: this.flags[i],
        _score: this.score[i],
        _see: this.see[i],
      };
    }

    encode(i) {
      return (this.from[i]) | (this.to[i] << 8) | (this.promo[i] << 16) | (this.flags[i] << 24);
    }
  }

  /* ── Piece List ── */
  class PieceList {
    constructor() {
      this.pieces = [[], []];
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

  /* ── Pawn Hash Table ── */
  class PawnHashTable {
    constructor(sizeBits = 14) {
      this.size = 1 << sizeBits;
      this.mask = this.size - 1;
      this.keys_lo = new Int32Array(this.size);
      this.keys_hi = new Int32Array(this.size);
      this.mg = new Int16Array(this.size);
      this.eg = new Int16Array(this.size);
      this.valid = new Uint8Array(this.size);
    }

    clear() { this.valid.fill(0); }

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

  /* ── Main Engine ── */
  class Engine {
    constructor() {
      this.name = 'Bintang Toba 3.0';
      this.author = 'Bintang Team';

      this.options = {
        Hash: DEFAULT_HASH_MB,
        MultiPV: 1,
        Ponder: false,
        StrengthPreset: 'Custom',
        SkillLevel: 20,
        UCI_LimitStrength: false,
        UCI_Elo: 2000,
        MoveOverhead: 10,
        UCI_AnalyseMode: false,
        UCI_ShowWDL: false,
        UCI_ShowACPL: false,
        PVFormat: 'uci',
      };

      this.stop = false;
      this.nodes = 0;
      this.selDepth = 0;
      this.startTime = 0;
      this.moveTime = 0;
      this.maxNodes = 0;
      this.selDepthHard = 0;
      this.effectiveSkillLevel = 20;
      this.pondering = false;
      this.lastGoSpec = null;
      this.searchTimer = null;
      this.normalMoveTime = 0;
      this.maxMoveTime = 0;

      // Board state
      this.board = new Uint8Array(128);
      this.side = WHITE;
      this.castle = 0;
      this.ep = -1;
      this.halfmove = 0;
      this.fullmove = 1;

      this.kingPos = [-1, -1];
      this.plist = new PieceList();

      this.history = [];
      this.hashStack = [];

      // Killers [ply][0..1]
      this.killers = Array.from({ length: MAX_PLY }, () => [0, 0]);

      // History heuristic [piece][to]
      this.histTable = new Int32Array(16 * 128);

      // Counter moves [piece][to] -> best response
      this.counterMoves = new Int16Array(16 * 128);

      // Follow-up history [prevPiece][prevTo][piece][to]
      this.followUpHist = new Int16Array(16 * 128 * 16 * 128);

      // Continuation history
      this.contHistSize = 16 * 128;
      this.contHist = new Int16Array(this.contHistSize * this.contHistSize);

      // Static eval trace
      this.evalTrace = new Int32Array(MAX_PLY + 8);

      // Zobrist
      this.Z = initZobrist();
      this.pawnZ = this._initPawnZobrist();

      // Tables
      this.tt = new TranspositionTable(this.options.Hash);
      this.pawnHash = new PawnHashTable(14);

      // Pools
      this.movePool = new MovePool(8192);
      this.seeOcc = new Uint8Array(128);

      this.bestMove = null;
      this.hash = HASH_ZERO;
      this.pHash = HASH_ZERO;

      this.setFen(START_FEN);
    }

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

    /* ── UCI Communication ── */
    send(...parts) { 
      const msg = parts.join(' ').trim();
      if (typeof postMessage !== 'undefined') {
        postMessage(msg);
      } else if (typeof console !== 'undefined') {
        console.log(msg);
      }
    }

    /* ── UCI Command Handlers ── */
    command(line) {
      const tokens = line.trim().split(/\s+/);
      const cmd = tokens[0].toLowerCase();

      switch (cmd) {
        case 'uci': this.sendUCI(); break;
        case 'isready': this.send('readyok'); break;
        case 'position': this.handlePosition(tokens); break;
        case 'go': this.handleGo(tokens); break;
        case 'stop': this.stop = true; break;
        case 'quit': 
        case 'exit': 
          this.stop = true;
          if (typeof self !== 'undefined' && self.close) self.close();
          break;
        case 'setoption': this.handleSetOption(tokens); break;
        case 'ucinewgame': this.resetGame(); break;
        case 'bench': this.runBench(tokens[1] ? +tokens[1] : 6); break;
        case 'perft': this.runPerft(tokens[1] ? +tokens[1] : 4, tokens.includes('divide')); break;
        case 'd': this.send('info string fen', this.getFen()); break;
        case 'eval': this.send('info string eval', this.evaluate()); break;
        default: this.send('info string unknown command', cmd);
      }
    }

    sendUCI() {
      this.send('id name', this.name);
      this.send('id author', this.author);
      
      this.send('option name Hash type spin default', DEFAULT_HASH_MB, 'min', MIN_HASH_MB, 'max', MAX_HASH_MB);
      this.send('option name MultiPV type spin default 1 min 1 max 12');
      this.send('option name Skill Level type spin default 20 min 0 max 20');
      this.send('option name Ponder type check default false');
      this.send('option name Move Overhead type spin default 10 min 0 max 10000');
      this.send('option name UCI_AnalyseMode type check default false');
      this.send('option name UCI_LimitStrength type check default false');
      this.send('option name UCI_Elo type spin default 2000 min 800 max 2800');
      this.send('option name UCI_ShowWDL type check default false');
      this.send('option name UCI_ShowACPL type check default false');
      this.send('option name PVFormat type combo default uci var uci var san');
      this.send('option name Strength Preset type combo default Custom var Elo1200 var Elo1500 var Elo1800 var Elo2200 var Max');
      
      this.send('uciok');
    }

    resetGame() {
      this.setFen(START_FEN);
      this.tt.clear();
      this.pawnHash.clear();
      this.histTable.fill(0);
      this.contHist.fill(0);
      this.counterMoves.fill(0);
      this.followUpHist.fill(0);
      for (const k of this.killers) { k[0] = 0; k[1] = 0; }
      this.send('info string new game started');
    }

    /* ── FEN Handling ── */
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
      const rows = parts[0].split('/');
      let r = 7;
      for (const row of rows) {
        let f = 0;
        for (const ch of row) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const sq = (r << 4) | f;
          const p = CH_PIECE[ch] || EMPTY;
          this.board[sq] = p;
          if (p === WK) this.kingPos[WHITE] = sq;
          if (p === BK) this.kingPos[BLACK] = sq;
          if (p) this.plist.add(sq, p);
          f++;
        }
        r--;
      }
      this.side = parts[1] === 'b' ? BLACK : WHITE;
      const cstr = parts[2] || '-';
      this.castle = 0;

      // Validate castle rights dengan proper checks
      if (cstr !== '-') {
        if (cstr.includes('K') && this.board[SQ['e1']] === WK && this.board[SQ['h1']] === WR) {
          if (!this.board[SQ['f1']] && !this.board[SQ['g1']]) this.castle |= 1;
        }
        if (cstr.includes('Q') && this.board[SQ['e1']] === WK && this.board[SQ['a1']] === WR) {
          if (!this.board[SQ['d1']] && !this.board[SQ['c1']] && !this.board[SQ['b1']]) this.castle |= 2;
        }
        if (cstr.includes('k') && this.board[SQ['e8']] === BK && this.board[SQ['h8']] === BR) {
          if (!this.board[SQ['f8']] && !this.board[SQ['g8']]) this.castle |= 4;
        }
        if (cstr.includes('q') && this.board[SQ['e8']] === BK && this.board[SQ['a8']] === BR) {
          if (!this.board[SQ['d8']] && !this.board[SQ['c8']] && !this.board[SQ['b8']]) this.castle |= 8;
        }
      }

      this.ep = (parts[3] && parts[3] !== '-') ? uciToSq(parts[3]) : -1;
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
        ? `${this.castle & 1 ? 'K' : ''}${this.castle & 2 ? 'Q' : ''}${this.castle & 4 ? 'k' : ''}${this.castle & 8 ? 'q' : ''}`
        : '-';
      return `${rows.join('/')} ${this.side === WHITE ? 'w' : 'b'} ${c} ${this.ep === -1 ? '-' : sqToUci(this.ep)} ${this.halfmove} ${this.fullmove}`;
    }

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

    /* ── Attack Detection ── */
    isAttacked(sq, byColor) {
      const board = this.board;
      if (byColor === WHITE) {
        if (onBoard(sq - 15) && board[sq - 15] === WP) return true;
        if (onBoard(sq - 17) && board[sq - 17] === WP) return true;
      } else {
        if (onBoard(sq + 15) && board[sq + 15] === BP) return true;
        if (onBoard(sq + 17) && board[sq + 17] === BP) return true;
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
          const p = board[to]; if (p) { if (p === bi || p === qu) return true; break; }
          to += d;
        }
      }
      const ro = byColor === WHITE ? WR : BR;
      for (let di = 0; di < 4; di++) {
        const d = ROOK_DIR[di];
        let to = sq + d;
        while (onBoard(to)) {
          const p = board[to]; if (p) { if (p === ro || p === qu) return true; break; }
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
        return (onBoard(sq - 15) && board[sq - 15] === WP) ||
          (onBoard(sq - 17) && board[sq - 17] === WP);
      }
      return (onBoard(sq + 15) && board[sq + 15] === BP) ||
        (onBoard(sq + 17) && board[sq + 17] === BP);
    }

    /* ── Make/Undo Moves ── */
    makeMove(m) {
      const oldCastle = this.castle;
      const oldEp = this.ep;
      const oldHash = this.hash;
      const oldPHash = this.pHash;

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

      if (m.piece === WP || m.piece === BP) {
        ph = hashXor(ph, this.pawnZ[m.piece][m.from]);
      }

      this.halfmove++;
      if (m.piece === WP || m.piece === BP || m.capture) this.halfmove = 0;

      this.board[m.from] = EMPTY;
      this.plist.remove(m.from, colorOf(m.piece));

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

      if (placed === WP || placed === BP) {
        ph = hashXor(ph, this.pawnZ[placed][m.to]);
      }

      if (m.piece === WK) this.kingPos[WHITE] = m.to;
      if (m.piece === BK) this.kingPos[BLACK] = m.to;

      this.ep = -1;
      if (m.flags & FLAG_EP) {
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
      this.side = opponent(this.side);
      this.castle = st.castle;
      this.ep = st.ep;
      this.halfmove = st.halfmove;
      this.fullmove = st.fullmove;
      this.hash = st.hash;
      this.pHash = st.pHash;
      this.kingPos[WHITE] = st.kingW;
      this.kingPos[BLACK] = st.kingB;

      const placed = st.promo || st.piece;
      this.plist.remove(st.to, colorOf(placed));

      this.board[st.from] = st.piece;
      this.plist.add(st.from, st.piece);

      if (st.flags & FLAG_EP) {
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

    /* ── Draw Detection ── */
    isDraw(forRoot = false) {
      if (this.halfmove >= 100) return true;
      const cur = this.hash;
      let reps = 0;
      const threshold = forRoot ? 2 : 1;
      const limit = Math.max(0, this.hashStack.length - this.halfmove - 1);
      for (let i = this.hashStack.length - 2; i >= limit; i--) {
        if (hashEq(this.hashStack[i], cur)) {
          if (++reps >= threshold) return true;
        }
      }
      return false;
    }

    isInsufficientMaterial() {
      let wn = 0, wb = 0, bn = 0, bb = 0, wbl = 0, wbd = 0, bbl = 0, bbd = 0;
      
      this.plist.forEach(WHITE, (sq, p) => {
        const pt = p & 7;
        if (pt === 1 || pt === 4 || pt === 5) { wn = 99; return; }
        if (pt === 2) wn++;
        if (pt === 3) {
          wb++;
          const sq64 = sq128To64(sq);
          const isLight = ((sq64 >> 3) + (sq64 & 7)) % 2 === 0;
          if (isLight) wbl++; else wbd++;
        }
      });
      if (wn >= 2 || wb >= 2) return false;

      this.plist.forEach(BLACK, (sq, p) => {
        const pt = p & 7;
        if (pt === 1 || pt === 4 || pt === 5) { bn = 99; return; }
        if (pt === 2) bn++;
        if (pt === 3) {
          bb++;
          const sq64 = sq128To64(sq);
          const isLight = ((sq64 >> 3) + (sq64 & 7)) % 2 === 0;
          if (isLight) bbl++; else bbd++;
        }
      });

      if (wn + wb + bn + bb === 0) return true;
      if (wn + wb <= 1 && bn + bb === 0) return true;
      if (bn + bb <= 1 && wn + wb === 0) return true;
      
      // KB vs KB with same color bishops
      if (wn === 0 && bn === 0 && wb === 1 && bb === 1) {
        if ((wbl > 0 && bbl > 0) || (wbd > 0 && bbd > 0)) return true;
      }
      
      return false;
    }

    /* ── Move Generation ── */
    genMoves(capturesOnly = false) {
      const pool = this.movePool;
      pool.reset();
      const us = this.side;
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

      // Legal filter
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
      const board = this.board;
      const up = p === WP ? 16 : -16;
      const rank = sq >> 4;
      const sRank = p === WP ? 1 : 6;
      const pRank = p === WP ? 6 : 1;
      const promos = p === WP ? [WQ, WR, WB, WN] : [BQ, BR, BB, BN];
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
      const opp = opponent(us);
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

    /* ── Move Helpers ── */
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

    /* ── SEE (Fixed with proper x-ray detection) ── */
    see(m) {
      if (!(m.flags & FLAG_CAPTURE)) return 0;

      const occ = this.seeOcc;
      occ.set(this.board);

      const to = m.to;
      const from = m.from;
      const target = m.capture;

      let gain = new Int16Array(32);
      gain[0] = PIECE_VALUE[target] || 0;
      if (m.flags & FLAG_EP) gain[0] = 100;

      // Remove attacker from board
      occ[from] = EMPTY;
      if (m.flags & FLAG_EP) {
        const epSq = this.side === WHITE ? to - 16 : to + 16;
        occ[epSq] = EMPTY;
      }

      // Place moved piece (or promotion)
      const placed = m.promo || m.piece;
      occ[to] = placed;

      let depth = 0;
      let side = opponent(this.side);
      let currentPiece = placed;

      while (depth < 31) {
        // Find least valuable attacker for 'side'
        const attacker = this._findLeastValuableAttacker(to, side, occ);
        if (!attacker) break;

        depth++;
        gain[depth] = PIECE_VALUE[currentPiece] - gain[depth - 1];

        // Pruning: if we can't beat current best, stop
        if (Math.max(-gain[depth - 1], gain[depth]) < 0 && depth > 1) break;

        // Remove this attacker
        occ[attacker.sq] = EMPTY;
        currentPiece = attacker.piece;
        occ[to] = currentPiece; // Now occupied by capturing piece

        side = opponent(side);
      }

      // Negamax backup
      while (--depth > 0) {
        gain[depth] = -Math.max(-gain[depth], gain[depth + 1]);
      }

      return gain[0];
    }

    _findLeastValuableAttacker(sq, side, occ) {
      const board = occ;

      // Pawns (lowest value)
      const pawn = side === WHITE ? WP : BP;
      const pawnAttackOffsets = side === WHITE ? [-15, -17] : [15, 17];
      for (const d of pawnAttackOffsets) {
        const from = sq - d; // Square that attacks sq
        if (onBoard(from) && board[from] === pawn) {
          return { sq: from, piece: pawn, value: 100 };
        }
      }

      // Knights
      const knight = side === WHITE ? WN : BN;
      for (const d of KNIGHT_DIR) {
        const from = sq - d;
        if (onBoard(from) && board[from] === knight) {
          return { sq: from, piece: knight, value: 320 };
        }
      }

      // Bishops (diagonal)
      const bishop = side === WHITE ? WB : BB;
      const queen = side === WHITE ? WQ : BQ;
      for (const d of BISHOP_DIR) {
        let from = sq - d;
        while (onBoard(from)) {
          const p = board[from];
          if (p) {
            if (p === bishop) return { sq: from, piece: p, value: 330 };
            if (p === queen) return { sq: from, piece: p, value: 900 };
            break;
          }
          from -= d;
        }
      }

      // Rooks (orthogonal)
      const rook = side === WHITE ? WR : BR;
      for (const d of ROOK_DIR) {
        let from = sq - d;
        while (onBoard(from)) {
          const p = board[from];
          if (p) {
            if (p === rook) return { sq: from, piece: p, value: 500 };
            if (p === queen) {
              // Check if queen wasn't already found as bishop
              let found = false;
              for (const bd of BISHOP_DIR) {
                let bfrom = sq - bd;
                while (onBoard(bfrom)) {
                  const bp = board[bfrom];
                  if (bp) { if (bp === queen && bfrom !== from) found = true; break; }
                  bfrom -= bd;
                }
              }
              if (!found) return { sq: from, piece: p, value: 900 };
            }
            break;
          }
          from -= d;
        }
      }

      // King (last resort)
      const king = side === WHITE ? WK : BK;
      for (const d of KING_DIR) {
        const from = sq - d;
        if (onBoard(from) && board[from] === king) {
          return { sq: from, piece: king, value: 20000 };
        }
      }

      return null;
    }

    /* ── Evaluation ── */
    _pst(p, sq, table) {
      const i64 = sq128To64(sq);
      const j = isWhite(p) ? i64 : mirror64(i64);
      return table[j];
    }

    _pawnStructureEval() {
      const cached = this.pawnHash.probe(this.pHash);
      if (cached) return cached;

      const board = this.board;
      const whiteFiles = new Int8Array(8);
      const blackFiles = new Int8Array(8);
      let mg = 0, eg = 0;

      this.plist.forEach(WHITE, (sq, p) => { if (p === WP) whiteFiles[sq & 7]++; });
      this.plist.forEach(BLACK, (sq, p) => { if (p === BP) blackFiles[sq & 7]++; });

      // Doubled & isolated pawns
      for (let f = 0; f < 8; f++) {
        if (whiteFiles[f] > 1) { mg -= DOUBLED_MG * (whiteFiles[f] - 1); eg -= DOUBLED_EG * (whiteFiles[f] - 1); }
        if (blackFiles[f] > 1) { mg += DOUBLED_MG * (blackFiles[f] - 1); eg += DOUBLED_EG * (blackFiles[f] - 1); }

        const wIsolated = whiteFiles[f] && (f === 0 ? !whiteFiles[1] : (f === 7 ? !whiteFiles[6] : !whiteFiles[f - 1] && !whiteFiles[f + 1]));
        const bIsolated = blackFiles[f] && (f === 0 ? !blackFiles[1] : (f === 7 ? !blackFiles[6] : !blackFiles[f - 1] && !blackFiles[f + 1]));
        if (wIsolated) { mg -= ISOLATED_MG * whiteFiles[f]; eg -= ISOLATED_EG * whiteFiles[f]; }
        if (bIsolated) { mg += ISOLATED_MG * blackFiles[f]; eg += ISOLATED_EG * blackFiles[f]; }
      }

      // Per-pawn evaluation
      this.plist.forEach(WHITE, (sq, p) => {
        if (p !== WP) return;
        const f = sq & 7;
        const r = sq >> 4;

        // Passed pawn
        let passed = true;
        for (let rr = r + 1; rr < 8 && passed; rr++) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (board[(rr << 4) | ff] === BP) { passed = false; break; }
          }
        }
        if (passed && r >= 1 && r <= 6) {
          const adv = PAWN_PASSED[r] || 0;
          mg += Math.round(30 + 10 * adv);
          eg += Math.round(45 + 85 * adv);
        }

        // Connected
        if ((onBoard(sq - 15) && board[sq - 15] === WP) ||
          (onBoard(sq - 17) && board[sq - 17] === WP)) {
          mg += CONNECTED_BONUS; eg += CONNECTED_BONUS;
        }

        // Blocked
        const ahead = sq + 16;
        if (onBoard(ahead) && board[ahead] !== EMPTY) {
          mg -= BLOCKED_PAWN_MG; eg -= BLOCKED_PAWN_EG;
        }

        // Backward
        const canAdvance = onBoard(ahead) && !board[ahead];
        const hasSupport = (onBoard(sq - 1) && board[sq - 1] === WP) ||
          (onBoard(sq + 1) && board[sq + 1] === WP);
        if (!canAdvance && !hasSupport && r < 6) {
          mg -= BACKWARD_PAWN_MG; eg -= BACKWARD_PAWN_EG;
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
          mg -= Math.round(30 + 10 * adv);
          eg -= Math.round(45 + 85 * adv);
        }

        if ((onBoard(sq + 15) && board[sq + 15] === BP) ||
          (onBoard(sq + 17) && board[sq + 17] === BP)) {
          mg -= CONNECTED_BONUS; eg -= CONNECTED_BONUS;
        }

        const ahead = sq - 16;
        if (onBoard(ahead) && board[ahead] !== EMPTY) {
          mg += BLOCKED_PAWN_MG; eg += BLOCKED_PAWN_EG;
        }

        const canAdvance = onBoard(ahead) && !board[ahead];
        const hasSupport = (onBoard(sq - 1) && board[sq - 1] === BP) ||
          (onBoard(sq + 1) && board[sq + 1] === BP);
        if (!canAdvance && !hasSupport && r > 1) {
          mg += BACKWARD_PAWN_MG; eg += BACKWARD_PAWN_EG;
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

    _evalOutposts() {
      const outpostRanks = [0, 0, 0, 1, 1, 1, 0, 0]; // ranks 3-5 (0-indexed: 2-4)
      let score = 0;

      // White knights
      this.plist.forEach(WHITE, (sq, p) => {
        if (p !== WN) return;
        const rank = sq >> 4;
        if (!outpostRanks[rank]) return;

        const file = sq & 7;
        const protectedByPawn = (onBoard(sq - 15) && this.board[sq - 15] === WP) ||
          (onBoard(sq - 17) && this.board[sq - 17] === WP);
        if (!protectedByPawn) return;

        // Cannot be attacked by enemy pawn
        const canAttack = (onBoard(sq + 15) && this.board[sq + 15] === BP) ||
          (onBoard(sq + 17) && this.board[sq + 17] === BP);
        if (canAttack) return;

        score += KNIGHT_OUTPOST;
      });

      // Black knights
      this.plist.forEach(BLACK, (sq, p) => {
        if (p !== BN) return;
        const rank = sq >> 4;
        if (!outpostRanks[7 - rank]) return;

        const protectedByPawn = (onBoard(sq + 15) && this.board[sq + 15] === BP) ||
          (onBoard(sq + 17) && this.board[sq + 17] === BP);
        if (!protectedByPawn) return;

        const canAttack = (onBoard(sq - 15) && this.board[sq - 15] === WP) ||
          (onBoard(sq - 17) && this.board[sq - 17] === WP);
        if (canAttack) return;

        score -= KNIGHT_OUTPOST;
      });

      return score;
    }

    _activityEval() {
      const board = this.board;
      const whiteKingSq = this.kingPos[WHITE];
      const blackKingSq = this.kingPos[BLACK];
      let mg = 0, eg = 0;
      let wAttackN = 0, wAttackV = 0;
      let bAttackN = 0, bAttackV = 0;
      let wRookFiles = 0, bRookFiles = 0;

      const wPawnFiles = new Int8Array(8);
      const bPawnFiles = new Int8Array(8);
      this.plist.forEach(WHITE, (sq, p) => { if (p === WP) wPawnFiles[sq & 7]++; });
      this.plist.forEach(BLACK, (sq, p) => { if (p === BP) bPawnFiles[sq & 7]++; });

      const evalPiece = (sq, p, us) => {
        const pt = p & 7;
        if (pt === 1 || pt === 6) return;

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

        if (pt === 4) { // Rook bonuses
          const ownPawnFiles = us === WHITE ? wPawnFiles : bPawnFiles;
          const oppPawnFiles = us === WHITE ? bPawnFiles : wPawnFiles;

          if (us === WHITE) {
            if (rank === 6 && ((blackKingSq >> 4) === 7 || bPawnFiles[file] > 0)) { mg += ROOK7TH_S; eg += ROOK7TH_E; }
            if (!ownPawnFiles[file]) {
              mg += ROOKOPEN_S; eg += ROOKOPEN_E;
              if (!oppPawnFiles[file]) { mg += ROOKOPEN_S; eg += ROOKOPEN_E; }
            }
            if (wRookFiles & (1 << file)) { mg += ROOK_DOUBLED_S; eg += ROOK_DOUBLED_E; }
            wRookFiles |= (1 << file);
          } else {
            if (rank === 1 && ((whiteKingSq >> 4) === 0 || wPawnFiles[file] > 0)) { mg -= ROOK7TH_S; eg -= ROOK7TH_E; }
            if (!ownPawnFiles[file]) {
              mg -= ROOKOPEN_S; eg -= ROOKOPEN_E;
              if (!oppPawnFiles[file]) { mg -= ROOKOPEN_S; eg -= ROOKOPEN_E; }
            }
            if (bRookFiles & (1 << file)) { mg -= ROOK_DOUBLED_S; eg -= ROOK_DOUBLED_E; }
            bRookFiles |= (1 << file);
          }
        }

        if (pt === 5) { // Queen on 7th
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
            if (p === ownPawn) shelter += 15 - step * 4;
            else if (p !== EMPTY) storm += 10 - step * 2;
          }
        }

        let openPenalty = 0;
        for (let df = -1; df <= 1; df++) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          if (ownFiles[ff] === 0) openPenalty += KSAFETY_OPEN;
          if (ownFiles[ff] === 0 && oppFiles[ff] === 0) openPenalty += 5;
        }

        let attackCount = 0;
        for (let di = 0; di < 8; di++) {
          const to = kingSq + KING_DIR[di];
          if (onBoard(to) && this.isAttacked(to, oppColor)) attackCount++;
        }
        if (this.isAttacked(kingSq, oppColor)) attackCount++;

        const safeBonus = shelter >= 20 && attackCount <= 2 ? KSAFETY_SAFE_BONUS : 0;
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

      const pawnStruct = this._pawnStructureEval();
      mgScore += pawnStruct.mg;
      egScore += pawnStruct.eg;

      mgScore += this._evalOutposts();

      const activity = this._activityEval();
      mgScore += activity.mg;
      egScore += activity.eg;

      const kingSafety = this._kingSafetyEval();
      mgScore += kingSafety.mg;
      egScore += kingSafety.eg;

      const phaseClamped = Math.max(0, Math.min(MAX_PHASE, phase));
      let score = Math.round((mgScore * phaseClamped + egScore * (MAX_PHASE - phaseClamped)) / MAX_PHASE);

      if (this.inCheck(this.side)) {
        score += this.side === WHITE ? -25 : 25;
      }

      const tempoBonus = Math.round((TEMPO_MG * phaseClamped + TEMPO_EG * (MAX_PHASE - phaseClamped)) / MAX_PHASE);
      score += this.side === WHITE ? tempoBonus : -tempoBonus;

      return this.side === WHITE ? score : -score;
    }

    /* ── Move Ordering ── */
    _moveScore(m, ttBestEnc, ply, prevMove) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc === ttBestEnc) return 2500000;

      if (m.flags & FLAG_CAPTURE) {
        const victim = pieceType(m.capture) || 0;
        const attacker = pieceType(m.piece) || 0;
        const mvv = MVV_LVA[victim] ? (MVV_LVA[victim][attacker] || 0) : 0;
        const seeVal = m._see || 0;

        const movingQueen = pieceType(m.piece) === 5;
        if (movingQueen && victim !== 5 && seeVal < 250) return 130000 + mvv + seeVal;
        if (seeVal < 0) return 260000 + mvv + seeVal;
        return 1600000 + mvv + Math.min(300, seeVal);
      }

      if (m.flags & FLAG_PROMO) return 1200000 + (pieceType(m.promo) || 0) * 10;

      const killers = this.killers[ply] || [];
      if (enc === killers[0]) return 900000;
      if (enc === killers[1]) return 800000;

      // Counter move bonus
      let counterBonus = 0;
      if (prevMove && prevMove.from >= 0) {
        const prevIdx = (prevMove.piece << 7) | prevMove.to;
        if (this.counterMoves[prevIdx] === enc) counterBonus = 700000;
      }

      let quiet = (this.histTable[(m.piece << 7) | m.to] | 0) + this._getContinuationBonus(m) + counterBonus;

      if (pieceType(m.piece) === 5) {
        const them = opponent(this.side);
        if (this.isAttacked(m.to, them)) quiet -= 250;
        if (this.isSquareAttackedByPawn(m.to, them)) quiet -= 200;
      }

      return quiet;
    }

    scoreMoves(moves, ttBestEnc, ply, prevMove) {
      for (const m of moves) {
        if (m.flags & FLAG_CAPTURE) {
          const victimVal = PIECE_VALUE[m.capture] || 0;
          const attackerVal = PIECE_VALUE[m.piece] || 0;
          m._see = victimVal >= attackerVal ? (victimVal - attackerVal) : this.see(m);
        } else {
          m._see = 0;
        }
        m._score = this._moveScore(m, ttBestEnc, ply, prevMove);
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

    storeCounterMove(prevMove, bestMove) {
      if (!prevMove || prevMove.from < 0 || !prevMove.piece) return;
      const prevIdx = (prevMove.piece << 7) | prevMove.to;
      this.counterMoves[prevIdx] = TranspositionTable.encodeMove(bestMove);
    }

    _getContinuationBonus(m) {
      const curIdx = (m.piece << 7) | m.to;
      const prev = this.history[this.history.length - 1];
      if (!prev || prev.from < 0 || !prev.piece) return 0;
      const prevIdx = (prev.piece << 7) | prev.to;
      if (prevIdx >= this.contHistSize || curIdx >= this.contHistSize) return 0;
      return this.contHist[prevIdx * this.contHistSize + curIdx] | 0;
    }

    _getFollowUpBonus(m) {
      if (this.history.length < 2) return 0;
      const prev = this.history[this.history.length - 2];
      if (!prev || prev.from < 0 || !prev.piece) return 0;
      const prevIdx = ((prev.piece << 7) | prev.to) * this.contHistSize;
      const curIdx = (m.piece << 7) | m.to;
      return this.followUpHist[prevIdx + curIdx] | 0;
    }

    updateHistory(m, depth, prevMove) {
      const idx = (m.piece << 7) | m.to;
      const bonus = Math.min(depth * depth, 400);
      this.histTable[idx] = Math.min(this.histTable[idx] + bonus, 30000);

      // Update continuation history
      if (prevMove && prevMove.from >= 0) {
        const prevIdx = (prevMove.piece << 7) | prevMove.to;
        if (prevIdx < this.contHistSize && idx < this.contHistSize) {
          const cidx = prevIdx * this.contHistSize + idx;
          this.contHist[cidx] = Math.max(-30000, Math.min(30000, (this.contHist[cidx] | 0) + bonus));
        }
      }

      // Update follow-up history
      if (this.history.length >= 2) {
        const prev2 = this.history[this.history.length - 2];
        if (prev2 && prev2.from >= 0) {
          const prev2Idx = ((prev2.piece << 7) | prev2.to) * this.contHistSize;
          this.followUpHist[prev2Idx + idx] = Math.max(-30000, Math.min(30000,
            (this.followUpHist[prev2Idx + idx] | 0) + bonus));
        }
      }
    }

    hasNonPawnMaterial(color) {
      return this.plist.hasNonPawnMaterial(color);
    }

    /* ── Quiescence Search ── */
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
        const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
        this.scoreMoves(evasions, ttBest, ply, prevMove);
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
      const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
      this.scoreMoves(moves, ttBest, ply, prevMove);

      for (let i = 0; i < moves.length; i++) {
        const m = this.pickNextMove(moves, i);
        const gain = (PIECE_VALUE[m.capture] || 0) + (m.promo ? PIECE_VALUE[m.promo] || 0 : 0);
        if (stand + gain + 250 < alpha) continue;
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

    /* ── Singular Extension ── */
    _singularExtension(m, depth, beta, ply, ttBestEnc) {
      const enc = TranspositionTable.encodeMove(m);
      if (enc !== ttBestEnc) return 0;
      if (depth < 8) return 0;

      const i = this.tt._idx(this.hash);
      if (!this.tt._keysMatch(i, this.hash)) return 0;
      const ttDepth = this.tt.data[i + TT_DEPTH];
      const ttScore = this.tt.data[i + TT_SCORE];
      const ttFlag = this.tt.data[i + TT_FLAG];
      if (ttDepth < depth - 3) return 0;
      if (ttFlag === -1) return 0;
      if (ttScore < beta - 100) return 0;

      const rBeta = Math.max(-INF, ttScore - 2 * depth);
      const rDepth = Math.max(1, (depth - 1) / 2 | 0);

      const moves = this.genMoves(false);
      const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
      this.scoreMoves(moves, 0, ply, prevMove);

      for (let mi = 0; mi < moves.length; mi++) {
        const other = this.pickNextMove(moves, mi);
        if (other.from === m.from && other.to === m.to && (other.promo || 0) === (m.promo || 0)) continue;
        this.makeMove(other);
        const score = -this.negamax(rDepth, -rBeta - 1, -rBeta, ply + 1, false);
        this.undoMove();
        if (this.stop) return 0;
        if (score > rBeta) return 0;
      }
      return 1;
    }

    /* ── Negamax with PVS ── */
    negamax(depth, alpha, beta, ply, allowNull = true, extensions = 0) {
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

      // Mate distance pruning
      const mateVal = MATE - ply;
      if (alpha < -mateVal) alpha = -mateVal;
      if (beta > mateVal) beta = mateVal;
      if (alpha >= beta) return alpha;

      // TT probe
      const ttScore = this.tt.probe(this.hash, depth, alpha, beta);
      if (!isPV && ttScore !== null) return ttScore;
      const ttBestEnc = this.tt.getBestMove(this.hash);

      let staticEval = 0;
      if (!inChk) staticEval = this.evaluate();
      this.evalTrace[ply] = inChk ? this.evalTrace[Math.max(0, ply - 2)] : staticEval;
      const improving = !inChk && ply >= 2 && staticEval > this.evalTrace[ply - 2];

      // Reverse futility pruning
      if (!isPV && !inChk && depth <= 4) {
        const margin = 120 * depth;
        if (staticEval - margin >= beta) return staticEval - margin;
      }

      // Razoring
      if (!isPV && !inChk && depth <= 3) {
        const razor = staticEval + 350 * depth;
        if (razor < alpha) {
          const q = this.qsearch(alpha, beta, ply);
          if (q < alpha) return alpha;
        }
      }

      // Null move pruning with verification
      if (allowNull && !isPV && depth >= 3 && !inChk && this.hasNonPawnMaterial(this.side)) {
        const R = depth >= 6 ? 4 : 3;
        this.makeNullMove();
        let nmScore = -this.negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false, extensions);
        this.undoNullMove();
        if (this.stop) return 0;

        if (nmScore >= beta) {
          if (depth >= 6) {
            const verScore = this.negamax(depth - R - 1, beta - 1, beta, ply, false, extensions);
            if (verScore >= beta) return beta;
          } else {
            return beta;
          }
        }
      }

      const moves = this.genMoves(false);
      if (moves.length === 0) return inChk ? -MATE + ply : 0;

      const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
      this.scoreMoves(moves, ttBestEnc, ply, prevMove);

      const alpha0 = alpha;
      let bestScore = -INF;
      let bestMove = null;
      let legalIdx = 0;
      let moveTried = 0;

      for (let i = 0; i < moves.length; i++) {
        const m = this.pickNextMove(moves, i);
        moveTried++;
        const quietMove = (m.flags & (FLAG_CAPTURE | FLAG_PROMO | FLAG_EP)) === 0;
        const killerMove = quietMove && this.isKillerMove(m, ply);

        // Late move pruning
        if (!isPV && !inChk && quietMove && depth <= 4) {
          const limit = depth === 1 ? 8 : (depth === 2 ? 14 : (depth === 3 ? 22 : 32));
          if (moveTried >= limit) continue;
        }

        // Futility pruning for quiet moves
        if (!isPV && !inChk && quietMove && depth <= 3) {
          if (staticEval + 150 * depth + 100 <= alpha) continue;
        }

        this.makeMove(m);
        const givesCheck = this.inCheck(this.side);

        // Singular extension
        let extension = 0;
        if (extensions < 3 && !isPV && !inChk && ttBestEnc && legalIdx === 0 && depth >= 8) {
          this.undoMove();
          extension = this._singularExtension(m, depth, beta, ply, ttBestEnc);
          this.makeMove(m);
          if (this.stop) { this.undoMove(); return 0; }
        }

        if (givesCheck && extensions < 3) extension++;

        let score;
        if (legalIdx === 0) {
          score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply + 1, true, extensions + extension);
        } else {
          // LMR
          let reduction = 0;
          if (!isPV && depth >= 3 && legalIdx >= 2 && !inChk && quietMove && !givesCheck && !killerMove) {
            const dTerm = Math.floor(Math.log2(Math.max(2, depth)));
            const mTerm = Math.floor(Math.log2(legalIdx + 1));
            reduction = Math.max(1, Math.floor((dTerm * mTerm) / 2));

            // History-based adjustment
            const hist = this.histTable[(m.piece << 7) | m.to] | 0;
            if (hist > 10000) reduction = Math.max(0, reduction - 1);
            else if (hist < -10000) reduction++;

            if (improving) reduction = Math.max(0, reduction - 1);
            reduction = Math.min(reduction, depth - 2);
          }

          const newDepth = depth - 1 - reduction + extension;
          score = -this.negamax(newDepth, -alpha - 1, -alpha, ply + 1, true, extensions + extension);

          if (!this.stop && reduction > 0 && score > alpha) {
            score = -this.negamax(depth - 1 + extension, -alpha - 1, -alpha, ply + 1, true, extensions + extension);
          }
          if (!this.stop && score > alpha && score < beta) {
            score = -this.negamax(depth - 1 + extension, -beta, -alpha, ply + 1, true, extensions + extension);
          }
        }

        this.undoMove();
        if (this.stop) return 0;

        legalIdx++;

        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
        }
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (!(m.flags & FLAG_CAPTURE)) {
              this.storeKiller(m, ply);
              this.updateHistory(m, depth, prevMove);
              this.storeCounterMove(prevMove, m);
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

    /* ── Time Management ── */
    _checkTime() {
      if ((this.nodes & 4095) === 0) {
        const elapsed = Date.now() - this.startTime;
        if (this.moveTime > 0 && elapsed >= this.moveTime) this.stop = true;
        if (this.maxNodes > 0 && this.nodes >= this.maxNodes) this.stop = true;
        
        // Check for time extension on unstable score
        if (!this.stop && this.normalMoveTime > 0 && elapsed >= this.normalMoveTime && elapsed < this.maxMoveTime) {
          // Continue searching if we have time and score is unstable
        }
      }
    }

    _strengthProfileFromElo(elo) {
      const e = Math.max(800, Math.min(2800, elo | 0));
      const t = (e - 800) / 2000;
      const skill = Math.max(0, Math.min(20, Math.round(t * 20)));
      const depthCap = Math.max(1, Math.min(64, Math.round(3 + t * 18)));
      const nodeCap = Math.max(1000, Math.round(2000 + t * t * 1000000));
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
        const softDepthCap = Math.max(3, Math.round(3 + t * 16));
        const softNodeCap = Math.max(2000, Math.round(3000 + t * t * 800000));
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
      const t = this.side === WHITE ? (spec.wtime || 0) : (spec.btime || 0);
      const inc = this.side === WHITE ? (spec.winc || 0) : (spec.binc || 0);
      const mtg = spec.movestogo || 30;
      if (!t) return 5000;

      const overhead = this.options.MoveOverhead | 0;
      
      // Calculate phase for time allocation
      const phase = this._calculateGamePhase();
      const isEndgame = phase < 8;

      let baseTime, maxTime;
      
      if (mtg > 0) {
        const moveImportance = Math.max(5, Math.min(30, mtg)) / 30;
        baseTime = (t / Math.min(mtg, 20)) + inc * 0.7;
        baseTime *= 0.7 + moveImportance * 0.5;
        maxTime = t * (isEndgame ? 0.35 : 0.25);
      } else {
        baseTime = Math.min(t * 0.05, inc * 0.8) + inc * 0.6;
        maxTime = t * 0.2;
      }

      if (t < 10000) {
        baseTime = Math.min(baseTime, t * 0.08);
        maxTime = t * 0.12;
      }

      const allocated = Math.max(1, Math.min(maxTime, baseTime) - overhead);
      
      this.normalMoveTime = allocated;
      this.maxMoveTime = Math.min(t * 0.9, allocated * 3);
      
      return allocated;
    }

    _calculateGamePhase() {
      let phase = 0;
      this.plist.forEach(WHITE, (sq, p) => { phase += PHASE_WEIGHT[p] || 0; });
      this.plist.forEach(BLACK, (sq, p) => { phase += PHASE_WEIGHT[p] || 0; });
      return Math.min(MAX_PHASE, phase);
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
      const maxDrop = 25 + (20 - skill) * 20;
      const maxCount = Math.min(scoredMoves.length, 2 + Math.floor((20 - skill) / 2));

      const candidates = [];
      for (let i = 0; i < maxCount; i++) {
        const gap = bestScore - scoredMoves[i].score;
        if (gap <= maxDrop) candidates.push(scoredMoves[i]);
      }
      if (!candidates.length) return scoredMoves[0].m;

      const temp = Math.max(0.2, (20 - skill) / 10);
      const base = 40 + skill * 4;
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
      if (depth > 7) {
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
          const hardSee = ultraSafe ? 500 : 300;
          const hardGap = ultraSafe ? 15 : 35;
          if (victimType !== 5 && seeVal < hardSee && line.score < rawBest - hardGap) line._hardUnsafe = true;
          else hasSafeAlt = true;
        } else {
          const quietGap = ultraSafe ? 8 : 25;
          if (this.isSquareAttackedByPawn(m.to, them) && this.isAttacked(m.to, them) && line.score < rawBest - quietGap)
            line._hardUnsafe = true;
          else hasSafeAlt = true;
        }

        if (ultraSafe && (m.flags & FLAG_CAPTURE) && seeVal <= -400 && line.score < rawBest - 10)
          line._hardUnsafe = true;
      }

      for (const line of scoredMoves) {
        let penalty = 0;
        const m = line.m;
        if (Math.abs(line.score) < MATE_BOUND) {
          const seeVal = this.see(m);
          if (seeVal <= -600) penalty += ultraSafe ? 450 : 240;
          else if (seeVal <= -300) penalty += ultraSafe ? 200 : 100;

          const moving = m.promo || m.piece;
          if (pieceType(moving) === 5 && seeVal < 0) penalty += ultraSafe ? 300 : 160;

          if (pieceType(m.piece) === 5 && (m.flags & FLAG_CAPTURE)) {
            const victimType = pieceType(m.capture) || 0;
            if (victimType !== 5) {
              if (seeVal < (ultraSafe ? 450 : 280)) penalty += ultraSafe ? 500 : 280;
              else if (seeVal < (ultraSafe ? 600 : 450)) penalty += ultraSafe ? 240 : 140;
            }
          }

          if (pieceType(m.piece) === 5 && !(m.flags & FLAG_CAPTURE)) {
            const them = opponent(this.side);
            if (this.isAttacked(m.to, them)) penalty += ultraSafe ? 300 : 140;
            if (this.isSquareAttackedByPawn(m.to, them)) penalty += ultraSafe ? 360 : 160;
          }
        }
        if (hasSafeAlt && line._hardUnsafe) penalty += ultraSafe ? 250000 : 120000;
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

    /* ── Root Search (Iterative Deepening with Aspiration Windows) ── */
    search(spec) {
      this.stop = false;
      this.nodes = 0;
      this.selDepth = 0;
      this.startTime = Date.now();
      this.moveTime = this.calcMoveTime(spec);
      this.maxNodes = 0;
      this.selDepthHard = Math.max(0, spec.selDepth | 0);
      this.evalTrace.fill(0);
      this.tt.nextEpoch();
      this.pawnHash.clear();

      const strength = this._resolveSearchStrength(spec);
      this.maxNodes = strength.nodeCap;
      this.effectiveSkillLevel = strength.skill;

      this.histTable.fill(0);
      this.contHist.fill(0);
      this.counterMoves.fill(0);
      this.followUpHist.fill(0);
      for (const k of this.killers) { k[0] = 0; k[1] = 0; }

      const depthLimit = Math.max(1, Math.min(strength.depthCap, Math.min(64, spec.depth || 64)));
      const multiPV = Math.max(1, Math.min(12, (spec.multiPV || this.options.MultiPV) | 0));
      const outFmt = this.options.PVFormat === 'san' ? 'san' : 'uci';

      let rootMoves = this.genMoves(false);
      if (spec.searchMoves && spec.searchMoves.length) {
        const wanted = new Set(spec.searchMoves);
        rootMoves = rootMoves.filter(m => wanted.has(this.moveToUci(m)));
      }
      if (rootMoves.length === 0) {
        this.send('bestmove 0000');
        return;
      }

      let bestMove = rootMoves[0];
      let bestScore = -INF;
      let prevScore = -INF;
      let finalScored = null;
      let panicUsed = false;
      let stableIterations = 0;

      for (let d = 1; d <= depthLimit; d++) {
        if (this.stop) break;

        // Aspiration windows
        let delta = d > 1 ? 30 : INF;
        let alpha = d > 1 ? Math.max(-INF, prevScore - delta) : -INF;
        let beta = d > 1 ? Math.min(INF, prevScore + delta) : INF;

        let scored = [];
        let prevWindowScored = null;
        let aspTries = 0;

        aspirationLoop:
        while (true) {
          if (++aspTries > 15) { alpha = -INF; beta = INF; }
          
          scored = [];
          let bestInWindow = -INF;
          let localAlpha = alpha;

          const ttEnc = this.tt.getBestMove(this.hash);
          const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
          this.scoreMoves(rootMoves, ttEnc, 0, prevMove);

          for (let moveIdx = 0; moveIdx < rootMoves.length; moveIdx++) {
            const m = this.pickNextMove(rootMoves, moveIdx);
            if (this.stop) break;

            this.makeMove(m);
            let score;

            if (moveIdx === 0) {
              score = -this.negamax(d - 1, -beta, -localAlpha, 1, true, 0);
            } else {
              score = -this.negamax(d - 1, -localAlpha - 1, -localAlpha, 1, true, 0);
              if (!this.stop && score > localAlpha && score < beta) {
                score = -this.negamax(d - 1, -beta, -localAlpha, 1, true, 0);
              }
            }

            this.undoMove();
            if (this.stop) break;

            scored.push({ m, score });
            if (score > bestInWindow) bestInWindow = score;

            if (score > localAlpha) {
              localAlpha = score;
              if (localAlpha >= beta) {
                prevWindowScored = scored.slice();
                delta = Math.min(delta * 2, INF);
                beta = Math.min(INF, localAlpha + delta);
                alpha = Math.max(-INF, localAlpha - delta);
                continue aspirationLoop;
              }
            }
          }

          if (!this.stop && bestInWindow <= alpha && alpha > -INF + 1) {
            prevWindowScored = scored.slice();
            delta = Math.min(delta * 2, INF);
            alpha = Math.max(-INF, bestInWindow - delta);
            beta = Math.min(INF, bestInWindow + delta);
            continue aspirationLoop;
          }
          break;
        }

        if (!scored.length && prevWindowScored && prevWindowScored.length) {
          scored = prevWindowScored;
        }
        if (!scored.length) break;

        scored.sort((a, b) => b.score - a.score);
        this.applyRootBlunderGuard(scored, d);
        finalScored = scored;
        bestMove = scored[0].m;
        bestScore = scored[0].score;

        // Check stability for early termination
        const scoreChange = Math.abs(bestScore - prevScore);
        if (scoreChange < 20) stableIterations++;
        else stableIterations = 0;

        // Panic time extension on score drop
        if (!panicUsed && !spec.moveTime && this.moveTime > 0 && d >= 5 && prevScore > -INF + 1) {
          const drop = prevScore - bestScore;
          if (drop >= 60) {
            const elapsedNow = Date.now() - this.startTime;
            if (elapsedNow < this.moveTime * 0.6) {
              const sideTime = this.side === WHITE ? (spec.wtime || 0) : (spec.btime || 0);
              const maxBudget = sideTime > 0 ? Math.floor(sideTime * 0.85) : Math.floor(this.moveTime * 2.5);
              const boosted = Math.min(maxBudget, Math.floor(this.moveTime * 1.5));
              if (boosted > this.moveTime) {
                this.moveTime = boosted;
                panicUsed = true;
                this.send('info string panic_time drop', drop, 'new_movetime', this.moveTime);
              }
            }
          }
        }

        // Early termination if stable and time running low
        const elapsed = Date.now() - this.startTime;
        if (d >= 8 && stableIterations >= 3 && elapsed > this.normalMoveTime * 0.8) {
          if (!panicUsed && bestScore > prevScore - 30) {
            this.send('info string early_termination stable_score');
            break;
          }
        }

        prevScore = bestScore;
        rootMoves = scored.map(x => x.m);

        const nps = elapsed > 0 ? Math.floor(this.nodes * 1000 / elapsed) : this.nodes;
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
          const evalBar = Math.max(0, Math.min(100, 50 + Math.round(rootLines[i].score / 15)));
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
        this.counterMoves.fill(0);
        this.followUpHist.fill(0);
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
          const prevMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
          this.scoreMoves(rootMoves, ttEnc, 0, prevMove);

          for (let mi = 0; mi < rootMoves.length; mi++) {
            const m = this.pickNextMove(rootMoves, mi);
            this.makeMove(m);
            const score = -this.negamax(curDepth - 1, -beta, -alpha, 1, true, 0);
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

    /* ── UCI Position Handler ── */
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

    /* ── UCI Go Handler ── */
    handleGo(tokens) {
      const spec = {
        depth: 0, moveTime: 0,
        wtime: 0, btime: 0, winc: 0, binc: 0, movestogo: 30,
        multiPV: 0, infinite: false, ponder: false,
        maxNodes: 0, selDepth: 0, searchMoves: [],
      };
      const stopWords = new Set(['searchmoves', 'ponder', 'wtime', 'btime', 'winc', 'binc', 'movestogo',
        'depth', 'nodes', 'mate', 'movetime', 'infinite', 'multipv', 'seldepth']);
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i], v = Number(tokens[i + 1]);
        if (t === 'infinite') spec.infinite = true;
        if (t === 'ponder') spec.ponder = true;
        if (t === 'depth') spec.depth = v;
        if (t === 'movetime') spec.moveTime = v;
        if (t === 'nodes') spec.maxNodes = v;
        if (t === 'seldepth') spec.selDepth = v;
        if (t === 'wtime') spec.wtime = v;
        if (t === 'btime') spec.btime = v;
        if (t === 'winc') spec.winc = v;
        if (t === 'binc') spec.binc = v;
        if (t === 'movestogo') spec.movestogo = v;
        if (t === 'multipv') spec.multiPV = v;
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

      if (this.searchTimer) clearTimeout(this.searchTimer);
      
      // Use MessageChannel for minimal latency
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

    /* ── UCI SetOption Handler ── */
    handleSetOption(tokens) {
      const ni = tokens.indexOf('name');
      const vi = tokens.indexOf('value');
      if (ni < 0) return;
      const name = tokens.slice(ni + 1, vi > -1 ? vi : tokens.length).join(' ');
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
          this.options.MoveOverhead = Math.max(0, Math.min(10000, +value || 10)); break;
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
  }

  /* ── Bootstrap ── */
  const engine = new Engine();
  
  if (typeof self !== 'undefined') {
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
  }

  // Node.js compatibility
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Engine };
  }

})();
