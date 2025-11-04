let quizData = [];
let currentQuestionIndex = 0;
let backgroundAudio = new Audio('audio/background.mp3');
backgroundAudio.loop = true;
let translationsMap = {}; // NEW: store loaded translations

// --- Localization / INI loader ---
function parseIni(text) {
    const lines = text.split(/\r?\n/);
    const obj = {};
    for (let raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        obj[key] = val;
    }
    return obj;
}

// Safe getter for inputs that may not exist
function safeGetValue(id, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return defaultVal;
    return (el.value === undefined || el.value === null) ? defaultVal : el.value;
}

function applyTranslations(map) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        if (map[key] !== undefined) {
            // use textContent to avoid removing child elements (inputs/selects) inside labels
            el.textContent = map[key];
        }
    });
}

async function loadLocale(lang) {
    try {
        const res = await fetch(`localization/${lang}.ini`);
        if (!res.ok) throw new Error('Locale file not found');
        const txt = await res.text();
        const map = parseIni(txt);
        translationsMap = map; // mentjük globálisan
        applyTranslations(map);
        localStorage.setItem('quiz_lang', lang);
        const sel = document.getElementById('lang-select');
        if (sel) sel.value = lang;
    } catch (err) {
        console.warn('Failed to load locale', lang, err);
    }
}

// initialize language at startup
const storedLang = localStorage.getItem('quiz_lang') || 'HU-hu';
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('lang-select');
    if (sel) {
        sel.value = storedLang;
        sel.addEventListener('change', (e) => loadLocale(e.target.value));
    }
    loadLocale(storedLang);
});


// Help counters
let helpCounters = {
    half: 1,
    hint: 1,
    dbl: 1
};

// Game statistics
let gameStats = {
    correct: 0,
    total: 0,
    answers: []
};

// Game state flags
let isDblModeActive = false;
let selectedAnswers = [];
let answerProcessing = false;

// Beállítások kezelése
/*document.getElementById('settings-toggle').addEventListener('click', function() {
    const content = document.getElementById('settings-content');
    content.classList.toggle('hidden');
});*/

document.getElementById('bg-volume').addEventListener('input', function(e) {
    backgroundAudio.volume = parseFloat(e.target.value);
});

document.getElementById('fx-volume').addEventListener('input', function(e) {
    // Ez a hangerő a hatásokra vonatkozik
});

// Segítségek panel megjelenítése
document.getElementById('help-toggle').addEventListener('click', () => {
    document.getElementById('help-options').classList.toggle('hidden');
});

// Segítségek számlálók
document.getElementById('inc-half').addEventListener('click', () => {
    helpCounters.half++;
    document.getElementById('count-half').textContent = helpCounters.half;
});

document.getElementById('dec-half').addEventListener('click', () => {
    if (helpCounters.half > 0) {
        helpCounters.half--;
        document.getElementById('count-half').textContent = helpCounters.half;
    }
});

document.getElementById('inc-hint').addEventListener('click', () => {
    helpCounters.hint++;
    document.getElementById('count-hint').textContent = helpCounters.hint;
});

document.getElementById('dec-hint').addEventListener('click', () => {
    if (helpCounters.hint > 0) {
        helpCounters.hint--;
        document.getElementById('count-hint').textContent = helpCounters.hint;
    }
});

document.getElementById('inc-dbl').addEventListener('click', () => {
    helpCounters.dbl++;
    document.getElementById('count-dbl').textContent = helpCounters.dbl;
});

document.getElementById('dec-dbl').addEventListener('click', () => {
    if (helpCounters.dbl > 0) {
        helpCounters.dbl--;
        document.getElementById('count-dbl').textContent = helpCounters.dbl;
    }
});

// Start game
document.getElementById('start-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('json-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please choose a JSON file!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            quizData = JSON.parse(e.target.result);
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('quiz-screen').classList.remove('hidden');
            document.getElementById('help-buttons').classList.remove('hidden');
            backgroundAudio.play();
            currentQuestionIndex = 0;
            gameStats = { correct: 0, total: 0, answers: [] };
            showQuestion();
        } catch (err) {
            alert('Error processing JSON file!');
        }
    };
    reader.readAsText(file);
});

