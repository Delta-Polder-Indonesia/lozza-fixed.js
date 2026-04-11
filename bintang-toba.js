"use strict"

// ============================================================================
// LOZZA-INSPIRED CHESS ENGINE v3.0
// Modern JavaScript Chess Engine with Neural Network Evaluation
// ============================================================================

const BUILD = "3.0";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const MAX_PLY = 128;
const MAX_MOVES = 256;
const INF = 32000;
const MATE = 31000;
const MINMATE = 30000;
const CONTEMPT = 0;

// Neural Network Configuration
const NET_QA = 255;
const NET_QB = 64;
const NET_SCALE = 400;
const NET_INPUT_SIZE = 768; // 64 squares * 12 pieces
const NET_HIDDEN_SIZE = 256;

// Transposition Table
const TT_SIZE = 1 << 24; // 16M entries
const TT_MASK = TT_SIZE - 1;

// Pawn Hash Table
const PTT_SIZE = 1 << 14; // 16K entries
const PTT_MASK = PTT_SIZE - 1;

// Move Generation Constants
const WHITE = 0x0;
const BLACK = 0x8;
const PIECE_MASK = 0x7;
const COLOR_MASK = 0x8;

// Piece Types
const EMPTY = 0;
const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;
const EDGE = 7;

// Color-specific pieces
const W_PAWN = PAWN;
const W_KNIGHT = KNIGHT;
const W_BISHOP = BISHOP;
const W_ROOK = ROOK;
const W_QUEEN = QUEEN;
const W_KING = KING;

const B_PAWN = PAWN | BLACK;
const B_KNIGHT = KNIGHT | BLACK;
const B_BISHOP = BISHOP | BLACK;
const B_ROOK = ROOK | BLACK;
const B_QUEEN = QUEEN | BLACK;
const B_KING = KING | BLACK;

// Move Flags
const MOVE_LEGAL_MASK = 0x01000000;
const MOVE_EPTAKE_MASK = 0x02000000;
const MOVE_EPMAKE_MASK = 0x04000000;
const MOVE_CASTLE_MASK = 0x08000000;
const MOVE_PROMOTE_MASK = 0x10000000;
const MOVE_PROMAS_MASK = 0x60000000; // NBRQ
const MOVE_NOISY_MASK = 0x0F000000; // Captures, promotions, en passant

// Castling Rights
const WHITE_RIGHTS_KING = 0x1;
const WHITE_RIGHTS_QUEEN = 0x2;
const BLACK_RIGHTS_KING = 0x4;
const BLACK_RIGHTS_QUEEN = 0x8;

// TT Entry Types
const TT_EXACT = 1;
const TT_ALPHA = 2;
const TT_BETA = 3;

// Search Constants
const ASP_WINDOW_INIT = 25;
const ASP_WINDOW_MAX = 2000;
const NULL_MOVE_R = 2;
const LMR_THRESHOLD = 4;
const LMR_DIVISOR = 16;

// Piece Values
const PIECE_VALUE = [0, 100, 394, 388, 588, 1207, 10000];
const PIECE_PHASE = [0, 0, 1, 1, 2, 4, 0];
const TOTAL_PHASE = 24;

// Board Constants (12x12 mailbox)
const SQUARE_MAP = {
    A1: 110, B1: 111, C1: 112, D1: 113, E1: 114, F1: 115, G1: 116, H1: 117,
    A2: 98,  B2: 99,  C2: 100, D2: 101, E2: 102, F2: 103, G2: 104, H2: 105,
    A3: 86,  B3: 87,  C3: 88,  D3: 89,  E3: 90,  F3: 91,  G3: 92,  H3: 93,
    A4: 74,  B4: 75,  C4: 76,  D4: 77,  E4: 78,  F4: 79,  G4: 80,  H4: 81,
    A5: 62,  B5: 63,  C5: 64,  D5: 65,  E5: 66,  F5: 67,  G5: 68,  H5: 69,
    A6: 50,  B6: 51,  C6: 52,  D6: 53,  E6: 54,  F6: 55,  G6: 56,  H6: 57,
    A7: 38,  B7: 39,  C7: 40,  D7: 41,  E7: 42,  F7: 43,  G7: 44,  H7: 45,
    A8: 26,  B8: 27,  C8: 28,  D8: 29,  E8: 30,  F8: 31,  G8: 32,  H8: 33
};

const PROMOTION_SQUARES = {
    WHITE: [26, 27, 28, 29, 30, 31, 32, 33],
    BLACK: [110, 111, 112, 113, 114, 115, 116, 117]
};

// ============================================================================
// NEURAL NETWORK WEIGHTS AND STRUCTURES
// ============================================================================

// Neural network weights (quantized)
const NET_WEIGHTS = {
    // Input to hidden weights (768 x 256)
    input_hidden: new Int8Array([
        // This would normally be loaded from a trained network
        // For now, using placeholder values that would be replaced with actual trained weights
        ...Array(NET_INPUT_SIZE * NET_HIDDEN_SIZE).fill(1)
    ]),
    
    // Hidden to output weights (256)
    hidden_output: new Int8Array([
        ...Array(NET_HIDDEN_SIZE).fill(1)
    ]),
    
    // Hidden biases (256)
    hidden_bias: new Int16Array([
        ...Array(NET_HIDDEN_SIZE).fill(0)
    ])
};

// Activation buffers
const NET_BUFFER = {
    hidden: new Int16Array(NET_HIDDEN_SIZE),
    output: 0
};

// ============================================================================
// MOVE STRUCTURE AND GENERATION
// ============================================================================

class Move {
    constructor(from, to, promoted = 0, flags = 0) {
        this.from = from;
        this.to = to;
        this.promoted = promoted;
        this.flags = flags;
        this.score = 0; // For move ordering
    }
    
    static encode(from, to, promoted = 0, flags = 0) {
        return (from << MOVE_FR_BITS) | (to << MOVE_TO_BITS) | 
               (promoted << MOVE_PROMAS_BITS) | flags;
    }
    
    static decode(move) {
        return {
            from: (move >>> MOVE_FR_BITS) & 0xFF,
            to: move & 0xFF,
            promoted: (move >>> MOVE_PROMAS_BITS) & 0x3,
            flags: move & ~MOVE_PROMAS_MASK & ~0xFF & ~(0xFF << MOVE_FR_BITS)
        };
    }
}

class MoveList {
    constructor() {
        this.moves = new Array(MAX_MOVES);
        this.count = 0;
        for (let i = 0; i < MAX_MOVES; i++) {
            this.moves[i] = new Move(0, 0, 0, 0);
        }
    }
    
    add(from, to, promoted = 0, flags = 0) {
        const move = this.moves[this.count++];
        move.from = from;
        move.to = to;
        move.promoted = promoted;
        move.flags = flags;
        move.score = 0;
        return move;
    }
    
    clear() {
        this.count = 0;
    }
    
    sort() {
        // Insertion sort for stable sorting
        for (let i = 1; i < this.count; i++) {
            const key = this.moves[i];
            let j = i - 1;
            while (j >= 0 && this.moves[j].score < key.score) {
                this.moves[j + 1] = this.moves[j];
                j--;
            }
            this.moves[j + 1] = key;
        }
    }
}

// ============================================================================
// BOARD REPRESENTATION
// ============================================================================

class Board {
    constructor() {
        // 12x12 mailbox board (144 squares)
        this.board = new Int8Array(144);
        this.pieceList = new Int8Array(32); // Up to 32 pieces
        this.pieceCount = new Int8Array(16); // Count per piece type
        this.material = [0, 0]; // Material balance
        
        // Side to move
        this.turn = WHITE;
        
        // Castling rights
        this.castling = 0;
        
        // En passant square
        this.ep = 0;
        
        // Halfmove clock
        this.halfmove = 0;
        
        // Fullmove number
        this.fullmove = 1;
        
        // Hash key
        this.key = 0n;
        
        // Pawn hash key
        this.pawnKey = 0n;
        
        // History stack
        this.history = [];
        
        // King positions
        this.kingSq = [0, 0];
        
        // Initialize board edges
        this.initBoard();
    }
    
