/**
 * Advanced JavaScript Chess Engine
 * Web Worker compatible, near-Stockfish architecture
 */

// ============================================================================
// 1. BITBOARD UTILITIES & CONSTANTS
// ============================================================================

const Bitboard = {
  // Precomputed bitboards
  FILES: [0x101010101010101n, 0x202020202020202n, 0x404040404040404n, 0x808080808080808n,
          0x1010101010101010n, 0x2020202020202020n, 0x4040404040404040n, 0x8080808080808080n],
  
  RANKS: [0xFFn, 0xFF00n, 0xFF0000n, 0xFF000000n, 
          0xFF00000000n, 0xFF0000000000n, 0xFF000000000000n, 0xFF00000000000000n],
  
  // Square index to bitboard
  SQ: Array(64).fill(0n).map((_, i) => 1n << BigInt(i)),
  
  // Directions
  N: 8n, S: -8n, E: 1n, W: -1n,
  NE: 9n, NW: 7n, SE: -7n, SW: -9n,
  
  // Piece values
  PIECE_VALUES: { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 },
  
  // Game phases
  PHASE_VALUES: { P: 0, N: 1, B: 1, R: 2, Q: 4, K: 0 },
  TOTAL_PHASE: 24,
  
  // Zobrist keys for hashing
  ZOBRIST: {
    pieces: {},
    side: 0n,
    castling: Array(16).fill(0n),
    ep: Array(64).fill(0n)
  },
  
  // Initialize Zobrist keys
  initZobrist() {
    const random64 = () => BigInt(Math.floor(Math.random() * 2**32)) << 32n | 
                              BigInt(Math.floor(Math.random() * 2**32));
    
    // Piece keys
    for (let color of ['w', 'b']) {
      this.ZOBRIST.pieces[color] = {};
      for (let piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
        this.ZOBRIST.pieces[color][piece] = Array(64).fill(0n).map(() => random64());
      }
    }
    
    // Side to move
    this.ZOBRIST.side = random64();
    
    // Castling keys
    for (let i = 0; i < 16; i++) {
      this.ZOBRIST.castling[i] = random64();
    }
    
    // En passant keys
    for (let i = 0; i < 64; i++) {
      this.ZOBRIST.ep[i] = random64();
    }
  },
  
  // Helper functions
  popcnt: (bb) => {
    let count = 0;
    while (bb) {
      count++;
      bb &= bb - 1n;
    }
    return count;
  },
  
  lsb: (bb) => {
    return Number((bb & -bb).toString());
  },
  
  msb: (bb) => {
    let pos = 0;
    while (bb) {
      pos++;
      bb >>= 1n;
    }
    return pos - 1;
  },
  
  bitscan: (bb) => {
    if (!bb) return -1;
    return Bitboard.msb(bb & -bb);
  }
};

// Initialize Zobrist keys
Bitboard.initZobrist();

// ============================================================================
// 2. BOARD REPRESENTATION
// ============================================================================

class Board {
  constructor() {
    this.pieces = {
      w: { P: 0n, N: 0n, B: 0n, R: 0n, Q: 0n, K: 0n },
      b: { P: 0n, N: 0n, B: 0n, R: 0n, Q: 0n, K: 0n }
    };
    this.occupied = 0n;
    this.empty = ~0n;
    this.side = 'w';
    this.castling = { w: { k: false, q: false }, b: { k: false, q: false } };
    this.ep = -1; // En passant square index
    this.halfmove = 0;
    this.fullmove = 1;
    this.hash = 0n;
    this.history = [];
    this.attackMaps = { w: 0n, b: 0n };
    this.kingSquares = { w: 4, b: 60 };
  }
  
  updateHash() {
    let hash = 0n;
    
    // Hash pieces
    for (let color of ['w', 'b']) {
      for (let piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
        let bb = this.pieces[color][piece];
        while (bb) {
          const sq = Bitboard.bitscan(bb);
          bb &= bb - 1n;
          hash ^= Bitboard.ZOBRIST.pieces[color][piece][sq];
        }
      }
    }
    
    // Hash side to move
    if (this.side === 'b') {
      hash ^= Bitboard.ZOBRIST.side;
    }
    
    // Hash castling rights
    let castlingIndex = 0;
    if (this.castling.w.k) castlingIndex |= 1;
    if (this.castling.w.q) castlingIndex |= 2;
    if (this.castling.b.k) castlingIndex |= 4;
    if (this.castling.b.q) castlingIndex |= 8;
    hash ^= Bitboard.ZOBRIST.castling[castlingIndex];
    
    // Hash en passant
    if (this.ep >= 0) {
      hash ^= Bitboard.ZOBRIST.ep[this.ep];
    }
    
    this.hash = hash;
  }
  
  fromFen(fen) {
    const parts = fen.split(' ');
    const ranks = parts[0].split('/');
    
    // Reset board
    this.pieces = {
      w: { P: 0n, N: 0n, B: 0n, R: 0n, Q: 0n, K: 0n },
      b: { P: 0n, N: 0n, B: 0n, R: 0n, Q: 0n, K: 0n }
    };
    
    let sq = 56; // Start from a8
    for (let rank of ranks) {
      for (let char of rank) {
        if (char >= '1' && char <= '8') {
          sq += parseInt(char);
        } else {
          const color = char === char.toUpperCase() ? 'w' : 'b';
          const piece = char.toUpperCase();
          this.pieces[color][piece] |= Bitboard.SQ[sq];
          if (piece === 'K') this.kingSquares[color] = sq;
          sq++;
        }
      }
      sq -= 16; // Move to next rank
    }
    
    this.side = parts[1] || 'w';
    this.castling = { w: { k: false, q: false }, b: { k: false, q: false } };
    if (parts[2]) {
      for (let c of parts[2]) {
        if (c === 'K') this.castling.w.k = true;
        if (c === 'Q') this.castling.w.q = true;
        if (c === 'k') this.castling.b.k = true;
        if (c === 'q') this.castling.b.q = true;
      }
    }
    
    this.ep = parts[3] && parts[3] !== '-' ? 
      'abcdefgh'.indexOf(parts[3][0]) + (parseInt(parts[3][1]) - 1) * 8 : -1;
    
    this.halfmove = parseInt(parts[4]) || 0;
    this.fullmove = parseInt(parts[5]) || 1;
    
    this.updateOccupancy();
    this.generateAttackMaps();
    this.updateHash();
  }
  
