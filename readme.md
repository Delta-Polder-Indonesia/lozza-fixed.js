# Lozza JS (Single-File Engine)

Versi ini adalah engine catur JavaScript berbasis Lozza yang dijalankan sebagai **single file** di `index.html` (tanpa file tambahan). Seluruh engine disimpan di dalam `<script>`.

## Cara Menjalankan

### 1) Web Worker / Browser
Gunakan `postMessage` untuk mengirim perintah UCI:

```js
worker.postMessage("uci\n");
worker.postMessage("isready\n");
worker.postMessage("ucinewgame\n");
worker.postMessage("position startpos\n");
worker.postMessage("go depth 8\n");
```

Engine akan mengirim balasan melalui `onmessage`.

### 2) Node.js
Jalankan file JS (atau gunakan bagian Node di bawah `// node interface`):

```bash
node index.html
```
Lalu kirim perintah UCI melalui stdin:

```text
uci
isready
ucinewgame
position startpos
go depth 8
```

## Perintah UCI Umum

- `uci`
- `isready`
- `ucinewgame`
- `position startpos`
- `position fen <FEN> [moves ...]`
- `go depth <n>`
- `go movetime <ms>`
- `go wtime <ms> btime <ms> winc <ms> binc <ms> movestogo <n>`
- `stop`

## Mode “Human” (Lebih Mirip Manusia)
Engine mendukung mode **Human** untuk membuat pilihan langkah tidak selalu optimal seperti bot.

### Opsi UCI
```
setoption name MultiPV value 1..5
setoption name HumanMode value on|off
setoption name HumanSkill value 0..20
setoption name HumanNoise value 0..100
setoption name HumanStyle value balanced|aggressive|defensive|tactical|positional
setoption name ShowWDL value on|off
setoption name ShowEvalBar value on|off
setoption name ShowACPL value on|off
```

**Penjelasan:**
- **MultiPV**: jumlah variasi PV yang ingin ditampilkan (1..5).
- **HumanMode**: menyalakan pemilihan langkah dengan variasi.
- **HumanSkill**: semakin kecil, semakin banyak blunder & variasi (0 = sangat lemah, 20 = kuat).
- **HumanNoise**: menambah randomness pada pemilihan langkah (0 = stabil, 100 = sangat random).
- **HumanStyle**: gaya bermain (balanced, aggressive, defensive, tactical, positional).
- **ShowWDL**: tampilkan WDL (win/draw/loss) di output `info`.
- **ShowEvalBar**: tampilkan eval bar (0–1000) via `info string evalbar`.
- **ShowACPL**: tampilkan ACPL (average centipawn loss) & loss terakhir via `info string acpl`.

### Contoh
```
setoption name HumanMode value on
setoption name HumanSkill value 8
setoption name HumanNoise value 30
setoption name HumanStyle value aggressive
```

## Tips Upgrade (Rekomendasi)
1. **Masukkan PST & nilai evaluasi asli** untuk strength maksimal.
2. **Opening book** (polyglot) agar pembukaan lebih natural.
3. **Time management halus** (endgame vs midgame).
4. **NNUE** (opsional) untuk evaluasi lebih modern.
5. **MultiPV** untuk analisis beberapa kandidat langkah.

## Catatan
- Engine ini menggunakan hash TT dan pawn-hash.
- Jika ingin performa lebih stabil di web, jalankan di Web Worker.