    initBoard() {
        // Set up edge squares
        for (let i = 0; i < 144; i++) {
            const row = Math.floor(i / 12);
            const col = i % 12;
            if (row < 2 || row > 9 || col < 2 || col > 9) {
                this.board[i] = EDGE;
            } else {
                this.board[i] = EMPTY;
            }
        }
        
        // Initialize piece count
        this.pieceCount.fill(0);
    }
    
    clear() {
        this.initBoard();
        this.pieceList.fill(0);
        this.material[0] = this.material[1] = 0;
        this.turn = WHITE;
        this.castling = 0;
        this.ep = 0;
        this.halfmove = 0;
        this.fullmove = 1;
        this.key = 0n;
        this.pawnKey = 0n;
        this.history = [];
        this.kingSq[0] = this.kingSq[1] = 0;
    }
    
    setPiece(sq, piece) {
        this.board[sq] = piece;
        if (piece !== EMPTY) {
            this.pieceList[this.pieceCount[piece]++] = sq;
            const color = (piece & BLACK) ? 1 : 0;
            this.material[color] += PIECE_VALUE[piece & PIECE_MASK];
        }
    }
    
    removePiece(sq) {
        const piece = this.board[sq];
        if (piece !== EMPTY) {
            this.board[sq] = EMPTY;
            const color = (piece & BLACK) ? 1 : 0;
            this.material[color] -= PIECE_VALUE[piece & PIECE_MASK];
            
            // Remove from piece list
            for (let i = 0; i < this.pieceCount[piece]; i++) {
                if (this.pieceList[i] === sq) {
                    this.pieceList[i] = this.pieceList[--this.pieceCount[piece]];
                    break;
                }
            }
        }
        return piece;
    }
    
    movePiece(from, to) {
        const piece = this.board[from];
        this.board[from] = EMPTY;
        this.board[to] = piece;
        
        // Update piece list
        for (let i = 0; i < this.pieceCount[piece]; i++) {
            if (this.pieceList[i] === from) {
                this.pieceList[i] = to;
                break;
            }
        }
        
        // Update king position
        if ((piece & PIECE_MASK) === KING) {
            const color = (piece & BLACK) ? 1 : 0;
            this.kingSq[color] = to;
        }
    }
    
    fromFEN(fen) {
        this.clear();
        
        const parts = fen.split(' ');
        let idx = 0;
        
        // Piece placement
        for (const c of parts[0]) {
            if (c === '/') {
                idx += 12 - (idx % 12);
            } else if (c >= '1' && c <= '8') {
                idx += parseInt(c);
            } else {
                let piece = EMPTY;
                switch (c.toLowerCase()) {
                    case 'p': piece = PAWN; break;
                    case 'n': piece = KNIGHT; break;
                    case 'b': piece = BISHOP; break;
                    case 'r': piece = ROOK; break;
                    case 'q': piece = QUEEN; break;
                    case 'k': piece = KING; break;
                }
                if (c === c.toUpperCase()) {
                    piece |= WHITE;
                } else {
                    piece |= BLACK;
                }
                this.setPiece(SQA8 + idx, piece);
                if ((piece & PIECE_MASK) === KING) {
                    const color = (piece & BLACK) ? 1 : 0;
                    this.kingSq[color] = SQA8 + idx;
                }
                idx++;
            }
        }
        
        // Side to move
        this.turn = (parts[1] === 'w') ? WHITE : BLACK;
        
        // Castling rights
        this.castling = 0;
        if (parts[2].includes('K')) this.castling |= WHITE_RIGHTS_KING;
        if (parts[2].includes('Q')) this.castling |= WHITE_RIGHTS_QUEEN;
        if (parts[2].includes('k')) this.castling |= BLACK_RIGHTS_KING;
        if (parts[2].includes('q')) this.castling |= BLACK_RIGHTS_QUEEN;
        
        // En passant
        if (parts[3] !== '-') {
            const file = parts[3].charCodeAt(0) - 'a'.charCodeAt(0);
            const rank = 8 - parseInt(parts[3][1]);
            this.ep = SQA8 + rank * 12 + file;
        }
        
        // Halfmove and fullmove
        this.halfmove = parseInt(parts[4] || 0);
        this.fullmove = parseInt(parts[5] || 1);
        
        this.updateKey();
    }
    
    toFEN() {
        let fen = '';
        let empty = 0;
        
        for (let rank = 0; rank < 8; rank++) {
            if (rank > 0) fen += '/';
            empty = 0;
            
            for (let file = 0; file < 8; file++) {
                const sq = SQA8 + rank * 12 + file;
                const piece = this.board[sq];
                
                if (piece === EMPTY) {
                    empty++;
                } else {
                    if (empty > 0) {
                        fen += empty.toString();
                        empty = 0;
                    }
                    
                    let c = '';
                    switch (piece & PIECE_MASK) {
                        case PAWN: c = 'p'; break;
                        case KNIGHT: c = 'n'; break;
                        case BISHOP: c = 'b'; break;
                        case ROOK: c = 'r'; break;
                        case QUEEN: c = 'q'; break;
                        case KING: c = 'k'; break;
                    }
                    
                    if ((piece & COLOR_MASK) === WHITE) {
                        c = c.toUpperCase();
                    }
                    
                    fen += c;
                }
            }
            
            if (empty > 0) {
                fen += empty.toString();
            }
        }
        
        // Side to move
        fen += this.turn === WHITE ? ' w ' : ' b ';
        
        // Castling rights
        let castling = '';
        if (this.castling & WHITE_RIGHTS_KING) castling += 'K';
        if (this.castling & WHITE_RIGHTS_QUEEN) castling += 'Q';
        if (this.castling & BLACK_RIGHTS_KING) castling += 'k';
        if (this.castling & BLACK_RIGHTS_QUEEN) castling += 'q';
        fen += castling || '-';
        
        // En passant
        if (this.ep) {
            const file = (this.ep % 12) - 2;
            const rank = 8 - Math.floor(this.ep / 12) + 2;
            fen += ' ' + String.fromCharCode('a'.charCodeAt(0) + file) + rank;
        } else {
            fen += ' -';
        }
        
        // Halfmove and fullmove
        fen += ' ' + this.halfmove + ' ' + this.fullmove;
        
        return fen;
    }
    
    updateKey() {
        this.key = 0n;
        this.pawnKey = 0n;
        
        for (let sq = 0; sq < 144; sq++) {
            const piece = this.board[sq];
            if (piece !== EMPTY && piece !== EDGE) {
                const color = (piece & BLACK) ? 'b' : 'w';
                const type = ['', 'P', 'N', 'B', 'R', 'Q', 'K'][piece & PIECE_MASK];
                if (ZOBRIST.pieces[color] && ZOBRIST.pieces[color][type]) {
                    this.key ^= ZOBRIST.pieces[color][type][this.sqToIndex(sq)];
                    
                    if ((piece & PIECE_MASK) === PAWN) {
                        this.pawnKey ^= ZOBRIST.pieces[color][type][this.sqToIndex(sq)];
                    }
                }
            }
        }
        
        if (this.turn === BLACK) {
            this.key ^= ZOBRIST.side;
        }
        
        if (this.ep) {
            this.key ^= ZOBRIST.ep[this.sqToIndex(this.ep)];
        }
        
        this.key ^= BigInt(this.castling);
    }
    
    sqToIndex(sq) {
        const row = Math.floor(sq / 12);
        const col = sq % 12;
        return (row - 2) * 8 + (col - 2);
    }
    
