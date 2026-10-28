# Audit Framework UX — Sentra (Desktop / Web-Agent UI)

Dokumen kerangka audit untuk desain UI Sentra (app terminal-agent: onboarding, setup API-key, session list, file attach, prompt input, settings). Doc point: halaman desk 1440×900, hero "Many terminals,", komponen CLI-agent logos, file-type icons (PDF/TXT/MD/JSON), setup/settings flow.

---

## 1. Definisi "11 Paradigma"

**Keputusan:** Pilih Nielsen's 10 Usability Heuristics (NN/g) + WCAG 2.2 Accessibility Level AA sebagai paradigma ke-11.

**Justifikasi:** Tidak ditemukan set "11 paradigma" lembaga eksplisit dalam penelusuran. Nielsen 10 adalah framework heuristic evaluation paling lembaga-kredibel — direkomendasikan langsung oleh NN/g untuk metode heuristic evaluation ([How to Conduct a Heuristic Evaluation](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation)) — dan kompakt. Ditambah paradigma aksesibilitas WCAG 2.2 karena: (a) kritikal untuk aplikasi desktop/agent yang dipakai intensif, (b) terukur objektif dari desain statis + token, (c) tidak tercakup 10 heuristik Nielsen. Alternatif (Gestalt/visual hierarchy) dipindah ke Baterai Tambahan §4 menghindari double counting dengan H6.

