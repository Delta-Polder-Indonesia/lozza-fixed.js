# 📋 **PROMPT LENGKAP - UPGRADE ENGINE LOZZA 2.5**
---
## 🎯 **TUJUAN**
Upgrade engine Lozza 2.5 yang sudah memiliki:
- ✅ Core search (AlphaBeta, TT, LMR, Null Move, Futility, LMP, Razoring, NMCP)
- ✅ MultiPV (1-5 lines)
- ✅ Human Mode (SkillLevel, HumanNoise, HumanStyle)
- ✅ SEE (Static Exchange Evaluation)
- ✅ Dynamic Contempt
- ✅ Modern UCI outputs (WDL, ACPL, Hashfull, Seldepth)
- ✅ Benchmark & Self-test commands
Menjadi engine **modern** dengan fitur-fitur tambahan yang **critical & high priority**.
---
## PHASE 1: CRITICAL UPGRADES (Must Do First!)
### 1.1 **PONDERING MODE**
Implementasi UCI pondering mode sesuai UCI protocol.
**Requirements:**
1. Tambah opsi UCI: `Ponder` type `check`, default `false`
2. Handler untuk command `go ponder`
3. Saat ponder hit, engine harus:
   - Thinking terhadap ponder move
   - Tekedaya time management adjusted untuk ponder
4. Saat opponent move, cek gem:
   - Jika equal to ponder move, resume search immediately
   - Jika tidak, restart search dari position baru
5. Stop ponder saat me-receive `stop`, `ponderhit`, atau new `position`
**Implementation Guide:**
```javascript
// Ditambahkan di lozUCI constructor:
this.pondering      = false;
this.ponderMove    = 0;
// Definisi opsi UCI:
this.options['Ponder'] = false;
// Di case 'go':
if (uci.getStr('ponder')) {
  // Parse PV, ambil first move sebagai ponderMove
  spec.ponder = true;
  lozza.uci.ponderMove = ...; // from PV
}
// Di setoption handler:
if (key == 'ponder' || key == 'Ponder') {
  lozza.uci.options['Ponder'] = (val == 'true' || val == 'on');
}
// Di go() function:
if (this.uci.spec.ponder) {
  // Tambah konteks untuk ponder time manajemen
  // e.g., allocate additional time buffer
}
// Ponder handler baru case di onmessage:
case 'ponderhit':
  lozza.uci.pondering = false;
  lozza.stats.startTime = Date.now(); // Adjust start time
  break;
case 'stop':
  if (lozza.uci.pondering) {
    lozza.uci.pondering = false;
    lozza.stats.timeOut = 1;
  }
  break;
```
### 1.2 **OPENING BOOK**
Implementasi basic opening book (array internal minimal).
**Requirements:**
1. Book internal minimal: array of FEN + list of moves untuk first 10 plies
2. Di search, check book dulu untuk depth <= 5 dalam iterative deepening
3. Jika book move tersedia:
   - Output: `info string book move e2e4`
   - Tambah `is_book_move` flag untuk reporting PV origin
4. Jika book tidak tersedia, proses normal search
**Implementation Guide:**
```javascript
// Tambah array internal (minimal):
var OPENING_BOOK = {
  "startpos": {
    moves: ["e2e4", "d2d4", "g1f3", "c2c4"],  // Popular openings
    weights: [100, 80, 70, 60]  // Relative frequency
  },
  // Tambah hingga 5-10 positions untuk variasi opening
};
// Di lozChess.prototype.go():
function checkOpeningBook() {
  var board = this.board;
  var spec = this.uci.spec;
  var fen = board.fen().replace(/\s[0-9]+$/, "");  // Remove move numbers
  for (var i=0; i < OPENING_BOOK[fen+" w"].moves.length; i++) {
    var moveStr = OPENING_BOOK[fen+" w"].moves[i];
    if (board.playMove(moveStr)) {
      board.turn = ~board.turn & COLOR_MASK; // Revert
      this.uci.send('info string book move', moveStr);
      return this.board.formatMove(board.playMove(moveStr), UCI_FMT);
    }
  }
  return null;  // No book move found
}
// Di go() sebelum search:
if (ply <= 5) {
  var bookMove = this.checkOpeningBook();
  if (bookMove != null) {
    this.uci.send('bestmove', bookMove);
    return;
  }
}
```
### 1.3 **RECAPTURE EXTENSION**
Implementasi proper recapture extension dengan material comparison.
**Requirements:**
1. Track `node.lastTo`, `node.lastFr`, `node.lastCapturedPiece`
2. Set saat makeMove, clear/re-init saat node.init
3. Di alphabeta: jika move.to == lastTo:
   - Hitung delta: captured value now vs lastCapturedPiece
   - Jika delta negative (ganti piece kecil dengan piece besar), extension
