// Enhanced Chess Game Logic with Drag-and-Drop

// Zobrist hashing constants for better transposition table
const ZOBRIST_PIECES = [];
const ZOBRIST_PLAYER = Math.random() * 0xFFFFFFFF | 0;

// Initialize zobrist hash table
for (let i = 0; i < 64; i++) {
    ZOBRIST_PIECES[i] = [];
    for (let j = 0; j < 12; j++) {
        ZOBRIST_PIECES[i][j] = Math.random() * 0xFFFFFFFF | 0;
    }
}

// Chess Engine Integration
let stockfish = null;
let komodo = null;
let currentEngine = null;
let stockfishAnalysisTimer = null;
let periodicStockfishAnalysisInProgress = false;
const STOCKFISH_ANALYSIS_INTERVAL_SECONDS = 20;
let stockfishLoadAttempted = false;

// Initialize engines (assumes stockfish.js is loaded)
function initEngines() {
    try {
        if (typeof Stockfish !== 'undefined') {
            stockfish = new Stockfish();
            stockfish.onmessage = handleStockfishMessage;
            stockfish.postMessage('uci');
            console.log('Stockfish initialized successfully');

            // Test Stockfish with a simple position
            setTimeout(() => {
                stockfish.postMessage('position startpos');
                stockfish.postMessage('go depth 1');
            }, 1000);

            startPeriodicStockfishAnalysis(STOCKFISH_ANALYSIS_INTERVAL_SECONDS);
        } else {
            // Try to load a local copy of stockfish.js before giving up
            if (!stockfishLoadAttempted) {
                stockfishLoadAttempted = true;
                const s = document.createElement('script');
                s.src = 'stockfish.js';
                s.onload = () => {
                    console.log('Local stockfish.js loaded, re-initializing engines');
                    initEngines();
                };
                s.onerror = () => {
                    console.warn('Local stockfish.js not found; using fallback AI');
                };
                document.head.appendChild(s);
                return;
            } else {
                console.warn('Stockfish not available after attempting local load, using fallback AI');
            }
        }
    } catch (e) {
        console.error('Failed to initialize Stockfish:', e);
    }

    // Try to initialize Komodo engine if available (optional)
    try {
        if (typeof Komodo !== 'undefined') {
            komodo = new Komodo();
            komodo.onmessage = handleKomodoMessage;
            komodo.postMessage('uci');
            console.log('Komodo initialized successfully');
        } else {
            komodo = null;
        }
    } catch (kErr) {
        console.warn('Komodo initialization failed or not present:', kErr);
        komodo = null;
    }
}

function startPeriodicStockfishAnalysis(intervalSeconds = STOCKFISH_ANALYSIS_INTERVAL_SECONDS) {
    stopPeriodicStockfishAnalysis();

    if (!stockfish) return;

    stockfishAnalysisTimer = setInterval(() => {
        if (!stockfish || game.gameOver || periodicStockfishAnalysisInProgress) return;
        periodicStockfishAnalysisInProgress = true;
        showAIBestMoveAnalysis(() => {
            periodicStockfishAnalysisInProgress = false;
        });
    }, Math.max(5000, intervalSeconds * 1000));
}

function stopPeriodicStockfishAnalysis() {
    if (stockfishAnalysisTimer) {
        clearInterval(stockfishAnalysisTimer);
        stockfishAnalysisTimer = null;
    }
}

// Engine message handlers
let stockfishCallbacks = {};
let komodoCallbacks = {};

function handleStockfishMessage(event) {
    const line = event.data;
    if (line.startsWith('bestmove')) {
        const callback = stockfishCallbacks.bestmove;
        if (callback) {
            const parts = line.split(' ');
            const move = parts[1];
            callback(move);
            delete stockfishCallbacks.bestmove;
        }
    } else if (line.startsWith('info')) {
        const callback = stockfishCallbacks.info;
        if (callback) callback(line);
    }
}

function handleKomodoMessage(event) {
    const line = event.data;
    if (line.startsWith('bestmove')) {
        const callback = komodoCallbacks.bestmove;
        if (callback) {
            const parts = line.split(' ');
            const move = parts[1];
            callback(move);
            delete komodoCallbacks.bestmove;
        }
    } else if (line.startsWith('info')) {
        const callback = komodoCallbacks.info;
        if (callback) callback(line);
    }
}

// Convert board to FEN
function boardToFEN() {
    let fen = '';
    for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
            const piece = game.getPieceAt(r, c);
            if (piece) {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                const symbol = piece.color === 'white' ?
                    piece.type.charAt(0).toUpperCase() :
                    piece.type.charAt(0).toLowerCase();
                fen += symbol;
            } else {
                empty++;
            }
        }
        if (empty > 0) fen += empty;
        if (r < 7) fen += '/';
    }

    // Add current player
    fen += ' ' + (game.currentPlayer === 'white' ? 'w' : 'b');

    // Add castling rights
    let castling = '';
    if (game.castlingRights.white.kingside) castling += 'K';
    if (game.castlingRights.white.queenside) castling += 'Q';
    if (game.castlingRights.black.kingside) castling += 'k';
    if (game.castlingRights.black.queenside) castling += 'q';
    fen += ' ' + (castling || '-');

    // Add en passant
    fen += ' ' + (game.enPassantTarget || '-');

    // Add halfmove clock and fullmove number
    fen += ' ' + game.halfMoveClock + ' ' + game.fullMoveNumber;

    return fen;
}

// Get best move from engine
function getEngineMove(engine, fen, depth, callback) {
    if (!engine) {
        callback(null);
        return;
    }

    engine.postMessage('position fen ' + fen);
    engine.postMessage('go depth ' + depth);

    if (engine === stockfish) {
        stockfishCallbacks.bestmove = callback;
    } else if (engine === komodo) {
        komodoCallbacks.bestmove = callback;
    }
}

// Get analysis from Stockfish
function getStockfishAnalysis(fen, depth, callback) {
    if (!stockfish) {
        callback(null);
        return;
    }

    let analysisData = {
        score: { value: 0, type: 'cp' },
        bestMove: null,
        pv: [],
        depth: 0
    };

    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth ' + depth);

    stockfishCallbacks.info = (line) => {
        // Parse score
        if (line.includes('score cp')) {
            const scoreMatch = line.match(/score cp (-?\d+)/);
            if (scoreMatch) {
                analysisData.score = { value: parseInt(scoreMatch[1]), type: 'cp' };
            }
        } else if (line.includes('score mate')) {
            const mateMatch = line.match(/score mate (-?\d+)/);
            if (mateMatch) {
                analysisData.score = { value: parseInt(mateMatch[1]), type: 'mate' };
            }
        }

        // Parse principal variation
        if (line.includes('pv')) {
            const pvMatch = line.match(/pv\s+(.+)/);
            if (pvMatch) {
                analysisData.pv = pvMatch[1].split(' ');
            }
        }

        // Parse depth
        if (line.includes('depth')) {
            const depthMatch = line.match(/depth (\d+)/);
            if (depthMatch) {
                analysisData.depth = parseInt(depthMatch[1]);
            }
        }
    };

    stockfishCallbacks.bestmove = (move) => {
        analysisData.bestMove = move;
        callback(analysisData);
        delete stockfishCallbacks.info;
        delete stockfishCallbacks.bestmove;
    };

    // Timeout fallback
    setTimeout(() => {
        if (stockfishCallbacks.bestmove) {
            // Always return analysisData (may have partial info) instead of null
            callback(analysisData);
            delete stockfishCallbacks.info;
            delete stockfishCallbacks.bestmove;
        }
    }, 10000); // 10 second timeout for deeper analysis
}

