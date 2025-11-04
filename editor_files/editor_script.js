let quizData = [];
let currentEditingIndex = -1;
let language = 'HU-hu';
let translationsMap = {}; // NEW: store loaded translations for editor

// --- Localization / INI loader for editor ---
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

function applyTranslations(map, root = document) {
    // If no explicit map is given, use the global one
    const m = map || translationsMap || {};
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        if (m[key] !== undefined) {
            // textContent keeps child input/select elements if needed
            el.textContent = m[key];
        }
    });
}

async function loadLocale(lang) {
    try {
        const res = await fetch(`localization/${lang}.ini`);
        if (!res.ok) throw new Error('Locale file not found');
        const txt = await res.text();
        const map = parseIni(txt);
        translationsMap = map;           // save globally
        applyTranslations(map);         // update UI
        localStorage.setItem('quiz_lang', lang);
        language = lang;
        // Synchronize both select values, if they exist
        const selTop = document.getElementById('lang-select');
        const selEditor = document.getElementById('lang-select-editor');
        if (selTop) selTop.value = lang;
        if (selEditor) selEditor.value = lang;
    } catch (err) {
        console.warn('Failed to load locale', lang, err);
    }
}

const storedLangEditor = language || 'HU-hu';
document.addEventListener('DOMContentLoaded', () => {
    // Single initialization: set language selectors
    const sel = document.getElementById('lang-select');
    if (sel) {
        sel.value = storedLangEditor;
        sel.addEventListener('change', (e) => loadLocale(e.target.value));
    }
    loadLocale(storedLangEditor);
});

// Start screen actions
document.getElementById('new-quiz-btn').addEventListener('click', () => {
    quizData = [];
    showEditorScreen();
});

document.getElementById('load-quiz-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('json-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a JSON file!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            quizData = JSON.parse(e.target.result);
            showEditorScreen();
        } catch (err) {
            alert('Error parsing JSON file!');
        }
    };
    reader.readAsText(file);
});

function showEditorScreen() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('editor-screen').classList.remove('hidden');
    renderQuestionsList();
}

// Editor functionality
function renderQuestionsList() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    quizData.forEach((question, index) => {
        const questionItem = document.createElement('div');
        questionItem.className = 'question-item';
        questionItem.draggable = true;
        questionItem.dataset.index = index;

        // Drag and drop functionality
        questionItem.addEventListener('dragstart', handleDragStart);
        questionItem.addEventListener('dragover', handleDragOver);
        questionItem.addEventListener('dragenter', handleDragEnter);
        questionItem.addEventListener('dragleave', handleDragLeave);
        questionItem.addEventListener('drop', handleDrop);
        questionItem.addEventListener('dragend', handleDragEnd);

        const hasImage = question.image && question.image.length > 0;
        const imageIcon = hasImage ? '🖼️' : '❌';

        const hasHint = question.hint && question.hint.length > 0;
        const hintText = hasHint ? question.hint : 'Nincs megadva';

        const hasTrivia = question.trivia && question.trivia.length > 0;
        const triviaText = hasTrivia ? question.trivia : 'Nincs megadva';

        questionItem.innerHTML = `
            <div class="question-content">
                <h3>${question.question}</h3>
                <p><strong>A:</strong> ${question.answers[0]}</p>
                <p><strong>B:</strong> ${question.answers[1]}</p>
                <p><strong>C:</strong> ${question.answers[2]}</p>
                <p><strong>D:</strong> ${question.answers[3]}</p>
                <p class="extra-info"><strong data-i18n="editor_hint">Segítség:</strong> ${hintText}</p>
                <p class="extra-info"><strong data-i18n="editor_trivia">Érdekesség:</strong> ${triviaText}</p>
                <p><strong data-i18n="editor_image">Kép:</strong> ${imageIcon}</p>
            </div>
            <div class="question-actions">
                <button class="edit-btn" onclick="editQuestion(${index})">✏️ Szerkeszt</button>
                <button class="delete-btn" onclick="deleteQuestion(${index})">🗑️ Töröl</button>
            </div>
        `;

        container.appendChild(questionItem);
    });

    // Apply translations to newly created dynamic elements
    applyTranslations(null, container);
}

// Drag and drop handlers
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (dragSrcEl !== this) {
        const srcIndex = parseInt(dragSrcEl.dataset.index);
        const targetIndex = parseInt(this.dataset.index);
        
        // Move item in array
        const movedItem = quizData.splice(srcIndex, 1)[0];
        quizData.splice(targetIndex, 0, movedItem);
        
        // Update indices
        const items = document.querySelectorAll('.question-item');
        items.forEach((item, index) => {
            item.dataset.index = index;
        });
        
        renderQuestionsList();
    }

    return false;
}

