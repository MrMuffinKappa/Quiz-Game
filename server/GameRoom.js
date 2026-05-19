const LETTERS = ['A', 'B', 'C', 'D'];
const REVEAL_DELAY_MS = 5000;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

const DEFAULT_LIFELINES = { half: 1, hint: 1, dbl: 1 };

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function randomId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createPlayer(ws, name, iconId) {
    return {
        id: randomId('p'),
        name: (name || 'Player').trim().slice(0, 24) || 'Player',
        iconId: (iconId || '').toString().slice(0, 40) || null,
        score: 0,
        currentAnswer: null,
        currentAnswers: [],
        dblActive: false,
        hiddenLetters: [],
        hintShown: false,
        lifelines: { half: 0, hint: 0, dbl: 0 },
        answerHistory: [],
        ws
    };
}

class GameRoom {
    constructor(code, onEmpty) {
        this.code = code;
        this.onEmpty = onEmpty;
        this.quiz = null;
        this.phase = 'lobby';
        this.questionIndex = 0;
        this.shuffledAnswers = [];
        this.correctLetter = null;
        this.host = null;
        this.players = new Map();
        this.revealTimer = null;
        this.connections = new Set();
        this.lifelineConfig = { ...DEFAULT_LIFELINES };
    }

    addConnection(ws) {
        this.connections.add(ws);
        ws.roomCode = this.code;
    }

    removeConnection(ws) {
        this.connections.delete(ws);
        if (ws.role === 'host' && this.host && this.host.ws === ws) {
            this.host = null;
        }
        if (ws.role === 'player' && ws.playerId) {
            this.players.delete(ws.playerId);
        }
        if (this.connections.size === 0) {
            this.clearRevealTimer();
            this.onEmpty(this.code);
        } else {
            this.broadcastState();
        }
    }

    clearRevealTimer() {
        if (this.revealTimer) {
            clearTimeout(this.revealTimer);
            this.revealTimer = null;
        }
    }

    setHost(ws, name) {
        if (this.host && this.host.ws !== ws) {
            return { ok: false, error: 'room_has_host' };
        }
        this.host = { ws, name: name || 'Host' };
        ws.role = 'host';
        ws.playerId = null;
        return { ok: true };
    }

    addPlayer(ws, name, iconId) {
        if (this.players.size >= MAX_PLAYERS) {
            return { ok: false, error: 'room_full' };
        }
        if (this.phase !== 'lobby') {
            return { ok: false, error: 'game_started' };
        }
        const player = createPlayer(ws, name, iconId);
        this.players.set(player.id, player);
        ws.role = 'player';
        ws.playerId = player.id;
        return { ok: true, playerId: player.id };
    }

    setSettings(settings) {
        if (!settings || !settings.lifelines) {
            return { ok: false, error: 'invalid_settings' };
        }
        const l = settings.lifelines;
        this.lifelineConfig = {
            half: Math.max(0, Math.min(5, parseInt(l.half, 10) || 0)),
            hint: Math.max(0, Math.min(5, parseInt(l.hint, 10) || 0)),
            dbl: Math.max(0, Math.min(5, parseInt(l.dbl, 10) || 0))
        };
        this.broadcastState();
        return { ok: true };
    }

    initPlayerLifelines(player) {
        player.lifelines = { ...this.lifelineConfig };
    }

    resetPlayerQuestionState(player) {
        player.currentAnswer = null;
        player.currentAnswers = [];
        player.dblActive = false;
        player.hiddenLetters = [];
        player.hintShown = false;
    }

    loadQuiz(quiz) {
        if (!Array.isArray(quiz) || quiz.length === 0) {
            return { ok: false, error: 'invalid_quiz' };
        }
        this.quiz = quiz;
        this.questionIndex = 0;
        this.phase = 'lobby';
        this.clearRevealTimer();
        for (const p of this.players.values()) {
            p.score = 0;
            p.answerHistory = [];
            this.resetPlayerQuestionState(p);
        }
        return { ok: true };
    }