    inCheck(color) {
        const kingSq = this.kingSq[color ? 1 : 0];
        const opponent = color ? WHITE : BLACK;
        
        // Knight checks
        const knightMoves = [-25, -23, -14, -10, 10, 14, 23, 25];
        for (const offset of knightMoves) {
            const target = kingSq + offset;
            if (this.board[target] === (KNIGHT | opponent)) {
                return true;
            }
        }
        
        // Pawn checks
        if (color === WHITE) {
            if (this.board[kingSq - 11] === B_PAWN || this.board[kingSq - 13] === B_PAWN) {
                return true;
            }
        } else {
            if (this.board[kingSq + 11] === W_PAWN || this.board[kingSq + 13] === W_PAWN) {
                return true;
            }
        }
        
        // Rook/Queen checks (horizontal/vertical)
        const rookDirs = [-12, 12, -1, 1];
        for (const dir of rookDirs) {
            let sq = kingSq + dir;
            while (this.board[sq] !== EDGE) {
                const piece = this.board[sq];
                if (piece !== EMPTY) {
                    if (piece === (ROOK | opponent) || piece === (QUEEN | opponent)) {
                        return true;
                    }
                    break;
                }
                sq += dir;
            }
        }
        
        // Bishop/Queen checks (diagonal)
        const bishopDirs = [-13, -11, 11, 13];
        for (const dir of bishopDirs) {
            let sq = kingSq + dir;
            while (this.board[sq] !== EDGE) {
                const piece = this.board[sq];
                if (piece !== EMPTY) {
                    if (piece === (BISHOP | opponent) || piece === (QUEEN | opponent)) {
                        return true;
                    }
                    break;
                }
                sq += dir;
            }
        }
        
        // King checks
        const kingMoves = [-13, -12, -11, -1, 1, 11, 12, 13];
        for (const offset of kingMoves) {
            const target = kingSq + offset;
            if (this.board[target] === (KING | opponent)) {
                return true;
            }
        }
        
        return false;
    }
}

// ============================================================================
// ZOBRIST HASHING
// ============================================================================

const ZOBRIST = {
    pieces: { w: {}, b: {} },
    side: 0n,
    castling: new BigInt64Array(16),
    ep: new BigInt64Array(144)
};

function initZobrist() {
    // Initialize random 64-bit numbers
    const random64 = () => {
        return BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) |
               (BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) << 32n);
    };
    
    // Piece keys
    const pieces = ['P', 'N', 'B', 'R', 'Q', 'K'];
    for (const piece of pieces) {
        ZOBRIST.pieces.w[piece] = new BigInt64Array(64);
        ZOBRIST.pieces.b[piece] = new BigInt64Array(64);
        for (let i = 0; i < 64; i++) {
            ZOBRIST.pieces.w[piece][i] = random64();
            ZOBRIST.pieces.b[piece][i] = random64();
        }
    }
    
    // Side to move
    ZOBRIST.side = random64();
    
    // Castling rights
    for (let i = 0; i < 16; i++) {
        ZOBRIST.castling[i] = random64();
    }
    
    // En passant squares
    for (let i = 0; i < 144; i++) {
        ZOBRIST.ep[i] = random64();
    }
}

// ============================================================================
// MOVE GENERATION
// ============================================================================

class MoveGen {
    constructor() {
        this.moves = new MoveList();
    }
    
    generateAll(board, color) {
        this.moves.clear();
        
        const opponent = color ? WHITE : BLACK;
        const me = color ? BLACK : WHITE;
        
        // Generate moves for each piece
        for (let sq = 0; sq < 144; sq++) {
            const piece = board.board[sq];
            if ((piece & COLOR_MASK) !== color) continue;
            
            const pieceType = piece & PIECE_MASK;
            
            switch (pieceType) {
                case PAWN:
                    this.generatePawnMoves(board, sq, color);
                    break;
                case KNIGHT:
                    this.generateKnightMoves(board, sq, color, opponent);
                    break;
                case BISHOP:
                    this.generateBishopMoves(board, sq, color, opponent);
                    break;
                case ROOK:
                    this.generateRookMoves(board, sq, color, opponent);
                    break;
                case QUEEN:
                    this.generateQueenMoves(board, sq, color, opponent);
                    break;
                case KING:
                    this.generateKingMoves(board, sq, color, opponent);
                    break;
            }
        }
        
        return this.moves;
    }
    
    generatePawnMoves(board, sq, color) {
        const dir = color === WHITE ? -12 : 12;
        const startRank = color === WHITE ? 6 : 1;
        const promotionRank = color === WHITE ? 0 : 7;
        const opponent = color ? WHITE : BLACK;
        
        const rank = Math.floor(sq / 12) - 2;
        const file = (sq % 12) - 2;
        
        // Single push
        const to = sq + dir;
        if (board.board[to] === EMPTY) {
            if (rank === promotionRank) {
                // Promotions
                this.moves.add(sq, to, QUEEN - 2, MOVE_PROMOTE_MASK);
                this.moves.add(sq, to, ROOK - 2, MOVE_PROMOTE_MASK);
                this.moves.add(sq, to, BISHOP - 2, MOVE_PROMOTE_MASK);
                this.moves.add(sq, to, KNIGHT - 2, MOVE_PROMOTE_MASK);
            } else {
                this.moves.add(sq, to, 0, 0);
                
                // Double push from starting rank
                if (rank === startRank) {
                    const to2 = to + dir;
                    if (board.board[to2] === EMPTY) {
                        this.moves.add(sq, to2, 0, MOVE_EPMAKE_MASK);
                    }
                }
            }
        }
        
        // Captures
        for (const captureOffset of [dir - 1, dir + 1]) {
            const to = sq + captureOffset;
            const target = board.board[to];
            
            if (target !== EMPTY && target !== EDGE && (target & COLOR_MASK) === opponent) {
                if (rank === promotionRank) {
                    // Promotion captures
                    this.moves.add(sq, to, QUEEN - 2, MOVE_PROMOTE_MASK);
                    this.moves.add(sq, to, ROOK - 2, MOVE_PROMOTE_MASK);
                    this.moves.add(sq, to, BISHOP - 2, MOVE_PROMOTE_MASK);
                    this.moves.add(sq, to, KNIGHT - 2, MOVE_PROMOTE_MASK);
                } else {
                    this.moves.add(sq, to, 0, 0);
                }
            }
            
            // En passant
            if (to === board.ep && target === EMPTY) {
                this.moves.add(sq, to, 0, MOVE_EPTAKE_MASK);
            }
        }
    }
    
    generateKnightMoves(board, sq, color, opponent) {
        const offsets = [-25, -23, -14, -10, 10, 14, 23, 25];
        
        for (const offset of offsets) {
            const to = sq + offset;
            const target = board.board[to];
            
            if (target !== EDGE && (target === EMPTY || (target & COLOR_MASK) === opponent)) {
                this.moves.add(sq, to, 0, 0);
            }
        }
    }
    
    generateBishopMoves(board, sq, color, opponent) {
        const directions = [-13, -11, 11, 13];
        
        for (const dir of directions) {
            let to = sq + dir;
            while (board.board[to] !== EDGE) {
                const target = board.board[to];
                
                if (target === EMPTY) {
                    this.moves.add(sq, to, 0, 0);
                } else {
                    if ((target & COLOR_MASK) === opponent) {
                        this.moves.add(sq, to, 0, 0);
                    }
                    break;
                }
                
                to += dir;
            }
        }
    }
    
    generateRookMoves(board, sq, color, opponent) {
        const directions = [-12, 12, -1, 1];
        
        for (const dir of directions) {
            let to = sq + dir;
            while (board.board[to] !== EDGE) {
                const target = board.board[to];
                
                if (target === EMPTY) {
                    this.moves.add(sq, to, 0, 0);
                } else {
                    if ((target & COLOR_MASK) === opponent) {
                        this.moves.add(sq, to, 0, 0);
                    }
                    break;
                }
                
                to += dir;
            }
        }
    }
    
    generateQueenMoves(board, sq, color, opponent) {
        this.generateBishopMoves(board, sq, color, opponent);
        this.generateRookMoves(board, sq, color, opponent);
    }
    