  toFen() {
    let fen = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        const piece = this.getPieceAt(sq);
        if (piece) {
          if (empty > 0) {
            fen += empty;
            empty = 0;
          }
          const symbol = piece.color === 'w' ? piece.type : piece.type.toLowerCase();
          fen += symbol;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (rank > 0) fen += '/';
    }
    
    fen += ` ${this.side} `;
    
    let castling = '';
    if (this.castling.w.k) castling += 'K';
    if (this.castling.w.q) castling += 'Q';
    if (this.castling.b.k) castling += 'k';
    if (this.castling.b.q) castling += 'q';
    fen += castling || '-';
    
    fen += ' ';
    if (this.ep >= 0) {
      const file = this.ep % 8;
      const rank = Math.floor(this.ep / 8);
      fen += String.fromCharCode(97 + file) + (rank + 1);
    } else {
      fen += '-';
    }
    
    fen += ` ${this.halfmove} ${this.fullmove}`;
    return fen;
  }
  
  getPieceAt(sq) {
    const bb = Bitboard.SQ[sq];
    for (let color of ['w', 'b']) {
      for (let piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
        if (this.pieces[color][piece] & bb) {
          return { type: piece, color };
        }
      }
    }
    return null;
  }
  
  updateOccupancy() {
    this.occupied = 0n;
    for (let color of ['w', 'b']) {
      for (let piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
        this.occupied |= this.pieces[color][piece];
      }
    }
    this.empty = ~this.occupied & 0xFFFFFFFFFFFFFFFFn;
  }
  
  generateAttackMaps() {
    this.attackMaps = { w: 0n, b: 0n };
    
    for (let color of ['w', 'b']) {
      const opponent = color === 'w' ? 'b' : 'w';
      let attacks = 0n;
      
      // Pawn attacks
      const pawns = this.pieces[color].P;
      if (color === 'w') {
        attacks |= (pawns << 7n) & ~Bitboard.FILES[7];
        attacks |= (pawns << 9n) & ~Bitboard.FILES[0];
      } else {
        attacks |= (pawns >> 7n) & ~Bitboard.FILES[0];
        attacks |= (pawns >> 9n) & ~Bitboard.FILES[7];
      }
      
      // Knight attacks
      let knights = this.pieces[color].N;
      while (knights) {
        const sq = Bitboard.bitscan(knights);
        knights &= knights - 1n;
        attacks |= this.generateKnightAttacks(sq);
      }
      
      // Bishop attacks
      let bishops = this.pieces[color].B;
      while (bishops) {
        const sq = Bitboard.bitscan(bishops);
        bishops &= bishops - 1n;
        attacks |= this.generateSlidingAttacks(sq, this.generateBishopMask(sq), this.occupied);
      }
      
      // Rook attacks
      let rooks = this.pieces[color].R;
      while (rooks) {
        const sq = Bitboard.bitscan(rooks);
        rooks &= rooks - 1n;
        attacks |= this.generateSlidingAttacks(sq, this.generateRookMask(sq), this.occupied);
      }
      
      // Queen attacks
      let queens = this.pieces[color].Q;
      while (queens) {
        const sq = Bitboard.bitscan(queens);
        queens &= queens - 1n;
        attacks |= this.generateSlidingAttacks(sq, this.generateBishopMask(sq), this.occupied) |
                   this.generateSlidingAttacks(sq, this.generateRookMask(sq), this.occupied);
      }
      
      // King attacks
      const kingSq = this.kingSquares[color];
      attacks |= this.generateKingAttacks(kingSq);
      
      this.attackMaps[color] = attacks;
    }
  }
  
  generateKnightAttacks(sq) {
    const bb = Bitboard.SQ[sq];
    let attacks = 0n;
    
    if ((bb << 17n) & ~Bitboard.FILES[0]) attacks |= bb << 17n;
    if ((bb << 15n) & ~Bitboard.FILES[7]) attacks |= bb << 15n;
    if ((bb << 10n) & ~Bitboard.FILES[0] & ~Bitboard.FILES[1]) attacks |= bb << 10n;
    if ((bb << 6n) & ~Bitboard.FILES[6] & ~Bitboard.FILES[7]) attacks |= bb << 6n;
    if ((bb >> 6n) & ~Bitboard.FILES[0] & ~Bitboard.FILES[1]) attacks |= bb >> 6n;
    if ((bb >> 10n) & ~Bitboard.FILES[6] & ~Bitboard.FILES[7]) attacks |= bb >> 10n;
    if ((bb >> 15n) & ~Bitboard.FILES[0]) attacks |= bb >> 15n;
    if ((bb >> 17n) & ~Bitboard.FILES[7]) attacks |= bb >> 17n;
    
    return attacks;
  }
  
  generateKingAttacks(sq) {
    const bb = Bitboard.SQ[sq];
    let attacks = 0n;
    
    if (bb << 8n) attacks |= bb << 8n;
    if (bb >> 8n) attacks |= bb >> 8n;
    if ((bb << 1n) & ~Bitboard.FILES[0]) attacks |= bb << 1n;
    if ((bb >> 1n) & ~Bitboard.FILES[7]) attacks |= bb >> 1n;
    if ((bb << 7n) & ~Bitboard.FILES[7]) attacks |= bb << 7n;
    if ((bb << 9n) & ~Bitboard.FILES[0]) attacks |= bb << 9n;
    if ((bb >> 7n) & ~Bitboard.FILES[0]) attacks |= bb >> 7n;
    if ((bb >> 9n) & ~Bitboard.FILES[7]) attacks |= bb >> 9n;
    
    return attacks;
  }
  
  generateBishopMask(sq) {
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    let mask = 0n;
    
    for (let r = rank + 1, f = file + 1; r < 7 && f < 7; r++, f++) {
      mask |= Bitboard.SQ[r * 8 + f];
    }
    for (let r = rank - 1, f = file + 1; r > 0 && f < 7; r--, f++) {
      mask |= Bitboard.SQ[r * 8 + f];
    }
    for (let r = rank + 1, f = file - 1; r < 7 && f > 0; r++, f--) {
      mask |= Bitboard.SQ[r * 8 + f];
    }
    for (let r = rank - 1, f = file - 1; r > 0 && f > 0; r--, f--) {
      mask |= Bitboard.SQ[r * 8 + f];
    }
    
    return mask;
  }
  
