# Lattice Builder

A three-field spatial puzzle about the Shortest Vector Problem. Eight dots ring HOME, the red dot at the centre of a scrambled grid. Straighten the grid with two dials until the dots light up, then take the one nearest HOME.

The exhibit is intentionally honest about its limits: it is an analogy, not an implementation or simulation of ML-KEM. Real ML-KEM uses high-dimensional module-lattice arithmetic and the hardness of learning from noisy relationships.

## How it plays

Two dials undo the distortion. **Twist** turns the whole field; **slant** takes the lean out of the columns. The eight candidate dots are visible from the first frame but stay dark until both dials land inside tolerance — then the grid snaps square and they light up. Hover, focus or tap any dot to read its exact distance from HOME before committing, so nobody is asked to judge by eye on a board that residual jitter can make lie.

The answer is whichever lit dot is physically closest to HOME. That is the Shortest Vector Problem: the shortest non-zero vector the lattice allows. Trivial to read off in two dimensions, and in the hundreds of dimensions real schemes use there is nothing to look at and no known fast method — which is the gap lattice-based cryptography is built on.

- **Campaign** — three hand-tuned fields.
- **Daily** — three fields generated from the date, identical for everyone playing that day, with a copyable result summary.

Scoring rewards precision rather than speed. A pick pays between 240 and 1000 signal depending on how tightly the grid is locked, so a perfect lock on both dials is worth roughly four times a lock that scrapes in at the tolerance edge. A wrong dot costs signal and permanently leaves its distance on the board, with the cost escalating on each miss. The secret costs a flat 220 and marks where both dials belong — it does not pick the dot for you, which is the point: in the real scheme the secret is a better description of the same lattice, not an answer key.

The nearest dot is always derived from the level's basis at runtime rather than stored alongside it, so the answer and the geometry cannot drift apart. Every field, hand-tuned or generated, is held to a minimum margin between the nearest dot and the runner-up, and generated fields draw their winning direction uniformly — a field whose answer is only a few percent nearer than its neighbour is not a puzzle, it is a coin flip.

### Controls

| Input | Action |
| --- | --- |
| `←` `→` | Twist |
| `↑` `↓` | Slant |
| `Shift` + arrow | Move in steps of five |
| `1`–`8` | Take a dot |
| `H` | Use the secret |
| `Enter` | Advance to the next field |
| `M` | Mute or unmute |

Sound is synthesised in the browser with WebAudio — no audio files and no network requests. The tone rises as the field gets clearer, so the search works by ear as well as by eye. Best scores and the mute preference are stored in `localStorage` and never leave the device.

## Advanced mode

Below the game the page stops using an analogy and runs the real thing.

**Break it yourself.** A Module-LWE instance with exactly ML-KEM's shape — public `A` and `t = A·s + e`, secret `s`, small error `e` — at n=4, k=2, q=29, so the secret is eight coefficients and only 6,561 secrets exist. You can set the coefficients by hand and watch the mismatch refuse to budge, then run an exhaustive search that recovers the key in front of you.

The reason nothing guides you is worth stating precisely, because it is the whole basis of the scheme. Grouping all 6,561 candidates by how many coefficients they get right, the mean mismatch is essentially constant — around 23 to 25 whether you have none right or seven of eight — and only collapses, to about 1.7, at the exact answer. Seven-of-eight typically scores *worse* than none. There is no hill to climb, so there is no better move than trying everything.

**Turn it up.** The same construction and the same search at larger n. Times use the search rate your own browser just measured:

| | secrets to try | time to grind them |
| --- | --- | --- |
| n=4, q=29 | 6,561 | instant |
| n=8, q=97 | 1.5 × 10¹¹ | days |
| n=16, q=257 | 10²² | ~10¹⁰ years |
| n=32, q=769 | 10⁴⁵ | 10²² × the age of the universe |
| n=256, q=3329 | 10⁴³³ | 10⁴¹⁰ × the age of the universe |

That last row is ML-KEM-512's actual shape. Brute force is the naive attack rather than the best one — real cryptanalysis uses lattice reduction and does far better than these figures, and is still nowhere near enough; ML-KEM-512 targets roughly the difficulty of an AES-128 key search.

**The real thing.** A complete ML-KEM implementation (FIPS 203) runs in the page: generate a keypair, encapsulate, decapsulate, and watch two parties who exchanged nothing secret arrive at the same 32 bytes. Flip a bit in the ciphertext and decapsulation does not fail — it returns a different key derived from a value only the receiver holds, so a tampering attacker learns nothing from the outcome.

It is implemented from scratch with no dependencies, including Keccak, because the Web Crypto API provides no SHA-3 or SHAKE. Correctness is checked against all 54 of NIST's published ACVP vectors across ML-KEM-512, 768 and 1024, including twelve invalid-ciphertext cases.

> This implementation exists to be looked at. It is not constant time, so it leaks timing information and must not be used to protect anything real.

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
- Cryptography implemented from scratch, no dependencies; randomness from `crypto.getRandomValues`
- `localStorage` holds only best scores and the mute flag, and degrades silently when blocked
- Content Security Policy included in `index.html`
- Keyboard-accessible route selection and reduced-motion support

## License

No software license has been selected. Add the license you want before inviting others to reuse or modify the code.
