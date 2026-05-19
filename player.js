let socket = null;
let myPlayerId = null;
let lastState = null;
let lastRevealMsg = null;
let selectedLetters = [];
let answersLocked = false;
let drumsPlayedForQuestion = false;
let lastRenderedQuestion = -1;
let selectedIconId = null;
let avatarIndex = 0;
let lastPhase = null;

const AVAILABLE_ICONS = [
    'bear', 'buffalo', 'chick', 'chicken', 'cow', 'crocodile', 'dog', 'duck',
    'elephant', 'frog', 'giraffe', 'goat', 'gorilla', 'hippo', 'horse', 'monkey',
    'moose', 'narwhal', 'owl', 'panda', 'parrot', 'penguin', 'pig', 'rabbit',
    'rhino', 'sloth', 'snake', 'walrus', 'whale', 'zebra'
];

function iconLabel(id) {
    const fallback = id.charAt(0).toUpperCase() + id.slice(1);
    return t(`icon_${id}`, fallback);
}

function vibrate(pattern) {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(pattern);
        }
    } catch (_) { /* ignore */ }
}

function iconUrl(iconId) {
    return iconId ? `icons/${iconId}.png` : null;
}

function setBgState({ fast, correct, wrong } = {}) {
    document.body.classList.toggle('mp-bg-fast', !!fast);
    document.body.classList.toggle('mp-bg-correct', !!correct);
    document.body.classList.toggle('mp-bg-wrong', !!wrong);
}

function updateAvatarDisplay() {
    const img = document.getElementById('mp-avatar-image');
    const name = document.getElementById('mp-avatar-name');
    if (!img || !name) return;
    const id = AVAILABLE_ICONS[avatarIndex];
    selectedIconId = id;
    img.src = iconUrl(id);
    img.alt = id;
    name.textContent = iconLabel(id);
    localStorage.setItem('quiz_player_icon', id);
    localStorage.setItem('quiz_player_icon_idx', String(avatarIndex));
}

function stepAvatar(dir) {
    const n = AVAILABLE_ICONS.length;
    avatarIndex = (avatarIndex + dir + n) % n;
    updateAvatarDisplay();
    const img = document.getElementById('mp-avatar-image');
    if (img) {
        img.classList.remove('mp-avatar-anim-left', 'mp-avatar-anim-right');
        void img.offsetWidth;
        img.classList.add(dir > 0 ? 'mp-avatar-anim-right' : 'mp-avatar-anim-left');
    }
    vibrate(10);
}

function initAvatarPicker() {
    const prev = document.getElementById('mp-avatar-prev');
    const next = document.getElementById('mp-avatar-next');
    if (!prev || !next) return;
    prev.addEventListener('click', () => stepAvatar(-1));
    next.addEventListener('click', () => stepAvatar(1));

    const savedIdx = parseInt(localStorage.getItem('quiz_player_icon_idx'), 10);
    if (!Number.isNaN(savedIdx) && savedIdx >= 0 && savedIdx < AVAILABLE_ICONS.length) {
        avatarIndex = savedIdx;
    } else {
        avatarIndex = Math.floor(Math.random() * AVAILABLE_ICONS.length);
    }
    updateAvatarDisplay();

    document.addEventListener('quiz-locale-loaded', () => {
        const name = document.getElementById('mp-avatar-name');
        if (name) name.textContent = iconLabel(AVAILABLE_ICONS[avatarIndex]);
    });
}

const screens = {
    join: document.getElementById('mp-join-screen'),
    wait: document.getElementById('mp-wait-screen'),
    game: document.getElementById('mp-game-screen'),
    end: document.getElementById('mp-end-screen')
};

