let quizData = [];
let currentQuestionIndex = 0;
let backgroundAudio = new Audio('audio/background.mp3');
backgroundAudio.loop = true;

// Beállítások kezelése
document.getElementById('settings-toggle').addEventListener('click', function() {
    const content = document.getElementById('settings-content');
    content.classList.toggle('hidden');
});

// Hangerő beállítások
document.getElementById('bg-volume').addEventListener('input', function(e) {
    backgroundAudio.volume = parseFloat(e.target.value);
});

document.getElementById('fx-volume').addEventListener('input', function(e) {
    // Ez a hangerő a hatásokra vonatkozik
});

document.getElementById('start-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('json-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Kérlek válassz egy JSON fájlt!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            quizData = JSON.parse(e.target.result);
            // Teljesen elrejtjük a start screent
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('quiz-screen').classList.remove('hidden');
            backgroundAudio.play();
            showQuestion();
        } catch (err) {
            alert('Hiba a JSON fájl feldolgozása során!');
        }
    };
    reader.readAsText(file);
});

function showQuestion() {
    const question = quizData[currentQuestionIndex];
    document.getElementById('question-text').textContent = question.question;

    const imgElement = document.getElementById('question-image');
    if (question.image) {
        imgElement.src = question.image;
        imgElement.classList.remove('hidden');
    } else {
        imgElement.classList.add('hidden');
    }

    const answersContainer = document.getElementById('answers-container');
    answersContainer.innerHTML = '';

    const answers = [...question.answers];
    const correctAnswer = answers[0];
    shuffleArray(answers);

    const letters = ['A', 'B', 'C', 'D'];
    
    answers.forEach((answer, index) => {
        const button = document.createElement('button');
        button.classList.add('answer');
        button.innerHTML = `<span class="answer-label">${letters[index]}.</span> ${answer}`;
        button.dataset.correct = answer === correctAnswer;
        button.dataset.answer = answer;
        button.addEventListener('click', () => handleAnswerClick(button));
        answersContainer.appendChild(button);
    });

    document.getElementById('next-btn').classList.add('hidden');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function handleAnswerClick(selectedButton) {
    // Először kijelöljük a választ
    document.querySelectorAll('.answer').forEach(btn => {
        btn.classList.add('disabled');
        if (btn === selectedButton) {
            btn.classList.add('selected');
        }
    });

    const isCorrect = selectedButton.dataset.correct === 'true';
    const drums = new Audio('audio/drums.mp3');
    drums.volume = parseFloat(document.getElementById('fx-volume').value);
    drums.play();

    setTimeout(() => {
        const sound = new Audio(isCorrect ? 'audio/good.mp3' : 'audio/bad.mp3');
        sound.volume = parseFloat(document.getElementById('fx-volume').value);
        sound.play();

        document.querySelectorAll('.answer').forEach(btn => {
            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            } else if (btn === selectedButton && !isCorrect) {
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
        }

        document.getElementById('next-btn').classList.remove('hidden');
    }, 5000);
}

document.getElementById('next-btn').addEventListener('click', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < quizData.length) {
        showQuestion();
    } else {
        alert('🎉 Gratulálok, végeztél a kvízzel! 🎉');
        location.reload();
    }
});