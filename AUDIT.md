# Audit UI/UX Final — Sentra (Desktop Terminal-Agent Manager)

Tanggal: 2026-10-27 · Metode: heuristic evaluation statis (Nielsen 10 + WCAG 2.2 AA) · Sumber bukti: `audit-framework.md` (rubrik & skema skor), `audit-evidence.md` (document.json, 1.907 node, 16 screen), `/tmp/audit/visual-notes.md` (16 screenshot light+dark).

---

## 1. Ringkasan Eksekutif

**Total skor: 7 / 22 → ≤12: REWORK DESAIN** (belum siap dev; perbaikan struktural & aksesibilitas wajib dulu).

Sentra isyaratnya kuat di permukaan: estetika terminal-chic monospace yang disiplin, hierarki hero tegas, grid 1440×900 konsisten 16/16 screen, radius & hairline border rapi (P8 satu-satunya skor 2). Tetapi kekuatan itu kulit: **di bawah permukaan, desain ini tidak bertumpu pada sistem** — 39 kombinasi tipografi vs 6 token yang didefinisikan sendiri, ≥23 hex warna vs 11 swatch resmi, 0 design token terdaftar di file (`styles: []`, `variables: []`), light+dark sebagai **dua pohon 1.900 node yang diduplikasi manual**, hampir seluruhnya absolute-positioned (26 auto-layout dari ~1.800).

