# Infinity Castle 3D (無限城)

> **Interactive 3D recreation of the Infinity Castle from Demon Slayer: Kimetsu no Yaiba**
>
> Built entirely with Three.js. No game engine. Runs in any browser.

**[Live Demo](https://infinity-castle-blond.vercel.app)**

---

## Overview

A fully interactive 3D experience that recreates the iconic Infinity Castle (無限城) — the sprawling, gravity-defying fortress controlled by Nakime's biwa. Walk through corridors, watch cinematic battle sequences, and explore a massive procedurally-generated Japanese castle that stretches infinitely in all directions.

## Features

### Architecture
- **700+ Japanese-style buildings** with multi-floor structures, verandas, railings, scaffolding
- **Mirror symmetry**: buildings above center are upside-down (anime-accurate)
- **L-shaped corridors** connecting buildings at right angles
- **4 building styles**: pagoda, grand, hip roof, simple — with varied proportions
- **Kiyomizu-dera style wooden scaffolds** supporting buildings
- **Geometry merging** for 60fps performance (thousands of meshes merged into ~6 draw calls)

### 7 Cinematic Events
| Event | Description |
|-------|-------------|
| **Nakime's Biwa** | Fall through the castle as the floor opens |
| **Tanjiro & Giyu vs Akaza** | Upside-down rescue, 30-second corridor run, circle combat |
| **Shinobu vs Doma** | Butterfly dance, ice fan attacks, poison activation |
| **Muichiro vs Kokushibo** | Moon breathing, world-flip, 6-eyed demon |
| **Zenitsu vs Kaigaku** | Thunderclap Flash God with lightning dragon & afterimages |
| **Tanjiro vs Muzan** | Castle collapse, multi-flip, tentacle combat |
| **Crow's Eye Recon** | Fly through the entire castle as Nakime's surveillance crow |

### Characters (10)
Detailed 3D models with character-specific features:
- **Tanjiro** — Custom GLB 3D model with vertex-colored checkered haori
- **Giyu** — Half-red/half-patterned haori, water breathing blade
- **Akaza** — Blue destruction lines, glowing fists, muscular build
- **Shinobu** — Butterfly wings (4 panels), thin stinger blade
- **Doma** — Golden hair, ice fans with ribs, lotus hat
- **Muichiro** — Mint hair, mist breathing blade
- **Kokushibo** — 6 glowing eyes, moon crescent marks, oversized blade
- **Zenitsu** — Lightning blade, orange-tipped hair
- **Kaigaku** — Dark thunder blade, demon marks
- **Muzan** — White suit, fedora, red eyes, 6 tentacles

### Atmosphere
- **12 surveillance crows** with glowing red eyes flying through the castle
- **3000 ember particles** floating upward
- **Central warm glow core** with pulsing light
- **Procedural BGM**: biwa plucks, shamisen rhythm, taiko drums, ambient drone, wind
- **Speed lines + FOV breathing** during fast camera movements

### Controls
- **Auto Tour**: select an event and watch the cinematic
- **Manual**: click to take control, WASD to move, mouse to look
- **Music**: toggle button (top-right)
- **Language**: Korean / Japanese / English

## Tech Stack

- **Three.js** (r170) — 3D rendering
- **Vite** — build tool
- **Web Audio API** — procedural music generation
- **GLTFLoader** — custom 3D model loading
- **BufferGeometryUtils.mergeGeometries** — performance optimization
- **Vercel** — deployment

## Performance

The castle contains 700+ buildings with detailed multi-floor structures, but runs at 60fps thanks to:
- All static geometry merged by material into ~6 draw calls
- Shared geometry instances (BoxGeometry cache)
- No shadows, limited point lights
- Particle updates every other frame

## Run Locally

```bash
git clone https://github.com/HongwooKim/infinity-castle.git
cd infinity-castle
npm install
npm run dev
```

## Disclaimer

This is a **fan-made, non-commercial** project inspired by Demon Slayer: Kimetsu no Yaiba. All character names and designs belong to Koyoharu Gotouge, Shueisha, and ufotable. This project is created purely for educational and artistic purposes.

## License

MIT (code only — character designs are not covered)