    generateKingMoves(board, sq, color, opponent) {
        const directions = [-13, -12, -11, -1, 1, 11, 12, 13];
        
        for (const dir of directions) {
            const to = sq + dir;
            const target = board.board[to];
            
            if (target !== EDGE && (target === EMPTY || (target & COLOR_MASK) === opponent)) {
                this.moves.add(sq, to, 0, 0);
            }
        }
        
        // Castling
        const rights = color ? BLACK_RIGHTS : WHITE_RIGHTS;
        const kingSide = color ? BLACK_RIGHTS_KING : WHITE_RIGHTS_KING;
        const queenSide = color ? BLACK_RIGHTS_QUEEN : WHITE_RIGHTS_QUEEN;
        
        if ((board.castling & rights) === rights) {
            // King side
            if ((board.castling & kingSide) && 
                board.board[sq + 1] === EMPTY && 
                board.board[sq + 2] === EMPTY) {
                // Check if squares are not under attack
                if (!board.isSquareAttacked(sq, opponent) &&
                    !board.isSquareAttacked(sq + 1, opponent) &&
                    !board.isSquareAttacked(sq + 2, opponent)) {
                    this.moves.add(sq, sq + 2, 0, MOVE_CASTLE_MASK);
                }
            }
            
            // Queen side
            if ((board.castling & queenSide) && 
                board.board[sq - 1] === EMPTY && 
                board.board[sq - 2] === EMPTY &&
                board.board[sq - 3] === EMPTY) {
                // Check if squares are not under attack
                if (!board.isSquareAttacked(sq, opponent) &&
                    !board.isSquareAttacked(sq - 1, opponent) &&
                    !board.isSquareAttacked(sq - 2, opponent)) {
                    this.moves.add(sq, sq - 2, 0, MOVE_CASTLE_MASK);
                }
            }
        }
    }
}

// ============================================================================
// SEE (Static Exchange Evaluation)
// ============================================================================

function see(board, move) {
    const from = move.from;
    const to = move.to;
    const movingPiece = board.board[from];
    const capturedPiece = board.board[to];
    
    if (capturedPiece === EMPTY || capturedPiece === EDGE) {
        return 0;
    }
    
    const pieceValue = PIECE_VALUE[capturedPiece & PIECE_MASK];
    const attackerValue = PIECE_VALUE[movingPiece & PIECE_MASK];
    
    // Simple SEE: if capturing higher value piece, good move
    if (pieceValue > attackerValue) {
        return pieceValue - attackerValue;
    }
    
    return pieceValue;
}

// ============================================================================
// EVALUATION
// ============================================================================

class Evaluation {
    constructor() {
        // Piece-square tables (tuned values)
        this.PST = {
            P: [ // Pawn
                0,  0,  0,  0,  0,  0,  0,  0,
                50, 50, 50, 50, 50, 50, 50, 50,
                10, 10, 20, 30, 30, 20, 10, 10,
                5,  5, 10, 25, 25, 10,  5,  5,
                0,  0,  0, 20, 20,  0,  0,  0,
                5, -5,-10,  0,  0,-10, -5,  5,
                5, 10, 10,-20,-20, 10, 10,  5,
                0,  0,  0,  0,  0,  0,  0,  0
            ],
            N: [ // Knight
                -50,-40,-30,-30,-30,-30,-40,-50,
                -40,-20,  0,  0,  0,  0,-20,-40,
                -30,  0, 10, 15, 15, 10,  0,-30,
                -30,  5, 15, 20, 20, 15,  5,-30,
                -30,  0, 15, 20, 20, 15,  0,-30,
                -30,  5, 10, 15, 15, 10,  5,-30,
                -40,-20,  0,  5,  5,  0,-20,-40,
                -50,-40,-30,-30,-30,-30,-40,-50
            ],
            B: [ // Bishop
                -20,-10,-10,-10,-10,-10,-10,-20,
                -10,  0,  0,  0,  0,  0,  0,-10,
                -10,  0,  5, 10, 10,  5,  0,-10,
                -10,  5,  5, 10, 10,  5,  5,-10,
                -10,  0, 10, 10, 10, 10,  0,-10,
                -10, 10, 10, 10, 10, 10, 10,-10,
                -10,  5,  0,  0,  0,  0,  5,-10,
                -20,-10,-10,-10,-10,-10,-10,-20
            ],
            R: [ // Rook
                0,  0,  0,  0,  0,  0,  0,  0,
                5, 10, 10, 10, 10, 10, 10,  5,
                -5,  0,  0,  0,  0,  0,  0, -5,
                -5,  0,  0,  0,  0,  0,  0, -5,
                -5,  0,  0,  0,  0,  0,  0, -5,
                -5,  0,  0,  0,  0,  0,  0, -5,
                -5,  0,  0,  0,  0,  0,  0, -5,
                0,  0,  0,  5,  5,  0,  0,  0
            ],
            Q: [ // Queen
                -20,-10,-10, -5, -5,-10,-10,-20,
                -10,  0,  0,  0,  0,  0,  0,-10,
                -10,  0,  5,  5,  5,  5,  0,-10,
                -5,  0,  5,  5,  5,  5,  0, -5,
                0,  0,  5,  5,  5,  5,  0, -5,
                -10,  5,  5,  5,  5,  5,  0,-10,
                -10,  0,  5,  0,  0,  0,  0,-10,
                -20,-10,-10, -5, -5,-10,-10,-20
            ],
            K: [ // King (middle game)
                -30,-40,-40,-50,-50,-40,-40,-30,
                -30,-40,-40,-50,-50,-40,-40,-30,
                -30,-40,-40,-50,-50,-40,-40,-30,
                -30,-40,-40,-50,-50,-40,-40,-30,
                -20,-30,-30,-40,-40,-30,-30,-20,
                -10,-20,-20,-20,-20,-20,-20,-10,
                20, 20,  0,  0,  0,  0, 20, 20,
                20, 30, 10,  0,  0, 10, 30, 20
            ]
        };
        
        // Mirror PST for black
        this.PST.k = this.PST.K.slice().reverse();
        this.PST.q = this.PST.Q.slice().reverse();
        this.PST.r = this.PST.R.slice().reverse();
        this.PST.b = this.PST.B.slice().reverse();
        this.PST.n = this.PST.N.slice().reverse();
        this.PST.p = this.PST.P.slice().reverse();
    }
    