class ChessGame {
    constructor() {
        this.board = this.initializeBoard();
        this.moveHistory = [];
        this.currentPlayer = 'white';
        this.aiEnabled = true;
        this.gameOver = false;
        this.gameOverReason = '';
        this.capturedPieces = { white: [], black: [] };
        this.castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true }
        };
        this.enPassantTarget = null;
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.lastMove = null; // Track last move for highlighting
        this.history = [];
        this.transpositionTable = new Map(); // For storing evaluated positions
        this.killerMoves = [[null, null], [null, null], [null, null], [null, null], [null, null], [null, null], [null, null]]; // Killer moves per depth (for move ordering)
        this.zobristHash = this.calculateZobristHash(); // Current board hash
        this.nodesSearched = 0; // For performance tracking
    }

    initializeBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // Place pawns
        for (let i = 0; i < 8; i++) {
            board[1][i] = { type: 'pawn', color: 'black' };
            board[6][i] = { type: 'pawn', color: 'white' };
        }

        // Place pieces
        const pieces = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        pieces.forEach((piece, i) => {
            board[0][i] = { type: piece, color: 'black' };
            board[7][i] = { type: piece, color: 'white' };
        });

        return board;
    }

    calculateZobristHash() {
        let hash = 0;
        const pieces = []
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece) {
                    const pieceIndex = this.getPieceZobristIndex(piece.type, piece.color);
                    const squareIndex = r * 8 + c;
                    hash ^= ZOBRIST_PIECES[squareIndex][pieceIndex];
                }
            }
        }
        if (this.currentPlayer === 'white') {
            hash ^= ZOBRIST_PLAYER;
        }
        return hash;
    }

    getPieceZobristIndex(type, color) {
        const typeIndex = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5 }[type];
        return color === 'white' ? typeIndex : typeIndex + 6;
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    getPieceAt(row, col) {
        if (!this.isValidPosition(row, col)) return null;
        return this.board[row][col];
    }

    setPieceAt(row, col, piece) {
        if (this.isValidPosition(row, col)) {
            this.board[row][col] = piece;
        }
    }

    positionToCoords(pos) {
        if (pos.length !== 2) return null;
        const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
        const row = 8 - parseInt(pos[1]);
        if (this.isValidPosition(row, col)) return [row, col];
        return null;
    }

    coordsToPosition(row, col) {
        return String.fromCharCode('a'.charCodeAt(0) + col) + (8 - row);
    }

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowDir = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
        const colDir = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);

        let r = fromRow + rowDir;
        let c = fromCol + colDir;

        while (r !== toRow || c !== toCol) {
            if (this.getPieceAt(r, c) !== null) return false;
            r += rowDir;
            c += colDir;
        }
        return true;
    }

    isSquareAttackedBy(row, col, attackingColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.color === attackingColor) {
                    if (this.canPieceAttack(r, c, row, col)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    canPieceAttack(fromRow, fromCol, toRow, toCol) {
        const piece = this.getPieceAt(fromRow, fromCol);
        if (!piece) return false;

        const target = this.getPieceAt(toRow, toCol);
        const rowDiff = Math.abs(fromRow - toRow);
        const colDiff = Math.abs(fromCol - toCol);

        switch (piece.type) {
            case 'pawn': {
                const direction = piece.color === 'white' ? -1 : 1;
                const captureRow = fromRow + direction;
                return captureRow === toRow && Math.abs(fromCol - toCol) === 1 && target && target.color !== piece.color;
            }
            case 'knight':
                return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
            case 'bishop':
                return rowDiff === colDiff && this.isPathClear(fromRow, fromCol, toRow, toCol);
            case 'rook':
                return (fromRow === toRow || fromCol === toCol) && this.isPathClear(fromRow, fromCol, toRow, toCol);
            case 'queen':
                return ((fromRow === toRow || fromCol === toCol) || (rowDiff === colDiff)) && 
                       this.isPathClear(fromRow, fromCol, toRow, toCol);
            case 'king':
                return rowDiff <= 1 && colDiff <= 1;
            default:
                return false;
        }
    }

    isMoveLegal(fromRow, fromCol, toRow, toCol) {
        const piece = this.getPieceAt(fromRow, fromCol);
        const target = this.getPieceAt(toRow, toCol);

        if (!piece || piece.color !== this.currentPlayer) return false;
        if (target && target.color === piece.color) return false;

        let canMove = false;

        switch (piece.type) {
            case 'pawn': {
                const direction = piece.color === 'white' ? -1 : 1;
                const startRow = piece.color === 'white' ? 6 : 1;

                if (toCol === fromCol && !target) {
                    if (toRow === fromRow + direction) canMove = true;
                    if (fromRow === startRow && toRow === fromRow + 2 * direction && 
                        !this.getPieceAt(fromRow + direction, fromCol)) {
                        canMove = true;
                    }
                } else if (Math.abs(toCol - fromCol) === 1 && toRow === fromRow + direction) {
                    if (target || this.enPassantTarget === this.coordsToPosition(toRow, toCol)) {
                        canMove = true;
                    }
                }
                break;
            }
            case 'knight':
                const rowDiff = Math.abs(fromRow - toRow);
                const colDiff = Math.abs(fromCol - toCol);
                canMove = (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
                break;
            case 'bishop':
                canMove = Math.abs(fromRow - toRow) === Math.abs(fromCol - toCol) && 
                         this.isPathClear(fromRow, fromCol, toRow, toCol);
                break;
            case 'rook':
                canMove = (fromRow === toRow || fromCol === toCol) && 
                         this.isPathClear(fromRow, fromCol, toRow, toCol);
                break;
            case 'queen':
                canMove = ((fromRow === toRow || fromCol === toCol) || 
                          (Math.abs(fromRow - toRow) === Math.abs(fromCol - toCol))) && 
                         this.isPathClear(fromRow, fromCol, toRow, toCol);
                break;
            case 'king': {
                const rowDiff = Math.abs(fromRow - toRow);
                const colDiff = Math.abs(fromCol - toCol);
                
                // Regular king move
                if (rowDiff <= 1 && colDiff <= 1) {
                    canMove = true;
                }
                // Castling
                else if (fromRow === toRow && colDiff === 2 && !this.isInCheck(this.currentPlayer)) {
                    if (toCol === 6 && this.castlingRights[this.currentPlayer].kingside) {
                        const rook = this.getPieceAt(fromRow, 7);
                        if (rook && rook.type === 'rook' && this.isPathClear(fromRow, fromCol, fromRow, 7)) {
                            canMove = true;
                        }
                    } else if (toCol === 2 && this.castlingRights[this.currentPlayer].queenside) {
                        const rook = this.getPieceAt(fromRow, 0);
                        if (rook && rook.type === 'rook' && this.isPathClear(fromRow, 0, fromRow, fromCol)) {
                            canMove = true;
                        }
                    }
                }
                break;
            }
        }

        if (!canMove) return false;

        // Check if move leaves king in check
        const testBoard = this.board.map(row => [...row]);
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        const isLegal = !this.isInCheckAfterMove(this.currentPlayer);

        this.board = testBoard;
        return isLegal;
    }

    isInCheckAfterMove(color) {
        // Find king
        let kingRow, kingCol;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'king' && piece.color === color) {
                    kingRow = r;
                    kingCol = c;
                    break;
                }
            }
        }

        const enemyColor = color === 'white' ? 'black' : 'white';
        return this.isSquareAttackedBy(kingRow, kingCol, enemyColor);
    }

    isInCheck(color) {
        let kingRow, kingCol;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'king' && piece.color === color) {
                    kingRow = r;
                    kingCol = c;
                }
            }
        }

        const enemyColor = color === 'white' ? 'black' : 'white';
        return this.isSquareAttackedBy(kingRow, kingCol, enemyColor);
    }

    hasLegalMove(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.color === color) {
                    for (let tr = 0; tr < 8; tr++) {
                        for (let tc = 0; tc < 8; tc++) {
                            if (this.isMoveLegal(r, c, tr, tc)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    makeMove(fromPos, toPos) {
        const fromCoords = this.positionToCoords(fromPos);
        const toCoords = this.positionToCoords(toPos);

        if (!fromCoords || !toCoords) return false;

        const [fromRow, fromCol] = fromCoords;
        const [toRow, toCol] = toCoords;

        if (!this.isMoveLegal(fromRow, fromCol, toRow, toCol)) return false;

        const piece = this.getPieceAt(fromRow, fromCol);
        const target = this.getPieceAt(toRow, toCol);

        // Handle captures
        if (target) {
            this.capturedPieces[this.currentPlayer].push(target);
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        // Handle pawn moves
        if (piece.type === 'pawn') {
            this.halfMoveClock = 0;
            
            // En passant
            if (Math.abs(fromCol - toCol) === 1 && !target) {
                this.setPieceAt(fromRow, toCol, null);
            }

            // Pawn promotion
            if ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
                piece.type = 'queen';
            }

            // En passant target
            if (Math.abs(fromRow - toRow) === 2) {
                this.enPassantTarget = this.coordsToPosition(fromRow + (toRow - fromRow) / 2, toCol);
            } else {
                this.enPassantTarget = null;
            }
        } else {
            this.enPassantTarget = null;
        }

        // Handle castling
        if (piece.type === 'king') {
            if (Math.abs(fromCol - toCol) === 2) {
                // Kingside
                if (toCol === 6) {
                    const rook = this.getPieceAt(fromRow, 7);
                    this.setPieceAt(fromRow, 7, null);
                    this.setPieceAt(fromRow, 5, rook);
                }
                // Queenside
                else if (toCol === 2) {
                    const rook = this.getPieceAt(fromRow, 0);
                    this.setPieceAt(fromRow, 0, null);
                    this.setPieceAt(fromRow, 3, rook);
                }
            }
            this.castlingRights[this.currentPlayer].kingside = false;
            this.castlingRights[this.currentPlayer].queenside = false;
        }

        // Update castling rights for rooks
        if (piece.type === 'rook') {
            if (fromCol === 0) {
                this.castlingRights[this.currentPlayer].queenside = false;
            } else if (fromCol === 7) {
                this.castlingRights[this.currentPlayer].kingside = false;
            }
        }

        // Move piece
        this.lastMove = { from: [fromRow, fromCol], to: [toRow, toCol] };
        this.setPieceAt(fromRow, fromCol, null);
        this.setPieceAt(toRow, toCol, piece);

        // Update zobrist hash for actual move
        const pieceIdx = this.getPieceZobristIndex(piece.type, piece.color);
        const fromIdx = fromRow * 8 + fromCol;
        const toIdx = toRow * 8 + toCol;
        this.zobristHash ^= ZOBRIST_PIECES[fromIdx][pieceIdx] ^ ZOBRIST_PIECES[toIdx][pieceIdx];
        
        if (target) {
            const targetIdx = this.getPieceZobristIndex(target.type, target.color);
            this.zobristHash ^= ZOBRIST_PIECES[toIdx][targetIdx];
        }

        // Record move
        let moveNotation = piece.type.charAt(0).toUpperCase() + fromPos + toPos;
        this.moveHistory.push(moveNotation);

        // Switch player and check game state
        this.zobristHash ^= ZOBRIST_PLAYER; // Toggle player bit
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';

        if (!this.hasLegalMove(this.currentPlayer)) {
            if (this.isInCheck(this.currentPlayer)) {
                this.gameOver = true;
                this.gameOverReason = (this.currentPlayer === 'white' ? 'black' : 'white') + ' wins by checkmate!';
            } else {
                this.gameOver = true;
                this.gameOverReason = 'Stalemate!';
            }
        }

        if (this.halfMoveClock >= 100) {
            this.gameOver = true;
            this.gameOverReason = 'Draw by fifty-move rule!';
        }

        // Clear transposition table after each move to avoid stale entries
        this.transpositionTable.clear();
        this.nodesSearched = 0;

        return true;
    }

    getValidMoves(row, col) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.isMoveLegal(row, col, r, c)) {
                    moves.push([r, c]);
                }
            }
        }
        return moves;
    }

    getAIMove(callback) {
        const eloData = ELO_LEVELS[currentELO];
        const fen = boardToFEN();

        // Use opening book for first 6 moves if available
        if (this.moveHistory.length < 12) { // 6 moves per player
            const bookMove = this.getOpeningBookMove();
            if (bookMove) {
                console.log(`AI using opening book: ${bookMove.from} to ${bookMove.to}`);
                callback(bookMove);
                return;
            }
        }

        // Determine engine and depth based on ELO
        const eloKey = String(currentELO);
        const eloCfg = ELO_LEVELS[eloKey] || { depth: 6 };
        let depth = eloCfg.depth || 6;

        if (currentELO <= 800) {
            // Beginner: Use simple minimax with blunders
            this.getSimpleMoveWithBlunders(callback);
            return;
        }

        // Prefer Komodo for stronger play if available for higher ELOs
        let engine = stockfish;
        if (komodo && currentELO >= 1400) {
            engine = komodo;
        } else if (stockfish) {
            engine = stockfish;
        } else if (komodo) {
            engine = komodo;
        }

        if (!engine) {
            // Fallback to simple minimax
            this.getSimpleMoveWithBlunders(callback);
            return;
        }

        console.log(`Using ${engine === komodo ? 'Komodo' : 'Stockfish'} at depth ${depth} for ELO ${currentELO}`);

        getEngineMove(engine, fen, depth, (bestMove) => {
            if (bestMove) {
                // Convert UCI move to our format
                const from = bestMove.substring(0, 2);
                const to = bestMove.substring(2, 4);
                const promotion = bestMove.length > 4 ? bestMove[4] : null;

                const fromCoords = this.positionToCoords(from);
                const toCoords = this.positionToCoords(to);

                if (fromCoords && toCoords) {
                    const move = {
                        from: from,
                        to: to,
                        fromRow: fromCoords[0],
                        fromCol: fromCoords[1],
                        toRow: toCoords[0],
                        toCol: toCoords[1]
                    };

                    // Handle promotion
                    if (promotion) {
                        // Note: Promotion handling would need to be added to makeMove
                    }

                    callback(move);
                } else {
                    callback(null);
                }
            } else {
                callback(null);
            }
        });
    }

    // Simple move generation with blunders for beginner levels
    getSimpleMoveWithBlunders(callback) {
        const moves = [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.color === aiColor) {
                    const validMoves = this.getValidMoves(r, c);
                    for (const [toRow, toCol] of validMoves) {
                        moves.push({
                            from: this.coordsToPosition(r, c),
                            to: this.coordsToPosition(toRow, toCol),
                            fromRow: r,
                            fromCol: c,
                            toRow: toRow,
                            toCol: toCol
                        });
                    }
                }
            }
        }

        if (moves.length === 0) {
            callback(null);
            return;
        }

        // For beginner levels, sometimes make blunders
        const eloData = ELO_LEVELS[currentELO];
        const blunderChance = eloData.blunderRate || 0;

        if (Math.random() < blunderChance) {
            // Make a blunder: choose a random bad move
            const badMoves = moves.slice(Math.max(moves.length - 4, 0));
            const chosen = badMoves[Math.floor(Math.random() * badMoves.length)];
            console.log(`AI made a blunder at ELO ${currentELO}`);
            callback(chosen);
        } else {
            // Choose a decent move using simple evaluation
            const evaluatedMoves = moves.map(move => {
                const moveScore = this.evaluateMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
                return { ...move, score: moveScore };
            });
            evaluatedMoves.sort((a, b) => b.score - a.score);
            callback(evaluatedMoves[0]);
        }
    }

    // Opening book for common chess openings
    getOpeningBookMove() {
        const openingBook = {
            // Starting position
            '': ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'],
            
            // After e4
            'e2e4': ['e7e5', 'c7c5', 'e7e6', 'd7d6', 'g8f6', 'c7c6'],
            
            // Italian Game
            'e2e4e7e5': ['g1f3', 'f1c4', 'd2d3'],
            'e2e4e7e5g1f3': ['b8c6', 'g8f6'],
            'e2e4e7e5g1f3b8c6': ['f1c4'],
            
            // Sicilian Defense
            'e2e4c7c5': ['g1f3', 'd2d4', 'c2c3'],
            'e2e4c7c5g1f3': ['d7d6', 'b8c6', 'g7g6'],
            
            // French Defense
            'e2e4e7e6': ['d2d4', 'c2c4'],
            'e2e4e7e6d2d4': ['d7d5'],
            
            // Queen's Gambit
            'd2d4d7d5': ['c2c4'],
            'd2d4d7d5c2c4': ['e7e6', 'd5c4', 'g8f6'],
            
            // King's Indian Defense
            'd2d4g8f6': ['c2c4', 'g1f3'],
            'd2d4g8f6c2c4': ['g7g6', 'd7d6'],
        };

        const moveHistoryStr = this.moveHistory.slice(-4).join(''); // Last 4 moves
        const possibleMoves = openingBook[moveHistoryStr];
        
        if (possibleMoves && possibleMoves.length > 0) {
            const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            return this.algebraicToCoords(randomMove);
        }
        
        return null;
    }

    algebraicToCoords(algebraic) {
        // Convert algebraic notation to coordinates (e.g., 'e2e4' -> from e2 to e4)
        if (algebraic.length !== 4) return null;
        
        const fromCol = algebraic.charCodeAt(0) - 'a'.charCodeAt(0);
        const fromRow = 8 - parseInt(algebraic[1]);
        const toCol = algebraic.charCodeAt(2) - 'a'.charCodeAt(0);
        const toRow = 8 - parseInt(algebraic[3]);
        
        return {
            from: this.coordsToPosition(fromRow, fromCol),
            to: this.coordsToPosition(toRow, toCol)
        };
    }

    quiescenceSearch(isMaximizing, alpha, beta) {
        // Evaluate current position
        const standPat = this.evaluateBoard();
        const currentEval = isMaximizing ? standPat : -standPat;

        if (isMaximizing) {
            if (currentEval >= beta) return beta;
            alpha = Math.max(alpha, currentEval);
        } else {
            if (currentEval <= alpha) return alpha;
            beta = Math.min(beta, currentEval);
        }

        const playerColor = isMaximizing ? 'black' : 'white';

        // Only consider captures and checks
        const captureMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (!piece || piece.color !== playerColor) continue;

                const validMoves = this.getValidMoves(r, c);
                for (const [toR, toC] of validMoves) {
                    const targetPiece = this.getPieceAt(toR, toC);
                    // Include captures and checks
                    if (targetPiece) {
                        captureMoves.push({
                            fromRow: r, fromCol: c, toRow: toR, toCol: toC,
                            value: this.getPieceValue(targetPiece.type) - this.getPieceValue(piece.type) * 0.1
                        });
                    } else {
                        // Check if this move puts opponent in check
                        this.makeTemporaryMove(r, c, toR, toC);
                        const opponentColor = playerColor === 'white' ? 'black' : 'white';
                        if (this.isInCheck(opponentColor)) {
                            captureMoves.push({
                                fromRow: r, fromCol: c, toRow: toR, toCol: toC,
                                value: 50 // Check bonus
                            });
                        }
                        this.undoTemporaryMove(r, c, toR, toC);
                    }
                }
            }
        }

        // Sort captures by value (best captures first)
        captureMoves.sort((a, b) => b.value - a.value);

        for (const move of captureMoves) {
            this.makeTemporaryMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
            const evalValue = this.quiescenceSearch(!isMaximizing, alpha, beta);
            this.undoTemporaryMove(move.fromRow, move.fromCol, move.toRow, move.toCol);

            if (isMaximizing) {
                if (evalValue >= beta) return beta;
                alpha = Math.max(alpha, evalValue);
            } else {
                if (evalValue <= alpha) return alpha;
                beta = Math.min(beta, evalValue);
            }
        }

    }

    getPieceValue(type) {
        const values = {
            pawn: 100,
            knight: 320,
            bishop: 330,
            rook: 500,
            queen: 900,
            king: 20000
        };
        return values[type] || 0;
    }

    makeTemporaryMove(fromRow, fromCol, toRow, toCol) {
        if (!this._tempStack) {
            this._tempStack = [];
            this._tempHashStack = []; // Track hashes for zobrist
        }
        const capture = this.getPieceAt(toRow, toCol);
        const piece = this.getPieceAt(fromRow, fromCol);
        
        // Save current zobrist hash before move
        this._tempHashStack.push(this.zobristHash);

        this._tempStack.push({
            fromRow,
            fromCol,
            toRow,
            toCol,
            capture,
            piece
        });

        // Update zobrist hash for this move
        if (piece) {
            const pieceIdx = this.getPieceZobristIndex(piece.type, piece.color);
            const fromIdx = fromRow * 8 + fromCol;
            const toIdx = toRow * 8 + toCol;
            this.zobristHash ^= ZOBRIST_PIECES[fromIdx][pieceIdx] ^ ZOBRIST_PIECES[toIdx][pieceIdx];
        }
        if (capture) {
            const captureIdx = this.getPieceZobristIndex(capture.type, capture.color);
            const toIdx = toRow * 8 + toCol;
            this.zobristHash ^= ZOBRIST_PIECES[toIdx][captureIdx];
        }

        this.setPieceAt(toRow, toCol, piece);
        this.setPieceAt(fromRow, fromCol, null);
    }

    undoTemporaryMove(fromRow, fromCol, toRow, toCol) {
        if (!this._tempStack || this._tempStack.length === 0) {
            return;
        }

        const last = this._tempStack.pop();
        const piece = this.getPieceAt(toRow, toCol);

        // Restore zobrist hash
        if (this._tempHashStack && this._tempHashStack.length > 0) {
            this.zobristHash = this._tempHashStack.pop();
        }

        // Restore pieces to previous squares
        this.setPieceAt(fromRow, fromCol, piece);
        this.setPieceAt(toRow, toCol, last.capture);
    }

    evaluateBoard() {
        // Piece-square tables for positional evaluation
        const pawnTable = [
            [0,  0,  0,  0,  0,  0,  0,  0],
            [50, 50, 50, 50, 50, 50, 50, 50],
            [10, 10, 20, 30, 30, 20, 10, 10],
            [5,  5, 10, 25, 25, 10,  5,  5],
            [0,  0,  0, 20, 20,  0,  0,  0],
            [5, -5,-10,  0,  0,-10, -5,  5],
            [5, 10, 10,-20,-20, 10, 10,  5],
            [0,  0,  0,  0,  0,  0,  0,  0]
        ];

        const knightTable = [
            [-50,-40,-30,-30,-30,-30,-40,-50],
            [-40,-20,  0,  0,  0,  0,-20,-40],
            [-30,  0, 10, 15, 15, 10,  0,-30],
            [-30,  5, 15, 20, 20, 15,  5,-30],
            [-30,  0, 15, 20, 20, 15,  0,-30],
            [-30,  5, 10, 15, 15, 10,  5,-30],
            [-40,-20,  0,  5,  5,  0,-20,-40],
            [-50,-40,-30,-30,-30,-30,-40,-50]
        ];

        const bishopTable = [
            [-20,-10,-10,-10,-10,-10,-10,-20],
            [-10,  0,  0,  0,  0,  0,  0,-10],
            [-10,  0,  5, 10, 10,  5,  0,-10],
            [-10,  5,  5, 10, 10,  5,  5,-10],
            [-10,  0, 10, 10, 10, 10,  0,-10],
            [-10, 10, 10, 10, 10, 10, 10,-10],
            [-10,  5,  0,  0,  0,  0,  5,-10],
            [-20,-10,-10,-10,-10,-10,-10,-20]
        ];

        const rookTable = [
            [0,  0,  0,  0,  0,  0,  0,  0],
            [5, 10, 10, 10, 10, 10, 10,  5],
            [-5,  0,  0,  0,  0,  0,  0, -5],
            [-5,  0,  0,  0,  0,  0,  0, -5],
            [-5,  0,  0,  0,  0,  0,  0, -5],
            [-5,  0,  0,  0,  0,  0,  0, -5],
            [-5,  0,  0,  0,  0,  0,  0, -5],
            [0,  0,  0,  5,  5,  0,  0,  0]
        ];

        const queenTable = [
            [-20,-10,-10, -5, -5,-10,-10,-20],
            [-10,  0,  0,  0,  0,  0,  0,-10],
            [-10,  0,  5,  5,  5,  5,  0,-10],
            [-5,  0,  5,  5,  5,  5,  0, -5],
            [0,  0,  5,  5,  5,  5,  0, -5],
            [-10,  5,  5,  5,  5,  5,  0,-10],
            [-10,  0,  5,  0,  0,  0,  0,-10],
            [-20,-10,-10, -5, -5,-10,-10,-20]
        ];

        const kingTableMiddlegame = [
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-20,-30,-30,-40,-40,-30,-30,-20],
            [-10,-20,-20,-20,-20,-20,-20,-10],
            [20, 20,  0,  0,  0,  0, 20, 20],
            [20, 30, 10,  0,  0, 10, 30, 20]
        ];

        const kingTableEndgame = [
            [-50,-40,-30,-20,-20,-30,-40,-50],
            [-30,-20,-10,  0,  0,-10,-20,-30],
            [-30,-10, 20, 30, 30, 20,-10,-30],
            [-30,-10, 30, 40, 40, 30,-10,-30],
            [-30,-10, 30, 40, 40, 30,-10,-30],
            [-30,-10, 20, 30, 30, 20,-10,-30],
            [-30,-30,  0,  0,  0,  0,-30,-30],
            [-50,-30,-30,-30,-30,-30,-30,-50]
        ];

        const values = {
            pawn: 100,
            knight: 320,
            bishop: 330,
            rook: 500,
            queen: 900,
            king: 20000
        };

        let score = 0;
        let blackMaterial = 0;
        let whiteMaterial = 0;

        // Enhanced material and positional evaluation
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (!piece) continue;

                let pieceValue = values[piece.type];
                let positionalBonus = 0;

                // Apply piece-square table bonuses
                if (piece.color === 'black') {
                    // For black pieces, flip the row (since black's perspective is upside down)
                    const tableRow = 7 - r;
                    switch (piece.type) {
                        case 'pawn': positionalBonus = pawnTable[tableRow][c]; break;
                        case 'knight': positionalBonus = knightTable[tableRow][c]; break;
                        case 'bishop': positionalBonus = bishopTable[tableRow][c]; break;
                        case 'rook': positionalBonus = rookTable[tableRow][c]; break;
                        case 'queen': positionalBonus = queenTable[tableRow][c]; break;
                        case 'king': 
                            // Use different king tables for middlegame vs endgame
                            const totalMaterial = blackMaterial + whiteMaterial;
                            const gamePhase = this.getGamePhase(totalMaterial);
                            positionalBonus = gamePhase > 0.5 ? kingTableEndgame[tableRow][c] : kingTableMiddlegame[tableRow][c];
                            break;
                    }
                    blackMaterial += pieceValue;
                    score += pieceValue + positionalBonus;
                } else {
                    // White pieces use tables directly
                    switch (piece.type) {
                        case 'pawn': positionalBonus = pawnTable[r][c]; break;
                        case 'knight': positionalBonus = knightTable[r][c]; break;
                        case 'bishop': positionalBonus = bishopTable[r][c]; break;
                        case 'rook': positionalBonus = rookTable[r][c]; break;
                        case 'queen': positionalBonus = queenTable[r][c]; break;
                        case 'king': 
                            const totalMaterial = blackMaterial + whiteMaterial;
                            const gamePhase = this.getGamePhase(totalMaterial);
                            positionalBonus = gamePhase > 0.5 ? kingTableEndgame[r][c] : kingTableMiddlegame[r][c];
                            break;
                    }
                    whiteMaterial += pieceValue;
                    score -= pieceValue + positionalBonus;
                }
            }
        }

        // Game phase detection
        const totalMaterial = blackMaterial + whiteMaterial;
        const gamePhase = this.getGamePhase(totalMaterial);

        // Additional positional evaluation (weighted by game phase)
        const positionalScore = this.evaluatePosition();
        score += positionalScore * (0.8 + gamePhase * 0.4);

        // Mobility evaluation
        score += this.evaluateMobility() * (0.5 + gamePhase * 0.5);

        // Development bonus (early game)
        if (gamePhase < 0.3) {
            score += this.evaluateDevelopment();
        }

        // King safety (more important in middlegame)
        score += this.evaluateKingSafety() * (0.3 + gamePhase * 0.7);

        // Pawn structure (important throughout)
        score += this.evaluatePawnStructure();

        // Tempo bonus (side to move advantage)
        score += this.evaluateTempo();

        // Endgame evaluation
        if (gamePhase > 0.7) {
            score += this.evaluateEndgame();
        }

        return score;
    }

    evaluatePosition() {
        let score = 0;

        // Piece-square tables (Magnus Carlsen style positional evaluation)
        const pieceSquareTables = {
            pawn: [
                [0,  0,  0,  0,  0,  0,  0,  0],
                [50, 50, 50, 50, 50, 50, 50, 50],
                [10, 10, 20, 30, 30, 20, 10, 10],
                [5,  5, 10, 25, 25, 10,  5,  5],
                [0,  0,  0, 20, 20,  0,  0,  0],
                [5, -5,-10,  0,  0,-10, -5,  5],
                [5, 10, 10,-20,-20, 10, 10,  5],
                [0,  0,  0,  0,  0,  0,  0,  0]
            ],
            knight: [
                [-50,-40,-30,-30,-30,-30,-40,-50],
                [-40,-20,  0,  0,  0,  0,-20,-40],
                [-30,  0, 10, 15, 15, 10,  0,-30],
                [-30,  5, 15, 20, 20, 15,  5,-30],
                [-30,  0, 15, 20, 20, 15,  0,-30],
                [-30,  5, 10, 15, 15, 10,  5,-30],
                [-40,-20,  0,  5,  5,  0,-20,-40],
                [-50,-40,-30,-30,-30,-30,-40,-50]
            ],
            bishop: [
                [-20,-10,-10,-10,-10,-10,-10,-20],
                [-10,  0,  0,  0,  0,  0,  0,-10],
                [-10,  0,  5, 10, 10,  5,  0,-10],
                [-10,  5,  5, 10, 10,  5,  5,-10],
                [-10,  0, 10, 10, 10, 10,  0,-10],
                [-10, 10, 10, 10, 10, 10, 10,-10],
                [-10,  5,  0,  0,  0,  0,  5,-10],
                [-20,-10,-10,-10,-10,-10,-10,-20]
            ],
            rook: [
                [0,  0,  0,  0,  0,  0,  0,  0],
                [5, 10, 10, 10, 10, 10, 10,  5],
                [-5,  0,  0,  0,  0,  0,  0, -5],
                [-5,  0,  0,  0,  0,  0,  0, -5],
                [-5,  0,  0,  0,  0,  0,  0, -5],
                [-5,  0,  0,  0,  0,  0,  0, -5],
                [-5,  0,  0,  0,  0,  0,  0, -5],
                [0,  0,  0,  5,  5,  0,  0,  0]
            ],
            queen: [
                [-20,-10,-10, -5, -5,-10,-10,-20],
                [-10,  0,  0,  0,  0,  0,  0,-10],
                [-10,  0,  5,  5,  5,  5,  0,-10],
                [-5,  0,  5,  5,  5,  5,  0, -5],
                [0,  0,  5,  5,  5,  5,  0, -5],
                [-10,  5,  5,  5,  5,  5,  0,-10],
                [-10,  0,  5,  0,  0,  0,  0,-10],
                [-20,-10,-10, -5, -5,-10,-10,-20]
            ],
            king: [
                [-30,-40,-40,-50,-50,-40,-40,-30],
                [-30,-40,-40,-50,-50,-40,-40,-30],
                [-30,-40,-40,-50,-50,-40,-40,-30],
                [-30,-40,-40,-50,-50,-40,-40,-30],
                [-20,-30,-30,-40,-40,-30,-30,-20],
                [-10,-20,-20,-20,-20,-20,-20,-10],
                [20, 20,  0,  0,  0,  0, 20, 20],
                [20, 30, 10,  0,  0, 10, 30, 20]
            ]
        };

        // Apply piece-square table bonuses
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type !== 'king') {
                    const table = pieceSquareTables[piece.type];
                    if (table) {
                        // For black pieces, use the table as-is (since black's perspective is from rank 8 to 1)
                        // For white pieces, flip the table vertically
                        const tableRow = piece.color === 'black' ? r : (7 - r);
                        const bonus = table[tableRow][c];
                        score += (piece.color === 'black' ? bonus : -bonus);
                    }
                }
            }
        }

        // Enhanced king safety
        score += this.evaluateKingSafety();

        // Advanced pawn structure
        score += this.evaluatePawnStructure();

        // Mobility bonus
        score += this.evaluateMobility();

        // Center control
        score += this.evaluateCenterControl();

        return score;
    }

    getGamePhase(totalMaterial) {
        // Return 0 for opening, 1 for endgame
        const midgameMaterial = 4000; // Roughly queen + both rooks + minor pieces
        const endgameMaterial = 2000; // Queen + rook or equivalent

        if (totalMaterial >= midgameMaterial) return 0;
        if (totalMaterial <= endgameMaterial) return 1;

        return 1 - (totalMaterial - endgameMaterial) / (midgameMaterial - endgameMaterial);
    }

    evaluateTempo() {
        // Side to move has a small advantage
        return this.currentPlayer === 'black' ? 10 : -10;
    }

    evaluateDevelopment() {
        let score = 0;

        // Bonus for developed pieces (moved from starting squares)
        const blackDeveloped = this.countDevelopedPieces('black');
        const whiteDeveloped = this.countDevelopedPieces('white');

        score += (blackDeveloped - whiteDeveloped) * 15;

        // Penalty for undeveloped knights and bishops
        score += this.evaluatePieceDevelopment();

        return score;
    }

    countDevelopedPieces(color) {
        let count = 0;

        // Knights
        if (color === 'black') {
            if (!this.getPieceAt(0, 1) || this.getPieceAt(0, 1).type !== 'knight') count++;
            if (!this.getPieceAt(0, 6) || this.getPieceAt(0, 6).type !== 'knight') count++;
        } else {
            if (!this.getPieceAt(7, 1) || this.getPieceAt(7, 1).type !== 'knight') count++;
            if (!this.getPieceAt(7, 6) || this.getPieceAt(7, 6).type !== 'knight') count++;
        }

        // Bishops
        if (color === 'black') {
            if (!this.getPieceAt(0, 2) || this.getPieceAt(0, 2).type !== 'bishop') count++;
            if (!this.getPieceAt(0, 5) || this.getPieceAt(0, 5).type !== 'bishop') count++;
        } else {
            if (!this.getPieceAt(7, 2) || this.getPieceAt(7, 2).type !== 'bishop') count++;
            if (!this.getPieceAt(7, 5) || this.getPieceAt(7, 5).type !== 'bishop') count++;
        }

        return count;
    }

    evaluatePieceDevelopment() {
        let score = 0;

        // Penalty for knights on starting squares in middlegame
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (!piece || piece.type !== 'knight') continue;

                // Knights on edges are bad
                if ((c === 0 || c === 7) && (r === 0 || r === 7)) {
                    score += (piece.color === 'black' ? -20 : 20);
                }
            }
        }

        return score;
    }

    evaluateKingSafety() {
        let score = 0;

        for (let color of ['black', 'white']) {
            const enemyColor = color === 'black' ? 'white' : 'black';
            let kingRow, kingCol;

            // Find king
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this.getPieceAt(r, c);
                    if (piece && piece.type === 'king' && piece.color === color) {
                        kingRow = r;
                        kingCol = c;
                        break;
                    }
                }
            }

            // Shield pawns (pawns in front of king)
            let shieldBonus = 0;
            const pawnDirection = color === 'black' ? 1 : -1;
            const shieldRanks = color === 'black' ? [1, 2] : [6, 7];

            for (let dr = 0; dr < shieldRanks.length; dr++) {
                const shieldRow = kingRow + (pawnDirection * (dr + 1));
                if (shieldRow >= 0 && shieldRow < 8) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const shieldCol = kingCol + dc;
                        if (shieldCol >= 0 && shieldCol < 8) {
                            const piece = this.getPieceAt(shieldRow, shieldCol);
                            if (piece && piece.type === 'pawn' && piece.color === color) {
                                shieldBonus += 10;
                            }
                        }
                    }
                }
            }

            // Open files near king
            let openFilePenalty = 0;
            for (let dc = -1; dc <= 1; dc++) {
                const checkCol = kingCol + dc;
                if (checkCol >= 0 && checkCol < 8) {
                    if (this.isOpenFile(checkCol)) {
                        openFilePenalty -= 20;
                    } else if (this.isSemiOpenFile(checkCol, color)) {
                        openFilePenalty -= 10;
                    }
                }
            }

            const totalSafety = shieldBonus + openFilePenalty;
            score += (color === 'black' ? totalSafety : -totalSafety);
        }

        return score;
    }

    evaluateMobility() {
        let blackMobility = 0;
        let whiteMobility = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece) {
                    const moves = this.getValidMoves(r, c);
                    if (piece.color === 'black') {
                        blackMobility += moves.length;
                    } else {
                        whiteMobility += moves.length;
                    }
                }
            }
        }

        // Scale mobility bonus based on piece type
        return (blackMobility - whiteMobility) * 1;
    }

    evaluateCenterControl() {
        let score = 0;

        // Central squares
        const centerSquares = [[3, 3], [3, 4], [4, 3], [4, 4]];
        for (const [r, c] of centerSquares) {
            const piece = this.getPieceAt(r, c);
            if (piece) {
                score += (piece.color === 'black' ? 30 : -30);
            }
        }

        // Extended center
        const extendedCenter = [[2, 2], [2, 5], [5, 2], [5, 5], [2, 3], [2, 4], [5, 3], [5, 4], [3, 2], [3, 5], [4, 2], [4, 5]];
        for (const [r, c] of extendedCenter) {
            const piece = this.getPieceAt(r, c);
            if (piece) {
                score += (piece.color === 'black' ? 15 : -15);
            }
        }

        return score;
    }

    isOpenFile(col) {
        for (let r = 0; r < 8; r++) {
            const piece = this.getPieceAt(r, col);
            if (piece && piece.type === 'pawn') {
                return false;
            }
        }
        return true;
    }

    isSemiOpenFile(col, color) {
        let hasOwnPawn = false;
        let hasEnemyPawn = false;

        for (let r = 0; r < 8; r++) {
            const piece = this.getPieceAt(r, col);
            if (piece && piece.type === 'pawn') {
                if (piece.color === color) {
                    hasOwnPawn = true;
                } else {
                    hasEnemyPawn = true;
                }
            }
        }

        return hasEnemyPawn && !hasOwnPawn;
    }

    isBackwardPawn(row, col, color) {
        // A backward pawn is one that is behind adjacent pawns and cannot be safely advanced
        const direction = color === 'black' ? 1 : -1;
        const nextRow = row + direction;

        // Check if there's a friendly pawn on adjacent files that is ahead
        let hasSupportingPawn = false;
        for (let dc = -1; dc <= 1; dc += 2) {
            const adjCol = col + dc;
            if (adjCol >= 0 && adjCol < 8) {
                for (let r = 0; r < 8; r++) {
                    const piece = this.getPieceAt(r, adjCol);
                    if (piece && piece.type === 'pawn' && piece.color === color) {
                        if (color === 'black' && r < row) {
                            hasSupportingPawn = true;
                        } else if (color === 'white' && r > row) {
                            hasSupportingPawn = true;
                        }
                    }
                }
            }
        }

        // If no supporting pawn ahead on adjacent files, it's backward
        return !hasSupportingPawn;
    }

    evaluatePawnStructure() {
        let score = 0;

        // Doubled pawns penalty (pawns on same file)
        for (let c = 0; c < 8; c++) {
            let blackPawnsInFile = 0;
            let whitePawnsInFile = 0;

            for (let r = 0; r < 8; r++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (piece.color === 'black') blackPawnsInFile++;
                    else whitePawnsInFile++;
                }
            }

            if (blackPawnsInFile > 1) score -= (blackPawnsInFile - 1) * 20;
            if (whitePawnsInFile > 1) score += (whitePawnsInFile - 1) * 20;
        }

        // Isolated pawns penalty (no friendly pawns on adjacent files)
        for (let c = 0; c < 8; c++) {
            let blackPawnsOnFile = false;
            let whitePawnsOnFile = false;
            let blackPawnsAdjacent = false;
            let whitePawnsAdjacent = false;

            // Check current file
            for (let r = 0; r < 8; r++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (piece.color === 'black') blackPawnsOnFile = true;
                    else whitePawnsOnFile = true;
                }
            }

            // Check adjacent files
            if (c > 0) {
                for (let r = 0; r < 8; r++) {
                    const piece = this.getPieceAt(r, c - 1);
                    if (piece && piece.type === 'pawn') {
                        if (piece.color === 'black') blackPawnsAdjacent = true;
                        else whitePawnsAdjacent = true;
                    }
                }
            }
            if (c < 7) {
                for (let r = 0; r < 8; r++) {
                    const piece = this.getPieceAt(r, c + 1);
                    if (piece && piece.type === 'pawn') {
                        if (piece.color === 'black') blackPawnsAdjacent = true;
                        else whitePawnsAdjacent = true;
                    }
                }
            }

            if (blackPawnsOnFile && !blackPawnsAdjacent) score -= 15;
            if (whitePawnsOnFile && !whitePawnsAdjacent) score += 15;
        }

        // Backward pawns penalty (pawn behind adjacent pawns)
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (this.isBackwardPawn(r, c, piece.color)) {
                        score += (piece.color === 'black' ? -10 : 10);
                    }
                }
            }
        }

        // Passed pawns bonus
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (this.isPassedPawn(r, c, piece.color)) {
                        const distanceToPromotion = piece.color === 'black' ? r : (7 - r);
                        const bonus = 50 + (7 - distanceToPromotion) * 10;
                        score += (piece.color === 'black' ? bonus : -bonus);
                    }
                }
            }
        }

        return score;
    }

    evaluateEndgame() {
        let score = 0;

        // King activity in endgame (centralize king)
        for (let color of ['black', 'white']) {
            const [kingRow, kingCol] = this.getKingPosition(color);
            const centerDistance = Math.abs(3.5 - kingRow) + Math.abs(3.5 - kingCol);
            const kingActivityBonus = (7 - centerDistance) * 5;
            score += (color === 'black' ? kingActivityBonus : -kingActivityBonus);
        }

        // Passed pawns are more valuable in endgame
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (this.isPassedPawn(r, c, piece.color)) {
                        const distanceToPromotion = piece.color === 'black' ? r : (7 - r);
                        const endgameBonus = 100 + (7 - distanceToPromotion) * 20;
                        score += (piece.color === 'black' ? endgameBonus : -endgameBonus);
                    }
                }
            }
        }

        // Opposite colored bishops endgame
        const blackBishop = this.countPieces('bishop', 'black');
        const whiteBishop = this.countPieces('bishop', 'white');
        const blackKnight = this.countPieces('knight', 'black');
        const whiteKnight = this.countPieces('knight', 'white');

        if (blackBishop === 1 && whiteBishop === 1 && blackKnight === 0 && whiteKnight === 0) {
            // Check if bishops are on opposite colors
            let blackBishopSquare = null;
            let whiteBishopSquare = null;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this.getPieceAt(r, c);
                    if (piece && piece.type === 'bishop') {
                        if (piece.color === 'black') blackBishopSquare = (r + c) % 2;
                        else whiteBishopSquare = (r + c) % 2;
                    }
                }
            }

            if (blackBishopSquare !== whiteBishopSquare) {
                score += 50; // Drawish position, slight advantage to side to move
            }
        }

        return score;
    }

    countPieces(type, color) {
        let count = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === type && piece.color === color) {
                    count++;
                }
            }
        }
        return count;
    }

    evaluatePositionAfterMove(fromRow, fromCol, toRow, toCol, color) {
        // Simulate the move temporarily to evaluate position
        const target = this.getPieceAt(toRow, toCol);
        const piece = this.getPieceAt(fromRow, fromCol);
        
        // Make temporary move
        this.setPieceAt(toRow, toCol, piece);
        this.setPieceAt(fromRow, fromCol, null);
        
        let score = 0;
        
        // Bonus for putting opponent in check
        const [kingRow, kingCol] = color === 'black' ? this.getKingPosition('white') : this.getKingPosition('black');
        if (this.isSquareUnderAttack(kingRow, kingCol, color === 'black' ? 'black' : 'white')) {
            score += 500;
        }
        
        // Penalty for exposing own king
        const [myKingRow, myKingCol] = this.getKingPosition(color);
        if (this.isSquareUnderAttack(myKingRow, myKingCol, color === 'black' ? 'white' : 'black')) {
            score -= 300;
        }
        
        // Bonus for controlling center
        if ((toRow >= 2 && toRow <= 5) && (toCol >= 2 && toCol <= 5)) {
            score += 20;
        }
        
        // Restore board
        this.setPieceAt(fromRow, fromCol, piece);
        this.setPieceAt(toRow, toCol, target);
        
        return score;
    }

    isSquareUnderAttack(row, col, byColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.color === byColor) {
                    const validMoves = this.getValidMoves(r, c);
                    for (const [toRow, toCol] of validMoves) {
                        if (toRow === row && toCol === col) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    getKingPosition(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'king' && piece.color === color) {
                    return [r, c];
                }
            }
        }
        return null;
    }

    evaluateMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.getPieceAt(fromRow, fromCol);
        const target = this.getPieceAt(toRow, toCol);
        let score = 0;

        const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 1000 };
        
        // 1. HEAVY BONUS FOR CAPTURES (prioritize grabbing material)
        if (target) {
            const captureValue = pieceValues[target.type];
            score += captureValue * 100;
            
            // Bonus multiplier for capturing higher value pieces
            if (captureValue >= 5) score += 200;
        }

        // 2. PIECE TYPE SPECIFIC EVALUATION
        switch (piece.type) {
            case 'pawn':
                // Bonus for advancing toward promotion
                if (piece.color === 'black') {
                    score += (7 - toRow) * 5;
                    // Huge bonus if on 7th rank (ready to promote)
                    if (toRow === 6) score += 300;
                } else {
                    score += toRow * 5;
                    if (toRow === 1) score += 300;
                }
                break;
            case 'knight':
                // Knights are best in center
                score += (toRow >= 2 && toRow <= 5 && toCol >= 2 && toCol <= 5) ? 30 : 10;
                break;
            case 'bishop':
                // Bishops control long diagonals
                score += (toRow >= 2 && toRow <= 5 && toCol >= 2 && toCol <= 5) ? 25 : 5;
                break;
            case 'rook':
                // Rooks on open/semi-open files and 7th rank
                const fileOpenness = this.countEmptyInFile(toCol) / 8 * 20;
                score += fileOpenness;
                if (toRow === 1 || toRow === 6) score += 40;
                break;
            case 'queen':
                // Queen is flexible, reward for centralization and activity
                score += (toRow >= 2 && toRow <= 5 && toCol >= 2 && toCol <= 5) ? 25 : 10;
                break;
        }

        // 3. CENTER CONTROL (critical for all pieces)
        const centerDistance = Math.abs(toRow - 3.5) + Math.abs(toCol - 3.5);
        score += (7 - centerDistance) * 3;

        // 4. KING SAFETY - Heavy penalties for moving king into danger
        if (piece.type === 'king' && this.isSquareUnderAttack(toRow, toCol, piece.color === 'white' ? 'black' : 'white')) {
            score -= 500;
        }

        // 5. PIECE PROTECTION (avoid hanging pieces)
        const isProtected = this.isSquareProtected(toRow, toCol, piece.color);
        if (!isProtected && !target) {
            score -= 50;
        }

        // 6. ATTACKING UNDEFENDED PIECES
        if (this.isSquareUnderAttack(toRow, toCol, piece.color === 'white' ? 'black' : 'white')) {
            if (!isProtected && !target) {
                score -= 100;
            }
        }

        // 7. PAWN STRUCTURE - Bonus for pawn advances that create passed pawns
        if (piece.type === 'pawn' && !target) {
            // Check if this creates a passed pawn
            if (this.isPassedPawn(toRow, toCol, piece.color)) {
                score += 50;
            }
        }

        // 8. DEVELOPMENT BONUS (moving pieces out in opening)
        if (this.moveHistory.length < 10) {
            if (piece.type !== 'pawn' && (fromRow === 7 || fromRow === 0)) {
                score += 20;
            }
        }

        // Small randomness to avoid repetitive play
        score += Math.random() * 0.5;

        return Math.max(0, score);
    }

    countEmptyInFile(col) {
        let count = 0;
        for (let r = 0; r < 8; r++) {
            if (!this.getPieceAt(r, col)) count++;
        }
        return count;
    }

    isSquareProtected(row, col, byColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.color === byColor) {
                    // Simple check: can this piece defend the square?
                    if (this.canDefend(r, c, row, col)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    canDefend(fromRow, fromCol, toRow, toCol) {
        const piece = this.getPieceAt(fromRow, fromCol);
        if (!piece) return false;

        // Check if piece can legally move to that square (simplified)
        if (piece.type === 'pawn') {
            const direction = piece.color === 'white' ? -1 : 1;
            return (fromRow + direction === toRow) && Math.abs(fromCol - toCol) === 1;
        }

        if (piece.type === 'knight') {
            if (Math.abs(fromRow - toRow) === 2 && Math.abs(fromCol - toCol) === 1) return true;
            if (Math.abs(fromRow - toRow) === 1 && Math.abs(fromCol - toCol) === 2) return true;
            return false;
        }

        if (piece.type === 'bishop' || piece.type === 'queen') {
            if (Math.abs(fromRow - toRow) === Math.abs(fromCol - toCol)) {
                return this.isPathClear(fromRow, fromCol, toRow, toCol);
            }
        }

        if (piece.type === 'rook' || piece.type === 'queen') {
            if (fromRow === toRow || fromCol === toCol) {
                return this.isPathClear(fromRow, fromCol, toRow, toCol);
            }
        }

        if (piece.type === 'king') {
            if (Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1) {
                return true;
            }
        }

        return false;
    }

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const stepRow = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
        const stepCol = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);
        
        let r = fromRow + stepRow;
        let c = fromCol + stepCol;
        
        while (r !== toRow || c !== toCol) {
            if (this.getPieceAt(r, c)) return false;
            r += stepRow;
            c += stepCol;
        }
        return true;
    }

    isPassedPawn(row, col, color) {
        // Check if pawn is passed (no enemy pawns ahead or on adjacent files)
        if (color === 'black') {
            for (let checkRow = row + 1; checkRow < 8; checkRow++) {
                for (let checkCol = Math.max(0, col - 1); checkCol <= Math.min(7, col + 1); checkCol++) {
                    const p = this.getPieceAt(checkRow, checkCol);
                    if (p && p.type === 'pawn' && p.color === 'white') {
                        return false;
                    }
                }
            }
        } else {
            for (let checkRow = row - 1; checkRow >= 0; checkRow--) {
                for (let checkCol = Math.max(0, col - 1); checkCol <= Math.min(7, col + 1); checkCol++) {
                    const p = this.getPieceAt(checkRow, checkCol);
                    if (p && p.type === 'pawn' && p.color === 'black') {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    renderBoard() {
        let output = '    A   B   C   D   E   F   G   H\n';
        output += '  ┌─────────────────────────────────┐\n';

        for (let r = 0; r < 8; r++) {
            output += (8 - r) + ' │ ';
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece) {
                    const symbols = {
                        white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
                        black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
                    };
                    output += symbols[piece.color][piece.type];
                } else {
                    output += '·';
                }
                output += ' │ ';
            }
            output += (8 - r) + '\n';
        }

        output += '  └─────────────────────────────────┘\n';
        output += '    A   B   C   D   E   F   G   H\n';

        return output;
    }

    getMaterialCount() {
        const values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
        let white = 0, black = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type !== 'king') {
                    if (piece.color === 'white') {
                        white += values[piece.type];
                    } else {
                        black += values[piece.type];
                    }
                }
            }
        }

        return { white, black };
    }

    countTotalPieces() {
        let count = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.getPieceAt(r, c)) count++;
            }
        }
        return count;
    }

    evaluateEndgame() {
        let score = 0;

        // King centralization in endgame
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'king') {
                    // Kings should be more active in endgame
                    const centerDistance = Math.abs(r - 3.5) + Math.abs(c - 3.5);
                    const bonus = (7 - centerDistance) * 10;
                    score += (piece.color === 'black' ? bonus : -bonus);
                }
            }
        }

        // Pawn promotion potential
        for (let c = 0; c < 8; c++) {
            for (let r = 0; r < 8; r++) {
                const piece = this.getPieceAt(r, c);
                if (piece && piece.type === 'pawn') {
                    if (piece.color === 'black') {
                        score += r * 20; // Closer to promotion = better
                    } else {
                        score -= (7 - r) * 20;
                    }
                }
            }
        }

        return score;
    }
}