Dua area gagal total: **state** (tidak ada satu pun hover/active/disabled/loading/error/upload-progress di 16 screen — semua rubrik yang menuntut feedback runtime kosong) dan **aksesibilitas** (accent #2D81FF di light theme FAIL AA 3.57–3.69 pada teks 10px, ghost #AEAEB2 FAIL 2.21, error #D94B4B marginal 4.15, semua target interaktif <24px, tombol "Kill" 10×14 px, status murni warna).

Interpretasi: fondasi visual & komposisi layak dipertahankan; yang harus di-rework adalah (1) sistem token & komponen, (2) katalog state, (3) kepatuhan WCAG, (4) microcopy jargon.

---

## 2. Tabel Skor 11 Paradigma

| Paradigma | Skor (0–2) | Bukti (lokasi di desain/json) | Temuan (apa yang kurang) | Rekomendasi |
|---|---|---|---|---|
| P1 Visibility of System Status | 1 | Footer status "● DAEMON IDLE · SOCKET … · 0 AGENTS · RSS 1.8 MB" (screen 01); strip "N AGENTS ACTIVE"; pane header "FOCUSED · PTY 120×30 · RING 18.4K/256K · LAST OUT 340MS AGO" | Tidak ada loading/progress/upload-progress/disabled/spinner di seluruh 16 screen; status dot ● murni warna tanpa label state | Tambah katalog state: spinner/skeleton agent, upload % di dropzone, indikator koneksi; beri label teks pada dot status |
| P2 Match Between System and Real World | 1 | Ikon File/pdf·txt·md·json berlabel; log realistis ($ cargo build, VmRSS); copy launcher humanis ("UI crashes, agents live") | Jargon internal bocor: "agent/harness" campur ("8/40 HARNESSES" vs "AGENTS (8 ACTIVE / 40 MAX)"), "HELPER OF OMP", "Auto-learn offered." | Satukan istilah (pilih "agent"), tulis ulang microcopy ambigu ke bahasa user |
| P3 User Control and Freedom | 1 | Aksi kontrol ada: tombol "Kill", "DISMISS", "SPAWN", "COPY OUTPUT (sentra read)", esc/kbd di command bar | Tidak ada evidence undo/konfirmasi destruktif, cancel operasi agent yang terkirim, atau exit wizard tanpa kehilangan data | Desain konfirmasi + undo untuk delete/kill, tombol exit di settings, visible "stop agent" |
| P4 Consistency and Standards | 1 | Visual konsisten: Topbar h48/Sidebar w288 identik 16 screen; radius skala 4/8/12/9999; hairline bottom-only 78×; satu aksen #2D81FF | 0 token terdaftar; 39 kombinasi font vs 6 token; ≥23 hex vs 11 swatch; Geist Mono Bold 10 ×3 letterSpacing; light+dark = duplikat manual 2 pohon; tab Settings 03–05 kosong | Bangun token JSON (warna/spacing/type) + komponen real (Topbar/Sidebar/Pane), hapus duplikasi `Logo / claude` |
| P5 Error Prevention | 1 | Dropzone "SUPPORTED: PDF · TXT · MD · JSON — MULTIPLE FILES OK" mencegah format salah sejak awal; hint "Enter = spawn preset · free text = raw argv" | Tidak ada validasi format API key/placeholder, eye toggle, tombol disabled saat input kosong, dialog konfirmasi destruktif | Tambah validasi inline, disabled state CTA, konfirmasi aksi irreversibel |
| P6 Recognition Rather Than Recall | 1 | Session/pane berlabel deskriptif ("Pane 2 - OMP"); kbd shortcut ditampilkan (CTRL+SHIFT+↑ SPLIT · CTRL+TAB CYCLE · R-CLICK HANDOFF); recipes bernomor di sidebar 08 | Ikon "Kill" 10×14 px tanpa label/tooltip; hint "→ transitions to workspace" internal desainer; tak ada step indicator onboarding | Label teks semua ikon aksi; tooltip shortcut; step indicator di flow 01→02 |
| P7 Flexibility and Efficiency of Use | 1 | Shortcut kbd goresan di command bar; dua jalur spawn (spawn input + sidebar recipes); preset @claude/@omp | Tidak ada bukti: shortcut new session/prompt, Cmd+K palette, prompt history ↑, autocomplete path, dismissible tips, bulk action | Dokumentasikan & desain set shortcut inti + palette; multiline/history pada prompt input |
| P8 Aesthetic and Minimalist Design | 2 | Hero "Many terminals," + serif italic + satu CTA terpusat (hero max-width 560); whitespace lega; chrome UI minimal, hairline selektif; logos row tidak mendominasi CTA; density 06 padat tapi tertata | Screen 06: teks panel 9–10px mikro — keterbacaan pada density tinggi diragukan; 9 node tanpa fill | Level mikro 06 naikkan min. 10–11px; isi/buang 9 frame kosong |
| P9 Recognize, Diagnose, Recover from Errors | 0 | — | Tidak ada satu pun error state desain di 16 screen (terkonfirmasi bukti JSON + visual): tanpa pesan, tanpa recovery action, tanpa highlight field | Desain katalog error: API key invalid (sebab + fix + focus), attach gagal (format/size), agent crash — semua dengan retry/help |
| P10 Help and Documentation | 0 | Recipes sidebar 08 semi-instruksional ("+ SPAWN @OMP FOR BACKEND REFACTOR"); hint 1 baris di launcher | Tidak ada akses docs, tombol "?", cheat-sheet, bantuan konteksual di field API key; Settings tab 03 PERSONAS/04 APPEARANCE/05 SHORTCUTS kosong | Tambah shortcut cheat-sheet (tab 05 diisi), link docs kontekstual, guide langkah API key |
| P11 Aksesibilitas WCAG 2.2 AA | 0 | PASS: teks utama #1D1D1F/#F2F1EE kontras 15.8–16.8; dark secondary 9.17–9.75 | **FAIL langsung**: accent #2D81FF di light 3.57–3.69 (<4.5, dipakai teks 10px); ghost #AEAEB2 2.21; error #D94B4B 4.15 marginal; #6E6E73 di canvas 4.49 FAIL; semua target <24px (Kill 10×14, Settings Btn 28); tanpa constraints/focus state; status murni warna | Gelapkan accent untuk teks light (≥4.5:1), naikkan error ke ≥4.5, semua target ≥24px (ideal 44), focus ring eksplisit, ikon+teks pada status |
| **Total (maks 22)** | **7** | | | |

---

## 3. Detail Temuan Terpenting per Paradigma

### P1 — Visibility of System Status (1)
- **Positif:** Tripod status statis solid — footer daemon (`● DAEMON IDLE · SOCKET /RUN/USER/1000/SENTRA.SOCK · 0 AGENTS · RSS 1.8 MB`), context strip (`● PROJECT: ~/orca/sentra · N AGENTS ACTIVE`), pane header (PTY size, ring buffer, last output 340ms ago). Level detail teknis ini tepat untuk audiens CLI-agent.
- **Kritis:** Nol state runtime di seluruh file (`flows: []`, tanpa hover/active/disabled/loading — dibuktikan JSON §9.9 dan catatan visual). Agent yang sedang berjalan, file yang sedang di-upload, perintah yang gagal: tidak punya representasi desain.
- **Aksi:** P2 — wajibkan katalog state (idle/loading/streaming/error per pane; upload-progress % di dropzone; disabled CTA) sebelum dev.
- **Aksi:** P1 — dot status murni warna harus diberi label teks atau ikon.

### P2 — Match Between System and Real World (1)
- Ikon file mengikuti konvensi (`File / pdf|txt|md|json`), log terminal realistis — bahasa domain tepat.
- **Temuan:** istilah "agent" vs "harness" dipakai bergantian ("+ SPAWN HARNESS IN SLOT #9", "8/40 HARNESSES" vs "AGENTS (8 ACTIVE / 40 MAX)"); deskripsi "HELPER OF OMP" untuk hermes membingungkan; "Auto-learn offered." jargon.
- **Aksi:** P1 — pilih satu istilah resmi (rekomendasi: "agent"; "harness" hanya di nilai teknis daemon), revisi copy ambigu.

### P3 — User Control and Freedom (1)
- Aksi kontrol tersedia sebagai label ("Kill", "DISMISS", "SPAWN", R-CLICK HANDOFF), tapi tanpa bukti undo, konfirmasi, atau escape path yang didesain. Modal Settings hanya punya DISMISS + X kecil.
- **Aksi:** P1 — desain konfirmasi/undo untuk kill agent & revoke; ESC + tombol disclose di modal; visible "stop/cancel running agent".

### P4 — Consistency and Standards (1)
- **Positif:** disiplin visual luar biasa — skeleton workspace identik (Topbar h48, Sidebar w288, Context Strip 1152×28, Pane 1140×716, Command Bar 84) di 16 screen; radius dari 4 nilai skala; hairline bottom-only konsisten; satu aksen.
- **Kritis (struktural):** 0 token terdaftar (`styles: []`, `variables: []`); 39 kombinasi tipografi vs 6 token type scale; ≥23 hex vs 11 swatch (`#0F0A14`, `#8A8A94`, `#DA932C`, `#D9433C` off-palette; dark surface pecah 5 nilai); Geist Mono Bold 10 dengan 3 letterSpacing (0.2/0.8/none); light+dark = dua pohon manual 1.907 node; `Logo / claude` didefinisikan 2× (id 3426, 3429); Topbar/Sidebar/Pane manual-duplicate antar screen; spacing termasuk 6 yang bukan kelipatan 4; 26/1800 auto-layout.
- **Aksi:** P0 — bangun token library (warna, type scale, spacing, radius) dan konversi komponen inti ke komponen+instance; merge light/dark ke satu variabel set. Ini pengungkit semua paradigma lain.

### P5 — Error Prevention (1)
- **Positif:** dropzone menyatakan format didukung sebelum submit ("SUPPORTED: PDF · TXT · MD · JSON"); hint input menjelaskan dua mode spawn sebelum user beraksi.
- **Temuan:** tidak ada validasi/eye-toggle/disabled state di form settings atau spawn input; tidak ada konfirmasi destruktif.
- **Aksi:** P2 — validasi inline + CTA disabled saat invalid; P1 — konfirmasi aksi irreversibel.

### P6 — Recognition Rather Than Recall (1)
- **Positif:** shortcut permintaan mengingat rendah — kbd hints tampil permanen ("CTRL+SHIFT+↑ SPLIT · CTRL+TAB CYCLE · R-CLICK HANDOFF"); nama objek deskriptif; sidebar 08 memakai checklist bernomor dengan status ("01 · GIT REPO CLONE", "✓ CLONED · CONTEXT SYNCED").
- **Temuan:** tombol "Kill" ikon glyph 10×14 px tanpa label — makna hanya dari ingatan; tab Settings 03–05 kosong jadi user harus menebak isi; hint "→ transitions to workspace" bocoran desainer.
- **Aksi:** P1 — label semua ikon aksi; P2 — isi/prototipe tab 03–05, bersihkan copy internal.

### P7 — Flexibility and Efficiency of Use (1)
- **Positif:** shortcut terlihat; dua jalur spawn (free-text argv + preset @name; sidebar recipes) melayani expert & beginner.
- **Temuan:** tidak ada Cmd/Ctrl+K palette, prompt history/autocomplete, bulk action, atau dismissible tips sebagai desain.
- **Aksi:** P2 — tambahkan shortcut set lengkap + palette; pastikan onboarding tips bisa dimatikan.

### P8 — Aesthetic and Minimalist Design (2)
- Halaman terkuat. Hero satu fokus (headline Inter SemiBold 40 → sub serif italic → spawn input terpusat), logos row pendukung, chrome UI hairline selektif, density 06 tertata dalam grid rapi, empty state 06b berisi CTA nyata ("+ SPAWN … SLOT #9").
- **Satu catatan:** ukuran teks 9–10px menjadi default ~202 layer — minim sesak di skala desktop 1440; screen 06 paling rentan.
- **Aksi:** P2 — floor keterbacaan 10–11px pada pane 8+ agent; isi 9 node tanpa fill.

### P9 — Recognize, Diagnose, Recover from Errors (0)
- Nol error state di 8 flow utama. Untuk produk yang menangani API key, network, PTY, dan file attach, ini celah desain paling berbahaya: pola error tak pernah dipikirkan, berarti implementasi akan mengada-ada.
- **Aksi:** P0 — desain minimal 3 skenario error end-to-end: (1) API key invalid — sebab + langkah fix + field highlight + focus; (2) attach file ditolak — format/size + cara benar; (3) agent crash/timeout — pesan + retry + buka docs. Mengikuti NN/g Error-Message Guidelines (plain language, konstruktif, merah hanya untuk error).

### P10 — Help and Documentation (0)
- Yang ada: hint satu baris launcher, recipes sidebar 08 (baik sebagai template, bukan docs), tab settings 05 SHORTCUTS diberi label tapi **tanpa konten**.
- Tidak ada: akses docs, tombol bantuan kontekstual di field API key, cheat-sheet, onboarding step-guide.
- **Aksi:** P1 — isi tab 05 SHORTCUTS (cheat-sheet in-app); P2 — link "How do I get a key?" di field API key; step indicator 01→02.

### P11 — Aksesibilitas WCAG 2.2 AA (0)
Dihitung objektif dari file (35 pair dominan):
- **FAIL**: accent #2D81FF sebagai teks 10px di light (#FFFFFF 3.69 / #FBFBFD 3.57 < 4.5) — dipakai 15× untuk label/status; ghost #AEAEB2 2.21; error #D94B4B 4.15 (marginal, di bawah 4.5); #6E6E73 di page canvas #F2F1EE 4.49.
- **PASS**: teks utama light/dark 15.8–16.8; secondary dark 9.17–9.75; muted light di white 5.07.
- **Target size SC 2.5.8**: semua target < 24px — Kill 10×14, Copy Btn 28, Settings Btn 28, Chip 24–30 (ideal 44).
- **Use of color SC 1.4.1**: status dot ● murni warna, tanpa label; merah tak punya pembeda ikon.
- **Focus SC 2.4.7** dan **constraints responsive**: tidak ada sama sekali di file.
- **Aksi:** P0 — darken accent untuk teks light (mis. varian teks-accent ≥4.5:1), naikkan error copy ke ≥4.5, semua target ≥24px, tambahkan focus ring di token state; P1 — label teks pada status; dark theme sudah lebih sehat — jadikan baseline.

---

## 4. Baterai Tambahan §4 (ringkas)

**4.1 WCAG detail:** Sama dengan P11 — teks utama PASS, accent/ghost/error FAIL, target FAIL, focus/warna/struktur tak terbukti. **Gagal keseluruhan.**

**4.2 Visual Hierarchy & Gestalt:** **LOLOS** — hierarki hero 1 fokus CTA per layar; proximity rapi (session/pane: nama+status batched dalam kartu); similarity: File badges satu struktur; 1 primary aksen konsisten. [NN/g Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition), [Gestalt Proximity](https://www.nngroup.com/articles/gestalt-proximity).

**4.3 Empty/Loading/Error States:** **Parsial.** Empty state ada dan berkualitas ("+ SPAWN HARNESS IN SLOT #9"); loading skeleton/error state **tidak ada di 16 screen** — belum memenuhi [NN/g Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications).

**4.4 Microcopy:** **Parsial.** Verb-first dan informatif ("SAVE CONFIG ▸", "SPAWN + SEND", hint Enter/raw argv); tone terminal konsisten; tapi agent/harness campur, "HELPER OF OMP" & "Auto-learn offered." jargon, "→ transitions to workspace" copy internal, "Kill" tanpa label — melanggar [3 C's of Microcopy](https://www.nngroup.com/articles/3-cs-microcopy/). Placeholder dipakai benar di spawn input. **Dua istilah untuk satu objek = harus dirapikan.**

**4.5 Konsistensi Token Desain:** **GAGAL** — meski radius punya skala (9999/12/8/4) dan stroke hairline disiplin, tidak ada satu pun token terbind ke node (0 registered), type scale 6 token ≠ 39 realita, palet 11 ≠ ≥23 warna, spacing termasuk nilai non-kelipatan-4 (6), dan posisi float aneh {1.4,1.4} 33× dari centering manual.

---

## 5. Top-10 Perbaikan Prioritas

| # | Prio | Perbaikan | Paradigma |
|---|---|---|---|
| 1 | P0 | Bangun design-token library nyata (warna+type+spacing) & bind ke semua node | P4 |
| 2 | P0 | Gelapkan accent light theme (#2D81FF → ≥4.5:1 untuk teks), naikkan #D94B4B ≥4.5, buang ghost #AEAEB2 dari teks | P11 |
| 3 | P0 | Naikkan semua target interaktif ≥24px (ideal 44) — "Kill" 10×14 paling darurat; beri label teks | P11, P6 |
| 4 | P0 | Desain katalog state: loading/progress/disabled/hover/error per komponen inti | P1, P9 |
| 5 | P0 | 3 skenario error end-to-end (API key, attach, agent crash) dengan recovery action | P9 |
| 6 | P1 | Merge light/dark dari 2 pohon manual → 1 pohon + variable mode swap | P4 |
| 7 | P1 | Konversi Topbar/Sidebar/Pane/Command Bar ke komponen & instance; hapus duplikat `Logo / claude` | P4 |
| 8 | P1 | Satukan istilah agent vs harness; revisi "HELPER OF OMP", "Auto-learn offered.", hint internal | P2, P6 |
| 9 | P1 | Konfirmasi/undo untuk kill & delete; ESC + visible exit di modal Settings | P3, P5 |
| 10 | P2 | Isi Settings tab 03–05 (mulai cheat-sheet SHORTCUTS); validasi inline + CTA disabled + eye toggle di form | P10, P5, P7 |

**Catatan penutup:** skor 7/22 jangan dibaca sebagai kegagalan arah desain — komposisi, grid, dan bahasa visual Sentra di atas rata-rata. Yang gagal adalah **infrastruktur desain** (token, komponen, state, aksesibilitas), dan seluruhnya dapat diperbaiki tanpa mengubah bahasa visual yang sudah berhasil ini.

---

*Sumber: rubrik & skor dari audit-framework.md (Nielsen 10 — [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/); WCAG 2.2 — [W3C](https://www.w3.org/TR/WCAG22)); bukti struktural dari audit-evidence.md (document.json Sentra UI, 1.907 node); observasi visual dari catatan 16 screenshot light+dark.*

## 6. Keputusan Rombak Tipografi (user)

- **Rombak tipografi global: Higuen Elegant Serif** jadi font display/brand Sentra (hero, judul, wordmark) — menggantikan peran Archivo/Instrument Serif. Pairing detail di §6.1.
- Tetap jalankan temuan audit saat rombak: konsolidasi 39 kombinasi → type scale token (AUDIT §P4) — font baru, jumlah kombinasi tetap harus turun; letter-spacing diseragamkan (buat Bold 10 yang kini 3 varian).
- Higuen Elegant tidak punya varian monospace (bukan font mono) → output terminal/PTY & log layar 03–06 tetap butuh font mono pendamping; tentukan pasangan (pairing) + fallback stack, jangan paksa Higuen di area terminal.

### 6.1 Pairing (keputusan)

| Peran | Font | Style terpakai |
|---|---|---|
| Display/brand (hero, judul section, wordmark) | **Higuen Elegant Serif** | Regular (satu-satunya style yang ada) |
| UI/body/label — **Regular, Bold, Italic** | **Inter** | Regular / SemiBold / Italic (+ underline = text-decoration, bukan file font) |
| Terminal, log PTY, kbd, stats (screen 03–06) | **Geist Mono** | Regular / Bold (sudah ada di file) |

- Fallback stack UI: `"Higuen Elegant", Georgia, serif → Inter, system-ui → Geist Mono, ui-monospace, monospace`.
- Italic elegan di slot hero line-2 (dulu Instrument Serif Italic) → Inter Italic agar total tetap 3 keluarga (ideal audit: ≤2; 3 karena kebutuhan mono terminal).

### 6.2 Peringatan lisensi & mutu

- **Higuen Elegant = StrictlyPersonal Use gratis** (1 file OTF, 230 glyph). UI produk = komersial → **wajib beli lisensi** (Creative Market, Ngene). Tanpa lisensi: jangan ship.
- Higuen hanya punya 1 style; **tidak ada Bold/Italic asli** — kebutuhan itu dipindah ke Inter (lihat tabel). Simulasi bold dengan stroke/font-synthesis dilarang (merusak bentuk serif).
- Higuen = font display: JANGAN dipakai di bawah ~16px / label 9–10px audit — keterbacaan turun; area kecil tetap Inter/Geist Mono.
- Verifikasi coverage glyph sebelum beli: angka tabular, ●, ▸, ✓, ↑ — cek kehadirannya di spesimen 230 glyph versi gratis.