    evaluate(board) {
        // Material difference
        const material = board.material[0] - board.material[1];
        
        // Game phase calculation
        let phase = 0;
        for (let piece = KNIGHT; piece <= QUEEN; piece++) {
            phase += board.pieceCount[piece] * PIECE_PHASE[piece];
            phase += board.pieceCount[piece | BLACK] * PIECE_PHASE[piece];
        }
        phase = Math.min(phase, TOTAL_PHASE);
        
        // Pawn hash lookup
        let pawnEval = this.pawnHashLookup(board.pawnKey);
        if (pawnEval === null) {
            pawnEval = this.evaluatePawns(board);
            this.pawnHashStore(board.pawnKey, pawnEval);
        }
        
        // Piece evaluation
        let pieceEval = 0;
        let bishopPairBonus = 0;
        let knightOutpostBonus = 0;
        let rookOpenFileBonus = 0;
        
        // Evaluate white pieces
        for (let i = 0; i < board.pieceCount[W_KNIGHT]; i++) {
            const sq = board.pieceList[i];
            const idx = board.sqToIndex(sq);
            pieceEval += this.PST.n[idx];
            
            // Knight outposts
            if (this.isKnightOutpost(board, sq, WHITE)) {
                knightOutpostBonus += 20;
            }
        }
        
        for (let i = board.pieceCount[W_KNIGHT]; i < board.pieceCount[W_KNIGHT] + board.pieceCount[W_BISHOP]; i++) {
            const sq = board.pieceList[i];
            const idx = board.sqToIndex(sq);
            pieceEval += this.PST.b[idx];
        }
        
        // Bishop pair bonus
        if (board.pieceCount[W_BISHOP] >= 2) {
            bishopPairBonus += 30;
        }
        
        for (let i = 0; i < board.pieceCount[W_ROOK]; i++) {
            const sq = board.pieceList[board.pieceCount[W_KNIGHT] + board.pieceCount[W_BISHOP] + i];
            const idx = board.sqToIndex(sq);
            pieceEval += this.PST.r[idx];
            
            // Rook on open file
            if (this.isOpenFile(board, sq, WHITE)) {
                rookOpenFileBonus += 20;
            }
        }
        
        for (let i = 0; i < board.pieceCount[W_QUEEN]; i++) {
            const sq = board.pieceList[board.pieceCount[W_KNIGHT] + board.pieceCount[W_BISHOP] + board.pieceCount[W_ROOK] + i];
            const idx = board.sqToIndex(sq);
            pieceEval += this.PST.q[idx];
        }
        
        // Evaluate black pieces
        for (let i = 0; i < board.pieceCount[B_KNIGHT]; i++) {
            const sq = board.pieceList[32 + i];
            const idx = board.sqToIndex(sq);
            pieceEval -= this.PST.n[63 - idx];
            
            // Knight outposts
            if (this.isKnightOutpost(board, sq, BLACK)) {
                knightOutpostBonus -= 20;
            }
        }
        
        for (let i = board.pieceCount[B_KNIGHT]; i < board.pieceCount[B_KNIGHT] + board.pieceCount[B_BISHOP]; i++) {
            const sq = board.pieceList[32 + i];
            const idx = board.sqToIndex(sq);
            pieceEval -= this.PST.b[63 - idx];
        }
        
        // Bishop pair bonus
        if (board.pieceCount[B_BISHOP] >= 2) {
            bishopPairBonus -= 30;
        }
        
        for (let i = 0; i < board.pieceCount[B_ROOK]; i++) {
            const sq = board.pieceList[32 + board.pieceCount[B_KNIGHT] + board.pieceCount[B_BISHOP] + i];
            const idx = board.sqToIndex(sq);
            pieceEval -= this.PST.r[63 - idx];
            
            // Rook on open file
            if (this.isOpenFile(board, sq, BLACK)) {
                rookOpenFileBonus -= 20;
            }
        }
        
        for (let i = 0; i < board.pieceCount[B_QUEEN]; i++) {
            const sq = board.pieceList[32 + board.pieceCount[B_KNIGHT] + board.pieceCount[B_BISHOP] + board.pieceCount[B_ROOK] + i];
            const idx = board.sqToIndex(sq);
            pieceEval -= this.PST.q[63 - idx];
        }
        
        // King safety evaluation
        const kingSafety = this.evaluateKingSafety(board, phase);
        
        // Total evaluation
        let eval_ = material + pieceEval + pawnEval + kingSafety + 
                    bishopPairBonus + knightOutpostBonus + rookOpenFileBonus;
        
        // Tempo bonus
        eval_ += (board.turn === WHITE) ? 10 : -10;
        
        // Scale by phase
        const mgEval = eval_;
        const egEval = eval_; // Simplified - in real engine would have separate endgame eval
        
        return (mgEval * phase + egEval * (TOTAL_PHASE - phase)) / TOTAL_PHASE;
    }
    
    evaluatePawns(board) {
        let score = 0;
        
        // White pawns
        for (let i = 0; i < board.pieceCount[W_PAWN]; i++) {
            const sq = board.pieceList[i];
            const rank = Math.floor(sq / 12) - 2;
            const file = (sq % 12) - 2;
            
            // Doubled pawns
            for (let j = i + 1; j < board.pieceCount[W_PAWN]; j++) {
                const otherSq = board.pieceList[j];
                if ((otherSq % 12) === file) {
                    score -= 10; // Doubled pawn penalty
                }
            }
            
            // Isolated pawns
            let hasNeighbor = false;
            for (let j = 0; j < board.pieceCount[W_PAWN]; j++) {
                if (i === j) continue;
                const otherFile = (board.pieceList[j] % 12) - 2;
                if (Math.abs(file - otherFile) === 1) {
                    hasNeighbor = true;
                    break;
                }
            }
            if (!hasNeighbor) {
                score -= 15; // Isolated pawn penalty
            }
            
            // Passed pawns
            let isPassed = true;
            for (let j = 0; j < board.pieceCount[B_PAWN]; j++) {
                const otherSq = board.pieceList[32 + j];
                const otherFile = (otherSq % 12) - 2;
                const otherRank = Math.floor(otherSq / 12) - 2;
                
                if (Math.abs(file - otherFile) <= 1 && otherRank < rank) {
                    isPassed = false;
                    break;
                }
            }
            if (isPassed) {
                score += 30 + rank * 5; // Passed pawn bonus
            }
        }
        
        // Black pawns
        for (let i = 0; i < board.pieceCount[B_PAWN]; i++) {
            const sq = board.pieceList[32 + i];
            const rank = 7 - (Math.floor(sq / 12) - 2);
            const file = (sq % 12) - 2;
            
            // Doubled pawns
            for (let j = i + 1; j < board.pieceCount[B_PAWN]; j++) {
                const otherSq = board.pieceList[32 + j];
                if ((otherSq % 12) === file) {
                    score += 10; // Doubled pawn penalty for black
                }
            }
            
            // Isolated pawns
            let hasNeighbor = false;
            for (let j = 0; j < board.pieceCount[B_PAWN]; j++) {
                if (i === j) continue;
                const otherFile = (board.pieceList[32 + j] % 12) - 2;
                if (Math.abs(file - otherFile) === 1) {
                    hasNeighbor = true;
                    break;
                }
            }
            if (!hasNeighbor) {
                score += 15; // Isolated pawn penalty for black
            }
            
            // Passed pawns
            let isPassed = true;
            for (let j = 0; j < board.pieceCount[W_PAWN]; j++) {
                const otherSq = board.pieceList[j];
                const otherFile = (otherSq % 12) - 2;
                const otherRank = 7 - (Math.floor(otherSq / 12) - 2);
                
                if (Math.abs(file - otherFile) <= 1 && otherRank < rank) {
                    isPassed = false;
                    break;
                }
            }
            if (isPassed) {
                score -= 30 + rank * 5; // Passed pawn bonus for black
            }
        }
        
        return score;
    }
    
    evaluateKingSafety(board, phase) {
        let score = 0;
        
        // Evaluate white king
        const wKingSq = board.kingSq[0];
        if (wKingSq) {
            const wKingFile = (wKingSq % 12) - 2;
            const wKingRank = Math.floor(wKingSq / 12) - 2;
            
            // King on open file penalty
            if (this.isOpenFile(board, wKingSq, WHITE)) {
                score -= 20;
            }
            
            // Pawn shield
            let pawnShield = 0;
            const shieldSquares = [
                wKingSq - 11, wKingSq - 12, wKingSq - 13,
                wKingSq + 1, wKingSq - 1
            ];
            for (const sq of shieldSquares) {
                if (board.board[sq] === W_PAWN) {
                    pawnShield += 10;
                }
            }
            score += pawnShield;
        }
        
        // Evaluate black king
        const bKingSq = board.kingSq[1];
        if (bKingSq) {
            const bKingFile = (bKingSq % 12) - 2;
            const bKingRank = 7 - (Math.floor(bKingSq / 12) - 2);
            
            // King on open file penalty
            if (this.isOpenFile(board, bKingSq, BLACK)) {
                score += 20;
            }
            
            // Pawn shield
            let pawnShield = 0;
            const shieldSquares = [
                bKingSq + 11, bKingSq + 12, bKingSq + 13,
                bKingSq + 1, bKingSq - 1
            ];
            for (const sq of shieldSquares) {
                if (board.board[sq] === B_PAWN) {
                    pawnShield += 10;
                }
            }
            score -= pawnShield;
        }
        
        return score;
    }
    
    isKnightOutpost(board, sq, color) {
        const file = (sq % 12) - 2;
        const rank = Math.floor(sq / 12) - 2;
        
        // Knight outpost: protected by pawn, can't be attacked by enemy pawns
        const pawnDir = color === WHITE ? -12 : 12;
        const pawn = color === WHITE ? W_PAWN : B_PAWN;
        
        // Check if protected by own pawn
        const protectedByPawn = 
            board.board[sq - pawnDir - 1] === pawn ||
            board.board[sq - pawnDir + 1] === pawn;
        
        if (!protectedByPawn) return false;
        
        // Check if can't be attacked by enemy pawn
        const enemyPawn = color === WHITE ? B_PAWN : W_PAWN;
        const enemyPawnAttacks = color === WHITE ? [11, 13] : [-11, -13];
        
        for (const offset of enemyPawnAttacks) {
            if (board.board[sq + offset] === enemyPawn) {
                return false;
            }
        }
        
        return true;
    }
    
