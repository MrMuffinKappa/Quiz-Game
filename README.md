# Quiz Game

Simple browser-based quiz game. This project consists of static HTML, CSS and JavaScript files — open `index.html` in your browser or serve the folder with any simple static HTTP server.

## Live demo

The project is available online at: https://quiz.mrmuffin.dev

## Quick start

Anyone who downloads this repository can run the game locally. There are two easy ways:

1. Open the `index.html` file directly in your web browser (double-click the file).
2. (Recommended) Serve the project folder using a simple HTTP server to avoid local file restrictions (audio or module loading). Example commands that work on most systems:

```bash
# Python 3
python -m http.server 8000

# or using Node (if http-server is installed)
npx http-server -p 8000

# Then open: http://localhost:8000
```

You can also use editor extensions such as VS Code Live Server or any static server of your choice.

## Files overview

- `index.html` — Main game page.
- `editor.html` — Editor interface for editing quiz content.
- `quiz.json` — Quiz content (questions, answers, settings).
- `script.js`, `style.css` — Game logic and styles.
- `localization/` — Language files (DE, EN, HU, ZH).
- `audio/` — Audio assets (if present).

## Usage

- Start the game and follow the on-screen instructions: answer questions and track your score.
- To change languages, check the `localization/` folder (for example `EN-en.ini`, `HU-hu.ini`).
- Edit `quiz.json` or use `editor.html` to modify quiz content.

## Author

Developed by: Chlebik Dávid


## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