// Game instance and UI state
let game = new ChessGame();
initEngines(); // Initialize Stockfish engine
let selectedSquare = null;
let validMoves = [];
let currentELO = 1200;
let boardSize = 'medium';
let pieceColorsSwapped = false;
let playerColor = 'white';
let aiColor = 'black';
let gameAnalysis = {
    moves: [],  // Track all moves with evaluations
    playerMoves: []  // Track only player's moves
};
// UI state for analysis panel
let analysisVisible = false;

// ELO levels mapping
const ELO_LEVELS = {
    '600': { name: 'Beginner', blunderRate: 0.4, depth: 1 },
    '800': { name: 'Novice', blunderRate: 0.3, depth: 2 },
    '1000': { name: 'Intermediate', blunderRate: 0.2, depth: 2 },
    '1200': { name: 'Advanced', blunderRate: 0, depth: 6 },
    '1400': { name: 'Expert', blunderRate: 0, depth: 8 },
    '1600': { name: 'Master', blunderRate: 0, depth: 10 },
    '1800': { name: 'Grandmaster', blunderRate: 0, depth: 12 },
    '2000': { name: 'Super GM', blunderRate: 0, depth: 14 },
    '2200': { name: 'Magnus Level', blunderRate: 0, depth: 14 },
    '2500': { name: 'World Champion', blunderRate: 0, depth: 16 }
};