function showScreen(name) {
    Object.values(screens).forEach(el => el && el.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
    const helpBtns = document.getElementById('help-buttons');
    if (helpBtns) {
        helpBtns.classList.toggle('hidden', name !== 'game');
    }
}

function getQueryRoom() {
    return (new URLSearchParams(location.search).get('room') || '').toUpperCase().trim();
}

function updateMyScore(state) {
    const me = state.players.find(p => p.isYou);
    const text = me ? t('mp_your_score', 'Pontjaid: {n}').replace('{n}', me.score) : '';
    const el1 = document.getElementById('mp-your-score');
    const el2 = document.getElementById('mp-your-score-game');
    if (el1) el1.textContent = text;
    if (el2) el2.textContent = text;
}

function updateHelpButtons(pv) {
    if (!pv || !pv.lifelines) return;
    const map = { half: 'half-btn', hint: 'hint-btn', dbl: 'dbl-btn' };
    Object.entries(map).forEach(([key, id]) => {
        const btn = document.getElementById(id);
        const count = pv.lifelines[key] || 0;
        btn.querySelector('.help-counter').textContent = count;
        btn.classList.toggle('disabled', count <= 0 || answersLocked);
        if (key === 'dbl' && pv.dblActive) {
            btn.classList.add('disabled');
        }
    });
}

function applyPlayerView(pv) {
    if (!pv) return;
    answersLocked = pv.answersLocked;
    selectedLetters = [...(pv.selectedLetters || [])];

    updateHelpButtons(pv);

    const hintDiv = document.getElementById('hint');
    const hintContent = document.querySelector('.hint-content');
    if (pv.hintShown && pv.hintText) {
        hintContent.textContent = pv.hintText;
        hintDiv.classList.remove('hidden');
    } else if (!pv.hintShown) {
        hintDiv.classList.add('hidden');
    }

    const container = document.getElementById('answers-container');
    container.querySelectorAll('.answer').forEach(btn => {
        const letter = btn.dataset.letter;
        btn.classList.remove('deselected', 'mp-locked', 'correct', 'incorrect');
        if (pv.hiddenLetters && pv.hiddenLetters.includes(letter)) {
            btn.classList.add('hidden');
        }
        btn.classList.toggle('selected', selectedLetters.includes(letter));
        btn.disabled = answersLocked;
        if (answersLocked) {
            if (!selectedLetters.includes(letter)) {
                btn.classList.add('deselected');
            }
        }
    });
    updateAnswerAvatars();
}

function updateAnswerAvatars() {
    const container = document.getElementById('answers-container');
    if (!container) return;
    container.querySelectorAll('.mp-avatar-overlay').forEach(el => el.remove());

    const me = lastState && lastState.players.find(p => p.isYou);
    if (!me || !me.iconId) return;

    selectedLetters.forEach(letter => {
        const btn = container.querySelector(`.answer[data-letter="${letter}"]`);
        if (!btn) return;
        const overlay = document.createElement('span');
        overlay.className = 'mp-avatar-overlay';
        overlay.innerHTML = `<img src="${iconUrl(me.iconId)}" alt="${me.name}" title="${me.name}">`;
        btn.appendChild(overlay);
    });
}

function setPhaseStatus(el, text, phaseClass) {
    if (!el) return;
    if (!text) {
        el.className = 'mp-status-line mp-phase-status hidden';
        el.textContent = '';
        return;
    }
    el.classList.remove('hidden');
    el.className = `mp-status-line mp-phase-status mp-phase-${phaseClass}`;
    el.textContent = text;
}

function buildAnswerButtons(answers, pv) {
    const container = document.getElementById('answers-container');
    container.innerHTML = '';
    const colors = ['red', 'blue', 'yellow', 'green'];
    const dblActive = pv && pv.dblActive;

    answers.forEach((a, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `answer answer-color-${colors[i]} mp-player-answer`;
        btn.innerHTML = `<span class="answer-label">${a.letter}.</span> ${a.text}`;
        btn.dataset.letter = a.letter;

        if (pv && pv.hiddenLetters && pv.hiddenLetters.includes(a.letter)) {
            btn.classList.add('hidden');
        }

        btn.addEventListener('click', () => onAnswerClick(btn, dblActive));
        container.appendChild(btn);
    });

    applyPlayerView(pv);
}

function onAnswerClick(btn, dblActive) {
    if (answersLocked) return;

    const letter = btn.dataset.letter;
    const container = document.getElementById('answers-container');

    if (dblActive) {
        btn.classList.toggle('selected');
        selectedLetters = Array.from(container.querySelectorAll('.answer.selected'))
            .map(b => b.dataset.letter);
        if (selectedLetters.length > 2) {
            selectedLetters = selectedLetters.slice(-2);
            container.querySelectorAll('.answer').forEach(b => {
                b.classList.toggle('selected', selectedLetters.includes(b.dataset.letter));
            });
        }
        if (selectedLetters.length > 0) {
            socket.submitAnswers(selectedLetters);
        }
        setPhaseStatus(document.getElementById('mp-player-status'),
            selectedLetters.length < 2
                ? t('mp_pick_second', 'Válaszd a második választ is (dupla esély)')
                : t('mp_can_change', 'Válasz kész — módosíthatod, amíg a műsorvezető le nem zárja'),
            selectedLetters.length < 2 ? 'pick' : 'question');
    } else {
        container.querySelectorAll('.answer').forEach(b => {
            b.classList.remove('selected');
        });
        btn.classList.add('selected');
        selectedLetters = [letter];
        socket.submitAnswer(letter);
        setPhaseStatus(document.getElementById('mp-player-status'),
            t('mp_can_change', 'Válasz kész — módosíthatod, amíg a műsorvezető le nem zárja'),
            'question');
    }
    vibrate(15);
    updateAnswerAvatars();
}

function applyRevealToButtons(msg) {
    const container = document.getElementById('answers-container');
    const me = msg.playerResults.find(r => r.id === myPlayerId);

    const picked = me && (me.pickedLetters || (me.pickedLetter ? [me.pickedLetter] : []));

    container.querySelectorAll('.answer').forEach(btn => {
        const letter = btn.dataset.letter;
        const answerInfo = msg.answers.find(a => a.letter === letter);
        btn.disabled = true;
        btn.classList.remove('selected', 'deselected');
        if (answerInfo && answerInfo.correct) {
            btn.classList.add('correct');
        } else if (picked && picked.includes(letter) && me && !me.correct) {
            btn.classList.add('incorrect');
        } else {
            btn.classList.add('deselected');
        }
    });
    updateAnswerAvatars();

    const banner = document.getElementById('mp-result-banner');
    if (me) {
        banner.classList.remove('hidden');
        banner.className = `mp-result-banner ${me.correct ? 'mp-result-win' : 'mp-result-loss'}`;
        banner.textContent = me.correct
            ? t('mp_you_correct', 'Helyes! ✅')
            : t('mp_you_wrong', 'Helytelen ❌');
        playFx(me.correct ? 'good.mp3' : 'bad.mp3');
        vibrate(me.correct ? [60, 40, 60] : [200]);
    }
}

function renderAnswerMatrix(msg) {
    const wrap = document.getElementById('mp-answer-matrix-wrap');
    if (!wrap || !msg.answerMatrix) return;

    const qHead = msg.questions.map((q, i) =>
        `<th title="${escapeHtml(q.text)}">Q${i + 1}</th>`
    ).join('');

    const rows = msg.answerMatrix.map(row => {
        const cells = row.cells.map(c => {
            if (c === null) return '<td class="mp-cell-none">–</td>';
            if (c === 'correct') return '<td class="mp-cell-correct">✅</td>';
            return '<td class="mp-cell-wrong">❌</td>';
        }).join('');
        return `<tr><th>${escapeHtml(row.name)}</th>${cells}<td><strong>${row.score}</strong></td></tr>`;
    }).join('');

    wrap.innerHTML = `
        <h3>${t('mp_matrix_title', 'Kérdésenkénti eredmények')}</h3>
        <div class="mp-table-scroll">
            <table class="mp-results-table">
                <thead><tr><th>${t('mp_matrix_player', 'Játékos')}</th>${qHead}<th>${t('mp_matrix_total', 'Össz')}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function onState(state) {
    lastState = state;
    updateMyScore(state);

    if (state.phase === 'lobby') {
        showScreen('wait');
        document.getElementById('mp-wait-room').textContent = state.roomCode;
        return;
    }

    if (state.phase === 'ended') return;

    const pv = state.playerView;

    if (state.phase === 'question') {
        showScreen('game');
        drumsPlayedForQuestion = false;
        answersLocked = false;
        lastPhase = 'question';
        lastRevealMsg = null;
        setBgState({});
        selectedLetters = pv ? [...pv.selectedLetters] : [];

        document.getElementById('mp-player-progress').textContent =
            `${state.questionIndex + 1} / ${state.totalQuestions}`;
        document.getElementById('question-text').textContent = state.question.text;
        document.getElementById('mp-result-banner').classList.add('hidden');
        document.getElementById('hint').classList.add('hidden');
        const triviaEl = document.getElementById('mp-trivia');
        if (triviaEl) triviaEl.classList.add('hidden');

        const hasSelection = selectedLetters.length > 0;
        const statusEl = document.getElementById('mp-player-status');
        setPhaseStatus(statusEl,
            hasSelection
                ? t('mp_can_change', 'Válasz kész — módosíthatod, amíg a műsorvezető le nem zárja')
                : t('mp_pick_answer', 'Válassz egy választ!'),
            hasSelection ? 'question' : 'pick');

        if (state.questionIndex !== lastRenderedQuestion) {
            lastRenderedQuestion = state.questionIndex;
            buildAnswerButtons(state.question.answers, pv);
        } else {
            applyPlayerView(pv);
        }
        return;
    }

    if (state.phase === 'locked') {
        showScreen('game');
        answersLocked = true;
        applyPlayerView(pv || { answersLocked: true, selectedLetters });
        setPhaseStatus(document.getElementById('mp-player-status'),
            t('mp_answers_locked_player', 'Válaszok lezárva — várakozás a felfedésre…'),
            'locked');
        if (lastPhase !== 'locked') vibrate([40, 30, 40]);
        lastPhase = 'locked';
        setBgState({ fast: false });
        return;
    }

    if (state.phase === 'revealing') {
        showScreen('game');
        answersLocked = true;
        if (pv) applyPlayerView(pv);
        setPhaseStatus(document.getElementById('mp-player-status'),
            t('mp_revealing', 'Felfedés folyamatban…'),
            'locked');
        if (lastPhase !== 'revealing') {
            if (!drumsPlayedForQuestion) {
                drumsPlayedForQuestion = true;
                playFx('drums.mp3');
            }
            vibrate([100, 50, 100, 50, 200]);
        }
        lastPhase = 'revealing';
        setBgState({ fast: true });
        return;
    }

    if (state.phase === 'reveal') {
        showScreen('game');
        answersLocked = true;
        if (lastRevealMsg) {
            applyRevealToButtons(lastRevealMsg);
            showRevealTrivia(lastRevealMsg);
        } else if (pv) {
            applyPlayerView(pv);
        }
        lastPhase = 'reveal';
        const me = lastRevealMsg && lastRevealMsg.playerResults.find(r => r.id === myPlayerId);
        setBgState({
            fast: false,
            correct: !!(me && me.correct),
            wrong: !!(me && !me.correct)
        });
    }
}

function showRevealTrivia(msg) {
    const statusEl = document.getElementById('mp-player-status');
    const triviaEl = document.getElementById('mp-trivia');
    const triviaText = triviaEl && triviaEl.querySelector('.trivia-text');
    if (msg && msg.trivia && msg.trivia.trim()) {
        if (triviaEl && triviaText) {
            triviaText.textContent = msg.trivia;
            triviaEl.classList.remove('hidden');
        }
        setPhaseStatus(statusEl, null);
    } else {
        if (triviaEl) triviaEl.classList.add('hidden');
        setPhaseStatus(statusEl, null);
    }
}

function onReveal(msg) {
    lastRevealMsg = msg;
    applyRevealToButtons(msg);
    showRevealTrivia(msg);
    document.getElementById('help-buttons').classList.add('hidden');
    const me = msg.playerResults.find(r => r.id === myPlayerId);
    setBgState({ correct: !!(me && me.correct), wrong: !!(me && !me.correct) });
}

function onGameOver(msg) {
    showScreen('end');
    document.getElementById('help-buttons').classList.add('hidden');
    document.getElementById('mp-final-standings').innerHTML = msg.standings.map((s, i) =>
        `<div class="mp-standing-row">
            <span>${i + 1}.</span> <strong>${s.name}</strong>
            <span>${s.score} / ${msg.totalQuestions}</span>
        </div>`
    ).join('');
    renderAnswerMatrix(msg);
}

const CLOWN_NAMES = ['n3ro', 'n3rolul', 'tóth', 'toth', 'nero'];

function applyEasterEgg(name) {
    if (!name) return { name, iconId: selectedIconId };
    const normalized = name.toLowerCase().trim();
    if (CLOWN_NAMES.includes(normalized)) {
        return { name: 'CLOWN', iconId: 'clown' };
    }
    return { name, iconId: selectedIconId };
}

async function joinGame() {
    const roomCode = document.getElementById('mp-room-input').value.toUpperCase().trim();
    const rawName = document.getElementById('mp-name-input').value.trim() || 'Játékos';
    const status = document.getElementById('mp-join-status');

    if (roomCode.length < 4) {
        status.textContent = t('mp_error_missing_room', 'Add meg a szobakódot!');
        return;
    }

    const egg = applyEasterEgg(rawName);
    const name = egg.name;
    const iconForJoin = egg.iconId;

    if (!iconForJoin) {
        status.textContent = t('mp_error_no_icon', 'Válassz egy karaktert!');
        return;
    }

    status.textContent = t('mp_connecting', 'Kapcsolódás…');
    document.getElementById('mp-retry-btn').classList.add('hidden');

    socket = new QuizSocket({
        onJoined(msg) {
            myPlayerId = msg.playerId;
            showScreen('wait');
            document.getElementById('mp-wait-room').textContent = msg.roomCode;
            status.textContent = '';
        },
        onState,
        onReveal,
        onGameOver,
        onError(code) {
            status.textContent = errorMessage(code);
            document.getElementById('mp-retry-btn').classList.remove('hidden');
        },
        onDisconnect() {
            status.textContent = t('mp_disconnected', 'Kapcsolat megszakadt');
            showScreen('join');
            document.getElementById('mp-retry-btn').classList.remove('hidden');
        }
    });

    try {
        await socket.connect();
        socket.join(roomCode, 'player', name, iconForJoin);
    } catch {
        status.textContent = t('mp_server_offline', 'A szerver nem elérhető.');
        document.getElementById('mp-retry-btn').classList.remove('hidden');
    }
}

document.getElementById('half-btn').addEventListener('click', () => {
    if (answersLocked) return;
    playFx('half.mp3');
    socket.useLifeline('half');
});

document.getElementById('hint-btn').addEventListener('click', () => {
    if (answersLocked) return;
    playFx('hint.mp3');
    socket.useLifeline('hint');
});

document.getElementById('dbl-btn').addEventListener('click', () => {
    if (answersLocked) return;
    playFx('double.mp3');
    socket.useLifeline('dbl');
});

document.getElementById('mp-join-btn').addEventListener('click', joinGame);
document.getElementById('mp-retry-btn').addEventListener('click', joinGame);
document.getElementById('mp-rejoin').addEventListener('click', () => location.reload());

document.addEventListener('DOMContentLoaded', () => {
    const room = getQueryRoom();
    if (room) document.getElementById('mp-room-input').value = room;
    const savedName = localStorage.getItem('quiz_player_name');
    if (savedName) document.getElementById('mp-name-input').value = savedName;
    document.getElementById('mp-name-input').addEventListener('change', (e) => {
        localStorage.setItem('quiz_player_name', e.target.value);
    });

    initAvatarPicker();
});