4. Threshold depth for extension (e.g., >= 5)
**Implementation Guide:**
```javascript
// Di lozNode constructor:
this.lastTo = 0;
this.lastFr = 0;
this.lastCapturedPiece = 0;
// Di lozNode.prototype.init():
this.lastTo = 0;
this.lastFr = 0;
this.lastCapturedPiece = 0;
// Di makeMove():
var toObj   = (move & MOVE_TOOBJ_MASK) >>> MOVE_TOOBJ_BITS;
node.childNode.lastTo = to;
node.childNode.lastFr = fr;
node.childNode.lastCapturedPiece = toObj & PIECE_MASK;
// Di lozBoard (tambah material values array untuk quick lookup):
if (!this.MATERIAL_VALUES) {
  this.MATERIAL_VALUES = [0, 100, 320, 330, 500, 900, 20000];
}
// Di alphabeta extension logic:
var recaptureExtension = 0;
if (depth >= 5 && node.parentNode && node.parentNode.lastTo == to) {
  var capturedNow = (move & MOVE_TOOBJ_MASK) >>> MOVE_TOOBJ_BITS;
  var capturedThen = node.parentNode.lastCapturedPiece;
  var delta = board.MATERIAL_VALUES[capturedThen] - board.MATERIAL_VALUES[capturedNow];
  
  if (delta > 100) {  // Significant recapture gain
    recaptureExtension = 1;
    E += recaptureExtension;
  }
}
```
### 1.4 **CONTEMPT RESET**
Fix contempt tidak di-reset saat `ucinewgame`.
**Requirements:**
1. Di case `ucinewgame`, explicit-reset contempt value
2. Simpan default contempt dalam variable untuk dapat restore
3. Pastikan dynamic contempt calculation kemudian started dari base ko ndisi
**Implementation Guide:**
```javascript
// Di case 'ucinewgame':
case 'ucinewgame':
  lozza.newGameInit();
  
  // Reset contempt ke default
  lozza.uci.options['Contempt'] = '0';
  
  // Atau if service-level default specified:
  // lozza.uci.options['Contempt'] = '50';  // Example
  
  break;
// Pastikan getContemptSetting() reads current value:
lozChess.prototype.getContemptSetting = function() {
  var val = parseInt(this.uci.options.Contempt, 10);
  if (isNaN(val)) val = 0;
  return val;
}
```
---
## PHASE 2: SEARCH UPGRADES
### 2.1 **COUNTERMOVES HEURISTIC**
Implementasi countermoves untuk move ordering.
**Requirements:**
1. Array `counterMoves[144][144]` untuk menyimpan move yang membalas
2. Update saat coupé move tercipta di TT score >= beta (beta cut-off)
3. Di move ordering: bonus untuk counter moves sebelum killers
4. Score counter moves base depth: `BASE_COUNTERMOVE + historyScore`
**Implementation Guide:**
```javascript
// Global array:
var counterMoves = new Array(144);
for (var i=0; i<144; i++) {
  counterMoves[i] = new Array(144);
  for (var j=0; j<144; j++)
    counterMoves[i][j] = 0;
}
// Di搜案 provider (lozNode) add move ranking:
// Saat add capture moves atau quiet moves, check:
if (node.parentNode && node.parentNode.lastTo != 0) {
  var prevTo = node.parentNode.lastTo;
  var counterMove = counterMoves[prevTo][fr];
  if (counterMove == move) {
    this.ranks[n] += BASE_COUNTERMOVE;
  }
}
// Update saat beta cut-off:
if (score >= beta) {
  if (node.parentNode && node.parentNode.lastTo != 0) {
    var prevTo = node.parentNode.lastTo;
    counterMoves[prevTo][fr] = move;  // Update counter move
  }
}
```
### 2.2 **HISTORY PRUNING**
Implementasi history pruning untuk skip moves.
**Requirements:**
1. Track `badCaptures[6][144]` array untuk moves yang cause fail-high reduction
2. Tambah history pruning condition di deep nodes (depth >= 4)
3. Prune jika: (numSix + 6)*depth > historyScore[pièce][square]
4. Don't prune captures, promotions, checks, moves giving check
**Implementation Guide:**
```javascript
// Di lozBoard (or lozChess):
var badCaptures = Array(7);
for (var i=0; i<7; i++) {
  badCaptures[i] = Array(144);
  for (var j=0; j<144; j++)
    badCaptures[i][j] = 0;
}
// Di alphabeta move loop, sebelum makeMove for non-keeper moves:
if (!keeper && depth >= 4 && !inCheck) {
  var historyScore = (frCol == WHITE) 
    ? this.wHistory[frPiece][to] 
    : this.bHistory[frPiece][to];
  
  var remainingMoves = node.numMoves - node.sortedIndex;
  var threshold = (depth * depth * depth) / 2 + remainingMoves * 2;
  
  if (historyScore < threshold) {
    // Also check captures piece value isn't too large
    var toPiece = (move & MOVE_TOOBJ_MASK) >>> MOVE_TOOBJ_BITS;
    if (toPiece == EMPTY) {  
      // Not a capture, may prune
      // Add check if move doesn't give check
      continue;  // Skip this move
    }
  }
}
```
### 2.3 **CONTINUATION HISTORY**
Implementasi continuation history untuk better move ordering.
**Requirements:**
1. `continuationHistory[2][6][6][144]` array
  - [0]=current node, [1]=parent node depth
  - [6][6] = piece combination (e.g., knight->knight)
  - [144] = to square