// Piece symbols
const pieceSymbols = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.className = 'board ' + boardSize;
    boardEl.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'square';
            square.className += (row + col) % 2 === 0 ? ' light' : ' dark';
            square.id = `square-${row}-${col}`;

            // Highlight last move
            if (game.lastMove && 
                ((game.lastMove.from[0] === row && game.lastMove.from[1] === col) ||
                 (game.lastMove.to[0] === row && game.lastMove.to[1] === col))) {
                square.classList.add('last-move');
            }

            // Highlight selected square
            if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) {
                square.classList.add('selected');
            }

            // Highlight valid moves
            if (validMoves.some(m => m[0] === row && m[1] === col)) {
                square.classList.add('valid-move');
            }

            // Add piece
            const piece = game.getPieceAt(row, col);
            if (piece) {
                const pieceEl = document.createElement('div');
                pieceEl.className = 'piece';
                const displayColor = pieceColorsSwapped ? (piece.color === 'white' ? 'black' : 'white') : piece.color;
                pieceEl.textContent = pieceSymbols[displayColor][piece.type];
                pieceEl.draggable = !game.gameOver && piece.color === game.currentPlayer && piece.color === playerColor;
                pieceEl.addEventListener('dragstart', handleDragStart);
                pieceEl.addEventListener('dragend', handleDragEnd);
                square.appendChild(pieceEl);
            }

            square.addEventListener('dragover', handleDragOver);
            square.addEventListener('drop', (e) => handleDrop(e, row, col));
            square.addEventListener('click', () => handleSquareClick(row, col));

            boardEl.appendChild(square);
        }
    }
}