function handleDragEnd(e) {
    document.querySelectorAll('.question-item').forEach(item => {
        item.classList.remove('dragging', 'drag-over');
    });
}

// Question operations
function editQuestion(index) {
    currentEditingIndex = index;
    const question = quizData[index];
    
    document.getElementById('question-text').value = question.question;
    document.getElementById('correct-answer').value = question.answers[0];
    document.getElementById('wrong-answer-1').value = question.answers[1];
    document.getElementById('wrong-answer-2').value = question.answers[2];
    document.getElementById('wrong-answer-3').value = question.answers[3];
    document.getElementById('question-index').value = index;

    // NEW: load hint and trivia into the form
    document.getElementById('question-hint').value = question.hint || '';
    document.getElementById('question-trivia').value = question.trivia || '';

    // Handle image preview
    if (question.image && question.image.length > 0) {
        document.getElementById('image-preview').src = question.image;
        document.getElementById('image-preview-container').classList.remove('hidden');
        document.getElementById('no-image-container').classList.add('hidden');
    } else {
        document.getElementById('image-preview-container').classList.add('hidden');
        document.getElementById('no-image-container').classList.remove('hidden');
    }

    document.getElementById('question-modal').classList.remove('hidden');
}

function deleteQuestion(index) {
    if (confirm('Do you really want to delete this question?')) {
        quizData.splice(index, 1);
        renderQuestionsList();
    }
}

document.getElementById('add-question-btn').addEventListener('click', () => {
    currentEditingIndex = -1;
    
    // Clear form
    document.getElementById('question-form').reset();
    document.getElementById('question-index').value = '';
    
    // Hide image preview, show upload
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('no-image-container').classList.remove('hidden');
    
    document.getElementById('question-modal').classList.remove('hidden');
});

// Modal close
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('question-modal').classList.add('hidden');
});

// Image upload functionality
document.getElementById('change-image-btn').addEventListener('click', () => {
    document.getElementById('image-upload').click();
});

document.getElementById('image-upload').addEventListener('change', function(e) {
    handleImageUpload(e, 'image-preview');
});

document.getElementById('new-image-upload').addEventListener('change', function(e) {
    handleImageUpload(e, 'image-preview');
});

document.getElementById('remove-image-btn').addEventListener('click', () => {
    document.getElementById('image-preview').src = '';
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('no-image-container').classList.remove('hidden');
});

function handleImageUpload(event, previewId) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Resize if larger than 1000px height
                let width = img.width;
                let height = img.height;
                
                if (height > 1000) {
                    const ratio = 1000 / height;
                    width = Math.round(width * ratio);
                    height = 1000;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById(previewId).src = resizedDataUrl;
                document.getElementById('image-preview-container').classList.remove('hidden');
                document.getElementById('no-image-container').classList.add('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Save question
document.getElementById('question-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const questionText = document.getElementById('question-text').value;
    const correctAnswer = document.getElementById('correct-answer').value;
    const wrongAnswer1 = document.getElementById('wrong-answer-1').value;
    const wrongAnswer2 = document.getElementById('wrong-answer-2').value;
    const wrongAnswer3 = document.getElementById('wrong-answer-3').value;
    
    // NEW: read hint and trivia
    const hintText = document.getElementById('question-hint').value;
    const triviaText = document.getElementById('question-trivia').value;
    
    const answers = [correctAnswer, wrongAnswer1, wrongAnswer2, wrongAnswer3];
    
    // Get image data (save if data URL)
    let imageData = '';
    const previewSrc = document.getElementById('image-preview').src || '';
    if (previewSrc.startsWith('data:image')) {
        imageData = previewSrc;
    } else {
        imageData = '';
    }
    
    const questionObj = {
        question: questionText,
        answers: answers,
        image: imageData,
        // NEW fields
        hint: hintText,
        trivia: triviaText
    };
    
    if (currentEditingIndex >= 0) {
        // Update existing question
        quizData[currentEditingIndex] = questionObj;
    } else {
        // Add new question
        quizData.push(questionObj);
    }
    
    renderQuestionsList();
    document.getElementById('question-modal').classList.add('hidden');
    loadLocale(language);
});

// Download functionality
document.getElementById('download-btn').addEventListener('click', () => {
    if (quizData.length === 0) {
        alert('Nincs mit letölteni!');
        return;
    }
    
    const filename = document.getElementById('filename-input').value || 'quiz';
    const jsonStr = JSON.stringify(quizData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('question-modal');
    if (e.target === modal) {
        modal.classList.add('hidden');
    }
});