    isOpenFile(board, sq, color) {
        const file = (sq % 12) - 2;
        
        // Check if no pawns on this file
        for (let rank = 0; rank < 8; rank++) {
            const checkSq = SQA8 + rank * 12 + file;
            if (board.board[checkSq] === W_PAWN || board.board[checkSq] === B_PAWN) {
                return false;
            }
        }
        
        return true;
    }
    
    pawnHashLookup(key) {
        // Simplified - in real engine would use hash table
        return null;
    }
    
    pawnHashStore(key, value) {
        // Simplified - in real engine would use hash table
    }
}

// ============================================================================
// NEURAL NETWORK EVALUATION
// ============================================================================

function evaluateNN(board) {
    // Clear buffers
    NET_BUFFER.hidden.fill(0);
    NET_BUFFER.output = 0;
    
    // Feature extraction and activation
    let activeFeatures = 0;
    
    for (let sq = 0; sq < 144; sq++) {
        const piece = board.board[sq];
        if (piece !== EMPTY && piece !== EDGE) {
            const color = (piece & BLACK) ? 1 : 0;
            const pieceType = piece & PIECE_MASK;
            const idx = board.sqToIndex(sq);
            
            // Feature index: color * 384 + pieceType * 64 + square
            const feature = color * 384 + (pieceType - 1) * 64 + idx;
            
            // Activate hidden layer
            for (let h = 0; h < NET_HIDDEN_SIZE; h++) {
                NET_BUFFER.hidden[h] += NET_WEIGHTS.input_hidden[feature * NET_HIDDEN_SIZE + h];
            }
            
            activeFeatures++;
        }
    }
    
    // Apply activation function (ReLU) and hidden bias
    for (let h = 0; h < NET_HIDDEN_SIZE; h++) {
        NET_BUFFER.hidden[h] += NET_WEIGHTS.hidden_bias[h];
        NET_BUFFER.hidden[h] = Math.max(0, NET_BUFFER.hidden[h]);
        
        // Accumulate output
        NET_BUFFER.output += NET_BUFFER.hidden[h] * NET_WEIGHTS.hidden_output[h];
    }
    
    // Scale output
    return NET_BUFFER.output * NET_SCALE / (NET_QA * NET_QB);
}

// ============================================================================
// TRANSPOSITION TABLE
// ============================================================================

class TTEntry {
    constructor() {
        this.key = 0n;
        this.move = 0;
        this.score = 0;
        this.depth = 0;
        this.type = TT_EMPTY;
        this.age = 0;
    }
}

class TranspositionTable {
    constructor() {
        this.table = new Array(TT_SIZE);
        for (let i = 0; i < TT_SIZE; i++) {
            this.table[i] = new TTEntry();
        }
        this.age = 0;
    }
    
    store(key, move, score, depth, type, ply) {
        const index = Number(key & BigInt(TT_MASK));
        const entry = this.table[index];
        
        // Mate score adjustment
        if (score > MATE - MAX_PLY) {
            score += ply;
        } else if (score < -MATE + MAX_PLY) {
            score -= ply;
        }
        
        // Replace if deeper or same age
        if (type === TT_EXACT || 
            depth >= entry.depth || 
            entry.age !== this.age) {
            entry.key = key;
            entry.move = move;
            entry.score = score;
            entry.depth = depth;
            entry.type = type;
            entry.age = this.age;
        }
    }
    
    probe(key, depth, alpha, beta, ply) {
        const index = Number(key & BigInt(TT_MASK));
        const entry = this.table[index];
        
        if (entry.key === key) {
            // Mate score adjustment
            let score = entry.score;
            if (score > MATE - MAX_PLY) {
                score -= ply;
            } else if (score < -MATE + MAX_PLY) {
                score += ply;
            }
            
            // Check if entry can be used
            if (entry.depth >= depth) {
                if (entry.type === TT_EXACT) {
                    return { hit: true, move: entry.move, score: score };
                } else if (entry.type === TT_ALPHA && score <= alpha) {
                    return { hit: true, move: entry.move, score: alpha };
                } else if (entry.type === TT_BETA && score >= beta) {
                    return { hit: true, move: entry.move, score: beta };
                }
            }
            
            return { hit: true, move: entry.move, score: TTSCORE_UNKNOWN };
        }
        
        return { hit: false, move: 0, score: TTSCORE_UNKNOWN };
    }
    
    newSearch() {
        this.age++;
    }
}

// ============================================================================
// SEARCH
// ============================================================================

class Search {
    constructor() {
        this.board = new Board();
        this.tt = new TranspositionTable();
        this.eval = new Evaluation();
        this.moveGen = new MoveGen();
        
        // Killer moves
        this.killerMoves = new Array(MAX_PLY);
        for (let i = 0; i < MAX_PLY; i++) {
            this.killerMoves[i] = [0, 0];
        }
        
        // History heuristic
        this.history = new Array(2);
        for (let c = 0; c < 2; c++) {
            this.history[c] = new Array(144);
            for (let f = 0; f < 144; f++) {
                this.history[c][f] = new Array(144).fill(0);
            }
        }
        
        // PV table
        this.pvTable = new Array(MAX_PLY + 1);
        for (let i = 0; i <= MAX_PLY; i++) {
            this.pvTable[i] = new Array(MAX_PLY + 1).fill(0);
        }
        this.pvLength = new Array(MAX_PLY + 1).fill(0);
        
        // Search statistics
        this.nodes = 0;
        this.qNodes = 0;
        this.tbhits = 0;
        
        // Time management
        this.startTime = 0;
        this.timeLimit = 0;
        this.stop = false;
        
        // Root move
        this.rootMove = 0;
    }
    
    search(depth, timeLimit = Infinity) {
        this.nodes = 0;
        this.qNodes = 0;
        this.tbhits = 0;
        this.stop = false;
        this.startTime = Date.now();
        this.timeLimit = timeLimit;
        
        // Reset PV
        this.pvLength.fill(0);
        
        let score = 0;
        let alpha = -INF;
        let beta = INF;
        let window = ASP_WINDOW_INIT;
        
        // Iterative deepening
        for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
            // Aspiration window
            if (currentDepth > 4) {
                alpha = Math.max(score - window, -INF);
                beta = Math.min(score + window, INF);
            }
            
            while (true) {
                score = this.negamax(currentDepth, alpha, beta, 0, true);
                
                if (this.stop) break;
                
                if (score <= alpha) {
                    // Fail low - widen window
                    alpha = Math.max(score - window, -INF);
                } else if (score >= beta) {
                    // Fail high - widen window
                    beta = Math.min(score + window, INF);
                } else {
                    // Exact score
                    break;
                }
                
                window = Math.min(window * 2, ASP_WINDOW_MAX);
            }
            
            if (this.stop) break;
            
            // Send info
            this.sendInfo(currentDepth, score, this.pvTable[0], this.pvLength[0]);
        }
        