  generateRookMask(sq) {
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    let mask = 0n;
    
    for (let r = rank + 1; r < 7; r++) mask |= Bitboard.SQ[r * 8 + file];
    for (let r = rank - 1; r > 0; r--) mask |= Bitboard.SQ[r * 8 + file];
    for (let f = file + 1; f < 7; f++) mask |= Bitboard.SQ[rank * 8 + f];
    for (let f = file - 1; f > 0; f--) mask |= Bitboard.SQ[rank * 8 + f];
    
    return mask;
  }
  
  generateSlidingAttacks(sq, mask, occupied) {
    // For now, generate attacks on the fly - magic bitboards would be more efficient
    return this.generateSlidingAttacksOnFly(sq);
  }
  
  generateSlidingAttacksOnFly(sq) {
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    let attacks = 0n;
    const opponent = this.side === 'w' ? 'b' : 'w';
    
    // Bishop-like moves (diagonals)
    for (let r = rank + 1, f = file + 1; r < 8 && f < 8; r++, f++) {
      const targetSq = r * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let r = rank - 1, f = file + 1; r >= 0 && f < 8; r--, f++) {
      const targetSq = r * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let r = rank + 1, f = file - 1; r < 8 && f >= 0; r++, f--) {
      const targetSq = r * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let r = rank - 1, f = file - 1; r >= 0 && f >= 0; r--, f--) {
      const targetSq = r * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    
    // Rook-like moves (orthogonal)
    for (let r = rank + 1; r < 8; r++) {
      const targetSq = r * 8 + file;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let r = rank - 1; r >= 0; r--) {
      const targetSq = r * 8 + file;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let f = file + 1; f < 8; f++) {
      const targetSq = rank * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    for (let f = file - 1; f >= 0; f--) {
      const targetSq = rank * 8 + f;
      attacks |= Bitboard.SQ[targetSq];
      if (this.occupied & Bitboard.SQ[targetSq]) break;
    }
    
    return attacks;
  }
  
  isSquareAttacked(sq, attacker) {
    return (this.attackMaps[attacker] & Bitboard.SQ[sq]) !== 0n;
  }
  
  isInCheck(color) {
    const kingSq = this.kingSquares[color];
    const opponent = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingSq, opponent);
  }
}

// ============================================================================
// 3. MOVE REPRESENTATION
// ============================================================================

class Move {
  constructor(from, to, promotion = null, capture = null, isCastling = false) {
    this.from = from;
    this.to = to;
    this.promotion = promotion;
    this.capture = capture;
    this.isCastling = isCastling;
    this.score = 0; // For move ordering
  }
  
  toString() {
    const fromFile = String.fromCharCode(97 + (this.from % 8));
    const fromRank = Math.floor(this.from / 8) + 1;
    const toFile = String.fromCharCode(97 + (this.to % 8));
    const toRank = Math.floor(this.to / 8) + 1;
    
    let moveStr = `${fromFile}${fromRank}${toFile}${toRank}`;
    if (this.promotion) {
      moveStr += this.promotion.toLowerCase();
    }
    return moveStr;
  }
}

// ============================================================================
// 4. MOVE GENERATION
// ============================================================================

class MoveGenerator {
  constructor(board) {
    this.board = board;
  }
  
  generateLegalMoves() {
    const pseudoLegal = this.generatePseudoLegalMoves();
    const legal = [];
    
    for (let move of pseudoLegal) {
      if (this.isLegalMove(move)) {
        legal.push(move);
      }
    }
    
    return legal;
  }
  
  generatePseudoLegalMoves() {
    const moves = [];
    const color = this.board.side;
    const opponent = color === 'w' ? 'b' : 'w';
    
    // Generate moves for each piece type
    this.generatePawnMoves(moves, color);
    this.generateKnightMoves(moves, color);
    this.generateBishopMoves(moves, color);
    this.generateRookMoves(moves, color);
    this.generateQueenMoves(moves, color);
    this.generateKingMoves(moves, color);
    
    return moves;
  }
  
  generatePawnMoves(moves, color) {
    const pawns = this.board.pieces[color].P;
    const opponent = color === 'w' ? 'b' : 'w';
    const forward = color === 'w' ? 8 : -8;
    const startRank = color === 'w' ? 1 : 6;
    const promotionRank = color === 'w' ? 7 : 0;
    
    let p = pawns;
    while (p) {
      const from = Bitboard.bitscan(p);
      p &= p - 1n;
      
      const rank = Math.floor(from / 8);
      const file = from % 8;
      
      // Single push
      const to = from + forward;
      if (to >= 0 && to < 64 && !(this.board.occupied & Bitboard.SQ[to])) {
        if (rank === promotionRank) {
          // Promotion
          for (let promo of ['Q', 'R', 'B', 'N']) {
            moves.push(new Move(from, to, promo));
          }
        } else {
          moves.push(new Move(from, to));
          
          // Double push from starting rank
          if (rank === startRank) {
            const to2 = from + 2 * forward;
            if (!(this.board.occupied & Bitboard.SQ[to2])) {
              moves.push(new Move(from, to2));
            }
          }
        }
      }
      
      // Captures
      const captureLeft = from + forward - 1;
      const captureRight = from + forward + 1;
      
      if (file > 0 && captureLeft >= 0 && captureLeft < 64) {
        if (this.board.pieces[opponent].P & Bitboard.SQ[captureLeft] ||
            captureLeft === this.board.ep) {
          if (rank === promotionRank) {
            for (let promo of ['Q', 'R', 'B', 'N']) {
              moves.push(new Move(from, captureLeft, promo));
            }
          } else {
            moves.push(new Move(from, captureLeft));
          }
        }
      }
      
      if (file < 7 && captureRight >= 0 && captureRight < 64) {
        if (this.board.pieces[opponent].P & Bitboard.SQ[captureRight] ||
            captureRight === this.board.ep) {
          if (rank === promotionRank) {
            for (let promo of ['Q', 'R', 'B', 'N']) {
              moves.push(new Move(from, captureRight, promo));
            }
          } else {
            moves.push(new Move(from, captureRight));
          }
        }
      }
    }
  }
  
