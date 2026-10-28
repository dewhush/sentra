# Sentra UI — Design Audit Evidence
Source: `/home/dewhush/figcraft-work/sentra-ui.figcraft` (ZIP → `document.json`, 4.93 MB, 1.907 nodes). Metode: walk rekursif Python, agregat + sampel. Format figcraft v1. Limitasi: **JSON berisi statis saja — TIDAK ADA interaksi/prototyping/flows** (`flows: []`, `prototype.device "None"`); nilai interaksi harus dari screenshot. `styles: []`, `variables: {collections:[], variables:[]}`, `document_colors: []` → **tidak ada design token library terdaftar; palet & tipe hanya "dokumentasi gambar" di halaman Assets, tidak terikat ke node**.

## 1. Struktur
Page tunggal `82 "Sentra Application UI"` (bg #F2F1EE). 18 top-level node:

| id | nama | ukuran | fungsi |
|---|---|---|---|
| 1581 | Light Version - Sentra | 3060×3900 | desk grid 2 kolom × 4 baris screen 1440×900 (gap 60, origin 60,60 / 1560,60; row pitch 960) |
| 1931 | Dark Version - Sentra | 3060×3900 | duplikat persis 8 screen yang sama, dark |
| 1679 | Sentra Assets | 1440×1446 | style-guide: logo, palet, type scale, komponen, radius, spacing |
| 3425–3437, 3700, 3652–3661 | Logo/File components | 12–16 px | 11 component defs lepas (lihat §6) |
| 3651, 3698 | label teks assets | — | caption |

**16 screen eksplisit** (8 light + 8 dark), bernomor:
1. `01 · Empty Launcher — First Run` (hero marketing + spawn input) — id 933 / 2654
2. `02 · Context Set + Spawn 1 Agent` — 970 / 2698
3. `03 · 1-Agent Workspace` — 995 / 2730
4. `04 · Adding 2nd Agent` — 1059 / 2811
5. `05 · 3-Agent Dynamic Grid` — 1116 / 2894
6. `06 · Scaled 8+ Agents (Dynamic Grid)` — 1206 / 3030
7. `07 · Settings Panel` (modal 760×770 di atas backdrop + scrim) — 1271 / 3183
8. `08 · Sidebar Clone & Context Dispatch` — 1313 / 3296

Kelompok fungsional: onboarding (01–02) → workspace bertahap 1/2/3/8+ agent (03–06) → settings (07) → sidebar konteks (08). Anomali ukuran minor: `01 Dark` Hero H1 Line1 tinggi **38 vs 44 light** (id 2672 vs 944) — font hero light/dark tidak identik (40 vs kemungkinan 36).

## 2. Tipografi
793 text layer; 3 keluarga. 39 kombinasi unik (family×style×size×lh×ls). Distribution teratas (count):

| # | Font | Style | Size | LH | LS | count |
|---|---|---|---|---|---|---|
| 1 | Geist Mono | Bold | 11 | auto | 0.88px | 97 |
| 2 | Geist Mono | Regular | 10 | auto | – | 94 |
| 3 | Geist Mono | Regular | 11 | auto | – | 90 |
| 4 | Geist Mono | Bold | 10 | auto | 0.2px | 90 |
| 5 | Geist Mono | Bold | 9 | auto | – | 80 |
| 6 | Geist Mono | Bold | 10 | auto | 0.8px | 71 |
| 7 | Geist Mono | Regular | 10 | auto | 0.8px | 38 |
| 8 | Geist Mono | Bold | 11 | auto | – | 29 |
| … | dsb (26 kombinasi Geist Mono lagi) | | | | |

Non-mono: Inter Regular 12 (16×), Inter SemiBold 14 (8×), Inter Medium 14 (6×), Inter SemiBold **40/600/-1.6/44** hero (3×), Inter Regular 16/26 body-lg (3×), **Archivo SemiBold 36/-1.08** (3×), Instrument Serif Italic 44 & 40 (5×), Instrument Serif Italic 14 (1×).

**Outlier / red flag typografi:**
- Monospace mendominasi ~96% layer (mono untuk SEMUA UI termasuk body) — pilihan gaya terminal, tapi Inter yang dijanjikan token `body-lg` nyaris tak dipakai di screen.
- **LetterSpacing tidak konsisten pada ukuran sama**: Geist Mono Bold 10 muncul dengan ls 0.2 / 0.8 / none (90+71+23 kemunculan) — 3 varian tak terdokumentasi.
- Ukuran satu-dua kemunculan: Geist Mono Bold 22 ls 4.4 (1×), Inter 13 (1×), Inter 11 Regular (1×), Instrument Serif Italic 14 (1×).
- Hero light 40 (Inter SemiBold) vs hero dark tampak 36–38 (line-height 38) — mismat antar tema.
- Type scale di Assets mendefinisikan 6 token; aktual di screen ≥ 39 kombinasi. Scale "dokumen" ≠ praktik.

## 3. Warna
Fill solid unik + count (semua halaman): `#FBFBFD` 303, `#1D1D1F` 257, `#FFFFFF` 211, `#F2F1EE` 201, `#101014` 186, `#6E6E73` 163, `#2D81FF` 156, `#1F1F27` 114, `#B9B9C2` 103, `#17171C` 44, `#D97757` 33, `#0F0A14` 24, `#1B1B22` 22, `#0F0F0F` 12, `#D94B4B` 7, `#AEAEB2` 5, `#8A8A94` 4, `#F5F5F7` 3, `#E8E8ED` 3, `#DA932C` 2, `#D9433C` 2, `#8E8E93` 2, `#2A2A33` 2.

Dikelompokkan vs palet resmi Assets (11 swatch: ink #1D1D1F, paper #FBFBFD, canvas #F5F5F7, accent #2D81FF, neutral #FFFFFF, muted #6E6E73, ghost #AEAEB2, border #E8E8ED, error #D94B4B, border-strong #1D1D1F40):
- **Bg/canvas**: light #FBFBFD, #FFFFFF, #F2F1EE (page bg); dark #101014, #17171C, #1F1F27, #1B1B22, #0F0A14.
- **Teks**: #1D1D1F, #F2F1EE (dark text), #6E6E73 muted, #B9B9C2 (dark muted, 103×), #AEAEB2 ghost.
- **Aksen**: #2D81FF (satu aksen, 156×), #D97757 Claude-orange 33× (brand logo instance — di luar 11 swatch).
- **Status**: #D94B4B error (7×); `#DA932C` (2×) & `#D9433C` (2×) = **off-palette warning/error varian sekali pakai**.

**Off-palette flag:** #F5F5F7 disebut "canvas" di Assets tapi hanya dipakai 3× (app bg sebenarnya #FBFBFD + page #F2F1EE) — dokumentasi ≠ praktik. Dark surface terpecah **5 nilai** (#101014/#17171C/#1B1B22/#1F1F27/#0F0F0F) tanpa swatch padanan. `#0F0A14` 24× (dark Settings/tint keunguan) tidak ada di palet. `#8A8A94`, `#8E8E93`, `#2A2A33` masing-masing 2–4× — sisa eksperimen. Palet nominal 11 warna → realitas ≥ 23.

## 4. Kontras teks (WCAG, dihitung, dominant pairs)
Asumsi: ukuran <18.66px bold / <24px = "normal" (batas AA 4.5; large 3.0). Geist Mono 9–11 px = teks besar-besaran di bawah ukuran nyaman, tapi lintasan WCAG hanya size large.

| Teks | BG | Rasio | AA normal | Catatan |
|---|---|---|---|---|
| #1D1D1F | #FFFFFF | 16.83 | PASS | teks utama light (55×) |
| #1D1D1F | #FBFBFD | 16.28 | PASS | |
| #F2F1EE | #17171C | 15.81 | PASS | teks utama dark (43×) |
| #F2F1EE | #101014 | 16.81 | PASS | |
| #B9B9C2 | #101014 | 9.75 | PASS | secondary dark (24×) |
| #B9B9C2 | #17171C | 9.17 | PASS | |
| #6E6E73 | #FBFBFD | 4.91 | PASS (marginal) | secondary light (26×) |
| #6E6E73 | #FFFFFF | 5.07 | PASS | |
| #6E6E73 | #F2F1EE | 4.49 | **FAIL** | muted di page-canvas background |
| #2D81FF | #FFFFFF | 3.69 | **FAIL** <14px bold?, pass only large | accent text (15× @10px) |
| #2D81FF | #FBFBFD | 3.57 | **FAIL** normal | |
| #2D81FF | #17171C | 4.84 | PASS | dark accent ok |
| #AEAEB2 | #FFFFFF | 2.21 | **FAIL** | ghost text 5× |
| #D94B4B | #FFFFFF | 4.15 | **FAIL** (marginal) | error copy |
| #D97757 | #17171C | 5.72 | PASS | |
| #8A8A94 | #101014 | 5.55 | PASS | |

Temuan inti: accent #2D81FF sebagai teks kecil di light GAGAL AA (3.57–3.69) — dipakai untuk label/status 10–11px. Ghost #AEAEB2 gagal total. Dark theme secara umum lebih aman dari light.

## 5. Grid & spacing
- Slot 1440×900 sangat konsisten (16/16 screen); desk 3060×3900, gap antar-screen 60/60+margin. Kolom internal workspace identik di semua screen: Topbar h48, Sidebar w288, Context Strip 1152×28 @y48, Pane @x288 y88 1140×716, Command Bar 1440×84 @y816. Panes 2-col: 564 px @x288 & x864 (gap 12). `05` dynamic grid: rows 352 @y88/y452 (gap 12). Semua kelipatan 4.
- Spacing scale resmi: **6/16/24/32/80** — catat: bukan skala 4/8 murni (6 bukan kelipatan 4).
- Realita posisi (transform tx/ty modulo): banyak nilai non-kelipatan-4 — {1.4,1.4} 33×, {2.6,2.0} 24×, {2.25,2.0} 20×, plus float aneh (3.2999…, 2.2999…) dari node terpusat/manual: indikasi centering manual bukan auto-layout. Hanya 26 node punya `layout` (auto layout) dari 817 dengan `child_layout` — **desain hampir seluruhnya absolute-positioned**.
- Max-width hero 560, form 660 @x440/x390 (terpusat); modal 760×770 @x340 (terpusat sempurna pada 1440).
- Anomali `07 Settings`: modal y=65 — tidak vertikal center (900−770=130 → expected y=65 ✔ sebenarnya center; ok).
- Light Hero H1 Line2 y=320 h=48 vs Line1 h=44; dark h=38/44 — leading hero inkonsisten.

## 6. Komponen & reuse
- **COMPONENT defs: 11**, semua ikon: `Logo / claude` ×2 defs (id 3426 & 3429 — **duplikat defs dengan nama sama, duplikasi definitions itu sendiri**), `Logo / omp`, `Logo / codex`, `Logo / hermes`, `Logo / bash`, `Logo / custom`, `File / pdf|txt|md|json`.
- **Instances: 115** (237 kalau ikon dihitung dua kali) — `Logo / claude` 33, `omp` 24, `hermes` 20, `bash` 14, `codex` 12, `Logo / custom` 4, File icons 2×4.
- **Belasan `rectangles` manual untuk logo "Pixel S"**: `Pixel S Light/Dark/Accent/Lockup` — 11 rect 16×16 per kartu logo + 11 rect 8×8 lockup (id 1685–1745): grid pixel 4×4 direkonstruksi rectangle-per-rectangle, TIDAK dikomponenkan. Total 176 layer bernama "Pixel S"-related (176 "Pixel S" + 16 "Pixel S Tile" + 20 "Px").
- Komponen UI besar (Topbar, Sidebar, Pane, Command Bar, Settings Btn, Chip, Card) **manual copy antar 16 screen** — nama sama, struktur duplikat (mis. 16× "Topbar", 14× "Name"/"Sub"). 52 frame aksi kecil manual.
- Vector: 138 node; 5 terbesar `Glyph` id 3778–3782 masing ~153 KB network data (logo path besar) — diduplikasi 5× identik alih-alih satu instance.

## 7. Naming & hierarki
- Sahkan section numbering konsisten: screen "01 ·…", "08 ·…" (16), assets "01 · LOGO", "02 · COLOR PALETTE", "03 · TYPE SCALE", "04 · COMPONENTS", "05 · RADIUS & SPACING" — rapi.
- Nama komponen baik: "Logo / claude", "File / pdf", "Button Primary".
- Inkonsisten: generik berulang ("Txt" 142×, "Glyph" 107×, "B"/"H"/"T1–T4"), kapitalisasi campur ("Settings Btn" vs "Button Primary"; "Id" vs "ID"; "CtxTxt" vs "CtxStrip"; "Spawn Input (filled)" ok, tapi "Pane OMP (new)" vs "Pane 2 - OMP" — gaya berbeda). "Logo / claude" dipakai 2 definisi berbeda. Screen 06 nama panjang terpotong ("Scaled 8+ Agents (Dynamic").
- Duplikat defs `Logo / claude` (3426, 3429) = temuan penamaan/struktur.

## 8. Konten & microcopy (ringkas; lengkap 263 string unik diekstrak)
- Launcher: hero "Many terminals," / "one window."; body "Spawn any CLI agent into a daemon-owned PTY. Chain tasks across agents with send → wait → read. UI crashes, agents live."; placeholder "spawn an agent…  e.g.  @claude  or  bash --norc"; hint "Enter = spawn preset · free text = raw argv · @name handle task = spawn + send"; footer "● DAEMON IDLE · SOCKET /RUN/USER/1000/SENTRA.SOCK · 0 AGENTS · RSS 1.8 MB"; dropzone "DROP FILES OR FOLDERS HERE · OR CLICK TO BROWSE" + "SUPPORTED: PDF · TXT · MD · JSON — MULTIPLE FILES OK".
- Workspace: strip konteks "● PROJECT: ~/orca/sentra · BRIEF: … · N AGENTS ACTIVE"; status pane "FOCUSED · PTY 120×30 · RING 18.4K / 256K · LAST OUT 340MS AGO"; command kbd "CTRL+SHIFT+↑ SPLIT · CTRL+TAB CYCLE · R-CLICK HANDOFF"; tombol "SPAWN ▸", "SPAWN + SEND", "DISPATCH POOL ▸", "COPY OUTPUT  (sentra read)".
- Sidebar 08: "01 · GIT REPO CLONE", "✓ CLONED · CONTEXT SYNCED", recipes "+ SPAWN @OMP FOR BACKEND REFACTOR" dll.
- Settings: tabs "[01 DAEMON CORE] 02 PRESETS (40+) 03 PERSONAS 04 APPEARANCE 05 SHORTCUTS" (hanya tab 1–2 isi; **3–5 tak ada kontennya di mockup**), "SAVE CONFIG ▸", "DISMISS".
- Empty state: "+ SPAWN HARNESS IN SLOT #9".
- Log realistis ($ cargo build, VmRSS, ✓ diff). Microcopy teknis tajam.
- **Ambigu**: "HELPER OF OMP" (deskripsi harness hermes — dibaca aneh); "Auto-learn offered." (jargon); " killings" tidak ada tapi tombol **"Kill" 10×14 px tanpa label teks** (ikon glyph saja) tak informatif untuk screen reader; "→ transitions to workspace" di hint 01 adalah copy internal desainer, bukan UI; "8/40 HARNESSES" vs "AGENTS (8 ACTIVE / 40 MAX)" — dua istilah (agent/harness) dipakai bergantian.

## 9. Red flags lain
1. **Touch/target kecil**: Settings Btn 28 px; Chip 24–30 px; "Kill" 10×14 px; Copy Btn 28 px; beberapa txt tombol ~20 px tinggi — semua < 32 px, jauh di bawah 44 px.
2. **Scrim terpisah light/dark beda warna** (#FFFFFF @70% light, #101014 @70% dark) — konsisten, ok; tapi opacity fill hanya 9 total (0.10 badge tint #2D81FF 6×, scrim 2×, swatch 1×) — minim penggunaan alpha; glassmorphism yang diklaim di konten ("#FFFFFF8A glass… blur 12") tidak dieksplorasi di desain.
3. **strokeSides array** dipakai (78× bottom-only hairline di Topbar/strip; 12 top, 14 left, 14 all) — tepi hairline selektif, konsisten.
4. **Radius**: 9999 (242×, pill/chip), 4 (128×), 12 (63×), 8 (33×), 16 (3×) — sesuai skala token.
5. **Constraints/konteks responsive**: tidak ada field constraints; hanya `child_layout.sizing` dan 26 node auto-layout dari ~1.800 — desain fix 1440×900, tidak ada varian breakpoint. Semua kemungkinan responsive tak terbukti di file.
6. **Fill kosong**: 9 frame/rectangle tanpa fill (kemungkinan placeholder pengukur).
7. Monospace 9–10 px sebagai ukuran default — sangat kecil untuk keterbacaan nyata.
8. Light vs dark bukan hasil instance/variable swap — **dua pohon 1.900 node diduplikasi manual**; setiap perubahan harus diedit 2× (maintenance risk terbesar di file ini).
9. Tidak ada state hover/active/disabled yang dapat dikesan (statis); 52 tombol kecil tanpa afordansi state.
10. Big vectors diduplikasi (3778–3782, 153 KB each) — bloat file.

*Angka kontras dihitung dengan luminans WCAG Standar; pair diambil dari 35 kombinasi text×bg dominan (counter penuh tersedia bila perlu).*