2. Update saat coupé with good move (score > alpha)
3. Update untuk bad move (score <= alpha)
4. Gunakan di move ranking dengan bias yang kuat
**Implementation Guide:**
```javascript
// Init global:
var continuationHistory = new Array(2);
for (var i=0; i<2; i++) {
  continuationHistory[i] = new Array(6);
  for (var j=0; j<6; j++) {
    continuationHistory[i][j] = new Array(6);
    for (var k=0; k<6; k++) {
      continuationHistory[i][j][k] = new Array(144);
      for (var l=0; l<144; l++)
        continuationHistory[i][j][k][l] = 0;
    }
  }
}
// Di move ranking, add continuation history bonus:
if (node.parentNode) {
  var parentFrPiece = node.parentNode.lastFrPiece;
  if (parentFrPiece) {
    var contHist = continuationHistory[0][frPiece-1][parentFrPiece-1][to];
    this.ranks[n] += contHist * 0.1;  // Scale appropriately
  }
}
```
### 2.4 **BETTER EXTENSIONS**
Ha multiple extension types lebih sophisticated.
**Requirements:**
1. **Queen Check Extension**: depth+1 jika queen check pada critical depth
2. **Critical Pawn Push**: Pawn to 6th (white) or 3rd (black) creating passed pawn
3. **Double Check**: Double check jadi multi-extension
4. **Discover check threat**: Unpin piece making discovered check candidate
**Implementation Guide:**
```javascript
// Di extension logic area (alphabeta):
var es = 0;
// Existing check extension
if (inCheck) {
  es = 1;
  
  // Double check extension
  if (numChecks >= 2) {
    es = 2;
  }
  
  // Queen check extension at certain depths
  if (depth >= 6 && checkingPiece == QUEEN) {
    es = 2;
  }
}
// Critical pawn push extension
else if (!inCheck && frPiece == PAWN) {
  var toRank = turn == WHITE ? RANK[to] : (9 - RANK[to]);
  if (toRank == 6) {  // Pawn about to promote next move
    // Check if this creates passed pawn
    if (this.isPassedPawn(to, turn)) {
      es = 1;  // Push extension
    }
  }
}
// Add to total extension
E += es;
```
---
## PHASE 3: ENDGAME & EVALUATION UPGRADES
### 3.1 **SYZYGY EGTB (3-5 man)**
Integrate Syzygy endgame tablebases.
**Requirements:**
1. Load Syzygy JavaScript library for WDL and DTZ
2. Di evaluation phase, jika total pieces <= 5, kueri EGTB
3. Gunakan EGTB score untuk override evaluation
4. Output `info string tbhit` saat menghitung EGTB
5. Handle position tanpa result (e.g., 6 pieces or loaded file tidak tersedia)
**Implementation Guide:**
```javascript
// Tambah requirement file loading:
// Need to import/require Syzygy library, misalnya:
// const Syzygy = require('syzygy.js');
// Di lozBoard init:
this.hasEGTB = false;
this.syzygyWDL = null;
this.syzygyDTZ = null;
// Tambah function untuk query EGTB:
lozBoard.prototype.queryEGTB = function () {
  if (!this.hasEGTB) return null;
  if (this.wCount + this.bCount > 5) return null;
  
  // Construct position untuk Syzygy query
  var whitePieces = this.getPieceList(WHITE);
  var blackPieces = this.getPieceList(BLACK);
  
  try {
    // Call Syzygy API
    var wdl = this.syzygyWDL.probe_wdl(whitePieces, blackPieces, this.turn);
    var dtz = this.syzygyDTZ.probe_dtz(whitePieces, blackPieces, this.turn);
    
    if (wdl !== null) {
      // Convert WDL score to engine score:
      // WDL: 2=win, 1=cursed win, 0=draw, -1=cursed loss, -2=loss
      var egtbScore = this.wdlToScore(wdl, dtz);
      return egtbScore;
    }
  } catch (e) {
    // Handle EGTB query errors
  }
  
  return null;
}
// Di evaluate():
var egtbScore = this.queryEGTB();
if (egtbScore !== null) {
  return egtbScore;  // Use EGTB perfect score
}
// Helper untuk convert WDL ke engine score range:
lozBoard.prototype.wdlToScore = function (wdl, dtz) {
  // E.g., -2 (certipro loss) with dtz=50 => ~mate in 50
  if (wdl == -2) {
    return -MATE + node.ply + dtz;
  }
  if (wdl == 2) {
    return MATE - node.ply - dtz;
  }
  // Cursed wins/losses and draws are normally evaluate to near CONTEMPT
  return CONTEMPT;
}
```
### 3.2 **KING ACTIVITY (ENDGAME)**
Implementasi king activity scoring untuk endgame.
**Requirements:**
1. Detect endgame phase (low material, e.g., < 20 pieces)
2. Evaluasi king proximity to:
   - Passed pawns: king seharusnya dekat own passed pawn, far dari opponent's
   - Center pawns: king seharusnya mengontrol center di endgame