  generateKnightMoves(moves, color) {
    let knights = this.board.pieces[color].N;
    while (knights) {
      const from = Bitboard.bitscan(knights);
      knights &= knights - 1n;
      
      const attacks = this.board.generateKnightAttacks(from);
      let a = attacks & ~this.board.pieces[color].P & ~this.board.pieces[color].N & 
              ~this.board.pieces[color].B & ~this.board.pieces[color].R & 
              ~this.board.pieces[color].Q & ~this.board.pieces[color].K;
      
      while (a) {
        const to = Bitboard.bitscan(a);
        a &= a - 1n;
        const capture = this.board.getPieceAt(to);
        moves.push(new Move(from, to, null, capture));
      }
    }
  }
  
  generateBishopMoves(moves, color) {
    let bishops = this.board.pieces[color].B;
    while (bishops) {
      const from = Bitboard.bitscan(bishops);
      bishops &= bishops - 1n;
      
      const attacks = this.board.generateSlidingAttacksOnFly(from);
      let a = attacks & ~this.board.pieces[color].P & ~this.board.pieces[color].N & 
              ~this.board.pieces[color].B & ~this.board.pieces[color].R & 
              ~this.board.pieces[color].Q & ~this.board.pieces[color].K;
      
      while (a) {
        const to = Bitboard.bitscan(a);
        a &= a - 1n;
        const capture = this.board.getPieceAt(to);
        moves.push(new Move(from, to, null, capture));
      }
    }
  }
  
  generateRookMoves(moves, color) {
    let rooks = this.board.pieces[color].R;
    while (rooks) {
      const from = Bitboard.bitscan(rooks);
      rooks &= rooks - 1n;
      
      const attacks = this.board.generateSlidingAttacksOnFly(from);
      let a = attacks & ~this.board.pieces[color].P & ~this.board.pieces[color].N & 
              ~this.board.pieces[color].B & ~this.board.pieces[color].R & 
              ~this.board.pieces[color].Q & ~this.board.pieces[color].K;
      
      while (a) {
        const to = Bitboard.bitscan(a);
        a &= a - 1n;
        const capture = this.board.getPieceAt(to);
        moves.push(new Move(from, to, null, capture));
      }
    }
  }
  
  generateQueenMoves(moves, color) {
    let queens = this.board.pieces[color].Q;
    while (queens) {
      const from = Bitboard.bitscan(queens);
      queens &= queens - 1n;
      
      const attacks = this.board.generateSlidingAttacksOnFly(from);
      let a = attacks & ~this.board.pieces[color].P & ~this.board.pieces[color].N & 
              ~this.board.pieces[color].B & ~this.board.pieces[color].R & 
              ~this.board.pieces[color].Q & ~this.board.pieces[color].K;
      
      while (a) {
        const to = Bitboard.bitscan(a);
        a &= a - 1n;
        const capture = this.board.getPieceAt(to);
        moves.push(new Move(from, to, null, capture));
      }
    }
  }
  
  generateKingMoves(moves, color) {
    const from = this.board.kingSquares[color];
    const attacks = this.board.generateKingAttacks(from);
    
    let a = attacks & ~this.board.pieces[color].P & ~this.board.pieces[color].N & 
            ~this.board.pieces[color].B & ~this.board.pieces[color].R & 
            ~this.board.pieces[color].Q & ~this.board.pieces[color].K;
    
    while (a) {
      const to = Bitboard.bitscan(a);
      a &= a - 1n;
      const capture = this.board.getPieceAt(to);
      moves.push(new Move(from, to, null, capture));
    }
    
    // Castling
    if (!this.board.isInCheck(color)) {
      this.generateCastlingMoves(moves, color);
    }
  }
  
  generateCastlingMoves(moves, color) {
    const rank = color === 'w' ? 0 : 7;
    const kingFrom = rank * 8 + 4;
    
    // Kingside
    if (this.board.castling[color].k) {
      const path = Bitboard.SQ[rank * 8 + 5] | Bitboard.SQ[rank * 8 + 6];
      const between = Bitboard.SQ[rank * 8 + 5] | Bitboard.SQ[rank * 8 + 6];
      
      if ((this.board.occupied & between) === 0n) {
        const opponent = color === 'w' ? 'b' : 'w';
        let safe = true;
        for (let sq of [kingFrom, rank * 8 + 5, rank * 8 + 6]) {
          if (this.board.isSquareAttacked(sq, opponent)) {
            safe = false;
            break;
          }
        }
        if (safe) {
          moves.push(new Move(kingFrom, rank * 8 + 6));
        }
      }
    }
    
    // Queenside
    if (this.board.castling[color].q) {
      const between = Bitboard.SQ[rank * 8 + 1] | Bitboard.SQ[rank * 8 + 2] | Bitboard.SQ[rank * 8 + 3];
      
      if ((this.board.occupied & between) === 0n) {
        const opponent = color === 'w' ? 'b' : 'w';
        let safe = true;
        for (let sq of [kingFrom, rank * 8 + 3, rank * 8 + 2]) {
          if (this.board.isSquareAttacked(sq, opponent)) {
            safe = false;
            break;
          }
        }
        if (safe) {
          moves.push(new Move(kingFrom, rank * 8 + 2));
        }
      }
    }
  }
  
  isLegalMove(move) {
    // Make move
    const undo = this.makeMove(move);
    
    // Check if king is in check
    const inCheck = this.board.isInCheck(this.board.side === 'w' ? 'b' : 'w');
    
    // Undo move
    this.undoMove(move, undo);
    
    return !inCheck;
  }
  