| # | Paradigma | Sumber |
|---|-----------|--------|
| 1 | Visibility of System Status | [NN/g 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 2 | Match Between System and Real World | [sama](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 3 | User Control and Freedom | [NN/g User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom) + [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 4 | Consistency and Standards | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 5 | Error Prevention | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 6 | Recognition Rather Than Recall | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 7 | Flexibility and Efficiency of Use | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 8 | Aesthetic and Minimalist Design | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 9 | Help Users Recognize, Diagnose, Recover from Errors | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines) |
| 10 | Help and Documentation | [10 heuristik](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| 11 | Aksesibilitas WCAG 2.2 (Level AA) | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22) |

**Alasan memilih tiap paradigma:**
1–10: framework lembaga NN/g, teruji puluhan tahun, hari tepat untuk evaluasi statis desktop app; tiap paradigma langsung map ke permukaan Sentra (progress agent, session list, terminal markdown, API-key error).
11: WCAG 2.2 adalah standar W3C resmi (bukan pedoman opini) — satu "paradigma" resmi tunggal; kritikal untuk inclusiveness, terukur (kontras 4.5:1, target 24×24 px, focus indicator), dan tidak tercakup di 10 heuristik Nielsen.

---

## 2. Rubrik per Paradigma (Pertanyaan Cek — Statis)

Skala tiap paradigma 0–2 (lihat §3). Rubrik dirancang bisa dijawab dari: desain statis (Figma/FigCraft, JSON design-token), copy teks — **tanpa uji user live**. Konteks Sentra dicetak tebal.

### P1 — Visibility of System Status
1. Apakah setiap state penting punya indikator visual (loading/saving/error/success/idle) di UI, bukan blank?
2. **Saat agent berjalan, apakah ada progress/status (spinner, teks "thinking…", timeout indikator) yang jelas milik terminal mana?**
3. Apakah tombol submit/memberi feedback seketika (disabled state, spinner, "saved")?
4. Apakah status koneksi/API (--, connecting, error) terlihat tanpa harus membuka setting?
5. **Apakah attachment PDF/TXT/MD/JSON menunjukkan state upload-progress (%, indeterminite) sebelum done?**

### P2 — Match Between System and Real World
1. Apakah label memakai bahasa user, bukan jargon internal (hindari "instantiate", "dispatch"; di Sentra: "session", bukan "agent process instance")?
2. **Istilah terminal-agent konsisten dengan konvensi domain (session, prompt, attach, cwd)?**
3. Ikon file-type (PDF/TXT/MD/JSON) mengikuti konvensi umum yang dikenali (ekstensi berlabel jelas)?
4. Ikon CLI-agent (mis. logo agent) punya tooltip/name yang menyebut namanya, bukan berupa shape tanpa label?
5. Copy error memakai bahasa manusia, bukan stack trace atau kode (lihat juga P9).

### P3 — User Control and Freedom
1. Apakah aksi destruktif (hapus session, disconnect terminal, revoke API key) punya undo / satu pintu undo atau dengan konfirmasi yang tepat?
2. **Bisa keluar dari flow (onboarding, setup wizard) tanpa kehilangan data yang sudah diisi?**
3. Bisa cancel operasi agent yang jalan/telah terkirim (stop, kill, esc)?
4. Bisa kembali ke langkah sebelumnya di setup/settings (back, breadcrumb)?
5. Bisa edit/rename session, bukan hanya delete?
6. Bisa clear input saat salah attach file (hapus attachment, mulai ulang)?

### P4 — Consistency and Standards
1. Satu aksi = satu warna/ikon/label yang sama di semua screen (mis. biru = primary, merah = danger)?
2. **Komponen seragam: card session list, input, badge file-type — pemakaian size/spacing/radius konsisten?**
3. Terminology konsisten: "terminal"/"session"/"agent" tidak dipakai berganti-ganti untuk objek sama?
4. Pattern platform diikuti: Cmd/Ctrl+K palette, esc menutup modal, Cmd/Ctrl+C copy di terminal?
5. Format tampilan konsisten (tanggal, waktu, path file, ukuran file) antar layar?
6. Token desain (warna, spacing, radius, font) terdokumentasi di design token/JSON & dipakai konsisten?

### P5 — Error Prevention
1. Input yang butuh format (API key, URL, path) punya placeholder lengkap + validasi format sejak awal (bukan hanya saat submit)?
2. Aksi destruktif irreversibel (delete session, revoke key) butuh konfirmasi eksplisit?
3. **Apakah file yang tidak didukung (bukan PDF/TXT/MD/JSON) dicegah lebih awal: disabled state atau pesan sebelum submit?**
4. Copy-paste API key: apakah ada tampilkan/sembunyikan (eye toggle) berbanding paste salah sejak awal?
5. Apakah tombol utama disabled yang tepat saat input kosong/invalid?

### P6 — Recognition Rather Than Recall
1. **List session dirender dengan label/judul yang deskriptif (nama + timestamp + status), tidak memaksa user mengingat session #?**
2. Menu/shortcut ditampilkan (Ctrl+K palette menampilkan daftarnya, tooltip shortcut di tombol)?
3. File attachment menampilkan nama + ikon tipe (jangan hanya "3 files attached")?
4. Nilai setting yang dipakai tampil (bukan memaksa user ingat apa diset sebelumnya)?
5. Onboarding menunjukkan langkah berikutnya (step indicator), tidak memaksa user ingat manual?
6. Ikon non-standar punya label teks/tooltip?

### P7 — Flexibility and Efficiency of Use
1. Apakah ada shortcut keyboard (untuk aksi: new session, prompt, switch terminal, close)?
2. Apakah aksi berulang ada accelerator (bulk action, multi-select, default template)?
3. Bisa paste command/API-key dengan satu aksi (paste + auto-validate)?
4. Ada dua jalur ke aksi yang sama (toolbar + palette + context menu) bagi beginner & expert?
5. **Prompt input mendukung multiline, history (↑), dan autocomplete path file?**
6. Apakah ada dismissible onboarding/tips (expert tidak dipaksa lihat Tips setiap kali)?

### P8 — Aesthetic and Minimalist Design
1. Setiap elemen di layar relevan dengan tujuan layar (tanpa decoration yang bertabrakan)?
2. Hero "Many terminals," memakai hierarki tegas (headline besar → sub copy → CTA) tanpa konkur dengan elemen kontrol?
3. **Terminal area: chrome UI minimal, konten render (markdown/ANSI) dominan, tidak dipenuhi border/overlay?**
4. Logos row CLI-agent tidak mendominasi / tidak menyaingi CTA?
5. Empty states dirancang (bukan kosong mute yang membuat user bingung — silang-referensi Baterai §4)?
6. Density informasi pas: tidak overloaded, tidak terlalu sparse per layar?

### P9 — Help Users Recognize, Diagnose, Recover from Errors
1. Error message plain language (tanpa kode internal), tepat menunjuk masalah, konstruktif menawarkan solusi ([NN/g Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines))?
2. **Validasi API key gagal: pesan menyebut penyebab dan langkah fix (format? revoked? network?), dan field yang salah di-highlight + focus?**
3. Error state punya Recovery Action (retry, edit input, "buka docs") sehingga user tidak buntu?
4. Error visible (toast/banner/inline) — tidak hanya di console/log?
5. file attach gagal: pesan menjelaskan kenapa + cara bener (format, size limit)?
6. Indikator visual error (merah, ikon) hanya untuk error, bukan warning/info (hostile pattern dihindari — [Hostile Patterns in Error Messages](https://www.nngroup.com/articles/hostile-error-messages))?

### P10 — Help and Documentation
1. Apakah ada akses cepat ke bantuan (link docs, "?" tombol, Ctrl+? shortcuts cheat-sheet)?
2. Bantuan konteksual dekat titik kebutuhan (next to API key field, bukan hanya di docs site)?
3. Setup/onboarding punya instruksi langkah-by-step (guide: buat key di mana, paste ke mana)?
4. Error message link ke dokumentasi relevan?
5. Docs mudah dicari (search, daftar isi) bila berupa in-app help?

### P11 — Aksesibilitas WCAG 2.2 Level AA
1. **Kontras teks ≥ 4.5:1 (normal), ≥ 3:1 (large text ≥24px / 18.66px bold) — [SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)?**
2. Non-text contrast ≥ 3:1 untuk komponen UI & grafik informatif (ikon file, border input) — [SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)?
3. Focus visible jelas pada semua elemen interaktif — [SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)?
4. Target size pointer ≥ 24×24 px — [SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)?
5. Informasi tidak hanya disampaikan warna (error juga pakai ikon/teks) — [SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)?
6. Struktur headings/landmarks & label form yang benar (siap di-screen-read) — [SC 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)?

---

## 3. Skema Skor (0–2)

| Skor | Arti | Kriteria |
|---|---|---|
| **2** | Baik | Semua pertanyaan rubrik terjawab cukup (≥80%); bukti desain eksplisit (token/state/copy ada) |
| **1** | Sebagian | Ada tapi parsial: 40–79% item terjawab, ATAU ada padahal bukti tidak eksplisit (asumsi, tidak di-token/desain) |
| **0** | Gagal | <40% pertanyaan terjawab, atau pelanggaran langsung (mis. kontras 3:1 di body text, tanpa indikator status) |

**Template tabel skor akhir:**

| Paradigma | Skor (0–2) | Bukti (lokasi di desain/json) | Temuan (apa yang kurang) | Rekomendasi |
|---|---|---|---|---|
| P1 Visibility of System Status | | | | |
| P2 Match Between System and Real World | | | | |
| P3 User Control and Freedom | | | | |
| P4 Consistency and Standards | | | | |
| P5 Error Prevention | | | | |
| P6 Recognition Rather Than Recall | | | | |
| P7 Flexibility and Efficiency of Use | | | | |
| P8 Aesthetic and Minimalist Design | | | | |
| P9 Help Users Recognize, Diagnose, Recover from Errors | | | | |
| P10 Help and Documentation | | | | |
| P11 Aksesibilitas WCAG 2.2 AA | | | | |
| **Total (maks 22)** | | | | |

Interpretasi total: 18–22 = siap dev; 13–17 = perbaiki sebelum dev; ≤12 = rework desain.

---

## 4. Baterai Tambahan "Hal Penting UI/UX" (di luar 11 paradigma)

Checklist singkat yang kompletan audit statis, semua kredibel dengan sumber:

### 4.1 Aksesibilitas Detail (WCAG 2.2)
- [ ] Kontras teks ≥ 4.5:1; large text ≥ 3:1 — [SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [ ] Non-text (ikon, border komponen) ≥ 3:1 — [SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [ ] Target sentuh/klik ≥ 24×24 px (rekom. praktis 44×44) — [SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [ ] Focus indicator visible dan contrast terhadap background — [SC 2.4.11/2.4.13 WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [ ] Warna bukan satu-satunya pembawa makna — [SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [ ] Heading h1→h2 hierarchical, label form terhubung — [SC 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)

### 4.2 Visual Hierarchy dan Gestalt
- [ ] Ukuran/weight/warna membedakan tingkat info: 1 primary, ≤2 secondary level — [NN/g Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition)
- [ ] Proximity: item yang berelasi dekat (session card: title+timestamp+status batched) — [NN/g Gestalt Proximity](https://www.nngroup.com/articles/gestalt-proximity)
- [ ] Similarity: file-type badges (PDF/MD/JSON) satu struktur sama, hanya beda warna/label
- [ ] Satu titik fokus CTA per layar; hierarki hero → sub-copy → CTA tegas

### 4.3 Empty / Loading / Error States
- [ ] Setiap daftar (session list, history, file attach) punya empty state yang menjelaskan apa yang kosong + CTA ("Belum ada terminal — buat yang pertama")
- [ ] Loading skeleton/spinner untuk list dan render agent (bukan blank)
- [ ] Error state: ikon + pesan + aksi (retry/bantuan) — lihat [NN/g Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications)
- [ ] First-run empty state berbeda dengan empty-after-delete

### 4.4 Microcopy
- [ ] Label tombol verb-first dan spesifik ("Create session", bukan "OK"/"Submit") — [NN/g The 3 C's of Informational Microcopy](https://www.nngroup.com/articles/3-cs-microcopy/)
- [ ] Empty/error/tooltip copy manusiawi, tanpa jargon; tanpa milenial cheerful berlebihan di error
- [ ] Placeholder ≠ label (placeholder hilang saat diketik; label tetap) — [NN/g Placeholders](https://www.nngroup.com/articles/form-design-placeholders/) — [seri Form Design](https://www.nngroup.com/articles/form-design/)
- [ ] Konsisten satu nada bicara (tone) — formal ↔ santai dipilih dan konsisten

### 4.5 Konsistensi Token Desain
- [ ] Palet warna (surface, text, primary, danger, border) ter-token di JSON/CSS vars, bukan warna ad-hoc
- [ ] Spacing pakai skala (4/8 px grid), radius & shadow dari satu set
- [ ] Type scale terdefinisi (sizes + weights), ≤2 font family
- [ ] Touch/target size konsisten kontrol interaktif (≥24px, ideal 44px) — [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [ ] Iconography satu set (stroke/fill konsisten), ukuran seragam

---

## Sumber Utama
- NN/g 10 Usability Heuristics — https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g Heuristic Evaluation — https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation
- NN/g Error-Message Guidelines — https://www.nngroup.com/articles/error-message-guidelines
- NN/g User Control and Freedom — https://www.nngroup.com/articles/user-control-and-freedom
- NN/g Hostile Error Messages — https://www.nngroup.com/articles/hostile-error-messages
- W3C WCAG 2.2 — https://www.w3.org/TR/WCAG22
- W3C WCAG Quickref — https://www.w3.org/WAI/WCAG22/quickref/