let draggedPiece = null;
let draggedFrom = null;

function handleDragStart(e) {
    draggedPiece = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, toRow, toCol) {
    e.preventDefault();
    
    if (!draggedPiece) return;

    const fromSquare = draggedPiece.parentElement;
    const fromCoords = fromSquare.id.match(/\d+/g).map(Number);
    const [fromRow, fromCol] = fromCoords;

    draggedPiece = null;

    const fromPos = game.coordsToPosition(fromRow, fromCol);
    const toPos = game.coordsToPosition(toRow, toCol);

    makePlayerMove(fromPos, toPos);
}

function handleSquareClick(row, col) {
    if (game.gameOver) return;

    const piece = game.getPieceAt(row, col);

    // If clicking on a valid move
    if (validMoves.some(m => m[0] === row && m[1] === col)) {
        const fromPos = game.coordsToPosition(selectedSquare[0], selectedSquare[1]);
        const toPos = game.coordsToPosition(row, col);
        selectedSquare = null;
        validMoves = [];
        makePlayerMove(fromPos, toPos);
        return;
    }

    // If clicking on a piece of current player
    if (piece && piece.color === game.currentPlayer && piece.color === playerColor) {
        selectedSquare = [row, col];
        validMoves = game.getValidMoves(row, col);
    } else {
        selectedSquare = null;
        validMoves = [];
    }

    renderBoard();
}