  makeMove(move) {
    const color = this.board.side;
    const opponent = color === 'w' ? 'b' : 'w';
    
    const undo = {
      capture: null,
      castling: JSON.parse(JSON.stringify(this.board.castling)),
      ep: this.board.ep,
      halfmove: this.board.halfmove,
      kingSquares: { ...this.board.kingSquares }
    };
    
    const fromPiece = this.board.getPieceAt(move.from);
    if (!fromPiece || fromPiece.color !== color) return null;
    
    // Remove piece from source
    this.board.pieces[color][fromPiece.type] &= ~Bitboard.SQ[move.from];
    
    // Handle capture
    const targetPiece = this.board.getPieceAt(move.to);
    if (targetPiece) {
      this.board.pieces[targetPiece.color][targetPiece.type] &= ~Bitboard.SQ[move.to];
      undo.capture = targetPiece;
    }
    
    // Handle en passant
    if (fromPiece.type === 'P' && move.to === this.board.ep) {
      const epPawnSq = color === 'w' ? move.to - 8 : move.to + 8;
      this.board.pieces[opponent].P &= ~Bitboard.SQ[epPawnSq];
      undo.capture = { type: 'P', color: opponent };
    }
    
    // Place piece at destination
    const promotion = move.promotion || fromPiece.type;
    this.board.pieces[color][promotion] |= Bitboard.SQ[move.to];
    
    // Handle special moves
    if (fromPiece.type === 'K') {
      this.board.kingSquares[color] = move.to;
      
      // Castling
      if (Math.abs(move.to - move.from) === 2) {
        if (move.to > move.from) { // Kingside
          const rookFrom = move.from + 3;
          const rookTo = move.from + 1;
          this.board.pieces[color].R &= ~Bitboard.SQ[rookFrom];
          this.board.pieces[color].R |= Bitboard.SQ[rookTo];
        } else { // Queenside
          const rookFrom = move.from - 4;
          const rookTo = move.from + 1;
          this.board.pieces[color].R &= ~Bitboard.SQ[rookFrom];
          this.board.pieces[color].R |= Bitboard.SQ[rookTo];
        }
      }
      
      // Update castling rights
      this.board.castling[color].k = false;
      this.board.castling[color].q = false;
    }
    
    if (fromPiece.type === 'R') {
      const rank = Math.floor(move.from / 8);
      const file = move.from % 8;
      if (rank === (color === 'w' ? 0 : 7)) {
        if (file === 0) this.board.castling[color].q = false;
        if (file === 7) this.board.castling[color].k = false;
      }
    }
    
    // Update en passant target
    this.board.ep = -1;
    if (fromPiece.type === 'P' && Math.abs(move.to - move.from) === 16) {
      this.board.ep = move.from + forward / 2;
    }
    
    this.board.updateOccupancy();
    this.board.generateAttackMaps();
    
    return undo;
  }
  