    startGame() {
        if (!this.quiz || this.quiz.length === 0) {
            return { ok: false, error: 'no_quiz' };
        }
        if (!this.host) {
            return { ok: false, error: 'no_host' };
        }
        if (this.players.size < MIN_PLAYERS) {
            return { ok: false, error: 'not_enough_players' };
        }
        this.questionIndex = 0;
        for (const p of this.players.values()) {
            p.score = 0;
            p.answerHistory = [];
            this.initPlayerLifelines(p);
            this.resetPlayerQuestionState(p);
        }
        this.prepareQuestion();
        return { ok: true };
    }

    prepareQuestion() {
        this.clearRevealTimer();
        const question = this.quiz[this.questionIndex];
        const answers = [...question.answers];
        const correctText = answers[0];
        shuffleArray(answers);

        this.shuffledAnswers = answers.map((text, i) => ({
            letter: LETTERS[i],
            text
        }));
        this.correctLetter = this.shuffledAnswers.find(a => a.text === correctText).letter;

        for (const p of this.players.values()) {
            this.resetPlayerQuestionState(p);
        }
        this.phase = 'question';
        this.broadcastState();
    }

    submitAnswer(playerId, payload) {
        if (this.phase !== 'question') {
            return { ok: false, error: 'not_accepting' };
        }
        const player = this.players.get(playerId);
        if (!player) {
            return { ok: false, error: 'unknown_player' };
        }

        if (player.dblActive && Array.isArray(payload.letters)) {
            const letters = payload.letters.filter(l => LETTERS.includes(l)).slice(0, 2);
            if (letters.length === 0) {
                return { ok: false, error: 'invalid_letter' };
            }
            player.currentAnswers = letters;
            player.currentAnswer = letters[0];
        } else {
            const letter = payload.letter;
            if (!LETTERS.includes(letter)) {
                return { ok: false, error: 'invalid_letter' };
            }
            if (player.dblActive) {
                if (!player.currentAnswers.includes(letter)) {
                    if (player.currentAnswers.length >= 2) {
                        player.currentAnswers = [letter];
                    } else {
                        player.currentAnswers.push(letter);
                    }
                } else {
                    player.currentAnswers = player.currentAnswers.filter(l => l !== letter);
                }
                player.currentAnswer = player.currentAnswers[0] || null;
            } else {
                player.currentAnswer = letter;
                player.currentAnswers = [letter];
            }
        }

        this.broadcastState();
        return { ok: true };
    }

    lockAnswers() {
        if (this.phase !== 'question') {
            return { ok: false, error: 'not_question' };
        }
        this.phase = 'locked';
        this.broadcastState();
        return { ok: true };
    }

    revealAnswers() {
        if (this.phase !== 'locked') {
            return { ok: false, error: 'not_locked' };
        }
        this.phase = 'revealing';
        this.broadcastState();
        this.scheduleReveal();
        return { ok: true };
    }

    scheduleReveal() {
        this.clearRevealTimer();
        this.revealTimer = setTimeout(() => this.doReveal(), REVEAL_DELAY_MS);
    }

    isAnswerCorrect(player) {
        if (!player.currentAnswers || player.currentAnswers.length === 0) {
            return false;
        }
        return player.currentAnswers.some(l => l === this.correctLetter);
    }

