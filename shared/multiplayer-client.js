/* Shared multiplayer utilities (host + player) */

let translationsMap = {};

function parseIni(text) {
    const lines = text.split(/\r?\n/);
    const obj = {};
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        obj[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
    return obj;
}

function applyTranslations(map) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && map[key] !== undefined) {
            if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
                el.placeholder = map[key];
            } else {
                el.textContent = map[key];
            }
        }
    });
}

async function loadLocale(lang) {
    try {
        const res = await fetch(`localization/${lang}.ini`);
        if (!res.ok) throw new Error('Locale not found');
        translationsMap = parseIni(await res.text());
        applyTranslations(translationsMap);
        localStorage.setItem('quiz_lang', lang);
        const sel = document.getElementById('lang-select');
        if (sel) sel.value = lang;
    } catch (err) {
        console.warn('Locale load failed', lang, err);
    }
}

function t(key, fallback) {
    return (translationsMap && translationsMap[key]) || fallback || key;
}

function getWebSocketUrl() {
    if (window.QUIZ_WS_URL) return window.QUIZ_WS_URL;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
}

function getPlayerJoinUrl(roomCode) {
    const base = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}`;
    const root = base.endsWith('/') ? base : base + '/';
    return `${root}player.html?room=${encodeURIComponent(roomCode)}`;
}

function safeGetValue(id, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return defaultVal;
    return el.value === undefined || el.value === null ? defaultVal : el.value;
}

function playFx(filename) {
    const sound = new Audio(`audio/${filename}`);
    sound.volume = parseFloat(safeGetValue('fx-volume', '0.7'));
    sound.play().catch(() => {});
}

const ERROR_KEYS = {
    room_not_found: 'mp_error_room_not_found',
    room_full: 'mp_error_room_full',
    game_started: 'mp_error_game_started',
    room_has_host: 'mp_error_room_has_host',
    missing_room: 'mp_error_missing_room',
    no_quiz: 'mp_error_no_quiz',
    no_players: 'mp_error_no_players',
    not_enough_players: 'mp_error_not_enough_players',
    invalid_quiz: 'mp_error_invalid_quiz',
    not_question: 'mp_error_not_question',
    not_locked: 'mp_error_not_locked',
    no_lifeline: 'mp_error_no_lifeline'
};

function errorMessage(code) {
    const key = ERROR_KEYS[code];
    return key ? t(key, code) : code;
}

class QuizSocket {
    constructor(handlers) {
        this.handlers = handlers;
        this.ws = null;
        this.connected = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const url = getWebSocketUrl();
            this.ws = new WebSocket(url);

            const failTimer = setTimeout(() => {
                reject(new Error('timeout'));
            }, 8000);

            this.ws.onopen = () => {
                clearTimeout(failTimer);
                this.connected = true;
                resolve();
            };

            this.ws.onerror = () => {
                clearTimeout(failTimer);
                reject(new Error('connection_failed'));
            };

            this.ws.onclose = () => {
                this.connected = false;
                if (this.handlers.onDisconnect) this.handlers.onDisconnect();
            };

            this.ws.onmessage = (ev) => {
                let msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch {
                    return;
                }
                if (msg.type === 'ERROR' && this.handlers.onError) {
                    this.handlers.onError(msg.code);
                }
                if (msg.type === 'JOINED' && this.handlers.onJoined) {
                    this.handlers.onJoined(msg);
                }
                if (msg.type === 'STATE' && this.handlers.onState) {
                    this.handlers.onState(msg);
                }
                if (msg.type === 'REVEAL' && this.handlers.onReveal) {
                    this.handlers.onReveal(msg);
                }
                if (msg.type === 'GAME_OVER' && this.handlers.onGameOver) {
                    this.handlers.onGameOver(msg);
                }
            };
        });
    }

    send(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    hostCreate(name) {
        this.send({ type: 'HOST_CREATE', name });
    }

    join(roomCode, role, name) {
        this.send({ type: 'JOIN', roomCode, role, name });
    }

    loadQuiz(quiz) {
        this.send({ type: 'QUIZ_LOAD', quiz });
    }

    setSettings(lifelines) {
        this.send({ type: 'SET_SETTINGS', lifelines });
    }

    startGame() {
        this.send({ type: 'START_GAME' });
    }

    submitAnswer(letter) {
        this.send({ type: 'SUBMIT_ANSWER', letter });
    }

    submitAnswers(letters) {
        this.send({ type: 'SUBMIT_ANSWER', letters });
    }

    lockAnswers() {
        this.send({ type: 'LOCK_ANSWERS' });
    }

    revealAnswers() {
        this.send({ type: 'REVEAL_ANSWERS' });
    }

    useLifeline(lifeline) {
        this.send({ type: 'USE_LIFELINE', lifeline });
    }

    nextQuestion() {
        this.send({ type: 'NEXT_QUESTION' });
    }
}

function initLocaleSettings() {
    const storedLang = localStorage.getItem('quiz_lang') || 'HU-hu';
    document.addEventListener('DOMContentLoaded', () => {
        const sel = document.getElementById('lang-select');
        if (sel) {
            sel.value = storedLang;
            sel.addEventListener('change', (e) => loadLocale(e.target.value));
        }
        loadLocale(storedLang);

        const toggle = document.getElementById('settings-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const content = document.getElementById('settings-content');
                if (content) content.classList.toggle('hidden');
            });
        }
    });
}

initLocaleSettings();