  undoMove(move, undo) {
    const color = this.board.side === 'w' ? 'b' : 'w';
    const opponent = this.board.side;
    
    const toPiece = this.board.getPieceAt(move.to);
    if (!toPiece) return;
    
    // Remove piece from destination
    const promotion = move.promotion || toPiece.type;
    this.board.pieces[color][promotion] &= ~Bitboard.SQ[move.to];
    
    // Restore captured piece
    if (undo.capture) {
      this.board.pieces[undo.capture.color][undo.capture.type] |= Bitboard.SQ[move.to];
    }
    
    // Restore piece at source
    this.board.pieces[color][toPiece.type] |= Bitboard.SQ[move.from];
    
    // Handle castling
    if (toPiece.type === 'K' && Math.abs(move.to - move.from) === 2) {
      if (move.to > move.from) { // Kingside
        const rookFrom = move.from + 1;
        const rookTo = move.from + 3;
        this.board.pieces[color].R &= ~Bitboard.SQ[rookFrom];
        this.board.pieces[color].R |= Bitboard.SQ[rookTo];
      } else { // Queenside
        const rookFrom = move.from + 1;
        const rookTo = move.from - 4;
        this.board.pieces[color].R &= ~Bitboard.SQ[rookFrom];
        this.board.pieces[color].R |= Bitboard.SQ[rookTo];
      }
    }
    
    // Restore state
    this.board.castling = undo.castling;
    this.board.ep = undo.ep;
    this.board.halfmove = undo.halfmove;
    this.board.kingSquares = undo.kingSquares;
    
    this.board.updateOccupancy();
    this.board.generateAttackMaps();
  }
}

// ============================================================================
// 5. EVALUATION
// ============================================================================

class Evaluator {
  constructor() {
    // Piece-square tables (simplified - in production, use tuned tables)
    this.pst = {
      w: {
        P: [0, 0, 0, 0, 0, 0, 0, 0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
            5, 5, 10, 25, 25, 10, 5, 5,
            0, 0, 0, 20, 20, 0, 0, 0,
            5, -5, -10, 0, 0, -10, -5, 5,
            5, 10, 10, -20, -20, 10, 10, 5,
            0, 0, 0, 0, 0, 0, 0, 0],
        N: [-50, -40, -30, -30, -30, -30, -40, -50,
            -40, -20, 0, 0, 0, 0, -20, -40,
            -30, 0, 10, 15, 15, 10, 0, -30,
            -30, 5, 15, 20, 20, 15, 5, -30,
            -30, 0, 15, 20, 20, 15, 0, -30,
            -30, 5, 10, 15, 15, 10, 5, -30,
            -40, -20, 0, 5, 5, 0, -20, -40,
            -50, -40, -30, -30, -30, -30, -40, -50],
        B: [-20, -10, -10, -10, -10, -10, -10, -20,
            -10, 0, 0, 0, 0, 0, 0, -10,
            -10, 0, 5, 10, 10, 5, 0, -10,
            -10, 5, 5, 10, 10, 5, 5, -10,
            -10, 0, 10, 10, 10, 10, 0, -10,
            -10, 10, 10, 10, 10, 10, 10, -10,
            -10, 5, 0, 0, 0, 0, 5, -10,
            -20, -10, -10, -10, -10, -10, -10, -20],
        R: [0, 0, 0, 0, 0, 0, 0, 0,
            5, 10, 10, 10, 10, 10, 10, 5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            0, 0, 0, 5, 5, 0, 0, 0],
        Q: [-20, -10, -10, -5, -5, -10, -10, -20,
            -10, 0, 0, 0, 0, 0, 0, -10,
            -10, 0, 5, 5, 5, 5, 0, -10,
            -5, 0, 5, 5, 5, 5, 0, -5,
            0, 0, 5, 5, 5, 5, 0, -5,
            -10, 5, 5, 5, 5, 5, 0, -10,
            -10, 0, 5, 0, 0, 0, 0, -10,
            -20, -10, -10, -5, -5, -10, -10, -20],
        K: [-30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -20, -30, -30, -40, -40, -30, -30, -20,
            -10, -20, -20, -20, -20, -20, -20, -10,
            20, 20, 0, 0, 0, 0, 20, 20,
            20, 30, 10, 0, 0, 10, 30, 20]
      },
      b: {} // Will be mirrored
    };
    
    // Mirror PST for black
    for (let piece in this.pst.w) {
      this.pst.b[piece] = [];
      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const sq = rank * 8 + file;
          const mirroredSq = (7 - rank) * 8 + file;
          this.pst.b[piece][sq] = -this.pst.w[piece][mirroredSq];
        }
      }
    }
  }
  
  evaluate(board) {
    let score = 0;
    let phase = 0;
    
    const mgScore = this.evaluatePhase(board, 'midgame');
    const egScore = this.evaluatePhase(board, 'endgame');
    
    // Calculate game phase
    for (let color of ['w', 'b']) {
      for (let piece of ['N', 'B', 'R', 'Q']) {
        phase += Bitboard.popcnt(board.pieces[color][piece]) * Bitboard.PHASE_VALUES[piece];
      }
    }
    
    phase = Math.min(phase, Bitboard.TOTAL_PHASE);
    const egPhase = phase;
    const mgPhase = Bitboard.TOTAL_PHASE - egPhase;
    
    score = (mgScore * mgPhase + egScore * egPhase) / Bitboard.TOTAL_PHASE;
    
    return board.side === 'w' ? score : -score;
  }
  
  evaluatePhase(board, phase) {
    let score = 0;
    
    for (let color of ['w', 'b']) {
      const sign = color === 'w' ? 1 : -1;
      
      // Material and PST
      for (let piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
        let pieces = board.pieces[color][piece];
        while (pieces) {
          const sq = Bitboard.bitscan(pieces);
          pieces &= pieces - 1n;
          
          score += sign * Bitboard.PIECE_VALUES[piece];
          score += sign * this.pst[color][piece][sq];
        }
      }
      
      // Pawn structure
      score += sign * this.evaluatePawnStructure(board, color);
      
      // Piece coordination
      score += sign * this.evaluatePieceCoordination(board, color);
      
      // King safety
      score += sign * this.evaluateKingSafety(board, color);
    }
    
    return score;
  }
  
  evaluatePawnStructure(board, color) {
    let score = 0;
    const pawns = board.pieces[color].P;
    const opponent = color === 'w' ? 'b' : 'w';
    
    let p = pawns;
    while (p) {
      const sq = Bitboard.bitscan(p);
      p &= p - 1n;
      
      const file = sq % 8;
      const rank = Math.floor(sq / 8);
      
      // Isolated pawn
      const fileMask = Bitboard.FILES[file];
      const adjacentFiles = (file > 0 ? Bitboard.FILES[file - 1] : 0n) | 
                           (file < 7 ? Bitboard.FILES[file + 1] : 0n);
      
      if ((pawns & adjacentFiles) === 0n) {
        score -= 20;
      }
      
      // Doubled pawn
      if (Bitboard.popcnt(pawns & fileMask) > 1) {
        score -= 15;
      }
      
      // Passed pawn
      const forwardMask = color === 'w' ? 
        ~0n << BigInt(sq + 8) : 
        ~((1n << BigInt(sq)) - 1n);
      
      const opponentPawns = board.pieces[opponent].P;
      const passed = (opponentPawns & forwardMask & adjacentFiles) === 0n;
      
      if (passed) {
        score += 30 + rank * 10;
      }
      
      // Backward pawn (simplified)
      const backward = (pawns & adjacentFiles & (color === 'w' ? 
        Bitboard.RANKS[rank - 1] : Bitboard.RANKS[rank + 1])) === 0n;
      
      if (backward && !passed) {
        score -= 10;
      }
    }
    
    return score;
  }
  
  evaluatePieceCoordination(board, color) {
    let score = 0;
    
    // Bishop pair
    if (Bitboard.popcnt(board.pieces[color].B) >= 2) {
      score += 30;
    }
    
    // Rook on open file
    let rooks = board.pieces[color].R;
    while (rooks) {
      const sq = Bitboard.bitscan(rooks);
      rooks &= rooks - 1n;
      const file = sq % 8;
      
      const fileMask = Bitboard.FILES[file];
      if ((board.pieces[color].P & fileMask) === 0n) {
        score += 20;
        if ((board.pieces[color === 'w' ? 'b' : 'w'].P & fileMask) === 0n) {
          score += 10; // Fully open file
        }
      }
    }
    
    // Knight outposts (simplified)
    let knights = board.pieces[color].N;
    while (knights) {
      const sq = Bitboard.bitscan(knights);
      knights &= knights - 1n;
      
      const rank = Math.floor(sq / 8);
      const file = sq % 8;
      
      if (color === 'w' && rank >= 3 && rank <= 5) {
        if ((board.attackMaps[color] & Bitboard.SQ[sq]) && 
            !(board.attackMaps[color === 'w' ? 'b' : 'w'].P & Bitboard.SQ[sq])) {
          score += 20;
        }
      }
      if (color === 'b' && rank >= 2 && rank <= 4) {
        if ((board.attackMaps[color] & Bitboard.SQ[sq]) && 
            !(board.attackMaps[color === 'w' ? 'b' : 'w'].P & Bitboard.SQ[sq])) {
          score += 20;
        }
      }
    }
    
    return score;
  }
  
  evaluateKingSafety(board, color) {
    let score = 0;
    const kingSq = board.kingSquares[color];
    const opponent = color === 'w' ? 'b' : 'w';
    
    // King shield (simplified)
    const kingAttacks = board.generateKingAttacks(kingSq);
    const pawnShield = kingAttacks & board.pieces[color].P;
    score += Bitboard.popcnt(pawnShield) * 10;
    
    // Attacks on king
    const attackWeight = Bitboard.popcnt(board.attackMaps[opponent] & kingAttacks);
    score -= attackWeight * 15;
    
    return score;
  }
}

// ============================================================================
// 6. TRANSPOSITION TABLE
// ============================================================================

class TTEntry {
  constructor() {
    this.hash = 0n;
    this.depth = 0;
    this.score = 0;
    this.flag = 0; // 0 = exact, 1 = alpha, 2 = beta
    this.move = null;
    this.age = 0;
  }
}

