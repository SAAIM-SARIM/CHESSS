Chess Bot — Hosting and Deployment

This repository contains a browser-based chess app that can use a client-side chess engine (Stockfish) for analysis and AI play.

Quick local test

1. (Recommended) Place a local copy of the Stockfish JS build in the project root:

   Download the build (example):
   https://unpkg.com/stockfish.js@10.0.2/stockfish.js

   Save it as `stockfish.js` next to `index.html` and `chess.js`.

2. Run a simple static server from the project root and open the app in your browser:

```bash
# Using Python 3
python -m http.server 8000

# Or with Node (http-server)
npx http-server -p 8000
```

Open: http://localhost:8000

Verify the board loads, moves work, and the Analyze button opens the Game Analysis panel.

Important notes about engines and licensing

- Stockfish: the project is GPLv3. If you include `stockfish.js` in this repository you must comply with GPLv3 obligations. At minimum include a copy of the Stockfish license (or a link to Stockfish source) and document usage in this repo.
- Komodo: Komodo is proprietary and is not bundled here. You may not redistribute Komodo or embed it without a proper license and a browser-ready build.

Performance and UX

- Stockfish runs in the user's browser and is CPU-intensive. Provide a toggle to disable periodic analysis for users on low-end devices.
- This project includes a fallback to load a local `stockfish.js` if a CDN/global `Stockfish` is not present.

Prepare for GitHub Pages (static hosting)

1. Initialize Git, commit, and push to GitHub (replace the remote URL):

```bash
git init
git add .
git commit -m "Initial chess bot site"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

2. Enable GitHub Pages for the repository:

- On GitHub: Repository → Settings → Pages
- Under "Source" choose the `main` branch and the `/ (root)` folder, then click Save.
- After a short time the site will be available at:
  https://<your-username>.github.io/<repo-name>/

Notes for deployment

- Use a local `stockfish.js` file (checked into the repo) to avoid CDN availability issues. The app already attempts to load a local `stockfish.js` if Stockfish is not present globally.
- GitHub Pages serves over HTTPS — good for security and browser compatibility.

Optional: automatic deploy (CI)

You can add a GitHub Action to automatically deploy changes to GitHub Pages. Popular actions:
- `peaceiris/actions-gh-pages`
- `JamesIves/github-pages-deploy-action`

Example quick action (optional) — I can add this for you if desired.

Next steps I can take for you

- Add a `stockfish.js` copy to the repo and update `index.html` to load it locally (recommended for hosting).
- Add a small status indicator in the UI for when analysis starts/completes and a toggle to disable periodic analysis.
- Add a GitHub Action to auto-deploy to GitHub Pages.
- Add logging to `analyzeMoveAfter()` so we can confirm `gameAnalysis.playerMoves` is populated during play.

Tell me which of the above you want me to do next and I will implement it.