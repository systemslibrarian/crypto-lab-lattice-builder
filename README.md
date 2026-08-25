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

**How the game relates to ML-KEM.** The board is a *lattice*: every dot is a whole-number combination of two vectors. The game asks which dot is nearest HOME, which is the Shortest Vector Problem.

ML-KEM does not ask that exact question. It hides its key by parking a point just off a lattice: `t = A·s + e` means `t` is not a lattice point but sits a short hop from one, displaced by the small error `e`. Recovering `s` means working out *which lattice point `t` is nearest to*. Same lattice, same act of finding the nearest dot, asked about a different spot.

Measured on the instance the page ships: `t` sits 1.73 from its nearest lattice point — exactly ‖e‖ — while the second nearest is 8.54 away and a typical one is 23.64. It hugs one point and is nowhere near the rest.

Being precise about the difference: the board is SVP, ML-KEM rests on Module Learning-With-Errors, and those are cousins rather than the same problem. What ties them together is not hand-waving — the best known attacks on LWE work by building a lattice out of `A` and `t` and hunting for a short vector in it. Finding short vectors *is* the attack, which is why the exhibit spends its time teaching you to look for one.

**Break a real private key.** A Module-LWE instance with exactly ML-KEM's shape at n=4, k=2, q=29. Everything an eavesdropper gets is on screen: the shared matrix `A` and the public key `t`, where `t = A·s + e`. The private key `s` is eight coefficients, each −1, 0 or +1, so only 6,561 private keys exist.

You set those eight coefficients by hand and the page shows the actual subtraction `t − A·s`. The test is one an attacker can genuinely run, with no privileged information: if the guess is the private key, what is left over is only the tiny error `e`, every number inside ±1. Anything else leaves junk. Verified over 60 instances, that rule identifies exactly the secret and nothing else — the best wrong guess still leaves a number of size 5, and the median wrong guess leaves 13.

The point is what happens as you try. The leftover numbers scramble but never shrink, because there is nothing to steer by. Once the search has run, the page shows the landscape you were working blind in — all 6,561 keys grouped by how many coefficients each got right:

| coefficients right | average biggest leftover |
| --- | --- |
| 0 of 8 | 13.0 |
| 4 of 8 | 12.8 |
| 7 of 8 | **13.4** |
| 8 of 8 | **1.0** |

Getting seven of eight right is *worse* than getting none. There is no hill to climb, which is why exhaustive search is the only method left, and why the difficulty scales the way it does.

**Turn it up.** The same sum, the same test and the same code at larger n. Times use the search rate the visitor's own browser just measured:

| | possible private keys | time to try them all |
| --- | --- | --- |
| n=4, q=29 | 6,561 | instant |
| n=8, q=97 | 1.5 × 10¹¹ | days |
| n=16, q=257 | 10²² | ~10¹⁰ years |
| n=32, q=769 | 10⁴⁵ | 10²² × the age of the universe |
| n=256, q=3329 | 10⁴³³ | 10⁴¹⁰ × the age of the universe |

The bottom row is not an analogy for ML-KEM-512 — it is ML-KEM-512's actual shape. Brute force is also the naive attack rather than the best one: real cryptanalysis uses lattice reduction and does far better than these figures, and is still nowhere near enough. ML-KEM-512 targets roughly the difficulty of an AES-128 key search.

**The real thing.** A complete ML-KEM implementation (FIPS 203) runs in the page. Two people who have never met need one shared secret over a channel an eavesdropper is reading in full; they cannot simply send it, which is the whole problem.

Running an exchange fills in every value, split into the two groups that matter. Sent in the clear: `t`, the public key; `ρ`, the seed both sides expand into the shared matrix `A`, so `A` never has to be transmitted; and `c`, the scrambled package. Never sent: `s`, the receiver's private key, and the 32-byte shared secret both sides end up holding. That `t` is the same kind of object as the one broken above — a public key with a small secret inside it — differing only in size.

Flipping a bit of the ciphertext on screen shows implicit rejection: decapsulation does not fail or complain, it returns a *different* key derived from a value only the receiver holds, so a tampering attacker learns nothing from the outcome.

It is implemented from scratch with no dependencies, including Keccak, because the Web Crypto API provides no SHA-3 or SHAKE. Correctness is checked against all 54 of NIST's published ACVP vectors across ML-KEM-512, 768 and 1024, including twelve invalid-ciphertext cases.

> This implementation exists to be looked at. It is not constant time, so it leaks timing information and must not be used to protect anything real.

## Expert mode

The exhibit repeatedly says the secret is "a better description of the same lattice." Expert mode is that sentence made literal.

**A basis is a lens.** One set of dots, two descriptions of it. The secret basis is short and near-orthogonal — vectors of length 30 and 32, 71° apart. The public basis is `U · G` with `det(U) = 1`, so it generates *exactly* the same dots, but its vectors are 302 and 176 long and only **1° apart**. Switching between them on the board changes nothing about the dots, which is the point you can watch.

Through the secret description the eight one-step neighbours include the genuine shortest vector in the lattice, 30.3 — the whole ring fits inside the space the public description crosses in a single step. Through the public description the best of the eight is 126.0, a 4.2× overstatement, and the real answer sits at `3·b₁ − 5·b₂`, nowhere near one step out. Same dots; one lens shows the answer and the other hides it.

**What the secret does.** Babai rounding: write an off-lattice point in a description's own coordinates, round each to a whole number, rebuild. Over 400 targets, the secret description decodes 400/400; the public description manages 134/400 and otherwise lands on a dot hundreds of units away. Same lattice, same targets, same algorithm — only the description differs. That gap is the entire value of a private key.

**Why two dimensions lie.** The eight dots were never arbitrary: they are every non-zero combination of two vectors with coefficients −1, 0 or +1, which is 3² − 1 = 8. The same definition in d dimensions gives 3ᵈ − 1:

| dimensions | one-step neighbours |
| --- | --- |
| 2 — the board | 8 |
| 4 | 80 |
| 16 | 43,046,720 |
| 512 — ML-KEM-512 | 10²⁴⁴ |

Turning a bad description into a good one is lattice reduction. In two dimensions it is quick and exact, which is why the trick above is a party piece. As the dimension climbs the best known algorithms cost more than the security level they attack, and that is the bet ML-KEM's parameters are chosen to win.

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