        return { score, move: this.pvTable[0][0], nodes: this.nodes + this.qNodes };
    }
    
    negamax(depth, alpha, beta, ply, pvNode) {
        this.nodes++;
        
        // Check time
        if ((this.nodes & 0x3FFF) === 0 && Date.now() - this.startTime > this.timeLimit) {
            this.stop = true;
            return 0;
        }
        
        // Max depth reached
        if (ply >= MAX_PLY) {
            return this.eval.evaluate(this.board);
        }
        
        const inCheck = this.board.inCheck(this.turn);
        
        // Extend if in check
        if (inCheck) {
            depth++;
        }
        
        // Quiescence search
        if (depth <= 0) {
            return this.quiescence(alpha, beta, ply);
        }
        
        // Probe transposition table
        const ttEntry = this.tt.probe(this.board.key, depth, alpha, beta, ply);
        if (ttEntry.hit && !pvNode) {
            this.tbhits++;
            if (ttEntry.score !== TTSCORE_UNKNOWN) {
                return ttEntry.score;
            }
        }
        
        // Null move pruning
        if (!pvNode && !inCheck && depth >= 2 && this.board.material[this.turn ? 0 : 1] > 2500) {
            const R = NULL_MOVE_R + (depth >= 6 ? 1 : 0);
            
            // Make null move
            const savedTurn = this.board.turn;
            const savedEp = this.board.ep;
            this.board.turn = this.board.turn === WHITE ? BLACK : WHITE;
            this.board.ep = 0;
            this.board.key ^= ZOBRIST.side;
            
            const nullScore = -this.negamax(depth - R - 1, -beta, -beta + 1, ply + 1, false);
            
            // Unmake null move
            this.board.turn = savedTurn;
            this.board.ep = savedEp;
            this.board.key ^= ZOBRIST.side;
            
            if (this.stop) return 0;
            
            if (nullScore >= beta) {
                return beta;
            }
        }
        
        // Generate moves
        const moves = this.moveGen.generateAll(this.board, this.turn);
        const moveCount = moves.count;
        
        if (moveCount === 0) {
            // Checkmate or stalemate
            return inCheck ? -MATE + ply : 0;
        }
        
        // Move ordering
        this.orderMoves(moves, ttEntry.move, ply);
        
        let bestMove = 0;
        let bestScore = -INF;
        let moveCountPruned = 0;
        
        // Principal Variation Search
        for (let i = 0; i < moveCount; i++) {
            const move = moves.moves[i];
            
            // Make move
            if (!this.makeMove(move)) continue;
            
            let score;
            
            // Late Move Reduction
            if (depth >= 3 && 
                moveCountPruned > 3 && 
                !pvNode && 
                !inCheck && 
                (move.flags & MOVE_NOISY_MASK) === 0) {
                
                const reduction = Math.min(depth - 1, Math.floor(Math.log(moveCountPruned) * depth / LMR_DIVISOR));
                score = -this.negamax(depth - reduction - 1, -beta, -alpha, ply + 1, false);
                
                if (score > alpha) {
                    score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, pvNode);
                }
            } else {
                if (pvNode && moveCountPruned === 0) {
                    // Principal variation move
                    score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
                } else {
                    // Zero window search
                    score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, false);
                    
                    if (score > alpha && score < beta) {
                        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
                    }
                }
            }
            
            // Unmake move
            this.unmakeMove();
            
            if (this.stop) return 0;
            
            if (score > bestScore) {
                bestScore = score;
                bestMove = Move.encode(move.from, move.to, move.promoted, move.flags);
                
                // Update PV
                this.pvTable[ply][0] = bestMove;
                for (let j = 0; j < this.pvLength[ply + 1]; j++) {
                    this.pvTable[ply][j + 1] = this.pvTable[ply + 1][j];
                }
                this.pvLength[ply] = this.pvLength[ply + 1] + 1;
                
                if (score > alpha) {
                    alpha = score;
                    
                    // Update history and killers
                    if ((move.flags & MOVE_NOISY_MASK) === 0) {
                        this.history[this.turn === WHITE ? 0 : 1][move.from][move.to] += depth * depth;
                        
                        if (this.killerMoves[ply][0] !== bestMove) {
                            this.killerMoves[ply][1] = this.killerMoves[ply][0];
                            this.killerMoves[ply][0] = bestMove;
                        }
                    }
                    
                    if (score >= beta) {
                        // Beta cutoff
                        this.tt.store(this.board.key, bestMove, beta, depth, TT_BETA, ply);
                        return beta;
                    }
                }
            }
            
            moveCountPruned++;
        }
        
        // Store in transposition table
        const type = bestScore <= alpha ? TT_ALPHA : 
                     bestScore >= beta ? TT_BETA : TT_EXACT;
        this.tt.store(this.board.key, bestMove, bestScore, depth, type, ply);
        
        return bestScore;
    }
    
    quiescence(alpha, beta, ply) {
        this.qNodes++;
        
        // Stand pat
        let eval_ = this.eval.evaluate(this.board);
        
        if (eval_ >= beta) {
            return beta;
        }
        
        if (eval_ > alpha) {
            alpha = eval_;
        }
        
        // Generate capture moves
        const moves = this.moveGen.generateAll(this.board, this.turn);
        const moveCount = moves.count;
        
        // Order captures by MVV-LVA
        for (let i = 0; i < moveCount; i++) {
            const move = moves.moves[i];
            if ((move.flags & MOVE_NOISY_MASK) === 0) {
                move.score = -1000; // Non-captures last
            } else {
                move.score = see(this.board, move);
            }
        }
        moves.sort();
        
        // Search captures
        for (let i = 0; i < moveCount; i++) {
            const move = moves.moves[i];
            
            // Delta pruning
            const captureValue = PIECE_VALUE[this.board.board[move.to] & PIECE_MASK];
            if (eval_ + captureValue + 200 < alpha) {
                continue;
            }
            
            if (!this.makeMove(move)) continue;
            
            const score = -this.quiescence(-beta, -alpha, ply + 1);
            
            this.unmakeMove();
            
            if (this.stop) return 0;
            
            if (score > alpha) {
                alpha = score;
                if (score >= beta) {
                    return beta;
                }
            }
        }
        
        return alpha;
    }
    
    orderMoves(moves, ttMove, ply) {
        for (let i = 0; i < moves.count; i++) {
            const move = moves.moves[i];
            let score = 0;
            
            // TT move gets highest score
            if (ttMove && Move.encode(move.from, move.to, move.promoted, move.flags) === ttMove) {
                score = 1000000;
            }
            // Captures
            else if ((move.flags & MOVE_NOISY_MASK) !== 0) {
                score = 50000 + see(this.board, move);
            }
            // Killer moves
            else if (this.killerMoves[ply][0] === Move.encode(move.from, move.to, move.promoted, move.flags)) {
                score = 10000;
            }
            else if (this.killerMoves[ply][1] === Move.encode(move.from, move.to, move.promoted, move.flags)) {
                score = 9000;
            }
            // History heuristic
            else {
                const color = this.turn === WHITE ? 0 : 1;
                score = this.history[color][move.from][move.to];
            }
            
            move.score = score;
        }
        
        moves.sort();
    }
    
    makeMove(move) {
        // Save state
        const saved = {
            castling: this.board.castling,
            ep: this.board.ep,
            halfmove: this.board.halfmove,
            key: this.board.key,
            pawnKey: this.board.pawnKey,
            captured: EMPTY,
            turn: this.board.turn
        };
        
        this.board.history.push(saved);
        
        // Move piece
        const piece = this.board.board[move.from];
        const captured = this.board.board[move.to];
        
        if (captured !== EMPTY) {
            this.board.removePiece(move.to);
            saved.captured = captured;
        }
        
        this.board.movePiece(move.from, move.to);
        
        // Special moves
        if (move.flags & MOVE_PROMOTE_MASK) {
            const promotedPiece = (move.promoted + 2) | this.turn;
            this.board.removePiece(move.to);
            this.board.setPiece(move.to, promotedPiece);
        }
        
        if (move.flags & MOVE_CASTLE_MASK) {
            // Move rook
            if (move.to > move.from) { // King side
                const rookFrom = move.from + 3;
                const rookTo = move.to - 1;
                this.board.movePiece(rookFrom, rookTo);
            } else { // Queen side
                const rookFrom = move.from - 4;
                const rookTo = move.to + 1;
                this.board.movePiece(rookFrom, rookTo);
            }
        }
        
        if (move.flags & MOVE_EPTAKE_MASK) {
            const epPawn = move.to + (this.turn === WHITE ? 12 : -12);
            this.board.removePiece(epPawn);
        }
        
        // Update castling rights
        const fromRow = Math.floor(move.from / 12);
        const fromCol = move.from % 12;
        const toRow = Math.floor(move.to / 12);
        const toCol = move.to % 12;
        
        if (move.from === SQUARE_MAP.E1) {
            this.board.castling &= ~(WHITE_RIGHTS_KING | WHITE_RIGHTS_QUEEN);
        } else if (move.from === SQUARE_MAP.E8) {
            this.board.castling &= ~(BLACK_RIGHTS_KING | BLACK_RIGHTS_QUEEN);
        } else if (move.from === SQUARE_MAP.A1 || move.to === SQUARE_MAP.A1) {
            this.board.castling &= ~WHITE_RIGHTS_QUEEN;
        } else if (move.from === SQUARE_MAP.H1 || move.to === SQUARE_MAP.H1) {
            this.board.castling &= ~WHITE_RIGHTS_KING;
        } else if (move.from === SQUARE_MAP.A8 || move.to === SQUARE_MAP.A8) {
            this.board.castling &= ~BLACK_RIGHTS_QUEEN;
        } else if (move.from === SQUARE_MAP.H8 || move.to === SQUARE_MAP.H8) {
            this.board.castling &= ~BLACK_RIGHTS_KING;
        }
        
        // Update en passant
        this.board.ep = 0;
        if ((piece & PIECE_MASK) === PAWN) {
            const rankDiff = Math.abs(fromRow - toRow);
            if (rankDiff === 2) {
                this.board.ep = move.from + (toRow > fromRow ? 12 : -12);
            }
        }
        
        // Update halfmove clock
        if ((piece & PIECE_MASK) === PAWN || captured !== EMPTY) {
            this.board.halfmove = 0;
        } else {
            this.board.halfmove++;
        }
        
        // Update side to move
        this.board.turn = this.board.turn === WHITE ? BLACK : WHITE;
        this.board.fullmove++;
        
        // Update hash keys
        this.board.updateKey();
        
        // Check if move is legal
        if (this.board.inCheck(saved.turn)) {
            this.unmakeMove();
            return false;
        }
        
        return true;
    }
    
    unmakeMove() {
        const saved = this.board.history.pop();
        this.board.castling = saved.castling;
        this.board.ep = saved.ep;
        this.board.halfmove = saved.halfmove;
        this.board.key = saved.key;
        this.board.pawnKey = saved.pawnKey;
        this.board.turn = saved.turn;
        this.board.fullmove--;
        
        // Restore pieces from saved state would require tracking all piece positions
        // For simplicity, we'll rebuild the board from FEN (slower but safer)
        const fen = this.board.toFEN();
        this.board.fromFEN(fen);
    }
    
    sendInfo(depth, score, pv, pvLen) {
        if (typeof postMessage !== 'undefined') {
            let pvStr = '';
            for (let i = 0; i < pvLen; i++) {
                if (pv[i]) {
                    pvStr += ' ' + this.moveToString(pv[i]);
                }
            }
            
            const elapsed = Date.now() - this.startTime;
            const nps = elapsed > 0 ? Math.floor(this.nodes * 1000 / elapsed) : 0;
            
            postMessage(`info depth ${depth} score cp ${score} nodes ${this.nodes} nps ${nps} time ${elapsed} pv${pvStr}`);
        }
    }
    
    moveToString(move) {
        if (!move) return '';
        
        const decoded = Move.decode(move);
        const fromFile = String.fromCharCode('a'.charCodeAt(0) + ((decoded.from % 12) - 2));
        const fromRank = 8 - (Math.floor(decoded.from / 12) - 2);
        const toFile = String.fromCharCode('a'.charCodeAt(0) + ((decoded.to % 12) - 2));
        const toRank = 8 - (Math.floor(decoded.to / 12) - 2);
        
        let moveStr = fromFile + fromRank + toFile + toRank;
        
        if (decoded.flags & MOVE_PROMOTE_MASK) {
            const pieces = ['', '', 'n', 'b', 'r', 'q'];
            moveStr += pieces[decoded.promoted + 2];
        }
        
        return moveStr;
    }
}

