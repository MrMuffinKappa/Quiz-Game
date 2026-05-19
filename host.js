let socket = null;
let roomCode = null;
let quizLoaded = false;
let lastState = null;
let drumsPlayedForQuestion = false;

const helpCounters = { half: 1, hint: 1, dbl: 1 };
const MIN_PLAYERS = 2;

const screens = {
    connect: document.getElementById('mp-connect-screen'),
    lobby: document.getElementById('mp-lobby-screen'),
    game: document.getElementById('mp-game-screen'),
    end: document.getElementById('mp-end-screen')
};

function showScreen(name) {
    Object.values(screens).forEach(el => el && el.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
}

function setConnectStatus(text, showRetry) {
    const el = document.getElementById('mp-connect-status');
    if (el) el.textContent = text;
    const retry = document.getElementById('mp-retry-btn');
    if (retry) retry.classList.toggle('hidden', !showRetry);
}

function getLifelineSettings() {
    return {
        half: helpCounters.half,
        hint: helpCounters.hint,
        dbl: helpCounters.dbl
    };
}

function pushSettings() {
    if (socket && socket.connected) {
        socket.setSettings(getLifelineSettings());
    }
}

function updateHelpUI() {
    document.getElementById('count-half').textContent = helpCounters.half;
    document.getElementById('count-hint').textContent = helpCounters.hint;
    document.getElementById('count-dbl').textContent = helpCounters.dbl;
    pushSettings();
}

function updateLobby(state) {
    document.getElementById('mp-room-code').textContent = state.roomCode;
    document.getElementById('mp-player-url').value = getPlayerJoinUrl(state.roomCode);

    const list = document.getElementById('mp-players-waiting');
    list.innerHTML = '';
    const waiting = t('mp_waiting_players', 'Várakozás játékosokra…');
    const minP = state.minPlayers || MIN_PLAYERS;
    if (state.players.length === 0) {
        list.innerHTML = `<p class="mp-hint">${waiting} (0/${state.maxPlayers})</p>`;
    } else {
        state.players.forEach(p => {
            const div = document.createElement('div');
            div.className = 'mp-player-chip';
            div.textContent = `✅ ${p.name}`;
            list.appendChild(div);
        });
        if (state.players.length < state.maxPlayers) {
            const hint = document.createElement('p');
            hint.className = 'mp-hint';
            hint.textContent = `${waiting} (${state.players.length}/${state.maxPlayers})`;
            list.appendChild(hint);
        }
    }

    const startBtn = document.getElementById('mp-start-game');
    startBtn.disabled = !quizLoaded || state.players.length < minP;
}

function renderScoreboard(players) {
    document.getElementById('mp-scoreboard').innerHTML = players.map(p =>
        `<span class="mp-score-item">${p.name}: <strong>${p.score}</strong>
         ${p.hasAnswered ? '✓' : '○'}</span>`
    ).join('');
}

function renderHostAnswers(answers, revealData) {
    const container = document.getElementById('host-answers-display');
    container.innerHTML = '';
    const colors = ['red', 'blue', 'yellow', 'green'];
    const revealMap = revealData
        ? Object.fromEntries(revealData.answers.map(a => [a.letter, a]))
        : null;

    answers.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = `answer answer-color-${colors[i]}`;
        div.innerHTML = `<span class="answer-label">${a.letter}.</span> ${a.text}`;
        if (revealMap) {
            if (revealMap[a.letter].correct) div.classList.add('correct');
            else div.classList.add('deselected');
        }
        container.appendChild(div);
    });
}