function makePlayerMove(fromPos, toPos) {
    if (game.currentPlayer !== playerColor) {
        alert('Waiting for AI to move...');
        renderBoard();
        return;
    }

    if (!game.makeMove(fromPos, toPos)) {
        alert('Illegal move!');
        renderBoard();
        return;
    }

    // ANALYZE AFTER MAKING THE MOVE
    analyzeMoveAfter(fromPos, toPos);

    updateDisplay();

    // Show AI best move analysis for 1200+ ELO
    if (currentELO >= 1200 && !game.gameOver) {
        showAIBestMoveAnalysis();
    }

    if (!game.gameOver && game.aiEnabled && game.currentPlayer === aiColor) {
        setTimeout(() => {
            game.getAIMove((aiMove) => {
                if (aiMove) {
                    game.makeMove(aiMove.from, aiMove.to);
                }
                updateDisplay();
            });
        }, 500);
    }
}

// Analyze move after it's been made (when we have the position after the move)
function analyzeMoveAfter(fromPos, toPos) {
    // Use Stockfish to analyze the current position (after the move)
    const fen = boardToFEN();

    getStockfishAnalysis(fen, 15, (analysis) => {
        if (!analysis) {
            // Shouldn't happen now (getStockfishAnalysis returns partial), but guard anyway
            console.log('Stockfish returned null analysis (unexpected), using fallback');
            const fallbackResult = getFallbackAnalysis(fromPos, toPos);
            if (fallbackResult) {
                gameAnalysis.playerMoves.push(fallbackResult);
                updateMoveAnalysis(fallbackResult);
            }
            return;
        }

        const score = analysis.score;
        const pv = analysis.pv || [];

        // For post-move analysis, we look at the score of the position
        // A negative score means the position favors black (AI), positive favors white (player)
        let quality = 'best';
        let qualityReason = '';
        let centipawnLoss = 0;

        // Simplified: if the position is significantly worse for the player, it was a bad move
        // In a full implementation, we'd compare to the position before the move
        const positionScore = score.value;

        if (playerColor === 'white') {
            // White just moved, negative score means black is better (bad for white)
            centipawnLoss = Math.max(0, -positionScore);
        } else {
            // Black just moved, positive score means white is better (bad for black)
            centipawnLoss = Math.max(0, positionScore);
        }

        if (centipawnLoss >= 300) {
            quality = 'blunder';
            qualityReason = 'Major mistake - position significantly worsened';
        } else if (centipawnLoss >= 150) {
            quality = 'mistake';
            qualityReason = 'Significant error - position weakened';
        } else if (centipawnLoss >= 50) {
            quality = 'inaccuracy';
            qualityReason = 'Minor inaccuracy - slightly worse position';
        } else {
            quality = 'best';
            qualityReason = 'Good move - maintained or improved position';
        }

        // Get best moves from principal variation (what the AI would play now)
        const bestMovesSuggested = [];
        if (pv.length > 0) {
            for (let i = 0; i < Math.min(3, pv.length); i++) {
                const move = pv[i];
                if (move && move.length >= 4) {
                    bestMovesSuggested.push({
                        from: move.substring(0, 2),
                        to: move.substring(2, 4),
                        score: score.value - (i * 10) // Approximate score decrease
                    });
                }
            }
        }

        const result = {
            moveNumber: Math.floor(game.moveHistory.length / 2) + 1,
            from: fromPos,
            to: toPos,
            score: positionScore,
            bestScore: positionScore,
            centipawnLoss: centipawnLoss,
            quality: quality,
            qualityReason: qualityReason,
            bestMovesSuggested: bestMovesSuggested,
            playerScore: positionScore,
            tacticalAnalysis: {
                isBlunder: quality === 'blunder',
                isMistake: quality === 'mistake',
                isInaccuracy: quality === 'inaccuracy',
                reason: qualityReason
            }
        };

        // Store the analysis (guard against null)
        if (result && typeof result === 'object') {
            gameAnalysis.playerMoves.push(result);
            // Update the UI with analysis results
            updateMoveAnalysis(result);
        } else {
            // As a fallback, compute simple analysis and store that
            const fallbackResult = getFallbackAnalysis(fromPos, toPos);
            if (fallbackResult) {
                gameAnalysis.playerMoves.push(fallbackResult);
                updateMoveAnalysis(fallbackResult);
            }
        }
    });
}

// Fallback analysis when Stockfish is not available
function getFallbackAnalysis(fromPos, toPos) {
    // Quick analysis: no deep minimax on player input (avoid UI freeze)
    // Just use heuristic evaluation for instant response
    const allMoves = [];
    const analysisColor = playerColor;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = game.getPieceAt(r, c);
            if (piece && piece.color === analysisColor) {
                const validMoves = game.getValidMoves(r, c);
                for (const [toR, toC] of validMoves) {
                    const fromPosStr = game.coordsToPosition(r, c);
                    const toPosStr = game.coordsToPosition(toR, toC);

                    // Quick heuristic: material + position only
                    let quickScore = game.evaluateMove(r, c, toR, toC);
                    quickScore += game.evaluatePositionAfterMove(r, c, toR, toC, analysisColor);

                    allMoves.push({
                        from: fromPosStr,
                        to: toPosStr,
                        score: quickScore
                    });
                }
            }
        }
    }

    if (allMoves.length === 0) {
        // Return a minimal analysis object so callers don't push null
        return {
            moveNumber: Math.floor(game.moveHistory.length / 2) + 1,
            from: fromPos,
            to: toPos,
            score: 0,
            bestScore: 0,
            centipawnLoss: 0,
            quality: 'unknown',
            qualityReason: 'No legal moves evaluated',
            bestMovesSuggested: [],
            playerScore: 0,
            tacticalAnalysis: { isBlunder: false, isMistake: false, isInaccuracy: false, reason: '' }
        };
    }

    // Sort by quick score
    allMoves.sort((a, b) => b.score - a.score);

    // Find player's move in the list
    const playerMoveData = allMoves.find(m => m.from === fromPos && m.to === toPos);
    const playerMoveScore = playerMoveData ? playerMoveData.score : -Infinity;
    const bestScore = allMoves[0].score;

    // Simple quality assessment
    let quality = 'best';
    let qualityReason = '';
    const scoreDiff = bestScore - playerMoveScore;

    if (scoreDiff >= 500) {
        quality = 'blunder';
        qualityReason = 'Much better move available';
    } else if (scoreDiff >= 250) {
        quality = 'mistake';
        qualityReason = 'Better move available';
    } else if (scoreDiff >= 75) {
        quality = 'inaccuracy';
        qualityReason = 'Slightly better move available';
    } else {
        quality = 'best';
        qualityReason = 'Good move';
    }

    // Get top 3 best moves
    const bestMoves = allMoves.slice(0, 3);

    return {
        moveNumber: Math.floor(game.moveHistory.length / 2) + 1,
        from: fromPos,
        to: toPos,
        score: playerMoveScore,
        bestScore: bestScore,
        centipawnLoss: scoreDiff,
        quality: quality,
        qualityReason: qualityReason,
        bestMovesSuggested: bestMoves,
        playerScore: playerMoveScore,
        tacticalAnalysis: { isBlunder: false, isMistake: false, isInaccuracy: false, reason: '' }
    };
}

// Update the UI with move analysis results
function updateMoveAnalysis(analysis) {
    if (!analysis) return;

    // Update the move quality display
    const qualityElement = document.getElementById('move-quality');
    if (qualityElement) {
        qualityElement.textContent = `Move ${analysis.moveNumber}: ${analysis.quality.toUpperCase()}`;
        qualityElement.className = `move-quality ${analysis.quality}`;
    }

    // Update centipawn loss
    const cpElement = document.getElementById('centipawn-loss');
    if (cpElement) {
        cpElement.textContent = analysis.centipawnLoss > 0 ? `-${analysis.centipawnLoss}cp` : '0cp';
    }

    // Update best moves suggestions
    const suggestionsElement = document.getElementById('best-moves');
    if (suggestionsElement && analysis.bestMovesSuggested.length > 0) {
        const movesText = analysis.bestMovesSuggested.map(move =>
            `${move.from}-${move.to}`
        ).join(', ');
        suggestionsElement.textContent = `Better: ${movesText}`;
    }

    console.log(`Move analysis: ${analysis.quality} (${analysis.centipawnLoss}cp loss)`);
}

function updateDisplay() {
    selectedSquare = null;
    validMoves = [];
    renderBoard();

    // Update status
    const statusEl = document.getElementById('status');
    if (game.gameOver) {
        statusEl.textContent = 'Game Over – ' + game.gameOverReason;
        statusEl.classList.remove('check');
        statusEl.classList.add(game.gameOverReason.includes('checkmate') ? 'checkmate' : 'stalemate');
    } else {
        statusEl.classList.remove('checkmate', 'stalemate');
        let statusText = '';
        if (game.isInCheck(game.currentPlayer)) {
            statusText = 'Check! ';
            statusEl.classList.add('check');
        } else {
            statusEl.classList.remove('check');
        }
        statusText += (game.currentPlayer === playerColor ? 'Your Move' : 'Thinking...');
        statusEl.textContent = statusText;
    }

    // Update player status
    document.getElementById('playerStatus').textContent = game.currentPlayer === playerColor ? 'To move' : 'Waiting';
    const material = game.getMaterialCount();
    const diff = material.white - material.black;
    let materialStr = 'Equal';
    if (diff > 0) materialStr = 'White +' + diff;
    if (diff < 0) materialStr = 'Black +' + (-diff);
    document.getElementById('material').textContent = materialStr;

    // Update move count
    document.getElementById('moveCount').textContent = Math.floor(game.moveHistory.length / 2);
    document.getElementById('halfMoves').textContent = game.halfMoveClock;

    // Update game status
    if (game.gameOver) {
        document.getElementById('gameStatus').textContent = 'Over';
    } else {
        document.getElementById('gameStatus').textContent = game.currentPlayer === 'white' ? 'Active' : 'Thinking';
    }

    // Update captured pieces
    updateCapturedPieces();
    updateMoveHistory();
}

function updateCapturedPieces() {
    const blackCaptured = document.getElementById('capturedBlack');
    const whiteCaptured = document.getElementById('capturedWhite');

    blackCaptured.innerHTML = '';
    whiteCaptured.innerHTML = '';

    for (const piece of game.capturedPieces.white) {
        const el = document.createElement('span');
        el.className = 'captured-piece';
        el.textContent = pieceSymbols.black[piece.type];
        blackCaptured.appendChild(el);
    }

    for (const piece of game.capturedPieces.black) {
        const el = document.createElement('span');
        el.className = 'captured-piece';
        el.textContent = pieceSymbols.white[piece.type];
        whiteCaptured.appendChild(el);
    }
}

function updateMoveHistory() {
    const historyEl = document.getElementById('moveHistory');
    historyEl.innerHTML = '';

    for (let i = 0; i < game.moveHistory.length; i += 2) {
        const moveNum = (i / 2) + 1;
        const move1 = game.moveHistory[i] || '';
        const move2 = game.moveHistory[i + 1] || '';

        const numEl = document.createElement('div');
        numEl.className = 'move-number';
        numEl.textContent = moveNum + '.';

        const move1El = document.createElement('div');
        move1El.className = 'move-white';
        move1El.textContent = move1;

        const move2El = document.createElement('div');
        move2El.className = 'move-black';
        move2El.textContent = move2;

        historyEl.appendChild(numEl);
        historyEl.appendChild(move1El);
        historyEl.appendChild(move2El);
    }
}

function undoMove() {
    if (game.moveHistory.length === 0) {
        alert('No moves to undo!');
        return;
    }
    
    game = new ChessGame();
    for (let i = 0; i < game.moveHistory.length - 2; i++) {
        // Note: This is simplified - proper undo would replay moves
    }
    updateDisplay();
}

function resetGame() {
    game = new ChessGame();
    selectedSquare = null;
    validMoves = [];
    gameAnalysis = { moves: [], playerMoves: [] };
    document.getElementById('analysisContainer').innerHTML = '';
    updateDisplay();
}

function toggleAI() {
    game.aiEnabled = !game.aiEnabled;
    document.getElementById('aiBtn').textContent = 'AI: ' + (game.aiEnabled ? 'ON' : 'OFF');
    updateDisplay();
    if (game.aiEnabled) {
        scheduleAIMoveIfNeeded();
    }
}