class TranspositionTable {
  constructor(size = 32) { // Size in MB
    this.size = size * 1024 * 1024;
    this.entries = new Array(Math.floor(this.size / 24)); // ~24 bytes per entry
    this.age = 0;
    this.mask = this.entries.length - 1;
    
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i] = new TTEntry();
    }
  }
  
  index(hash) {
    return Number(hash & BigInt(this.mask));
  }
  
  store(hash, depth, score, flag, move, ply) {
    const idx = this.index(hash);
    const entry = this.entries[idx];
    
    // Replace if deeper or same age
    if (depth >= entry.depth || entry.age !== this.age) {
      entry.hash = hash;
      entry.depth = depth;
      entry.score = this.encodeScore(score, ply);
      entry.flag = flag;
      entry.move = move;
      entry.age = this.age;
    }
  }
  
  probe(hash, depth, alpha, beta, ply) {
    const idx = this.index(hash);
    const entry = this.entries[idx];
    
    if (entry.hash === hash) {
      const score = this.decodeScore(entry.score, ply);
      
      if (entry.depth >= depth) {
        if (entry.flag === 0) return { score, move: entry.move, flag: 'exact' };
        if (entry.flag === 1 && score <= alpha) return { score, move: entry.move, flag: 'alpha' };
        if (entry.flag === 2 && score >= beta) return { score, move: entry.move, flag: 'beta' };
      }
      
      return { move: entry.move, flag: 'none' };
    }
    
    return null;
  }
  
  encodeScore(score, ply) {
    if (Math.abs(score) > 9000) {
      return score + (score > 0 ? ply : -ply);
    }
    return score;
  }
  
  decodeScore(score, ply) {
    if (Math.abs(score) > 9000) {
      return score - (score > 0 ? ply : -ply);
    }
    return score;
  }
  
  newSearch() {
    this.age++;
  }
}

// ============================================================================
// 7. SEARCH
// ============================================================================

class Searcher {
  constructor(board, tt) {
    this.board = board;
    this.tt = tt;
    this.evaluator = new Evaluator();
    this.moveGenerator = new MoveGenerator(board);
    
    // History heuristic
    this.history = {
      w: Array(64).fill(null).map(() => Array(64).fill(0)),
      b: Array(64).fill(null).map(() => Array(64).fill(0))
    };
    
    // Killer moves
    this.killerMoves = Array(64).fill(null).map(() => [null, null]);
    
    // Search parameters
    this.nodes = 0;
    this.stop = false;
    this.startTime = 0;
    this.maxTime = 0;
    this.pvLine = [];
    this.pvTable = Array(64).fill(null).map(() => []);
  }
  
  search(depth, timeLimit = 3000) {
    this.nodes = 0;
    this.stop = false;
    this.startTime = Date.now();
    this.maxTime = timeLimit;
    this.tt.newSearch();
    
    let bestMove = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;
    
    // Aspiration windows
    const aspirationWindow = 25;
    
    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      this.pvLine = [];
      
      if (currentDepth > 4) {
        alpha = bestScore - aspirationWindow;
        beta = bestScore + aspirationWindow;
      }
      
      let score = this.negamax(currentDepth, alpha, beta, 0, true);
      
      // Aspiration window fail-low
      if (score <= alpha) {
        alpha = -Infinity;
        score = this.negamax(currentDepth, alpha, beta, 0, true);
      }
      
      // Aspiration window fail-high
      if (score >= beta) {
        beta = Infinity;
        score = this.negamax(currentDepth, alpha, beta, 0, true);
      }
      
      bestScore = score;
      bestMove = this.pvLine[0];
      
      // Send info to UI
      const elapsed = Date.now() - this.startTime;
      self.postMessage({
        type: 'info',
        depth: currentDepth,
        score: bestScore,
        nodes: this.nodes,
        time: elapsed,
        nps: Math.floor(this.nodes / (elapsed / 1000)),
        pv: this.pvLine.map(m => m.toString()).join(' ')
      });
      
      if (this.stop) break;
      
      // Time check
      if (elapsed > this.maxTime * 0.8) break;
    }
    