    doReveal() {
        this.revealTimer = null;
        if (!this.quiz) return;

        const question = this.quiz[this.questionIndex];
        const qIndex = this.questionIndex;

        const playerResults = [...this.players.values()].map(p => {
            const correct = this.isAnswerCorrect(p);
            if (correct) p.score += 1;

            const picked = p.currentAnswers.length > 0
                ? p.currentAnswers.map(l => {
                    const a = this.shuffledAnswers.find(x => x.letter === l);
                    return a ? `${l}. ${a.text}` : l;
                }).join(', ')
                : '';

            p.answerHistory.push({
                questionIndex: qIndex,
                correct,
                pickedLetters: [...(p.currentAnswers || [])]
            });

            return {
                id: p.id,
                name: p.name,
                iconId: p.iconId,
                correct,
                pickedLetter: p.currentAnswer,
                pickedLetters: [...(p.currentAnswers || [])],
                pickedText: picked
            };
        });

        const answersWithCorrect = this.shuffledAnswers.map(a => ({
            letter: a.letter,
            text: a.text,
            correct: a.letter === this.correctLetter
        }));

        this.phase = 'reveal';
        this.broadcast({
            type: 'REVEAL',
            correctLetter: this.correctLetter,
            trivia: question.trivia || '',
            playerResults,
            answers: answersWithCorrect
        });
        this.broadcastState();
    }

    nextQuestion() {
        if (this.phase !== 'reveal') {
            return { ok: false, error: 'not_reveal' };
        }
        this.questionIndex += 1;
        if (this.questionIndex >= this.quiz.length) {
            this.endGame();
            return { ok: true, ended: true };
        }
        this.prepareQuestion();
        return { ok: true, ended: false };
    }

    useLifeline(playerId, lifeline) {
        if (this.phase !== 'question') {
            return { ok: false, error: 'not_accepting' };
        }
        const player = this.players.get(playerId);
        if (!player) {
            return { ok: false, error: 'unknown_player' };
        }

        const question = this.quiz[this.questionIndex];

        if (lifeline === 'half') {
            if (player.lifelines.half <= 0) return { ok: false, error: 'no_lifeline' };
            const wrong = this.shuffledAnswers
                .filter(a => a.letter !== this.correctLetter)
                .map(a => a.letter);
            shuffleArray(wrong);
            player.hiddenLetters = wrong.slice(0, 2);
            player.lifelines.half--;
        } else if (lifeline === 'hint') {
            if (player.lifelines.hint <= 0) return { ok: false, error: 'no_lifeline' };
            if (!question.hint) return { ok: false, error: 'no_hint' };
            player.hintShown = true;
            player.lifelines.hint--;
        } else if (lifeline === 'dbl') {
            if (player.lifelines.dbl <= 0) return { ok: false, error: 'no_lifeline' };
            if (player.dblActive) return { ok: false, error: 'dbl_already' };
            player.dblActive = true;
            player.lifelines.dbl--;
        } else {
            return { ok: false, error: 'invalid_lifeline' };
        }

        this.broadcastState();
        return { ok: true };
    }

    buildAnswerMatrix() {
        const players = [...this.players.values()];
        const totalQ = this.quiz.length;
        const questions = this.quiz.map((q, i) => ({
            index: i,
            text: q.question
        }));

        const matrix = players.map(p => {
            const cells = [];
            for (let i = 0; i < totalQ; i++) {
                const entry = p.answerHistory.find(h => h.questionIndex === i);
                if (!entry) {
                    cells.push(null);
                } else {
                    cells.push(entry.correct ? 'correct' : 'wrong');
                }
            }
            return {
                id: p.id,
                name: p.name,
                score: p.score,
                cells
            };
        });

        return { questions, matrix };
    }

    endGame() {
        this.phase = 'ended';
        const standings = [...this.players.values()]
            .map(p => ({ id: p.id, name: p.name, score: p.score }))
            .sort((a, b) => b.score - a.score);

        const { questions, matrix } = this.buildAnswerMatrix();

        this.broadcast({
            type: 'GAME_OVER',
            standings,
            totalQuestions: this.quiz.length,
            questions,
            answerMatrix: matrix
        });
        this.broadcastState();
    }