function changeBoardSize(size) {
    boardSize = size;
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === size);
    });
    
    const wrapper = document.querySelector('.board-wrapper');
    wrapper.className = 'board-wrapper ' + size;
    
    const board = document.querySelector('.board');
    if (board) {
        board.className = 'board ' + size;
    }
    
    renderBoard();
}

function swapPieceColors() {
    pieceColorsSwapped = !pieceColorsSwapped;
    playerColor = playerColor === 'white' ? 'black' : 'white';
    aiColor = playerColor === 'white' ? 'black' : 'white';
    renderBoard();
    updateDisplay();
    scheduleAIMoveIfNeeded();
}

function scheduleAIMoveIfNeeded() {
    if (!game.gameOver && game.aiEnabled && game.currentPlayer === aiColor) {
        setTimeout(() => {
            game.getAIMove((aiMove) => {
                if (aiMove) {
                    game.makeMove(aiMove.from, aiMove.to);
                }
                updateDisplay();
            });
        }, 500);
    }
}

function setELO(elo) {
    currentELO = elo;
    document.querySelectorAll('.elo-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateDisplay();
}

function analyzeGame() {
    try {
        const container = document.getElementById('analysisContainer');
        const analyzeBtn = document.getElementById('analyzeBtn');

        // If panel currently visible, hide it
        if (analysisVisible) {
            if (container) container.innerHTML = '';
            analysisVisible = false;
            if (analyzeBtn) analyzeBtn.textContent = '📊 Analyze Game';
            return;
        }

        // Panel not visible -> attempt to show
        if (!game || !game.moveHistory) {
            alert('Game not initialized yet.');
            return;
        }

        if (game.moveHistory.length === 0) {
            alert('Play some moves first!');
            return;
        }

        const analysis = calculateGameAnalysis();
        if (!analysis) {
            alert('No analysis available.');
            return;
        }

        displayAnalysis(analysis);
        analysisVisible = true;
        if (analyzeBtn) analyzeBtn.textContent = '✖ Close Analysis';
    } catch (err) {
        console.error('analyzeGame() failed', err);
        alert('Analysis failed: ' + (err && err.message ? err.message : String(err)));
    }
}

function calculateGameAnalysis() {
    const eloData = ELO_LEVELS[currentELO];
    const playerMoves = gameAnalysis.playerMoves.filter(move => move && typeof move === 'object');

    // Analyze each move with more sophisticated criteria
    let bestMoves = 0, inaccuracies = 0, mistakes = 0, blunders = 0;
    let totalCentipawnLoss = 0;
    let totalComplexity = 0;

    for (const move of playerMoves) {
        if (move.quality === 'best') bestMoves++;
        else if (move.quality === 'inaccuracy') inaccuracies++;
        else if (move.quality === 'mistake') mistakes++;
        else if (move.quality === 'blunder') blunders++;

        // Track centipawn loss for accuracy calculation
        totalCentipawnLoss += Math.max(0, move.centipawnLoss || 0);

        // Track position complexity
        totalComplexity += game.countTotalPieces();
    }

    const totalPlayerMoves = gameAnalysis.playerMoves.length || 1;
    const avgCentipawnLoss = totalCentipawnLoss / totalPlayerMoves;
    const avgComplexity = totalComplexity / totalPlayerMoves;

    // More realistic accuracy calculation based on centipawn loss
    // Base accuracy depends on opponent strength and position complexity
    let baseAccuracy = 25; // Very hard against strong AI

    // Adjust base accuracy based on opponent ELO
    if (currentELO <= 1000) baseAccuracy = 45;
    else if (currentELO <= 1400) baseAccuracy = 35;
    else if (currentELO <= 1800) baseAccuracy = 30;
    else if (currentELO <= 2200) baseAccuracy = 25;
    else baseAccuracy = 20; // Against 2500+, extremely difficult

    // Adjust for position complexity (simpler positions are easier)
    if (avgComplexity < 25) baseAccuracy += 5;
    else if (avgComplexity > 30) baseAccuracy -= 5;

    // Calculate accuracy based on centipawn loss
    // Each 100 centipawns lost reduces accuracy by ~10%
    const centipawnPenalty = Math.min(50, avgCentipawnLoss / 10); // Cap penalty
    let accuracy = baseAccuracy - centipawnPenalty;

    // Bonus for excellent moves
    const excellentMoveBonus = (bestMoves / totalPlayerMoves) * 15;
    accuracy += excellentMoveBonus;

    // Additional penalties for mistakes/blunders
    const mistakePenalty = (mistakes * 5 + blunders * 15) / totalPlayerMoves * 10;
    accuracy -= mistakePenalty;

    // Factor in game phase - endgames are harder
    const finalGamePhase = game.getGamePhase(game.getMaterialCount().white + game.getMaterialCount().black);
    if (finalGamePhase > 0.7) {
        accuracy -= 5; // Endgames are more difficult
    }

    // Realistic caps based on chess reality
    const maxAccuracy = currentELO >= 2000 ? 75 : (currentELO >= 1600 ? 85 : 95);
    const minAccuracy = 5;
    accuracy = Math.max(minAccuracy, Math.min(maxAccuracy, accuracy));

    // Calculate performance rating using Glicko-style system
    let performanceRating = currentELO;

    // Base adjustment from accuracy
    if (accuracy > 80) {
        performanceRating += 200 + (accuracy - 80) * 10;
    } else if (accuracy > 70) {
        performanceRating += 100 + (accuracy - 70) * 20;
    } else if (accuracy > 60) {
        performanceRating += (accuracy - 60) * 10;
    } else if (accuracy > 50) {
        performanceRating -= (60 - accuracy) * 5;
    } else if (accuracy > 40) {
        performanceRating -= 100 + (50 - accuracy) * 10;
    } else {
        performanceRating -= 200 + (40 - accuracy) * 15;
    }

    // Adjust for centipawn loss
    performanceRating -= avgCentipawnLoss / 10;

    // Factor in mistakes/blunders
    performanceRating -= mistakes * 50 + blunders * 100;

    // Cap performance rating realistically
    performanceRating = Math.max(100, Math.min(3500, performanceRating));

    // Determine rating category
    let rating = 'Poor';
    let ratingClass = 'poor';
    if (accuracy > 85) {
        rating = 'Excellent';
        ratingClass = 'excellent';
    } else if (accuracy > 75) {
        rating = 'Good';
        ratingClass = 'good';
    } else if (accuracy > 65) {
        rating = 'Average';
        ratingClass = 'average';
    } else if (accuracy > 50) {
        rating = 'Below Average';
        ratingClass = 'below-average';
    }

    return {
        moves: game.moveHistory.length,
        accuracy: Math.round(accuracy),
        rating: rating,
        ratingClass: ratingClass,
        opponentELO: currentELO,
        opponentName: eloData.name,
        performanceRating: Math.round(performanceRating),
        bestMove: bestMoves,
        inaccuracies: inaccuracies,
        mistakes: mistakes,
        blunders: blunders,
        avgCentipawnLoss: Math.round(avgCentipawnLoss),
        playerMoves: gameAnalysis.playerMoves
    };
}

function displayAnalysis(analysis) {
    const container = document.getElementById('analysisContainer');
    if (!container) {
        console.error('displayAnalysis: analysisContainer element not found');
        alert('Analysis container not found in the page.');
        return;
    }

    // Generate mistake details with improved explanations
    let mistakesHTML = '';
    const playerMoves = Array.isArray(analysis && analysis.playerMoves) ? analysis.playerMoves.filter(m => m && typeof m === 'object') : [];
    const mistakes = playerMoves.filter(m => m.quality === 'mistake' || m.quality === 'blunder');
    const inaccuracies = playerMoves.filter(m => m.quality === 'inaccuracy');

    if (mistakes.length > 0) {
        mistakesHTML += '<div class="analysis-item"><div class="analysis-label">CRITICAL MISTAKES & BLUNDERS</div>';
        for (const move of mistakes.slice(0, 5)) {
            const bestMove = (move.bestMovesSuggested && move.bestMovesSuggested[0]) ? move.bestMovesSuggested[0] : { from: '', to: '' };
            const centipawnLoss = Math.round((move.centipawnLoss || 0) / 100 * 100) / 100; // Convert to pawns
            mistakesHTML += `
                <div style="background: #2a1a1a; margin-top: 8px; padding: 8px; border-radius: 3px; border-left: 3px solid #aa4a2a;">
                    <div style="color: #ff6b6b; font-size: 12px; font-weight: 600;">Move ${move.moveNumber}: You played ${move.from}${move.to}</div>
                    <div style="color: #aaa; font-size: 11px; margin-top: 4px;">❌ ${move.quality ? move.quality.toUpperCase() : 'UNKNOWN'} (${centipawnLoss} pawns lost)</div>
                    <div style="color: #4aaa4a; font-size: 11px; margin-top: 4px;">✅ Better: ${bestMove.from}${bestMove.to}</div>
                    <div style="color: #bbb; font-size: 10px; margin-top: 4px;">💡 ${move.qualityReason || 'Significant loss in position'}</div>
                </div>
            `;
        }
        mistakesHTML += '</div>';
    }

    if (inaccuracies.length > 0) {
        mistakesHTML += '<div class="analysis-item"><div class="analysis-label">INACCURACIES</div>';
        for (const move of inaccuracies.slice(0, 3)) {
            const bestMove = (move.bestMovesSuggested && move.bestMovesSuggested[0]) ? move.bestMovesSuggested[0] : { from: '', to: '' };
            const centipawnLoss = Math.round((move.centipawnLoss || 0) / 100 * 100) / 100;
            mistakesHTML += `
                <div style="background: #2a2a1a; margin-top: 8px; padding: 8px; border-radius: 3px; border-left: 3px solid #aaa42a;">
                    <div style="color: #ffff6b; font-size: 12px; font-weight: 600;">Move ${move.moveNumber}: You played ${move.from}${move.to}</div>
                    <div style="color: #aaa; font-size: 11px; margin-top: 4px;">⚠️ INACCURACY (${centipawnLoss} pawns lost)</div>
                    <div style="color: #4aaa4a; font-size: 11px; margin-top: 4px;">✅ Better: ${bestMove.from}${bestMove.to}</div>
                    <div style="color: #bbb; font-size: 10px; margin-top: 4px;">💡 ${move.qualityReason || 'Minor positional loss'}</div>
                </div>
            `;
        }
        mistakesHTML += '</div>';
    }

    if (playerMoves.length === 0) {
        mistakesHTML = '<div class="analysis-item"><div class="analysis-label">No move analysis available yet. Make a move and wait for engine feedback before analyzing the game.</div></div>';
    }

    let html = `
        <div class="analysis-panel">
            <div class="analysis-title">Game Analysis</div>
            <div class="analysis-content">
                <div class="analysis-item ${analysis.ratingClass}">
                    <div class="analysis-label">Overall Rating</div>
                    <div class="analysis-value">${analysis.rating}</div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Accuracy Against ${analysis.opponentName} (${analysis.opponentELO} ELO)</div>
                    <div class="analysis-value">${analysis.accuracy}%</div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Average Centipawn Loss</div>
                    <div class="analysis-value">${analysis.avgCentipawnLoss || 0} cp</div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Estimated Performance Rating</div>
                    <div class="analysis-value">${analysis.performanceRating} ELO</div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Total Moves</div>
                    <div class="analysis-value">${analysis.moves}</div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Move Quality Breakdown</div>
                    <div class="analysis-value">
                        Best: ${analysis.bestMove} |
                        Inaccuracies: ${analysis.inaccuracies} |
                        Mistakes: ${analysis.mistakes} |
                        Blunders: ${analysis.blunders}
                    </div>
                </div>
                <div class="analysis-item">
                    <div class="analysis-label">Analysis Feedback</div>
                    <div class="analysis-value">${getDetailedAnalysisFeedback(analysis)}</div>
                </div>
            </div>
            ${mistakesHTML}
        </div>
    `;

    container.innerHTML = html;
}

function showMistakes() {
    if (gameAnalysis.playerMoves.length === 0) {
        alert('No moves to analyze yet!');
        return;
    }

    const container = document.getElementById('analysisContainer');
    container.innerHTML = '<div class="panel-title">🚨 Critical Mistakes & Blunders</div>';

    let mistakeCount = 0;
    let blunderCount = 0;

    gameAnalysis.playerMoves.forEach((move, index) => {
        if (move.quality === 'mistake' || move.quality === 'blunder') {
            mistakeCount++;
            if (move.quality === 'blunder') blunderCount++;
            const moveNumber = move.moveNumber;

            const mistakeDiv = document.createElement('div');
            mistakeDiv.className = `mistake-item ${move.quality}`;
            const centipawnLoss = Math.round((move.centipawnLoss || 0) / 100 * 100) / 100;
            mistakeDiv.innerHTML = `
                <div class="mistake-header">
                    <span class="mistake-type">${move.quality.toUpperCase()}</span>
                    <span class="move-number">Move ${moveNumber}</span>
                    <span class="centipawn-loss">${centipawnLoss} pawns lost</span>
                </div>
                <div class="mistake-content">
                    <div class="player-move">
                        <span class="label">You played:</span>
                        <span class="move">${move.from} → ${move.to}</span>
                    </div>
                    <div class="better-move">
                        <span class="label">Better move:</span>
                        <span class="move">${move.bestMovesSuggested[0]?.from || '?'} → ${move.bestMovesSuggested[0]?.to || '?'}</span>
                    </div>
                    <div class="mistake-explanation">
                        ${move.qualityReason || getMistakeExplanation(move.quality, move.bestMovesSuggested[0])}
                    </div>
                </div>
            `;
            container.appendChild(mistakeDiv);
        }
    });

    if (mistakeCount === 0) {
        container.innerHTML += '<div class="no-mistakes">🎉 Excellent play! No major mistakes found.</div>';
    } else {
        const summary = document.createElement('div');
        summary.className = 'mistake-summary';
        summary.innerHTML = `
            <div class="summary-stats">
                <div class="stat">Total Mistakes: ${mistakeCount}</div>
                <div class="stat">Blunders: ${blunderCount}</div>
                <div class="stat">Accuracy: ${calculateGameAnalysis().accuracy}%</div>
            </div>
        `;
        container.appendChild(summary);
    }
}

function analyzeTacticalConsequences(fromRow, fromCol, toRow, toCol) {
    const result = {
        isBlunder: false,
        isMistake: false,
        isInaccuracy: false,
        reason: ''
    };

    const piece = game.getPieceAt(fromRow, fromCol);
    const target = game.getPieceAt(toRow, toCol);

    // Simulate the move temporarily
    game.makeTemporaryMove(fromRow, fromCol, toRow, toCol);

    try {
        // Check 1: Does this move hang a valuable piece?
        const hangingPieces = findHangingPieces('white');
        if (hangingPieces.length > 0) {
            const mostValuableHang = hangingPieces[0];
            const pieceValue = game.getPieceValue(mostValuableHang.type);
            if (pieceValue >= 500) { // Queen or better
                result.isBlunder = true;
                result.reason = `Hangs ${mostValuableHang.type} worth ${pieceValue/100} pawns`;
            } else if (pieceValue >= 300) { // Rook or minor piece
                result.isMistake = true;
                result.reason = `Hangs ${mostValuableHang.type}`;
            }
        }

        // Check 2: Did we miss a capture opportunity?
        const missedCaptures = findMissedCaptures();
        if (missedCaptures.length > 0) {
            const bestMissedCapture = missedCaptures[0];
            const captureValue = game.getPieceValue(bestMissedCapture.targetType);
            const attackerValue = game.getPieceValue(bestMissedCapture.attackerType);

            if (captureValue >= attackerValue * 2) { // Winning capture
                result.isMistake = true;
                result.reason = `Missed winning capture: ${bestMissedCapture.attackerType} takes ${bestMissedCapture.targetType}`;
            } else if (captureValue > attackerValue) { // Equal or slightly winning
                result.isInaccuracy = true;
                result.reason = `Could capture ${bestMissedCapture.targetType} with ${bestMissedCapture.attackerType}`;
            }
        }

        // Check 3: Does this move expose the king to check?
        if (game.isInCheck('white')) {
            result.isBlunder = true;
            result.reason = 'Moves into check';
        }

        // Check 4: Does this allow a discovered attack?
        const discoveredAttacks = findDiscoveredAttacks();
        if (discoveredAttacks.length > 0) {
            result.isMistake = true;
            result.reason = 'Allows discovered attack';
        }

        // Check 5: Pawn structure issues
        if (piece.type === 'pawn') {
            if (isIsolatedPawn(toRow, toCol, 'white')) {
                result.isInaccuracy = true;
                result.reason = 'Creates isolated pawn';
            }
            if (isBackwardPawn(toRow, toCol, 'white')) {
                result.isInaccuracy = true;
                result.reason = 'Creates backward pawn';
            }
        }

        // Check 6: Development issues in opening
        if (game.moveHistory.length < 20) { // First 10 moves
            if (piece.type === 'king' && !isCastlingMove(fromRow, fromCol, toRow, toCol)) {
                result.isInaccuracy = true;
                result.reason = 'Early king move without castling';
            }
        }

    } finally {
        // Always undo the temporary move
        game.undoTemporaryMove(fromRow, fromCol, toRow, toCol);
    }

    return result;
}

function findHangingPieces(color) {
    const hangingPieces = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = game.getPieceAt(r, c);
            if (piece && piece.color === color) {
                // Check if this piece is attacked and not defended
                const isAttacked = game.isSquareUnderAttack(r, c, color === 'white' ? 'black' : 'white');
                const isDefended = game.isSquareProtected(r, c, color);

                if (isAttacked && !isDefended) {
                    hangingPieces.push({
                        row: r,
                        col: c,
                        type: piece.type,
                        value: game.getPieceValue(piece.type)
                    });
                }
            }
        }
    }

    // Sort by value descending
    return hangingPieces.sort((a, b) => b.value - a.value);
}