    return {
      move: bestMove,
      score: bestScore,
      depth: depth,
      nodes: this.nodes,
      time: Date.now() - this.startTime
    };
  }
  
  negamax(depth, alpha, beta, ply, isPv) {
    this.nodes++;
    
    // Time check
    if ((this.nodes & 0x3FF) === 0) {
      if (Date.now() - this.startTime > this.maxTime) {
        this.stop = true;
        return 0;
      }
    }
    
    const originalAlpha = alpha;
    const inCheck = this.board.isInCheck(this.board.side);
    
    // Check extension
    if (inCheck) depth++;
    
    // Transposition table probe
    const ttEntry = this.tt.probe(this.board.hash, depth, alpha, beta, ply);
    if (ttEntry && !isPv && ttEntry.flag !== 'none') {
      if (ttEntry.flag === 'exact') return ttEntry.score;
      if (ttEntry.flag === 'alpha' && ttEntry.score <= alpha) return alpha;
      if (ttEntry.flag === 'beta' && ttEntry.score >= beta) return beta;
    }
    
    // Static evaluation
    let staticEval = this.evaluator.evaluate(this.board);
    
    // Null move pruning (avoid zugzwang)
    if (depth >= 2 && !inCheck && !isPv && this.board.occupied) {
      const R = 2 + Math.floor(depth / 4);
      
      // Make null move
      const side = this.board.side;
      this.board.side = this.board.side === 'w' ? 'b' : 'w';
      this.board.generateAttackMaps();
      
      const nullScore = -this.negamax(depth - R - 1, -beta, -beta + 1, ply + 1, false);
      
      // Undo null move
      this.board.side = side;
      this.board.generateAttackMaps();
      
      if (nullScore >= beta) {
        return beta;
      }
    }
    
    // Quiescence search
    if (depth <= 0) {
      return this.quiescence(alpha, beta, ply);
    }
    
    // Generate moves
    const moves = this.moveGenerator.generateLegalMoves();
    
    if (moves.length === 0) {
      if (inCheck) return -10000 + ply; // Checkmate
      return 0; // Stalemate
    }
    
    // Move ordering
    this.orderMoves(moves, ttEntry?.move, ply);
    
    let bestScore = -Infinity;
    let bestMove = null;
    let movesSearched = 0;
    
    for (let move of moves) {
      const undo = this.moveGenerator.makeMove(move);
      if (!undo) continue;
      
      let score;
      if (movesSearched === 0) {
        // Principal variation search
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, isPv);
      } else {
        // LMR
        let reduction = 0;
        if (depth >= 3 && movesSearched >= 3 && !inCheck && !move.capture) {
          reduction = Math.floor(Math.log2(depth) * Math.log2(movesSearched));
          reduction = Math.min(reduction, depth - 1);
        }
        
        score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, false);
        
        if (score > alpha && reduction > 0) {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, false);
        }
        
        if (score > alpha && score < beta) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      
      this.moveGenerator.undoMove(move, undo);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        
        if (ply === 0) {
          this.pvLine = [move, ...this.pvTable[ply + 1]];
        }
        
        if (score > alpha) {
          alpha = score;
          
          // Update PV table
          this.pvTable[ply] = [move, ...this.pvTable[ply + 1]];
          
          if (score >= beta) {
            // Update killer moves and history
            if (!move.capture) {
              this.killerMoves[ply][1] = this.killerMoves[ply][0];
              this.killerMoves[ply][0] = move;
              this.history[this.board.side][move.from][move.to] += depth * depth;
            }
            break;
          }
        }
      }
      
      movesSearched++;
      if (this.stop) break;
    }
    
    // Transposition table store
    const flag = bestScore <= originalAlpha ? 1 : (bestScore >= beta ? 2 : 0);
    this.tt.store(this.board.hash, depth, bestScore, flag, bestMove, ply);
    
    return bestScore;
  }
  
  quiescence(alpha, beta, ply) {
    this.nodes++;
    
    // Time check
    if ((this.nodes & 0x3FF) === 0) {
      if (Date.now() - this.startTime > this.maxTime) {
        this.stop = true;
        return 0;
      }
    }
    
    const standPat = this.evaluator.evaluate(this.board);
    
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
    
    const inCheck = this.board.isInCheck(this.board.side);
    
    // Generate tactical moves
    const moves = this.generateTacticalMoves();
    
    if (moves.length === 0) {
      if (inCheck) return -10000 + ply;
      return standPat;
    }
    
    this.orderMoves(moves, null, ply);
    
    for (let move of moves) {
      // Delta pruning
      const captureValue = move.capture ? Bitboard.PIECE_VALUES[move.capture.type] : 0;
      if (standPat + captureValue + 200 < alpha) continue;
      
      const undo = this.moveGenerator.makeMove(move);
      if (!undo) continue;
      
      const score = -this.quiescence(-beta, -alpha, ply + 1);
      this.moveGenerator.undoMove(move, undo);
      
      if (score > alpha) {
        alpha = score;
        if (score >= beta) return beta;
      }
      
      if (this.stop) break;
    }
    
    return alpha;
  }
  
  generateTacticalMoves() {
    const moves = [];
    const color = this.board.side;
    const opponent = color === 'w' ? 'b' : 'w';
    
    // Generate captures and checks
    const pseudoMoves = this.moveGenerator.generatePseudoLegalMoves();
    
    for (let move of pseudoMoves) {
      const undo = this.moveGenerator.makeMove(move);
      if (!undo) continue;
      
      const givesCheck = this.board.isInCheck(opponent);
      this.moveGenerator.undoMove(move, undo);
      
      if (move.capture || givesCheck || move.promotion) {
        moves.push(move);
      }
    }
    
    return moves;
  }
  
  orderMoves(moves, ttMove, ply) {
    const color = this.board.side;
    
    for (let move of moves) {
      move.score = 0;
      
      // TT move
      if (ttMove && move.from === ttMove.from && move.to === ttMove.to) {
        move.score = 1000000;
        continue;
      }
      
      // MVV-LVA for captures
      if (move.capture) {
        const victim = Bitboard.PIECE_VALUES[move.capture.type];
        const attacker = 100; // Simplified
        move.score = 100000 + victim * 10 - attacker;
        continue;
      }
      
      // Killer moves
      if (this.killerMoves[ply][0] && 
          move.from === this.killerMoves[ply][0].from && 
          move.to === this.killerMoves[ply][0].to) {
        move.score = 50000;
        continue;
      }
      
      if (this.killerMoves[ply][1] && 
          move.from === this.killerMoves[ply][1].from && 
          move.to === this.killerMoves[ply][1].to) {
        move.score = 40000;
        continue;
      }
      
      // History heuristic
      move.score = this.history[color][move.from][move.to];
    }
    
    moves.sort((a, b) => b.score - a.score);
  }
}

// ============================================================================
// 8. WEB WORKER INTERFACE
// ============================================================================

class ChessEngine {
  constructor() {
    this.board = new Board();
    this.tt = new TranspositionTable(64); // 64MB TT
    this.searcher = null;
    this.isSearching = false;
  }
  
  handleMessage(event) {
    const data = event.data;
    
    switch (data.type) {
      case 'init':
        this.board.fromFen(data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        break;
        
      case 'search':
        if (this.isSearching) {
          self.postMessage({ type: 'error', message: 'Already searching' });
          return;
        }
        
        this.isSearching = true;
        this.search(data.depth || 10, data.time || 3000);
        break;
        
      case 'stop':
        if (this.searcher) {
          this.searcher.stop = true;
        }
        break;
        
      case 'position':
        this.board.fromFen(data.fen);
        break;
        
      case 'ping':
        self.postMessage({ type: 'pong' });
        break;
        
      default:
        self.postMessage({ type: 'error', message: 'Unknown command' });
    }
  }
  
  search(depth, timeLimit) {
    try {
      this.searcher = new Searcher(this.board, this.tt);
      const result = this.searcher.search(depth, timeLimit);
      
      self.postMessage({
        type: 'bestmove',
        move: result.move ? result.move.toString() : '(none)',
        score: result.score,
        depth: result.depth,
        nodes: result.nodes,
        time: result.time,
        nps: Math.floor(result.nodes / (result.time / 1000))
      });
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error.message,
        stack: error.stack
      });
    } finally {
      this.isSearching = false;
    }
  }
}

// Initialize engine
const engine = new ChessEngine();

// Worker message handler
self.onmessage = function(event) {
  engine.handleMessage(event);
};

// ============================================================================
// 9. TAMPERMONKEY INTEGRATION HELPER
// ============================================================================

// This section can be used to create a Tampermonkey userscript wrapper
// Example usage:
/*
// ==UserScript==
// @name         Chess Engine Worker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Advanced chess engine for analysis
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    const workerCode = `...engine code here...`;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = function(event) {
        console.log('Engine:', event.data);
    };
    
    worker.postMessage({ type: 'init', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
    worker.postMessage({ type: 'search', depth: 10, time: 3000 });
})();
*/