3. Bonus untuk king activity in ending
**Implementation Guide:**
```javascript
// Di evaluate(), setelah phase determination:
var isEndgame = phase && (wCount + bCount <= 16);
// King activity bonus only if endgame
if (isEndgame) {
  // King proximity to passed pawns
  kingE += this.evaluateKingProximityToPassedPawns(WHITE, wKingSq, bKingSq);
  kingE -= this.evaluateKingProximityToPassedPawns(BLACK, bKingSq, wKingSq);
  
  // King center activity
  kingE += this.evaluateKingCenterActivity(wKingSq, wKingRank, wKingFile);
  kingE -= this.evaluateKingCenterActivity(bKingSq, bKingRank, bKingFile);
}
// Tambahan function:
lozBoard.prototype.evaluateKingProximityToPassedPawns = function (side, kingSq, oppKingSq) {
  var bonus = 0;
  var pList = (side == WHITE) ? this.wList : this.bList;
  
  for (var i=0; i < pList.length; i++) {
    var sq = pList[i];
    if (!sq || this.b[sq] & COLOR_MASK !== side) continue;
    if (this.b[sq] & PIECE_MASK !== PAWN) continue;
    
    if (this.isPassedPawn(sq, side)) {
      // King should be close to own passed pawn
      var myDist = DIST[kingSq][sq];
      var oppDist = DIST[oppKingSq][sq];
      
      if (myDist < oppDist) bonus += 30;
      else bonus -= 20;
    }
  }
  
  return bonus;
}
lozBoard.prototype.evaluateKingCenterActivity = function (kingSq, rank, file) {
  // Prefer king in center during endgame
  if (rank >= 4 && rank <= 5 && file >= 4 && file <= 6)
    return 20;  // Center squares
  return 0;
}
```
### 3.3 **PASSED PAWN DISTANCE DETAILED**
Enhanced passed pawn evaluation dengan distance-to-promotion consideration.
**Requirements:**
1. Hitung passed pawn distance ke promosi square
2. King distance ke promosi square
3. Apakah pawn punya support terdekat (pawn or piece)
4. Multiply passed pawn value by these factors
**Implementation Guide:**
```javascript
// Tambah function untuk menghitung dinamik passed pawn value:
function evaluatePassedPawnDynamic(sq, turn) {
  var rank = RANK[sq];
  var file = FILE[sq];
  var distToPromote = (turn == WHITE) ? (8 - rank) : rank;
  
  // Better if closer to promoting
  var promotion = 100 * (14 - distToPromote);  // 14 max for distance
  
  // King support/attack consideration
  var wKingSq = this.wList[0];
  var bKingSq = this.bList[0];
  
  // Distance from king to pawn's forward path
  var kingDistToPath = ...;
  
  // Promotion if king can't block
  if (kingDistToPath > distToPromote + 3) {
    promotion += 50;  // Bonus for unstoppable
  }
  
  return promotion;
}
// Gunakan ini dalam phase 3 pawn evaluation untuk menggantikan simple PAWN_PASSED
```
---
## PHASE 4: PERFORMANCE & OPTIMIZATION
### 4.1 **PV HASH**
Implementasi PV hash untuk menghindari re-searching PV.
**Requirements:**
1. Di `ttPut`, store juga full PV (if not empty) atau at least first few moves
2. Di `ttGet`, dapat PV dari TT (bentuk array of moves)
3. Di `getPVStr`, gunakan PV dari TT jika ada, bypass recursive calls
4. Respect PV length limit (e.g., max 30 moves) untuk manage memory
**Implementation Guide:**
```javascript
// Pertama, modify TT storage untuk bisa menyimpan PV moves:
// Untuk minimalisasi, store only first 2-3 moves dari PV
// Di ttPut:
lozBoard.prototype.ttPut = function (type, depth, score, move, ply, alpha, beta, eval) {
  // ... existing code ...
  
  // If PV node and we have move, store it
  if (type == TT_EXACT && move != 0) {
    this.ttPV[idx] = move;  // Store best move for PV retrieval
  }
}
// Di ttGet, tambahkan property:
node.hashPVMove = this.ttPV[idx];
// Di getPVStr, gunakan ini terdahulu untuk mempercepat:
lozBoard.prototype.getPVStr = function(node, move, depth) {
  var pv = '';
  var remaining = depth;
  
  do {
    if (remaining <= 0) break;
    
    if (!move) {
      move = this.ttGetMove(node);
    }
    
    if (!move) break;
    
    pv += ' ' + this.formatMove(move, this.mvFmt);
    
    node.cache();
    this.makeMove(node, move);
    
    // Try to get PV from TT first
    var pvMove = this.ttPV[this.loHash & TTMASK];
    if (pvMove) {
      move = pvMove;
    } else {
      move = 0;
    }
    
    remaining--;
  } while (move != 0 && remaining > 0);
  
  return pv.trim();
}
```
### 4.2 **ATTACK MAPS / BITBOARD (Optional)**
Optional pre-computed attack tables (reuse 0x88 or upgrade to bitboard).
**Requirements:**
1. Precompute attack tables untuk N/B/R/Q/K from each square
2. Gunakan ini untuk accelerate `isAttacked()` function
3. Update attack maps saat move make/unmake (for incremental speed)
**Implementation Guide:**
```javascript
// Di lozBoard constructor/init:
this.attackMaps = new Array(144);
for (var sq=0; sq<144; sq++) {
  this.attackMaps[sq] = new Array(2);  // [0]=attacks white, [1]=attacks black
  this.attackMaps[sq][0] = new Array(144);  // From square: true/false if attacked
  this.attackMaps[sq][1] = new Array(144);
}
// Di init() atau pre-compute:
lozBoard.prototype.precomputeAttackMaps = function() {
  // Untuk each square, precompute attacks for each piece type
  // Ini memakan memory tapi speed up isAttacked()
}
// Di isAttacked, gunakan precomputed maps:
lozBoard.prototype.isAttacked = function(to, byCol) {
  if (byCol == WHITE) {
    if (this.b[to+13] == W_PAWN || this.b[to-13] == W_PAWN) return 1;
    if (this.attackMaps[to][0][KNIGHT]) return 1;
    // etc.
  }
  // ...
}
```
### 4.3 **ADVANCED TIME MANAGEMENT**
Implementasi more sophisticated time management.
**Requirements:**
1. Hitung sisa projects moves berdasarkan phase dan game status
2. Dinamis alokasi waktu per move:
   - Lebih banyak di kompleks position (high conflict, low depth)
   - Lebih sedikit di sederhana position (clear advantage, simple tactics)
