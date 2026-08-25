# Lattice Builder

A three-field spatial puzzle that turns lattice-cryptography intuition into tactile gameplay. Players twist and compress a noisy dot field, recover its hidden structure, and choose the shortest vector from the center.

The exhibit is intentionally honest about its limits: it is an analogy, not an implementation or simulation of ML-KEM. Real ML-KEM uses high-dimensional module-lattice arithmetic and the hardness of learning from noisy relationships.

## How it plays

Two sliders distort the field. **Twist** rotates the view, **depth** compresses the shear. When both land inside tolerance the lattice snaps into alignment and the eight candidate routes appear; pick the shortest one from the centre.

- **Campaign** — three hand-tuned fields.
- **Daily** — three fields generated from the date, identical for everyone playing that day, with a copyable result summary.

Scoring rewards precision rather than speed. A pick pays between 240 and 1000 signal depending on how tightly the field is locked, so a perfect lock on both controls is worth roughly four times a lock that scrapes in at the tolerance edge. A wrong route costs signal but permanently reveals that route's length on the board, and the cost escalates with each miss — guessing buys information at a rising price instead of being free. The hidden hint costs a flat 220 and marks the target position on both sliders.

The shortest route is always derived from the level's basis at runtime rather than stored alongside it, so the answer and the geometry cannot drift apart. Every field, hand-tuned or generated, is held to a minimum margin between the shortest route and the runner-up, and generated fields draw their winning direction uniformly — a field whose answer is only a few percent shorter than its neighbour is not a puzzle, it is a coin flip.

### Controls

| Input | Action |
| --- | --- |
| `←` `→` | Twist |
| `↑` `↓` | Depth |
| `Shift` + arrow | Move in steps of five |
| `1`–`8` | Choose a route |
| `H` | Use the hidden hint |
| `Enter` | Advance to the next field |
| `M` | Mute or unmute |

Sound is synthesised in the browser with WebAudio — no audio files and no network requests. The tone rises as the field gets clearer, so the search works by ear as well as by eye. Best scores and the mute preference are stored in `localStorage` and never leave the device.

## Publish on GitHub Pages

This repository is already configured for the GitHub account and repository name below:

- Account: `systemslibrarian`
- Repository: `crypto-lab-lattice-builder`
- Expected URL: `https://systemslibrarian.github.io/crypto-lab-lattice-builder/`

To publish:

1. Create a new public GitHub repository named `crypto-lab-lattice-builder`.
2. Upload every file and folder from this package to the repository root.
3. Open **Settings → Pages** in GitHub.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Push to `main` or run the **Deploy to GitHub Pages** workflow manually.

If you use a different account or repository name, update the canonical, Open Graph, and X/Twitter URLs in `index.html`. The game assets themselves use relative paths and will work under any GitHub Pages project path.

## Work locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Create the production build with:

```bash
npm run build
```

The static site is generated in `dist/`.

## Technology and privacy

- React + TypeScript + Vite
- Fully static; no backend or database
- No analytics, cookies, accounts, external fonts, CDNs, or runtime network calls
- Audio synthesised at runtime; no media assets
- `localStorage` holds only best scores and the mute flag, and degrades silently when blocked
- Content Security Policy included in `index.html`
- Keyboard-accessible route selection and reduced-motion support

## License

No software license has been selected. Add the license you want before inviting others to reuse or modify the code.
