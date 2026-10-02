# NIST ACVP ML-KEM vectors, pinned

These two files are NIST's published ACVP vector sets for ML-KEM, copied **verbatim**
and not transformed, so the bytes a test reads are the bytes NIST published.

| | |
|---|---|
| Upstream | https://github.com/usnistgov/ACVP-Server |
| Commit | `975de31eb83d87039ec88934fdc47d8c312b892d` |
| Fetched | 2026-10-01 |

| File here | Upstream path | SHA-256 |
|---|---|---|
| `ML-KEM-keyGen-FIPS203.json` | `gen-val/json-files/ML-KEM-keyGen-FIPS203/internalProjection.json` | `d7a62a2c3476957f56dd8d24f9004ea6776ccfe995ffe71a65bb9506dc9c7b1b` |
| `ML-KEM-encapDecap-FIPS203.json` | `gen-val/json-files/ML-KEM-encapDecap-FIPS203/internalProjection.json` | `a556952ce869bb89c3a3196a701dad89647c193a34c86eafb61a9d710d5b810f` |

`internalProjection.json` rather than `prompt.json` plus `expectedResults.json`, because the
projection carries the inputs and the expected outputs in one object per test case. The
other two files are the same data split for a submission workflow this repository does not
have.

## What they contain

| File | Group function | Param set | Tests |
|---|---|---|---:|
| keyGen | — | ML-KEM-512 / 768 / 1024 | 25 each, **75** |
| encapDecap | `encapsulation` | ML-KEM-512 / 768 / 1024 | 25 each, **75** |
| encapDecap | `decapsulation` | ML-KEM-512 / 768 / 1024 | 10 each, **30** |
| encapDecap | `encapsulationKeyCheck` | ML-KEM-512 / 768 / 1024 | 10 each, **30** |
| encapDecap | `decapsulationKeyCheck` | ML-KEM-512 / 768 / 1024 | 10 each, **30** |
| | | | **240** |

`test/mlkem-acvp.test.js` drives the first three rows — 180 tests — and does not drive the
two key-check rows, which assert that a malformed key is rejected and which this
implementation would fail because it performs no input validation. That split is stated in
the test, in `README.md` and on the page, rather than left for a reader to assume.

## Re-fetching

```sh
PIN=975de31eb83d87039ec88934fdc47d8c312b892d
for d in ML-KEM-keyGen-FIPS203 ML-KEM-encapDecap-FIPS203; do
  curl -sfo "test/fixtures/acvp/$d.json" \
    "https://raw.githubusercontent.com/usnistgov/ACVP-Server/$PIN/gen-val/json-files/$d/internalProjection.json"
done
shasum -a 256 test/fixtures/acvp/*.json   # must match the table above
```

Moving the pin is a deliberate act: the counts asserted at the end of
`test/mlkem-acvp.test.js` fail if the set changes, so the published sentence has to move
with the vectors rather than drift away from them quietly.