function renderRevealPanel(msg) {
    const panel = document.getElementById('mp-reveal-results');
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="results-list">${msg.playerResults.map(r =>
        `<div class="result-item ${r.correct ? 'correct' : 'incorrect'}">
            <span><strong>${escapeHtml(r.name)}</strong></span>
            <span>${r.correct ? '✅' : '❌'} ${escapeHtml(r.pickedText || '–')}</span>
        </div>`
    ).join('')}</div>`;
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

function renderAnswerMatrix(msg) {
    const wrap = document.getElementById('mp-answer-matrix-wrap');
    if (!msg.answerMatrix || !msg.questions) {
        wrap.innerHTML = '';
        return;
    }

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
        <h3 data-i18n="mp_matrix_title">Kérdésenkénti eredmények</h3>
        <div class="mp-table-scroll">
            <table class="mp-results-table">
                <thead>
                    <tr><th>${t('mp_matrix_player', 'Játékos')}</th>${qHead}<th>${t('mp_matrix_total', 'Össz')}</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function colorizeBackground(isCorrect) {
    const paths = document.querySelectorAll('#background-svg path');
    const colors = isCorrect
        ? ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7']
        : ['#F44336', '#EF5350', '#E57373', '#EF9A9A'];
    paths.forEach((p, i) => { p.style.fill = colors[i % colors.length]; });
}

function resetBackground() {
    const paths = document.querySelectorAll('#background-svg path');
    const original = ['#9b5de5', '#f15bb5', '#00bbf9', '#00f5d4'];
    paths.forEach((p, i) => { p.style.fill = original[i]; });
}

function updateHostButtons(state) {
    const lockBtn = document.getElementById('mp-lock-btn');
    const revealBtn = document.getElementById('mp-reveal-btn');
    const nextBtn = document.getElementById('next-btn');

    lockBtn.classList.toggle('hidden', state.phase !== 'question');
    revealBtn.classList.toggle('hidden', state.phase !== 'locked');
    nextBtn.classList.toggle('hidden', state.phase !== 'reveal');
}

function onState(state) {
    lastState = state;
    roomCode = state.roomCode;

    if (state.phase === 'lobby') {
        showScreen('lobby');
        updateLobby(state);
        return;
    }

    if (state.phase === 'ended') return;

    showScreen('game');
    renderScoreboard(state.players);
    updateHostButtons(state);

    if (!state.question) return;

    const q = state.question;
    document.getElementById('progress').textContent =
        `${state.questionIndex + 1}/${state.totalQuestions}`;
    document.getElementById('question-text').textContent = q.text;

    const img = document.getElementById('question-image');
    if (q.image) {
        img.src = q.image;
        img.classList.remove('hidden');
    } else {
        img.classList.add('hidden');
    }

    const statusLine = document.getElementById('mp-status-line');
    const triviaDiv = document.getElementById('trivia');
    const revealPanel = document.getElementById('mp-reveal-results');

    if (state.phase === 'question') {
        drumsPlayedForQuestion = false;
        resetBackground();
        revealPanel.classList.add('hidden');
        revealPanel.innerHTML = '';
        triviaDiv.classList.add('hidden');
        renderHostAnswers(q.answers, null);

        const answered = state.players.filter(p => p.hasAnswered).length;
        const total = state.players.length;
        setPhaseStatus(statusLine,
            t('mp_answers_open', 'Válaszadás folyamatban — {n}/{total} választott')
                .replace('{n}', answered).replace('{total}', total),
            'question');
    }

    if (state.phase === 'locked') {
        setPhaseStatus(statusLine,
            t('mp_answers_locked', 'Válaszok lezárva — felfedés gombbal mutasd a helyeset'),
            'locked');
    }

    if (state.phase === 'reveal') {
        setPhaseStatus(statusLine, null);
    }
}

function onReveal(msg) {
    const state = lastState;
    if (!state || !state.question) return;

    renderHostAnswers(state.question.answers, msg);
    renderRevealPanel(msg);

    const anyCorrect = msg.playerResults.some(r => r.correct);
    colorizeBackground(anyCorrect);

    setTimeout(() => {
        playFx(anyCorrect ? 'good.mp3' : 'bad.mp3');
        if (anyCorrect && typeof confetti === 'function') {
            confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        }
    }, 100);

    const triviaDiv = document.getElementById('trivia');
    const triviaText = document.querySelector('.trivia-text');
    if (msg.trivia && msg.trivia.trim()) {
        triviaText.textContent = msg.trivia;
        triviaDiv.classList.remove('hidden');
    } else {
        triviaDiv.classList.add('hidden');
    }

    if (lastState) updateHostButtons(lastState);
}

function onGameOver(msg) {
    showScreen('end');
    document.getElementById('mp-final-standings').innerHTML = msg.standings.map((s, i) =>
        `<div class="mp-standing-row">
            <span>${i + 1}.</span> <strong>${s.name}</strong>
            <span>${s.score} / ${msg.totalQuestions}</span>
        </div>`
    ).join('');
    renderAnswerMatrix(msg);
}

async function connectHost() {
    showScreen('connect');
    setConnectStatus(t('mp_connecting', 'Kapcsolódás…'), false);

    socket = new QuizSocket({
        onJoined(msg) {
            roomCode = msg.roomCode;
            showScreen('lobby');
            document.getElementById('mp-quiz-status').textContent = '';
            pushSettings();
        },
        onState,
        onReveal,
        onGameOver,
        onError(code) {
            alert(errorMessage(code));
        },
        onDisconnect() {
            setConnectStatus(t('mp_disconnected', 'Kapcsolat megszakadt'), true);
            showScreen('connect');
        }
    });

    try {
        await socket.connect();
        socket.hostCreate('Host');
    } catch {
        setConnectStatus(t('mp_server_offline', 'A szerver nem elérhető. Futtasd: npm start'), true);
    }
}

document.getElementById('mp-retry-btn').addEventListener('click', connectHost);

document.getElementById('mp-copy-link').addEventListener('click', () => {
    const input = document.getElementById('mp-player-url');
    input.select();
    navigator.clipboard.writeText(input.value).catch(() => {});
});

document.getElementById('help-toggle').addEventListener('click', () => {
    document.getElementById('help-options').classList.toggle('hidden');
});

['half', 'hint', 'dbl'].forEach(type => {
    document.getElementById(`inc-${type}`).addEventListener('click', () => {
        if (helpCounters[type] < 5) {
            helpCounters[type]++;
            updateHelpUI();
        }
    });
    document.getElementById(`dec-${type}`).addEventListener('click', () => {
        if (helpCounters[type] > 0) {
            helpCounters[type]--;
            updateHelpUI();
        }
    });
});

document.getElementById('json-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const quiz = JSON.parse(ev.target.result);
            socket.loadQuiz(quiz);
            quizLoaded = true;
            document.getElementById('mp-quiz-status').textContent =
                t('mp_quiz_loaded', 'Kvíz betöltve: {n} kérdés').replace('{n}', quiz.length);
            if (lastState) updateLobby(lastState);
        } catch {
            quizLoaded = false;
            document.getElementById('mp-quiz-status').textContent =
                t('mp_quiz_error', 'Érvénytelen JSON fájl');
        }
    };
    reader.readAsText(file);
});

document.getElementById('mp-start-game').addEventListener('click', () => {
    pushSettings();
    socket.startGame();
});

document.getElementById('mp-lock-btn').addEventListener('click', () => {
    socket.lockAnswers();
});

document.getElementById('mp-reveal-btn').addEventListener('click', () => {
    if (!drumsPlayedForQuestion) {
        drumsPlayedForQuestion = true;
        playFx('drums.mp3');
    }
    socket.revealAnswers();
});

document.getElementById('next-btn').addEventListener('click', () => {
    document.getElementById('trivia').classList.add('hidden');
    document.getElementById('mp-reveal-results').classList.add('hidden');
    socket.nextQuestion();
});

document.getElementById('mp-restart').addEventListener('click', () => {
    location.reload();
});

document.addEventListener('DOMContentLoaded', connectHost);