3. Consider: time moves harassment, last move urgency, check血栓
**Implementation Guide:**
```javascript
// Di lozChess.prototype.go(), existing time manajemen logic di-enhanced:
lozChess.prototype.calculateMoveTime = function() {
  var board = this.board;
  var spec = this.uci.spec;
  
  // Calculate remaining projected moves
  var totalPieces = board.wCount + board.bCount;
  var openingPhase = totalPieces > 28;
  var endgamePhase = totalPieces < 10;
  
  // Dynamic movesToGo
  var movesToGo;
  if (spec.movesToGo > 0) {
    movesToGo = spec.movesToGo;
  } else if (endgamePhase) {
    movesToGo = 20;  // Fewer moves in endgame
  } else if (openingPhase) {
    movesToGo = 40;  // More moves in opening/middlegame
  } else {
    movesToGo = 30;  // Average
  }
  
  // Base time allocation
  var baseTime = (turn == WHITE ? spec.wTime : spec.bTime) / movesToGo;
  var incTime = (turn == WHITE ? spec.wInc : spec.bInc);
  
  // Complex position factor
  var complexityFactor = 1.0;
  
  // Increase time if position uncertain (PV swing, low depth, etc.)
  if (lastPvSwing > 30) {
    complexityFactor += 0.2;
  }
  
  // Decrease time if very strong position (high alpha-beta margin)
  if (lastScore > 100 && !lastScoreWasMate) {
    complexityFactor -= 0.1;
  }
  
  // Apply time buffer for blunder prevention
  var totalTime = baseTime + incTime;
  var moveTime = baseTime * complexityFactor;
  
  // Ensure minimum time allocation
  if (moveTime < 100) moveTime = 100;
  
  // Set maximum time at 70% of remaining to avoid timeout
  var maxTime = totaltime * 0.7;
  if (moveTime > maxTime) moveTime = maxTime;
  
  return moveTime;
}
```
---
## PHASE 5: ADVANCED EVALUATION
### 5.1 **TUNED PST FROM DATASET**
Implementasi algorithm untuk tune PST dari dataset.
**Requirements:**
1. Gunakan dataset EPD quiet-labeled untuk training
2. Implementasi tuning algorithm (e.g., simplex, gradient descent)
3. Optimize PST weights untuk maximize correct rate
4. Generate runtime PST values dari tuned weights
**Implementation Guide:**
```javascript
// Initialisierung PST weights untuk training:
var INITIAL_PST_WEIGHTS = {
  // Center and control preferences per piece
  knight: [0, 0, -20, 20, 40, 50, 30, 10, 0, 0, // Example per rank/file combo
          // ...Fill for all 64 squares...
  ],
  bishop: [...],
  rook: [...],
  queen: [...],
  king: [...]
};
// Training framework (run outside engine loop):
function trainPST(dataset) {
  // Use quiet positions only
  // For each position, evaluate with current PST
  // Compare to reference evaluation (e.g., Stockfish or engine output)
  // Adjust PST weights to minimize error
  // Repeat until convergence
  
  // Implementasi basic coordinate descent atau grid search
  for (var piece in INITIAL_PST_WEIGHTS) {
    for (var square=0; square < 64; square++) {
      // Test small adjustment
      ORIGINAL_PST_WEIGHTS[piece][square] += delta;
      var adjustScore = evaluateDataset(dataset);
      
      if (adjustScore > currentScore) {
        // Keep adjustment
        currentScore = adjustScore;
      } else {
        // Revert
        ORIGINAL_PST_WEIGHTS[piece][square] -= delta;
      }
    }
  }
}
// Setelah training, generate final PST arrays for engine use
function generatePSTFromWeights(weights) {
  // Convert weight values ke final PST arrays (WPAWN_PSTE, etc.)
}
```
### 5.2 **KING SAFETY ADVANCED**
Advanced king safety dengan more factors.
**Requirements:**
1. Pin detection: apakah piece yang menyerang king is pinned by own piece
2. Weak squares: square tidak terlindungi oleh own pawn di front of king
3. King exposure: berapa banyak attack line ke raja
4. Attack table untuk king zone: total attack weight depan raja
**Implementation Guide:**
```javascript
// Di evaluate king safety bag, lengthen:
lozBoard.prototype.evaluateKingSafetyAdvanced = function(fromside, kingSq, oppPieces) {
  var penalty = 0;
  var kingFile = FILE[kingSq];
  var kingRank = RANK[kingSq];
  
  // 1. Weak squares
  penalty += this.calculateWeakSquares(kingFile, kingRank, fromside);
  
  // 2. King exposure - rook/queen lines
  penalty += this.calculateKingExposure(kingSq, fromside);
  
  // 3. Attack table on king zone
  penalty += this.calculateKingZoneAttacks(kingSq, fromside);
  
  // 4. Surrounding pawn support
  penalty += this.calculatePawnSupport(kingSq, fromside);
  
  return penalty;
}
// Implementasi sub-functions:
lozBoard.prototype.calculateWeakSquares = function(kingFile, kingRank, fromside) {
  // Sponsor squares depan raja
  // Check jika squares tidak terlindungi oleh pawn
}
lozBoard.prototype.calculateKingExposure = function(kingSq, fromside) {
  // Check if open files attacking king
  // Check diagonals if no pawn protection
}
```
### 5.3 **PAWN LEVERS & DUOS**
Implementasi pawn lever dan duo evaluation.
**Requirements:**
1. Pawn lever: dua pawn di adjacent file saling push
2. Pawn duo: dua pawn di adjacent file connected dan supported
3. Bonus/penalty untuk lever/duo tergantung king positioning dan files
**Implementation Guide:**
```javascript
// Di pawn evaluation bag:
lozBoard.prototype.evaluatePawnLevers = function(side) {
  var bonus = 0;
  var pList = (side == WHITE) ? this.wList : this.bList;
  
  for (var i=0; i < pList.length; i++) {
    var sq = pList[i];
    if (!sq || this.b[sq] & PIECE_MASK !== PAWN) continue;
    
    var file = FILE[sq];
    var rank = RANK[sq];
    
    // Check neighbor file for opposing pawn - it's a lever
    for (var df = -1; df <= 1; df += 2) {  // Left or right file
      var adjFile = file + df;
      if (adjFile < 1 || adjFile > 8) continue;
      
      var leverSq = sq + (side == WHITE ? -12 : 12);
      var leverObj = this.b[leverSq];
      
      if (leverObj && (leverObj & COLOR_MASK) !== side 
          && (leverObj & PIECE_MASK) === PAWN) {
        // Found a lever!
        bonus += 15;  // Bonus for lever activity
        
        // Better if lever closer to enemy king
        var enemyKingSq = (side == WHITE) ? this.bList[0] : this.wList[0];
        if (rank <= 2 || rank >= 7) {  // Near back rank (levers虫 localiized)
          bonus += 10;
        }
      }
    }
  }
  
  return bonus;
}
lozBoard.prototype.evaluatePawnDuos = function(side) {
  var bonus = 0;
  var pList = (side == WHITE) ? this.wList : this.bList;
  
  for (var i=0; i < pList.length; i++) {
    var sq = pList[i];
    if (!sq || this.b[sq] & PIECE_MASK !== PAWN) continue;
    
    var file = FILE[sq];
    var rank = RANK[sq];
    
    // Check for duo: adjacent file pawn at same rank or rank-1 (own forward)
    for (var df = -1; df <= 1; df += 2) {
      var adjFile = file + df;
      if (adjFile < 1 || adjFile > 8) continue;
      
      var duoSq = sq + (side == WHITE ? -12 : 12) + (side == WHITE ? df : -df);
      var duoObj = this.b[duoSq];
      
      if (duoObj && (duoObj & COLOR_MASK) === side 
          && (duoObj & PIECE_MASK) === PAWN) {
        bonus += 10;  // Duo bonus
      }
    }
  }
  
  return bonus;
}
```
### 5.4 **BISHOP/ROOK BEHIND PAWN**
Implementasi pieces behind pawn evaluation.
**Requirements:**
1. Bishop behind pawn: bishop di belakang pawn dari own color same diagonal
2. Rook behind pawn: rook di same file di belakang pawn
3. Bonus jika piece di belakang passed pawn
**Implementation Guide:**
```javascript
// Di pieces evaluation bag (khusus bishop):
if (frObj == W_BISHOP || frObj == B_BISHOP) {
  // Existing mobility/tight probing也加分, tapi tambahkan:
  
  var bishopBehindPawn = 0;
  var direction = (frCol == WHITE ? 1 : -1);  // Forward direction
  
  // Check squares ahead for pawns
  var sqAhead = sq + (direction * 11);
  while (this.b[sqAhead] && this.b[sqAhead] != EDGE) {
    if (this.b[sqAhead] == PAWN && (this.b[sqAhead] & COLOR_MASK) == frCol) {
      bishopBehindPawn = 1;  // Bishop behind own pawn
      break;
    }
    sqAhead += direction * 11;
  }
  
  if (bishopBehindPawn) {
    // Bonus better if pawn is passed or about to advance
    bishopsS += 20;
  }
}
// Untuk rook on open file:
if (frObj == W_ROOK || frObj == B_ROOK) {
  var rookBehindPawn = 0;
  var direction = (frCol == WHITE ? 1 : -1);
  
  var sqAhead = sq + (direction * 12);
  while (this.b[sqAhead] && this.b[sqAhead] != EDGE) {
    if (this.b[sqAhead] == PAWN && (this.b[sqAhead] & COLOR_MASK) == frCol) {
      rookBehindPawn = 1;
      break;
    }
    sqAhead += direction * 12;
  }
  
  if (rookBehindPawn) {
    // Bonus with additional consideration for passed pawn
    rooksS += 15;
  }
}
```
---
## PHASE 6: MODERN UCI & TESTING
### 6.1 **UCI PROTOCOL V2 OPTIONS**
Implementasi proper UCI v2 option types.
**Requirements:**
1. Gunakan `type spin` untuk numeric options dengan min/max
2. Gunakan `type combo` untuk string options dengan choices
3. Gunakan `type check` untuk boolean options
4. Output proper option description pada `uci` command
**Implementation Guide:**
```javascript
// Di case 'uci':
case 'uci':
  uci.send('id name Lozza',BUILD);
  uci.send('id author Colin Jenkins');
  
  // Options with proper UCI v2 types:
  uci.send('option name MultiPV type spin default 1 min 1 max 5');
  uci.send('option name SkillLevel type spin default 20 min 0 max 20');
  uci.send('option name Contempt type spin default 0 min -200 max 200');
  uci.send('option name HumanMode type check default false');
  uci.send('option name HumanNoise type spin default 0 min 0 max 100');
  uci.send('option name HumanStyle type combo default balanced var aggressive var defensive var tactical var positional var balanced');
  uci.send('option name ShowWDL type check default true');
  uci.send('option name ShowEvalBar type check default true');
  uci.send('option name ShowACPL type check default true');
  uci.send('option name Ponder type check default false');
  
  uci.send('uciok');
  break;
```
### 6.2 **EXTENDED BENCHMARK SUITE**
Implementasi suite benchmark positions.
**Requirements:**
1. Tambah LCT (Logical Chess Test) atau STS (Strategic Test Suite)
2. Hitung success rate (berapa banyak positions solved correctly)
3. Compare performance在不同depths的时间
4. Output summary statistics for evaluation
**Implementation Guide:**
```javascript
// Define benchmark suite:
var LCG_TEST_SUITE = [
  // Positions from LCT movement μα test set
  { fen: "...", solution: "...", depth: 10 },
  // Add 50-100 positions...
];
var STS_TEST_SUITE = [
  // Strategic Test Suite positions
  { fen: "...", bestMove: "...", evaluation: "..." },
  // Add positions...
];
// Di lozChess.prototype.bench():
lozChess.prototype.benchTestSuite = function(suiteName, suiteDepth) {
  var results = {
    positions: suiteName.length,
    solved: 0,
    nodes: 0,
    time: 0
  };
  
  var suite = (suiteName == 'LCT') ? LCG_TEST_SUITE : (suiteName == 'STS' ? STS_TEST_SUITE : BENCHMARK_POSITIONS);
  
  for (var i=0; i < suite.length; i++) {
    this.uci.spec.board = suite[i].fen;
    this.board.position();
    
    var start = Date.now();
    this.goDepth(suiteDepth);  // Run search to specified depth
    var elapsed = Date.now() - start;
    
    results.nodes += this.stats.nodes;
    results.time += elapsed;
    
    if (this.checkSolution(suite[i])) {
      results.solved++;
    }
  }
  
  this.uci.send('info string', suiteName, 'benchmark results:');
  this.uci.send('info string  Positions:', results.positions, 'Solved:', results.solved, 'Rate:', 
    (results.solved / results.positions * 100).toFixed(1) + '%');
  this.uci.send('info string  Total nodes:', results.nodes, 'Total time:', results.time, 'nps:', 
    (results.nodes / results.time * 1000 | 0));
}
```
### 6.3 **SELF-TEST REGRESSION**
Implementasi regression testing framework.
**Requirements:**
1. Store good PVs sebagai test suite
2. Function `regressionTest()` untuk menerima array of test positions
3. Untuk setiap position, search and verify result matches expected
4. Report pass/fail per position and summary
**Implementation Guide:**
```javascript
// Define regression test positions:
var REGRESSION_TEST = [
  { 
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
    depth: 12,
    expectedMove: "e2e4",
    tolerance: 50  // Evaluation tolerance
  },
  // Add 50-100 real-world test cases...
];
// Implementasi regression test function:
lozChess.prototype.regressionTest = function() {
  var passed = 0;
  var failed = 0;
  var results = [];
  
  for (var i=0; i < REGRESSION_TEST.length; i++) {
    var test = REGRESSION_TEST[i];
    
    this.uci.spec.board = test.fen;
    this.board.position();
    
    // Run search
    this.stats.init();
    this.search(this.rootNode, test.depth, this.board.turn, -INFINITY, INFINITY);
    
    // Check result
    var actualMove = this.board.formatMove(this.stats.bestMove, UCI_FMT);
    var score = this.board.evaluate(this.board.turn);
    
    var testPass = false;
    var status = "";
    
    if (actualMove === test.expectedMove) {
      testPass = true;
      status = "PASS: Move match";
    } else if (Math.abs(score - test.expectedScore) <= test.tolerance) {
      testPass = true;
      status = "PASS: Score within tolerance";
    } else {
      failed++;
      status = "FAIL: Expected " + test.expectedMove + " got " + actualMove;
    }
    
    if (testPass) {
      passed++;
    }
    
    results.push({
      id: i+1,
      fen: test.fen,
      expected: test.expectedMove,
      actual: actualMove,
      status: status
    });
  }
  
  // Report results
  this.uci.send('info string REGRESSION TEST RESULTS');
  this.uci.send('info string  Total:', passed + failed, 'Pass:', passed, 'Fail:', failed, 'Rate:', 
    (passed / (passed + failed) * 100).toFixed(1) + '%');
  
  for (var i=0; i < results.length; i++) {
    this.uci.send('info string', '#' + results[i].id, ':', results[i].status);
  }
}
// Tambahkan command handler:
case 'regressiontest':
  lozza.regressionTest();
  break;
```
---
## 🎯 **PRIORITY IMPLEMENTATION ORDER**
### 🔴 **Phase 1 - Critical (Do First!)**
1. Pondering mode
2. Opening book (minimal)
3. Recapture extension
4. Contempt reset on ucinewgame
### 🚀 **Phase 2 - Search Upgrades**
5. Countermoves heuristic
6. History pruning
7. Continuation history
8. Better extensions (queen check, critical pawn push, double check)
### ♟️ **Phase 3 - Endgame & Eval**
9. Syzygy EGTB (3-5 man) - optional jika membatasi complexity
10. King activity evaluation
11. Passed pawn distance detailed
### ⚡ **Phase 4 - Performance**
12. PV hash
13. Attack maps (optional for 0x88, skip if precompute expensive)
14. Advanced time management
### 🎲 **Phase 5 - Advanced Eval**
15. PST tuning from dataset (run offline, embed results)
16. King safety advanced
17. Pawn levers & duos
18. Bishop/rook behind pawn
### 📊 **Phase 6 - Testing**
19. UCI v2 options
20. Extended benchmark suite
21. Regression testing framework
---
## ✅ **CHECKLIST SEBELUM STARTING IMPLEMENTATION**
- [ ] Backup current `index.html`
- [ ] Verify current engine status with `selftest`
- [ ] Check `setoption` list matches README
- [ ] Review `ENGINE_REVIEW.md` for detailed analysis
- [ ] Prepare test scenarios for each new feature
- [ ] Ensure no undefined variable references
- [ ] Confirm all brace structures properly closed
---
## 📝 **CATATAN PENTING**
1. **Testing Setiap Fitur**: Implementasi fitur satu per satu dan test terlebih dahulu
2. **Performance Trade-offs**: Setiap addition mengorbankan time/complexity
3. **Memory Considerations**: 0x88 format lebih hemat daripada bitboard
4. **Browser Limitation**: JavaScript dipakai memory limit untuk worker
5. **UCI Compliance**: Verify test dengan standard GUI (Arena, CuteChess, Chessbase)
---
Copy paste prompt ini ke assistant untuk melanjutkan implementasi phase by phase. Mulai dari **Phase 1 (Critical)** terlebih dahulu!