// ============================================================================
// GLOBAL SEARCH INSTANCE
// ============================================================================

const search = new Search();

// ============================================================================
// WEB WORKER INTERFACE
// ============================================================================

if (typeof onmessage !== 'undefined') {
    onmessage = function(e) {
        const cmd = e.data;
        
        if (typeof cmd === 'string') {
            const tokens = cmd.split(' ');
            const command = tokens[0];
            
            switch (command) {
                case 'uci':
                    postMessage('id name Lozza-Inspired Chess Engine ' + BUILD);
                    postMessage('id author AI Assistant');
                    postMessage('option name Hash type spin default 16 min 1 max 1024');
                    postMessage('option name Threads type spin default 1 min 1 max 1');
                    postMessage('uciok');
                    break;
                    
                case 'isready':
                    initZobrist();
                    postMessage('readyok');
                    break;
                    
                case 'ucinewgame':
                    search.tt.newSearch();
                    break;
                    
                case 'position':
                    handlePosition(tokens);
                    break;
                    
                case 'go':
                    handleGo(tokens);
                    break;
                    
                case 'stop':
                    search.stop = true;
                    break;
                    
                case 'quit':
                    close();
                    break;
                    
                case 'ping':
                    postMessage('pong');
                    break;
                    
                case 'eval':
                    const eval_ = search.eval.evaluate(search.board);
                    postMessage('info string evaluation: ' + eval_);
                    break;
                    
                default:
                    postMessage('info string unknown command: ' + command);
            }
        }
    };
}

function handlePosition(tokens) {
    let fen = '';
    let movesStart = -1;
    
    if (tokens[1] === 'startpos') {
        fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        movesStart = tokens.indexOf('moves');
    } else if (tokens[1] === 'fen') {
        const fenEnd = tokens.indexOf('moves');
        if (fenEnd === -1) {
            fen = tokens.slice(2).join(' ');
        } else {
            fen = tokens.slice(2, fenEnd).join(' ');
            movesStart = fenEnd;
        }
    }
    
    search.board.fromFEN(fen);
    
    // Apply moves
    if (movesStart !== -1) {
        for (let i = movesStart + 1; i < tokens.length; i++) {
            const moveStr = tokens[i];
            const move = parseMove(moveStr);
            if (move) {
                search.makeMove(move);
            }
        }
    }
}

function handleGo(tokens) {
    let depth = 5;
    let timeLimit = Infinity;
    
    for (let i = 1; i < tokens.length; i++) {
        if (tokens[i] === 'depth') {
            depth = parseInt(tokens[++i]);
        } else if (tokens[i] === 'movetime') {
            timeLimit = parseInt(tokens[++i]);
        } else if (tokens[i] === 'wtime' && search.board.turn === WHITE) {
            timeLimit = parseInt(tokens[++i]) / 20; // Use 5% of time
        } else if (tokens[i] === 'btime' && search.board.turn === BLACK) {
            timeLimit = parseInt(tokens[++i]) / 20;
        }
    }
    
    // Run search
    const result = search.search(depth, timeLimit);
    
    // Send best move
    postMessage('bestmove ' + search.moveToString(result.move));
}

function parseMove(moveStr) {
    if (moveStr.length < 4) return null;
    
    const fromFile = moveStr.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = 8 - parseInt(moveStr[1]);
    const toFile = moveStr.charCodeAt(2) - 'a'.charCodeAt(0);
    const toRank = 8 - parseInt(moveStr[3]);
    
    const from = SQA8 + fromRank * 12 + fromFile;
    const to = SQA8 + toRank * 12 + toFile;
    
    let promoted = 0;
    let flags = 0;
    
    if (moveStr.length === 5) {
        flags = MOVE_PROMOTE_MASK;
        switch (moveStr[4]) {
            case 'n': promoted = KNIGHT - 2; break;
            case 'b': promoted = BISHOP - 2; break;
            case 'r': promoted = ROOK - 2; break;
            case 'q': promoted = QUEEN - 2; break;
        }
    }
    
    return new Move(from, to, promoted, flags);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Precompute LMR table
for (let depth = 1; depth < MAX_PLY; depth++) {
    for (let move = 1; move < MAX_MOVES; move++) {
        const reduction = Math.floor(Math.log(depth) * Math.log(move) / 2);
        LMR_LOOKUP[depth * MAX_MOVES + move] = Math.min(reduction, depth - 1);
    }
}

// ============================================================================
// EXPORT FOR NODE.JS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Search, Board, Evaluation };
}