    getPlayerView(player, question) {
        return {
            lifelines: { ...player.lifelines },
            hiddenLetters: [...player.hiddenLetters],
            hintShown: player.hintShown,
            hintText: player.hintShown && question && question.hint ? question.hint : null,
            dblActive: player.dblActive,
            selectedLetters: [...player.currentAnswers],
            answersLocked: this.phase !== 'question'
        };
    }

    getPublicState(forWs) {
        const question = this.quiz && this.quiz[this.questionIndex];
        const showPicked = forWs && forWs.role === 'host' && (this.phase === 'locked' || this.phase === 'revealing' || this.phase === 'reveal');
        const playerList = [...this.players.values()].map(p => {
            const isYou = forWs && forWs.playerId === p.id;
            const exposePicked = showPicked || isYou || this.phase === 'reveal' || this.phase === 'revealing';
            return {
                id: p.id,
                name: p.name,
                iconId: p.iconId,
                score: p.score,
                hasAnswered: p.currentAnswers.length > 0,
                pickedLetters: exposePicked ? [...p.currentAnswers] : [],
                isYou
            };
        });

        let questionPayload = null;
        if (question && ['question', 'locked', 'revealing', 'reveal'].includes(this.phase)) {
            questionPayload = {
                text: question.question,
                image: question.image || null,
                answers: this.shuffledAnswers.map(a => ({ letter: a.letter, text: a.text }))
            };
        }

        const state = {
            type: 'STATE',
            roomCode: this.code,
            phase: this.phase,
            questionIndex: this.questionIndex,
            totalQuestions: this.quiz ? this.quiz.length : 0,
            players: playerList,
            maxPlayers: MAX_PLAYERS,
            minPlayers: MIN_PLAYERS,
            hostConnected: !!this.host,
            question: questionPayload,
            role: forWs ? forWs.role : null,
            playerId: forWs ? forWs.playerId : null,
            lifelineConfig: this.lifelineConfig,
            answersLocked: this.phase !== 'question'
        };

        if (forWs && forWs.role === 'player' && forWs.playerId) {
            const player = this.players.get(forWs.playerId);
            if (player) {
                state.playerView = this.getPlayerView(player, question);
            }
        }

        return state;
    }

    broadcastState() {
        for (const ws of this.connections) {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify(this.getPublicState(ws)));
            }
        }
    }

    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const ws of this.connections) {
            if (ws.readyState === 1) {
                ws.send(data);
            }
        }
    }

    handleMessage(ws, msg) {
        switch (msg.type) {
            case 'SET_SETTINGS':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.setSettings({ lifelines: msg.lifelines });

            case 'QUIZ_LOAD':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.loadQuiz(msg.quiz);

            case 'START_GAME':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.startGame();

            case 'SUBMIT_ANSWER':
                if (ws.role !== 'player') return { error: 'player_only' };
                return this.submitAnswer(ws.playerId, msg);

            case 'LOCK_ANSWERS':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.lockAnswers();

            case 'REVEAL_ANSWERS':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.revealAnswers();

            case 'USE_LIFELINE':
                if (ws.role !== 'player') return { error: 'player_only' };
                return this.useLifeline(ws.playerId, msg.lifeline);

            case 'NEXT_QUESTION':
                if (ws.role !== 'host') return { error: 'host_only' };
                return this.nextQuestion();

            default:
                return { error: 'unknown_type' };
        }
    }
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    getOrCreate(code) {
        const normalized = (code || '').toUpperCase().trim();
        if (normalized && this.rooms.has(normalized)) {
            return this.rooms.get(normalized);
        }
        const newCode = normalized || randomCode();
        if (this.rooms.has(newCode)) {
            return this.rooms.get(newCode);
        }
        const room = new GameRoom(newCode, (c) => this.rooms.delete(c));
        this.rooms.set(newCode, room);
        return room;
    }

    get(code) {
        return this.rooms.get((code || '').toUpperCase().trim()) || null;
    }
}

module.exports = { GameRoom, RoomManager, randomCode, MAX_PLAYERS, MIN_PLAYERS };