function showQuestion() {
    // Visszaállítjuk a blob színeket az eredetire
    const paths = document.querySelectorAll('#background-svg path');
    const originalColors = ['#3B0270', '#6F00FF', '#3E1E68', '#5D2F77'];
    paths.forEach((p, i) => {
        p.style.fill = originalColors[i];
    });

    document.getElementById('progress').textContent = `${currentQuestionIndex + 1}/${quizData.length}`;

    const question = quizData[currentQuestionIndex];
    document.getElementById('question-text').textContent = question.question;

    // Hint és trivia elrejtése
    document.getElementById('hint').classList.add('hidden');
    document.getElementById('trivia').classList.add('hidden');

    const imgElement = document.getElementById('question-image');
    if (question.image) {
        imgElement.src = question.image;
        imgElement.classList.remove('hidden');
    } else {
        imgElement.classList.add('hidden');
    }

    // Segítség gombok frissítése
    updateHelpButtons();

    const answersContainer = document.getElementById('answers-container');
    answersContainer.innerHTML = '';

    const answers = [...question.answers];
    const correctAnswer = answers[0];
    shuffleArray(answers);

    const letters = ['A', 'B', 'C', 'D'];
    const colors = ['red', 'blue', 'yellow', 'green'];

    answers.forEach((answer, index) => {
        const button = document.createElement('button');
        button.classList.add('answer', `answer-color-${colors[index]}`);
        button.innerHTML = `<span class="answer-label">${letters[index]}.</span> ${answer}`;
        button.dataset.correct = answer === correctAnswer;
        button.dataset.answer = answer;
        button.dataset.letter = letters[index];
        button.addEventListener('click', () => handleAnswerClick(button));
        answersContainer.appendChild(button);
    });

    document.getElementById('next-btn').classList.add('hidden');
    // Játékállapot visszaállítása minden kérdésnél
    isDblModeActive = false;
    selectedAnswers = [];
    answerProcessing = false;
}

function updateHelpButtons() {
    document.querySelector('#half-btn .help-counter').textContent = helpCounters.half;
    document.querySelector('#hint-btn .help-counter').textContent = helpCounters.hint;
    document.querySelector('#dbl-btn .help-counter').textContent = helpCounters.dbl;

    document.getElementById('half-btn').classList.toggle('disabled', helpCounters.half <= 0);
    document.getElementById('hint-btn').classList.toggle('disabled', helpCounters.hint <= 0);
    document.getElementById('dbl-btn').classList.toggle('disabled', helpCounters.dbl <= 0 || isDblModeActive);
}

function handleAnswerClick(selectedButton) {
    if (answerProcessing) return; // Ha már folyamatban van a válasz, ne csináljon semmit

    if (isDblModeActive) {
        // Dupla esély mód
        selectedButton.classList.toggle('selected'); // Jelöljük a választást lilával
        selectedAnswers = Array.from(document.querySelectorAll('.answer.selected'));

        if (selectedAnswers.length < 2) {
            return; // Várjuk a második válaszra
        }

        // Ha megvan a két válasz, lezárjuk a további választás lehetőségét
        answerProcessing = true;
        document.querySelectorAll('.answer').forEach(btn => {
            btn.disabled = true; // Gombok letiltása
            if (!selectedAnswers.includes(btn)) {
                btn.classList.add('deselected'); // A nem kiválasztottak beszürkítése
            }
        });

        const isCorrect = selectedAnswers.some(btn => btn.dataset.correct === 'true');
        const userAnswerText = selectedAnswers.map(btn => btn.dataset.answer).join(', ');
        evaluateAnswer(isCorrect, selectedAnswers, userAnswerText);

    } else {
        // Normál mód
        answerProcessing = true; // Lezárjuk a további kattintásokat

        document.querySelectorAll('.answer').forEach(btn => {
            btn.disabled = true; // Minden gomb letiltása
            if (btn !== selectedButton) {
                btn.classList.add('deselected'); // A többi gomb beszürkítése
            }
        });
        selectedButton.classList.add('selected'); // A kiválasztott gomb lilára színezése

        const isCorrect = selectedButton.dataset.correct === 'true';
        evaluateAnswer(isCorrect, [selectedButton], selectedButton.dataset.answer);
    }
}

function evaluateAnswer(isCorrect, selectedButtons, userAnswerText) {
    const drums = new Audio('audio/drums.mp3');
    drums.volume = parseFloat(safeGetValue('fx-volume', '0.7'));
    drums.play();

    setTimeout(() => {
        const sound = new Audio(isCorrect ? 'audio/good.mp3' : 'audio/bad.mp3');
        sound.volume = parseFloat(safeGetValue('fx-volume', '0.7'));
        sound.play();

        // SVG háttér színezése az eredmény alapján
        const paths = document.querySelectorAll('#background-svg path');
        const colors = isCorrect
            ? ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7'] // Zöld árnyalatok
            : ['#F44336', '#EF5350', '#E57373', '#EF9A9A']; // Piros árnyalatok
        paths.forEach((p, i) => {
            p.style.fill = colors[i];
        });

        // Helyes válasz(ok) zöldre színezése
        document.querySelectorAll('.answer').forEach(btn => {
            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            }
        });

        // A helytelenül kiválasztott gomb(ok) pirosra színezése
        selectedButtons.forEach(btn => {
            if (btn.dataset.correct !== 'true') {
                btn.classList.add('incorrect');
            }
        });

        if (isCorrect) {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff']
            });
            gameStats.correct++;
        }

        gameStats.total++;
        gameStats.answers.push({
            index: currentQuestionIndex,
            question: quizData[currentQuestionIndex].question,
            correct: isCorrect,
            userAnswer: userAnswerText
        });

        // Trivia megjelenítése
        const triviaDiv = document.getElementById('trivia');
        const triviaText = document.querySelector('.trivia-text');
        const question = quizData[currentQuestionIndex];
        if (question.trivia && question.trivia.trim() !== '') {
            triviaText.textContent = question.trivia;
            triviaDiv.classList.remove('hidden');
        }

        document.getElementById('next-btn').classList.remove('hidden');
    }, 5000);
}