function findMissedCaptures() {
    const missedCaptures = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attacker = game.getPieceAt(r, c);
            if (attacker && attacker.color === 'white') {
                const moves = game.getValidMoves(r, c);
                for (const [toR, toC] of moves) {
                    const target = game.getPieceAt(toR, toC);
                    if (target && target.color === 'black') {
                        missedCaptures.push({
                            attackerRow: r,
                            attackerCol: c,
                            attackerType: attacker.type,
                            targetRow: toR,
                            targetCol: toC,
                            targetType: target.type,
                            attackerValue: game.getPieceValue(attacker.type),
                            targetValue: game.getPieceValue(target.type)
                        });
                    }
                }
            }
        }
    }

    // Sort by capture value minus attacker value (best captures first)
    return missedCaptures.sort((a, b) => (b.targetValue - b.attackerValue) - (a.targetValue - a.attackerValue));
}

function findDiscoveredAttacks() {
    const discoveredAttacks = [];

    // This is a simplified check - look for pieces that would attack along the same line
    // after the move is made
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = game.getPieceAt(r, c);
            if (piece && piece.color === 'black') {
                // Check if this piece attacks any white pieces
                const moves = game.getValidMoves(r, c);
                for (const [toR, toC] of moves) {
                    const target = game.getPieceAt(toR, toC);
                    if (target && target.color === 'white') {
                        discoveredAttacks.push({
                            attacker: piece.type,
                            target: target.type,
                            from: game.coordsToPosition(r, c),
                            to: game.coordsToPosition(toR, toC)
                        });
                    }
                }
            }
        }
    }

    return discoveredAttacks;
}

function isIsolatedPawn(row, col, color) {
    // Check if pawn has no friendly pawns on adjacent files
    for (let c = Math.max(0, col - 1); c <= Math.min(7, col + 1); c++) {
        if (c === col) continue; // Skip own file
        for (let r = 0; r < 8; r++) {
            const piece = game.getPieceAt(r, c);
            if (piece && piece.type === 'pawn' && piece.color === color) {
                return false; // Found friendly pawn on adjacent file
            }
        }
    }
    return true; // No friendly pawns on adjacent files
}

function isCastlingMove(fromRow, fromCol, toRow, toCol) {
    const piece = game.getPieceAt(fromRow, fromCol);
    if (!piece || piece.type !== 'king') return false;

    // Kingside castling
    if (fromCol === 4 && toCol === 6) return true;
    // Queenside castling
    if (fromCol === 4 && toCol === 2) return true;

    return false;
}

function showAIBestMoveAnalysis(done) {
    // Use Stockfish to show what the AI would play
    const fen = boardToFEN();

    getStockfishAnalysis(fen, 12, (analysis) => {
        if (analysis && analysis.bestMove) {
            const bestMoveUCI = analysis.bestMove;
            const from = bestMoveUCI.substring(0, 2);
            const to = bestMoveUCI.substring(2, 4);

            const statusEl = document.getElementById('status');
            const currentText = statusEl.textContent;
            const scoreText = analysis.score.type === 'mate' ?
                `Mate in ${analysis.score.value}` :
                `${analysis.score.value > 0 ? '+' : ''}${analysis.score.value}cp`;

            statusEl.innerHTML = `
                ${currentText}
                <div class="ai-analysis">
                    <small>🤖 Stockfish (${currentELO} ELO) best: <strong>${from} → ${to}</strong> (${scoreText})</small>
                </div>
            `;

            // Clear the analysis after a few seconds
            setTimeout(() => {
                if (statusEl) statusEl.innerHTML = currentText;
            }, 4000);
        }

        if (typeof done === 'function') {
            done();
        }
    });
}

function calculateAIBestMove() {
    const moves = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = game.getPieceAt(r, c);
            if (piece && piece.color === aiColor) {
                const validMoves = game.getValidMoves(r, c);
                for (const [toRow, toCol] of validMoves) {
                    moves.push({
                        from: game.coordsToPosition(r, c),
                        to: game.coordsToPosition(toRow, toCol),
                        fromRow: r,
                        fromCol: c,
                        toRow: toRow,
                        toCol: toCol
                    });
                }
            }
        }
    }

    if (moves.length === 0) return null;

    let bestMoves = [];
    let bestScore = -Infinity;

    for (const move of moves) {
        game.makeTemporaryMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
        const score = game.evaluateBoard();
        game.undoTemporaryMove(move.fromRow, move.fromCol, move.toRow, move.toCol);

        const normalizedScore = aiColor === 'black' ? score : -score;
        if (normalizedScore > bestScore) {
            bestScore = normalizedScore;
            bestMoves = [move];
        } else if (normalizedScore === bestScore) {
            bestMoves.push(move);
        }
    }

    if (bestMoves.length === 0) return null;
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function getDetailedAnalysisFeedback(analysis) {
    const accuracy = analysis.accuracy;
    const avgLoss = analysis.avgCentipawnLoss || 0;
    const mistakes = analysis.mistakes + analysis.blunders;
    const opponentELO = analysis.opponentELO;

    // Base feedback on accuracy and centipawn loss
    if (accuracy > 90) {
        if (avgLoss < 50) {
            return `🌟 Outstanding! You played like a ${opponentELO + 200}+ ELO player. Minimal losses and excellent decisions throughout.`;
        } else {
            return `🌟 Excellent accuracy! Your moves were very strong despite some minor inaccuracies.`;
        }
    } else if (accuracy > 80) {
        return `✅ Good performance! Solid play with occasional inaccuracies. Focus on calculating variations deeper.`;
    } else if (accuracy > 70) {
        if (mistakes > 2) {
            return `👍 Decent game, but ${mistakes} significant mistakes hurt your score. Work on tactical awareness.`;
        } else {
            return `👍 Good game! Some inaccuracies but overall solid play. Keep practicing.`;
        }
    } else if (accuracy > 60) {
        return `📈 Average performance. You made ${mistakes} mistakes and lost ${avgLoss} centipawns on average. Study basic tactics and positional play.`;
    } else if (accuracy > 50) {
        return `⚠️ Below average. ${mistakes} mistakes and high centipawn loss (${avgLoss} cp) indicate tactical and positional issues. Focus on fundamentals.`;
    } else if (accuracy > 40) {
        return `🎓 Significant room for improvement. ${mistakes} major errors and ${avgLoss} cp average loss. Start with basic tactics training.`;
    } else {
        return `🎯 Keep practicing! Against ${opponentELO} ELO, ${accuracy}% accuracy with ${avgLoss} cp loss shows you need to work on basic chess principles.`;
    }
}

function getMistakeExplanation(quality, bestMove) {
    if (!bestMove) return "Position improved by finding a better move.";

    const explanations = {
        blunder: [
            "Hanging a valuable piece",
            "Missing a winning tactic",
            "Moving into check or discovered attack",
            "Major positional oversight"
        ],
        mistake: [
            "Missing a tactical opportunity",
            "Creating weaknesses in pawn structure",
            "Poor piece coordination",
            "Underestimating opponent's threats"
        ],
        inaccuracy: [
            "Minor positional loss",
            "Could have improved piece activity",
            "Slight pawn structure issue",
            "Not the most precise move"
        ]
    };

    const options = explanations[quality] || ["Could be improved"];
    return options[Math.floor(Math.random() * options.length)];
}

// Initial render
updateDisplay();

// Initialize ELO buttons
function initializeELOButtons() {
    const container = document.getElementById('eloSelector');
    container.innerHTML = '';
    
    for (const [elo, data] of Object.entries(ELO_LEVELS)) {
        const btn = document.createElement('button');
        btn.className = 'elo-btn' + (elo === String(currentELO) ? ' active' : '');
        btn.textContent = elo;
        btn.title = data.name;
        btn.onclick = () => setELO(Number(elo));
        container.appendChild(btn);
    }
}

function setELO(elo) {
    currentELO = elo;
    initializeELOButtons();
    console.log(`ELO set to ${elo}`);
}

// Initialize on page load
window.addEventListener('load', initializeELOButtons);