// Segítségek
document.getElementById('half-btn').addEventListener('click', () => {
    if (helpCounters.half <= 0 || answerProcessing) return;
    helpCounters.half--;
    updateHelpButtons();

    const sound = new Audio('audio/half.mp3');
    sound.volume = parseFloat(safeGetValue('fx-volume', '0.7'));
    sound.play();

    const buttons = Array.from(document.querySelectorAll('.answer:not(.hidden)'));
    const incorrectButtons = buttons.filter(btn => btn.dataset.correct !== 'true');
    
    shuffleArray(incorrectButtons);

    let removedCount = 0;
    for (const btn of incorrectButtons) {
        if (removedCount < 2) {
            btn.classList.add('hidden');
            removedCount++;
        }
    }
});

document.getElementById('hint-btn').addEventListener('click', () => {
    if (helpCounters.hint <= 0 || answerProcessing) return;
    helpCounters.hint--;
    updateHelpButtons();

    const question = quizData[currentQuestionIndex];
    if (question.hint) {
        const sound = new Audio('audio/hint.mp3');
        sound.volume = parseFloat(safeGetValue('fx-volume', '0.7'));
        sound.play();

        const hintDiv = document.getElementById('hint');
        const hintContent = document.querySelector('.hint-content');
        hintContent.textContent = question.hint;
        hintDiv.classList.remove('hidden');
    }
});

document.getElementById('dbl-btn').addEventListener('click', () => {
    const sound = new Audio('audio/double.mp3');
    sound.volume = parseFloat(document.getElementById('fx-volume').value);
    sound.play();

    if (helpCounters.dbl <= 0 || isDblModeActive || answerProcessing) return;
    helpCounters.dbl--;
    isDblModeActive = true;
    updateHelpButtons();
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

document.getElementById('next-btn').addEventListener('click', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < quizData.length) {
        showQuestion();
    } else {
        showResults();
    }
});

const settingsToggle = document.getElementById('settings-toggle');
if (settingsToggle) {
    settingsToggle.addEventListener('click', function() {
        const content = document.getElementById('settings-content');
        if (content) content.classList.toggle('hidden');
    });
}

const bgVolEl = document.getElementById('bg-volume');
if (bgVolEl) {
    bgVolEl.addEventListener('input', function(e) {
        backgroundAudio.volume = parseFloat(e.target.value);
    });
}

const fxVolEl = document.getElementById('fx-volume');
if (fxVolEl) {
    fxVolEl.addEventListener('input', function(e) {
        // Ez a hangerő a hatásokra vonatkozik
    });
}

function showResults() {
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('help-buttons').classList.add('hidden');
    const resultsScreen = document.getElementById('results-screen');
    const resultsContent = document.getElementById('results-content');
    backgroundAudio.pause();
    backgroundAudio.currentTime = 0;

    const correctCount = gameStats.correct;
    const totalCount = gameStats.total;
    const percentage = totalCount > 0 ? ((correctCount / totalCount) * 100).toFixed(1) : 0;

    // A fejléc (results-header) lokalizált szövegét a data-i18n attribútum kezeli.
    // Az összegzés lokalizált sablonnal töltődik be ide: #results-summary
    const tpl = (translationsMap && translationsMap['results_summary']) || '{correct}/{total} helyes válasz<br>({percent}%)';
    const summaryHtml = tpl.replace('{correct}', correctCount).replace('{total}', totalCount).replace('{percent}', percentage);
    const summaryEl = document.getElementById('results-summary');
    if (summaryEl) summaryEl.innerHTML = summaryHtml;

    resultsContent.innerHTML = '<div class="results-list">';
    
    gameStats.answers.forEach((ans, index) => {
        const item = document.createElement('div');
        item.classList.add('result-item');
        if (ans.correct) {
            item.classList.add('correct');
        } else {
            item.classList.add('incorrect');
        }
        item.innerHTML = `<strong>${index + 1}.</strong> ${ans.question} <span>${ans.correct ? '✅' : '❌'}</span>`;
        resultsContent.appendChild(item);
    });

    resultsContent.innerHTML += '</div>';

    document.getElementById('restart-btn').classList.remove('hidden');
    resultsScreen.classList.remove('hidden');
}

document.getElementById('restart-btn').addEventListener('click', () => {
    location.reload();
});

function deleteQuestion(index) {
    if (confirm('Are you sure you want to delete this question?')) {
        quizData.splice(index, 1);
        renderQuestionsList();
    }
}

