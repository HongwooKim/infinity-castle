import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============ LOADING ============
const loadBar = document.getElementById('load-bar');
const loadText = document.getElementById('load-text');
function setLoad(pct, msg) {
  if (loadBar) loadBar.style.width = pct + '%';
  if (loadText) loadText.textContent = msg;
}
// Yield to browser so loading bar can repaint
function yieldFrame() { return new Promise(r => setTimeout(r, 0)); }
setLoad(5, 'Initializing...');
// Detect mobile — reduce building count
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

// ============ SCENE ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0400);
scene.fog = new THREE.FogExp2(0x1a0800, 0.003);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false }); // no AA for perf
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.0;
document.body.appendChild(renderer.domElement);

// ============ SEEDED RANDOM ============
let seed = 777;
function srand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// ============ GEOMETRY COLLECTORS (merge by material) ============
// Instead of creating individual meshes, collect geometries and merge at the end
const geoCollectors = {
  darkWood: [],   // building bodies, pillars, frames
  wood: [],       // floors, beams, bridges, stairs
  window: [],     // glowing window panels
  roof: [],       // roof pieces
  frame: [],      // thin frames, railings
};

const tempMatrix = new THREE.Matrix4();
const tempQuat = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempPos = new THREE.Vector3();
const tempEuler = new THREE.Euler();

function addGeo(collector, geometry, x, y, z, rx, ry, rz) {
  const geo = geometry.clone();
  tempEuler.set(rx || 0, ry || 0, rz || 0);
  tempQuat.setFromEuler(tempEuler);
  tempPos.set(x, y, z);
  tempScale.set(1, 1, 1);
  tempMatrix.compose(tempPos, tempQuat, tempScale);
  geo.applyMatrix4(tempMatrix);
  collector.push(geo);
}

// Pre-create reusable geometries
const boxGeos = {};
function getBox(w, h, d) {
  const key = `${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
  if (!boxGeos[key]) boxGeos[key] = new THREE.BoxGeometry(w, h, d);
  return boxGeos[key];
}
const planeGeos = {};
function getPlane(w, h) {
  const key = `${w.toFixed(2)}_${h.toFixed(2)}`;
  if (!planeGeos[key]) planeGeos[key] = new THREE.PlaneGeometry(w, h);
  return planeGeos[key];
}

// ============ BUILDING GENERATOR (wide, horizontal Japanese structures) ============
function addBuilding(ox, oy, oz, w, h, d, rotY, rotX, rotZ, scaffoldH) {
  const bEuler = new THREE.Euler(rotX || 0, rotY || 0, rotZ || 0);
  const bQuat = new THREE.Quaternion().setFromEuler(bEuler);
  const bPos = new THREE.Vector3(ox, oy, oz);

  function addLocal(collector, geo, lx, ly, lz, lrx, lry, lrz) {
    const g = geo.clone();
    const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(lrx || 0, lry || 0, lrz || 0));
    const finalQ = bQuat.clone().multiply(localQ);
    const finalP = new THREE.Vector3(lx, ly, lz).applyQuaternion(bQuat).add(bPos);
    tempMatrix.compose(finalP, finalQ, tempScale);
    g.applyMatrix4(tempMatrix);
    collector.push(g);
  }

  // === SCAFFOLD SUPPORT (Kiyomizu-style dense wooden framework) ===
  const sh = scaffoldH || 0;
  if (sh > 1) {
    const postSpX = Math.min(1.8, w / 3);
    const postSpZ = Math.min(1.8, d / 2);
    // Vertical posts in dense grid
    for (let px = -w / 2 + 0.3; px <= w / 2 - 0.2; px += postSpX) {
      for (let pz = -d / 2 + 0.3; pz <= d / 2 - 0.2; pz += postSpZ) {
        addLocal(geoCollectors.frame, getBox(0.12, sh, 0.12), px, -sh / 2, pz);
      }
    }
    // Horizontal cross beams every 1.5 units
    for (let bh = 1.2; bh < sh; bh += 1.5) {
      // X-direction beams
      for (let pz = -d / 2 + 0.3; pz <= d / 2 - 0.2; pz += postSpZ) {
        addLocal(geoCollectors.frame, getBox(w * 0.95, 0.06, 0.06), 0, -bh, pz);
      }
      // Z-direction beams
      for (let px = -w / 2 + 0.3; px <= w / 2 - 0.2; px += postSpX) {
        addLocal(geoCollectors.frame, getBox(0.06, 0.06, d * 0.95), px, -bh, 0);
      }
      // Diagonal braces (2 per level)
      if (srand() > 0.3) {
        const braceLen = Math.sqrt(postSpX * postSpX + 2.25);
        const braceX = (srand() - 0.5) * w * 0.5;
        addLocal(geoCollectors.frame, getBox(0.05, braceLen, 0.05), braceX, -bh + 0.75, d * 0.15, 0, 0, 0.55);
        addLocal(geoCollectors.frame, getBox(0.05, braceLen, 0.05), braceX, -bh + 0.75, -d * 0.15, 0, 0, -0.55);
      }
    }
  }

  // === BUILDING STYLE VARIATION ===
  const style = srand();
  // Vary floor height by style
  const floorH = style < 0.3 ? (0.8 + srand() * 0.3) :   // compact: low floors
                 style < 0.5 ? (1.5 + srand() * 0.5) :   // grand: tall floors
                 (1.0 + srand() * 0.5);                    // normal
  const numFloors = Math.max(1, Math.round(h / floorH));
  const totalH = numFloors * floorH;
  const hasVeranda = style < 0.8; // 80% have veranda
  const hasClosed = style > 0.6 && style < 0.75; // some fully enclosed
  const winDensity = style < 0.3 ? 0.35 : style < 0.6 ? 0.55 : 0.45; // spacing
  const winChance = style < 0.4 ? 0.95 : 0.8; // how many windows lit

  for (let floor = 0; floor < numFloors; floor++) {
    const fy = floor * floorH;

    // Floor platform + edge trim
    addLocal(geoCollectors.wood, getBox(w + 0.2, 0.08, d + 0.2), 0, fy, 0);
    // Floor edge highlight (bright line)
    addLocal(geoCollectors.wood, getBox(w + 0.3, 0.03, 0.04), 0, fy + 0.04, d / 2 + 0.1);
    addLocal(geoCollectors.wood, getBox(w + 0.3, 0.03, 0.04), 0, fy + 0.04, -d / 2 - 0.1);
    // Plank lines
    for (let lx = -w / 2 + 0.6; lx < w / 2; lx += 0.6) {
      addLocal(geoCollectors.frame, getBox(0.012, 0.09, d), lx, fy, 0);
    }

    // Walls: back + sides (vary by style)
    addLocal(geoCollectors.darkWood, getBox(w, floorH, 0.08), 0, fy + floorH / 2, -d / 2);
    if (hasClosed) {
      // Fully enclosed: all 4 walls
      addLocal(geoCollectors.darkWood, getBox(0.08, floorH, d), -w / 2, fy + floorH / 2, 0);
      addLocal(geoCollectors.darkWood, getBox(0.08, floorH, d), w / 2, fy + floorH / 2, 0);
      addLocal(geoCollectors.darkWood, getBox(w, floorH, 0.08), 0, fy + floorH / 2, d / 2);
    } else {
      // Partial side walls
      addLocal(geoCollectors.darkWood, getBox(0.08, floorH, d * 0.4), -w / 2, fy + floorH / 2, -d * 0.3);
      addLocal(geoCollectors.darkWood, getBox(0.08, floorH, d * 0.4), w / 2, fy + floorH / 2, -d * 0.3);
    }

    // Internal dividing walls
    const numPartitions = Math.max(0, Math.floor(w / 4));
    for (let p = 1; p <= numPartitions; p++) {
      if (srand() > 0.5) {
        const px2 = -w / 2 + p * (w / (numPartitions + 1));
        addLocal(geoCollectors.darkWood, getBox(0.05, floorH, d * 0.5), px2, fy + floorH / 2, -d * 0.25);
      }
    }

    // Pillars: front row, interior row, back row
    const pillarSp = Math.min(1.5, w / 4);
    for (let px = -w / 2; px <= w / 2 + 0.01; px += pillarSp) {
      addLocal(geoCollectors.frame, getBox(0.1, floorH, 0.1), px, fy + floorH / 2, d / 2);
      addLocal(geoCollectors.frame, getBox(0.07, floorH, 0.07), px, fy + floorH / 2, d / 2 - 1.0);
      addLocal(geoCollectors.frame, getBox(0.07, floorH, 0.07), px, fy + floorH / 2, -d / 2);
    }

    // Horizontal beams (kamoi + nageshi) at top and mid
    addLocal(geoCollectors.wood, getBox(w, 0.05, 0.07), 0, fy + floorH, d / 2);
    addLocal(geoCollectors.wood, getBox(w, 0.05, 0.07), 0, fy + floorH, d / 2 - 1.0);
    addLocal(geoCollectors.wood, getBox(w, 0.05, 0.07), 0, fy + floorH, -d / 2);
    // Mid-height beam (長押 nageshi)
    addLocal(geoCollectors.wood, getBox(w, 0.03, 0.05), 0, fy + floorH * 0.65, d / 2);
    addLocal(geoCollectors.wood, getBox(w, 0.03, 0.05), 0, fy + floorH * 0.65, -d / 2);

    // Sub-eave overhang between floors (庇 hisashi)
    addLocal(geoCollectors.roof, getBox(w + 0.6, 0.03, d + 0.8), 0, fy + floorH + 0.01, 0.2);
    // Eave edge trim
    addLocal(geoCollectors.frame, getBox(w + 0.7, 0.025, 0.03), 0, fy + floorH + 0.02, d / 2 + 0.6);

    // Veranda/balcony (style-dependent)
    if (hasVeranda) {
      const vDepth = 0.8 + srand() * 0.5;
      addLocal(geoCollectors.wood, getBox(w + 0.5, 0.05, vDepth), 0, fy, d / 2 + vDepth / 2);
      // Veranda plank lines
      for (let lx = -w / 2; lx <= w / 2; lx += 0.4) {
        addLocal(geoCollectors.frame, getBox(0.01, 0.055, vDepth), lx, fy, d / 2 + vDepth / 2);
      }
      // Railing variations
      const railZ = d / 2 + vDepth;
      if (style < 0.5) {
        // Dense baluster railing
        addLocal(geoCollectors.frame, getBox(w + 0.5, 0.03, 0.03), 0, fy + 0.65, railZ);
        addLocal(geoCollectors.frame, getBox(w + 0.5, 0.02, 0.02), 0, fy + 0.15, railZ);
        for (let rx = -w / 2; rx <= w / 2 + 0.01; rx += 0.25) {
          addLocal(geoCollectors.frame, getBox(0.015, 0.7, 0.015), rx, fy + 0.35, railZ);
        }
      } else {
        // Simpler railing with cross pattern
        addLocal(geoCollectors.frame, getBox(w + 0.5, 0.04, 0.04), 0, fy + 0.7, railZ);
        addLocal(geoCollectors.frame, getBox(w + 0.5, 0.03, 0.03), 0, fy + 0.35, railZ);
        for (let rx = -w / 2; rx <= w / 2 + 0.01; rx += 0.6) {
          addLocal(geoCollectors.frame, getBox(0.025, 0.75, 0.025), rx, fy + 0.37, railZ);
        }
      }
    }

    // === WINDOWS: style-varied density ===
    const winSp = winDensity;
    const winW2 = style < 0.3 ? 0.25 : style < 0.6 ? 0.4 : 0.32; // small/large/medium
    const winH2 = floorH * (style < 0.3 ? 0.5 : style < 0.5 ? 0.75 : 0.6);
    // Front
    for (let wx = -w / 2 + 0.3; wx < w / 2 - 0.1; wx += winSp) {
      if (srand() < winChance) {
        addLocal(geoCollectors.window, getPlane(winW2, winH2), wx, fy + floorH * 0.4, d / 2 - (hasVeranda ? 0.98 : 0.01));
      }
    }
    // Back
    for (let wx = -w / 2 + 0.3; wx < w / 2 - 0.1; wx += winSp) {
      if (srand() < winChance * 0.8) {
        addLocal(geoCollectors.window, getPlane(winW2, winH2), wx, fy + floorH * 0.4, -d / 2 - 0.01, 0, Math.PI);
      }
    }
    // Sides
    for (let wz = -d / 2 + 0.3; wz < d / 2 - 0.1; wz += winSp) {
      if (srand() < winChance * 0.7) {
        addLocal(geoCollectors.window, getPlane(winW2, winH2), -w / 2 - 0.01, fy + floorH * 0.4, wz, 0, -Math.PI / 2);
      }
      if (srand() < winChance * 0.7) {
        addLocal(geoCollectors.window, getPlane(winW2, winH2), w / 2 + 0.01, fy + floorH * 0.4, wz, 0, Math.PI / 2);
      }
    }
    // Window frames
    for (let wx = -w / 2 + 0.3; wx < w / 2 - 0.1; wx += winSp) {
      addLocal(geoCollectors.frame, getBox(0.015, winH2, 0.015), wx + winW2 / 2 + 0.02, fy + floorH * 0.4, d / 2 - 0.97);
    }
  }

  // === ROOF (style-varied) ===
  const roofStyle = srand();
  const roofOH = 0.6 + srand() * 0.4;

  function addRoofLayer(ry, rw, rd, rh) {
    addLocal(geoCollectors.roof, getBox(rw, 0.05, rd), 0, ry, 0.1);
    // Fascia edges
    addLocal(geoCollectors.frame, getBox(rw + 0.1, 0.05, 0.03), 0, ry + 0.03, rd / 2);
    addLocal(geoCollectors.frame, getBox(rw + 0.1, 0.05, 0.03), 0, ry + 0.03, -rd / 2);
    // Slopes
    const sl = Math.sqrt(rh * rh + (rd / 2) ** 2);
    const sa = Math.atan2(rh, rd / 2);
    addLocal(geoCollectors.roof, getBox(rw, 0.035, sl), 0, ry + rh / 2, rd / 4, -sa);
    addLocal(geoCollectors.roof, getBox(rw, 0.035, sl), 0, ry + rh / 2, -rd / 4, sa);
    // Ridge
    addLocal(geoCollectors.frame, getBox(rw + 0.1, 0.05, 0.05), 0, ry + rh, 0);
    // Tile lines
    for (let rt = 0.3; rt < 0.8; rt += 0.25) {
      addLocal(geoCollectors.frame, getBox(rw * 0.9, 0.012, 0.012), 0, ry + rh * rt, rd / 4 * rt);
    }
  }

  if (roofStyle < 0.2 && numFloors >= 2) {
    // PAGODA: multi-tier stepped roofs (smaller each tier)
    for (let tier = 0; tier < Math.min(numFloors, 3); tier++) {
      const tw = w * (1 - tier * 0.25) + roofOH * 2;
      const td = d * (1 - tier * 0.25) + roofOH * 2;
      const ty = totalH + tier * 0.8;
      addRoofLayer(ty, tw, td, 0.5);
    }
  } else if (roofStyle < 0.5) {
    // GRAND: single large roof with wide overhang
    addRoofLayer(totalH, w + roofOH * 3, d + roofOH * 3 + 1.0, 0.6 + srand() * 0.3);
  } else if (roofStyle < 0.7) {
    // HIP ROOF: two-layer (main + smaller upper)
    addRoofLayer(totalH, w + roofOH * 2, d + roofOH * 2, 0.4);
    addRoofLayer(totalH + 0.5, w * 0.6 + roofOH, d * 0.6 + roofOH, 0.5);
  } else {
    // SIMPLE: standard single roof
    addRoofLayer(totalH, w + roofOH * 2, d + roofOH * 2 + 0.5, 0.4 + srand() * 0.2);
  }

  // === DECORATIVE ELEMENTS (style-varied) ===
  // Small lanterns on veranda
  if (hasVeranda && srand() > 0.4) {
    const lFloor = Math.floor(srand() * numFloors);
    for (let lx = -w / 2 + 1; lx < w / 2; lx += 1.5 + srand() * 2) {
      addLocal(geoCollectors.window, getPlane(0.12, 0.18),
        lx, lFloor * floorH + 0.75, d / 2 + 0.8);
    }
  }
  // Corner accent posts on some buildings
  if (style > 0.5 && srand() > 0.5) {
    for (const [cx, cz] of [[-w/2 - 0.1, d/2 + 0.1], [w/2 + 0.1, d/2 + 0.1]]) {
      addLocal(geoCollectors.frame, getBox(0.06, totalH + 0.5, 0.06), cx, totalH / 2, cz);
    }
  }
  // Sub-building on top (tower/watchtower on some large buildings)
  if (w > 8 && srand() > 0.7) {
    const tw = 1.5 + srand() * 2, tH = 1.5 + srand(), td = 1.5 + srand();
    const tx = (srand() - 0.5) * (w - tw) * 0.6;
    addLocal(geoCollectors.darkWood, getBox(tw, tH, td), tx, totalH + tH / 2, 0);
    // Mini windows
    for (let mw = -tw/2 + 0.2; mw < tw/2; mw += 0.35) {
      addLocal(geoCollectors.window, getPlane(0.22, tH * 0.6), mw, totalH + tH * 0.4, td / 2 + 0.01);
    }
    // Mini roof
    addLocal(geoCollectors.roof, getBox(tw + 0.6, 0.04, td + 0.6), tx, totalH + tH + 0.02, 0);
    addLocal(geoCollectors.frame, getBox(tw + 0.5, 0.04, 0.04), tx, totalH + tH + 0.25, 0);
  }
}

// Corridor connecting two points
// Straight segment helper (axis-aligned)
function addCorridorSegment(x, y, z, len, cw, axis) {
  // axis: 'x' = runs along X, 'z' = runs along Z
  if (len < 0.3) return;
  const absLen = Math.abs(len);
  const mid = len / 2;
  if (axis === 'x') {
    addGeo(geoCollectors.wood, getBox(absLen, 0.06, cw), x + mid, y, z);
    addGeo(geoCollectors.frame, getBox(absLen, 0.5, 0.04), x + mid, y + 0.3, z + cw / 2);
    addGeo(geoCollectors.frame, getBox(absLen, 0.5, 0.04), x + mid, y + 0.3, z - cw / 2);
    for (let t = 0; t <= absLen; t += 1.5) {
      const px = x + (len > 0 ? t : -t);
      addGeo(geoCollectors.frame, getBox(0.04, 0.55, 0.04), px, y + 0.3, z + cw / 2);
      addGeo(geoCollectors.frame, getBox(0.04, 0.55, 0.04), px, y + 0.3, z - cw / 2);
    }
  } else {
    addGeo(geoCollectors.wood, getBox(cw, 0.06, absLen), x, y, z + mid);
    addGeo(geoCollectors.frame, getBox(0.04, 0.5, absLen), x + cw / 2, y + 0.3, z + mid);
    addGeo(geoCollectors.frame, getBox(0.04, 0.5, absLen), x - cw / 2, y + 0.3, z + mid);
    for (let t = 0; t <= absLen; t += 1.5) {
      const pz = z + (len > 0 ? t : -t);
      addGeo(geoCollectors.frame, getBox(0.04, 0.55, 0.04), x + cw / 2, y + 0.3, pz);
      addGeo(geoCollectors.frame, getBox(0.04, 0.55, 0.04), x - cw / 2, y + 0.3, pz);
    }
  }
}

// L-shaped corridor: go along X first, then Z (right-angle turn)
function addCorridor(x1, y1, z1, x2, y2, z2, corridorW) {
  const cw = corridorW || 1.5;
  const dx = x2 - x1, dz = z2 - z1;
  if (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5) return;

  // Use average Y (corridors are flat, stairs handle height changes)
  const cy = (y1 + y2) / 2;

  // If height difference is large, add vertical stairs section
  const dy = y2 - y1;
  if (Math.abs(dy) > 1) {
    // Stairs: vertical pillar + platforms at top and bottom
    const stairX = x1 + dx * 0.5;
    const stairZ = z1;
    addGeo(geoCollectors.frame, getBox(0.15, Math.abs(dy), 0.15), stairX, (y1 + y2) / 2, stairZ);
  }

  // L-shape: first leg along X, second leg along Z
  // Corner point
  const cornerX = x2;
  const cornerZ = z1;

  // Leg 1: X direction (from start to corner)
  if (Math.abs(dx) > 0.5) {
    addCorridorSegment(x1, cy, z1, dx, cw, 'x');
  }
  // Leg 2: Z direction (from corner to end)
  if (Math.abs(dz) > 0.5) {
    addCorridorSegment(cornerX, cy, z1, dz, cw, 'z');
  }
  // Corner floor plate
  if (Math.abs(dx) > 0.5 && Math.abs(dz) > 0.5) {
    addGeo(geoCollectors.wood, getBox(cw + 0.2, 0.06, cw + 0.2), cornerX, cy, cornerZ);
  }
}

// ============ BUILD INFINITY CASTLE ============
const SHAFT_W = 40;
const SHAFT_D = 40;
const SHAFT_HEIGHT = 120;

// Store building positions for connecting them
const buildingPositions = [];

// Wall buildings: wide structures on 4 walls, with scaffold supports
function placeWallBuildings(wallAxis, wallPos, wallDir, rows, cols, heightRange) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Varied proportions: wide/narrow/square mix
      const propStyle = srand();
      const w = propStyle < 0.4 ? (8 + srand() * 10) :   // wide pavilion
                propStyle < 0.6 ? (3 + srand() * 4) :     // narrow tower
                (5 + srand() * 6);                          // medium
      const h = propStyle < 0.4 ? (1.5 + srand() * 1.5) : // low
                propStyle < 0.6 ? (3 + srand() * 4) :      // tall
                (2 + srand() * 2.5);                        // medium
      const d = propStyle < 0.4 ? (4 + srand() * 4) :     // deep
                propStyle < 0.6 ? (2 + srand() * 2) :      // shallow
                (3 + srand() * 3);                          // medium
      const spanH = heightRange[1] - heightRange[0];
      const spanW = wallAxis === 'x' ? SHAFT_D * 2 : SHAFT_W * 2;
      const gridY = heightRange[0] + (row / rows) * spanH + srand() * (spanH / rows) * 0.3;
      const gridAlong = -spanW / 2 + (col / cols) * spanW + srand() * (spanW / cols) * 0.2;
      const protrude = 1 + srand() * 4;

      let bx, bz;
      if (wallAxis === 'x') {
        bx = wallPos + (wallPos > 0 ? -protrude : protrude);
        bz = gridAlong;
      } else {
        bx = gridAlong;
        bz = wallPos + (wallPos > 0 ? -protrude : protrude);
      }

      // ABOVE CENTER = UPSIDE DOWN (mirror symmetry like the anime)
      let rotX = gridY > 0 ? Math.PI : 0;

      // Scaffold height
      const scaffH = protrude * 2 + srand() * 3;

      addBuilding(bx, gridY, bz, w, h, d, wallDir, rotX, 0, scaffH);
      buildingPositions.push({ x: bx, y: gridY, z: bz });
    }
  }
}

// Materials + castle group (global — used by arenas, characters etc.)
const materials = {
  darkWood: new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.9, metalness: 0.02 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.85, metalness: 0.02 }),
  window: new THREE.MeshStandardMaterial({
    color: 0xffcc66, emissive: 0xff9933, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.7, metalness: 0.1 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.8, metalness: 0.05 }),
};
const castle = new THREE.Group();
scene.add(castle);

// Yield to browser between heavy steps
async function buildCastle() {
const WR = isMobile ? 8 : 20; // wall rows
const WC = isMobile ? 4 : 10; // wall cols
setLoad(10, 'Generating wall buildings...');
placeWallBuildings('x', SHAFT_W, Math.PI, WR, WC, [-55, 50]);
await yieldFrame();
setLoad(18, 'Wall 2/4...');
placeWallBuildings('x', -SHAFT_W, 0, WR, WC, [-55, 50]);
await yieldFrame();
setLoad(26, 'Wall 3/4...');
placeWallBuildings('z', SHAFT_D, -Math.PI / 2, WR, WC, [-55, 50]);
await yieldFrame();
setLoad(34, 'Wall 4/4...');
placeWallBuildings('z', -SHAFT_D, Math.PI / 2, WR, WC, [-55, 50]);
await yieldFrame();

setLoad(40, 'Generating floors...');
await yieldFrame();
const FG = isMobile ? 4 : 8; // floor grid size
for (let gx = 0; gx < FG; gx++) {
  for (let gz = 0; gz < FG; gz++) {
    const w = 5 + srand() * 8, h = 2 + srand() * 2, d = 3 + srand() * 4;
    const bx = -SHAFT_W + 5 + gx * 10 + srand() * 2;
    const bz = -SHAFT_D + 5 + gz * 10 + srand() * 2;
    addBuilding(bx, -55, bz, w, h, d, srand() * Math.PI * 0.5, 0, 0, 3 + srand() * 5);
    buildingPositions.push({ x: bx, y: -55, z: bz });
  }
}
await yieldFrame();
setLoad(48, 'Generating ceiling...');
for (let gx = 0; gx < FG; gx++) {
  for (let gz = 0; gz < FG; gz++) {
    const w = 5 + srand() * 8, h = 2 + srand() * 2, d = 3 + srand() * 4;
    const bx = -SHAFT_W + 5 + gx * 10 + srand() * 2;
    const bz = -SHAFT_D + 5 + gz * 10 + srand() * 2;
    addBuilding(bx, 52, bz, w, h, d, srand() * Math.PI * 0.5, Math.PI, 0, 3 + srand() * 5);
    buildingPositions.push({ x: bx, y: 52, z: bz });
  }
}

await yieldFrame();
setLoad(55, 'Generating inner platforms...');
const innerLevels = isMobile ? 6 : 15;
for (let level = 0; level < innerLevels; level++) {
  const y = -50 + level * 7;
  // Skip the battle arena zone — keep center clear for combat
  if (y > -15 && y < 20) continue;
  const numInner = 4 + Math.floor(srand() * 4);
  for (let i = 0; i < numInner; i++) {
    const w = 5 + srand() * 8, h = 2 + srand() * 2, d = 3 + srand() * 4;
    const rx = y > 0 ? Math.PI : 0;
    const rz = srand() > 0.8 ? (srand() - 0.5) * 0.2 : 0;
    const bx = (srand() - 0.5) * SHAFT_W * 1.0;
    const bz = (srand() - 0.5) * SHAFT_D * 1.0;
    addBuilding(bx, y + srand() * 5, bz, w, h, d, srand() * Math.PI * 2, rx, rz, 4 + srand() * 6);
    buildingPositions.push({ x: bx, y: y, z: bz });
  }
}

setLoad(55, 'Connecting corridors...');
await yieldFrame();
// === CONNECT BUILDINGS with corridors ===
// Connect nearby buildings
for (let i = 0; i < buildingPositions.length; i++) {
  const a = buildingPositions[i];
  for (let j = i + 1; j < buildingPositions.length; j++) {
    const b = buildingPositions[j];
    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    if (dist < 18 && dist > 2 && srand() > 0.4) {
      addCorridor(a.x, a.y, a.z, b.x, b.y, b.z, 1.2 + srand() * 0.5);
    }
  }
}

// Staircases connecting levels
for (let i = 0; i < 20; i++) {
  const steps = 10 + Math.floor(srand() * 15);
  const stepW = 2 + srand();
  const sx = (srand() - 0.5) * SHAFT_W * 1.5;
  const sy = -50 + srand() * 100;
  const sz = (srand() - 0.5) * SHAFT_D * 1.5;
  const sry = srand() * Math.PI * 2;
  const srz = srand() > 0.6 ? (srand() - 0.5) * Math.PI * 0.3 : 0;
  const sQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sry, srz));
  const sP = new THREE.Vector3(sx, sy, sz);
  for (let s = 0; s < steps; s++) {
    const localP = new THREE.Vector3(0, s * 0.25, s * 0.3).applyQuaternion(sQ).add(sP);
    addGeo(geoCollectors.wood, getBox(stepW, 0.08, 0.35), localP.x, localP.y, localP.z, 0, sry, srz);
  }
}

// Vertical pillars running through shaft
for (let i = 0; i < 30; i++) {
  const h = 20 + srand() * 50;
  addGeo(geoCollectors.frame, getBox(0.2, h, 0.2),
    (srand() - 0.5) * SHAFT_W * 1.8, (srand() - 0.5) * 30, (srand() - 0.5) * SHAFT_D * 1.8);
}

// Horizontal beams
for (let i = 0; i < 20; i++) {
  const len = 15 + srand() * 40;
  addGeo(geoCollectors.frame, getBox(len, 0.12, 0.12),
    (srand() - 0.5) * 20, -50 + srand() * 100, (srand() - 0.5) * 20, 0, srand() * Math.PI);
}

// ============ MERGE ALL GEOMETRIES ============
setLoad(65, 'Merging geometry...');
await yieldFrame();
console.time('merge');

const matNames = Object.keys(geoCollectors);
for (let mi = 0; mi < matNames.length; mi++) {
  const name = matNames[mi];
  const geos = geoCollectors[name];
  if (geos.length === 0) continue;
  setLoad(65 + Math.round((mi / matNames.length) * 20), `Merging ${name}...`);
  await yieldFrame();
  const CHUNK = 500;
  for (let start = 0; start < geos.length; start += CHUNK) {
    const chunk = geos.slice(start, start + CHUNK);
    const merged = mergeGeometries(chunk, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, materials[name]);
      castle.add(mesh);
    }
    for (const g of chunk) g.dispose();
  }
}
console.timeEnd('merge');
setLoad(90, 'Creating characters...');
await yieldFrame();
} // end buildCastle

// ============ NAKIME'S ROOM (separate group, small) ============
const nakimeRoom = new THREE.Group();
nakimeRoom.position.set(0, 55, 0);

const darkWoodMat = materials.darkWood;
const frameMat = materials.frame;

// Room floor
nakimeRoom.add(new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 8),
  new THREE.MeshStandardMaterial({ color: 0x7a8a32, roughness: 0.95 })));

// Pillars
for (const [px, pz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), darkWoodMat);
  p.position.set(px, 2, pz); nakimeRoom.add(p);
}

// Fusuma
const fusumaMat = new THREE.MeshStandardMaterial({
  color: 0xf0d8a0, emissive: 0xeec880, emissiveIntensity: 0.3, roughness: 0.8, side: THREE.DoubleSide,
});
for (let i = 0; i < 4; i++) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.5), fusumaMat);
  panel.position.set(-2.8 + i * 1.8, 1.3, -3.5); nakimeRoom.add(panel);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 0.05), frameMat);
  frame.position.set(-2.8 + i * 1.8, 1.3, -3.48); nakimeRoom.add(frame);
}
// Top light
const tl = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.1),
  new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 }));
tl.position.set(0, 3.2, -3.5); nakimeRoom.add(tl);
for (let i = 0; i < 5; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.06), frameMat);
  bar.position.set(-2.5 + i * 1.2, 3.2, -3.45); nakimeRoom.add(bar);
}
// Walls
for (const x of [-4, 4]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 8), darkWoodMat);
  wall.position.set(x, 2, 0); nakimeRoom.add(wall);
}
// Room lights
const rl1 = new THREE.PointLight(0xffaa44, 3, 15, 1.5); rl1.position.set(0, 3, 0); nakimeRoom.add(rl1);
const rl2 = new THREE.PointLight(0xff8833, 2, 10, 1.5); rl2.position.set(0, 1, -2); nakimeRoom.add(rl2);

// Nakime silhouette
const nakime = new THREE.Group();
nakime.position.set(0, 0.05, 0);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.9, 6), bodyMat);
torso.position.y = 0.55; nakime.add(torso);
const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.5), bodyMat);
base.position.y = 0.1; nakime.add(base);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), bodyMat);
head.position.y = 1.15; nakime.add(head);
const hairMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 });
const hair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), hairMat);
hair.position.set(0, 0.85, -0.05); nakime.add(hair);
const hairF = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.15), hairMat);
hairF.position.set(0, 1.0, 0.12); nakime.add(hairF);
// Biwa
const biwaMat2 = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.6, metalness: 0.1 });
const biwaBody = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), biwaMat2);
biwaBody.scale.set(0.7, 1, 0.3); biwaBody.position.set(0.2, 0.7, 0.15);
biwaBody.rotation.z = -0.3; nakime.add(biwaBody);
const biwaNeck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.03), biwaMat2);
biwaNeck.position.set(0.2, 1.05, 0.13); biwaNeck.rotation.z = -0.3; nakime.add(biwaNeck);
nakimeRoom.add(nakime);
castle.add(nakimeRoom);

// ============ LIGHTS (reduced count, larger range) ============
scene.add(new THREE.AmbientLight(0xcc8855, 0.6));
scene.add(new THREE.HemisphereLight(0xff9944, 0x331100, 0.8));

const dir1 = new THREE.DirectionalLight(0xff8833, 0.8);
dir1.position.set(30, 40, 20); scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xff6622, 0.5);
dir2.position.set(-20, -30, -15); scene.add(dir2);

// Central glow
const coreLight = new THREE.PointLight(0xff8844, 8, 120, 1.0);
scene.add(coreLight);
const coreLight2 = new THREE.PointLight(0xffaa55, 5, 80, 1.2);
coreLight2.position.y = 10; scene.add(coreLight2);
const coreLight3 = new THREE.PointLight(0xff6633, 5, 80, 1.2);
coreLight3.position.y = -10; scene.add(coreLight3);

// Core orb
const coreOrb = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8),
  new THREE.MeshStandardMaterial({ color: 0xff8844, emissive: 0xff6622, emissiveIntensity: 2, transparent: true, opacity: 0.15 }));
scene.add(coreOrb);

// Glow band
const glowMat = new THREE.MeshStandardMaterial({
  color: 0xff7733, emissive: 0xff5511, emissiveIntensity: 1.5, transparent: true, opacity: 0.08, side: THREE.DoubleSide
});
const gb1 = new THREE.Mesh(new THREE.PlaneGeometry(200, 8), glowMat);
gb1.rotation.x = Math.PI / 2; scene.add(gb1);
const gb2 = gb1.clone(); gb2.rotation.x = 0; gb2.rotation.y = 0; scene.add(gb2);

// Fewer, stronger point lights (8 instead of 30+)
const lightColors = [0xff8833, 0xff6622, 0xffaa44, 0xff5511];
for (let level = 0; level < 6; level++) {
  const y = -40 + level * 18;
  for (const pos of [[SHAFT_W - 5, y, 0], [-SHAFT_W + 5, y, 0], [0, y, SHAFT_D - 5], [0, y, -SHAFT_D + 5]]) {
    const pl = new THREE.PointLight(lightColors[level % 4], 2.5, 50, 1.0);
    pl.position.set(...pos); scene.add(pl);
  }
}

// ============ PARTICLES ============
const pCount = isMobile ? 500 : 3000;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(pCount * 3);
const pColors = new Float32Array(pCount * 3);
for (let i = 0; i < pCount; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * SHAFT_W * 2;
  pPos[i * 3 + 1] = (Math.random() - 0.5) * SHAFT_HEIGHT;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * SHAFT_D * 2;
  const b = 0.5 + Math.random() * 0.5;
  pColors[i * 3] = b; pColors[i * 3 + 1] = b * 0.5; pColors[i * 3 + 2] = b * 0.1;
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.15, transparent: true, opacity: 0.6,
  blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
}));
scene.add(particles);

// ============ CROWS (나키메의 눈 — 정보 수집 까마귀) ============
const NUM_CROWS = isMobile ? 4 : 12;
const crows = [];
const crowMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
const crowEyeMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 1.5 });

for (let i = 0; i < NUM_CROWS; i++) {
  const crow = new THREE.Group();

  // Body (larger — visible from distance)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), crowMat);
  body.scale.set(1, 0.6, 1.8);
  crow.add(body);

  // Head
  const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), crowMat);
  cHead.position.set(0, 0.2, 0.6);
  crow.add(cHead);

  // Beak
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), crowMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.18, 0.85);
  crow.add(beak);

  // Eyes (glowing red — bright, visible from far)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), crowEyeMat);
  eye.position.set(0.12, 0.28, 0.75);
  crow.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = -0.12;
  crow.add(eye2);

  // Eye glow light (so they're visible in darkness)
  const eyeLight = new THREE.PointLight(0xff2200, 2.0, 25, 1.5);
  eyeLight.position.set(0, 0.25, 0.75);
  crow.add(eyeLight);

  // Wings (big, visible)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, side: THREE.DoubleSide })
    );
    wing.position.set(side * 0.5, 0.1, 0);
    wing.rotation.z = side * 0.3;
    wing.name = 'wing';
    wing.userData.side = side;
    crow.add(wing);
  }

  // Tail feathers
  const tail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x080808, side: THREE.DoubleSide })
  );
  tail.position.set(0, 0, -0.7);
  tail.rotation.x = 0.3;
  crow.add(tail);

  // Flight path — half orbit near center, half near walls
  const nearCenter = i < 6;
  crow.userData = {
    cx: nearCenter ? (Math.random() - 0.5) * 15 : (Math.random() - 0.5) * SHAFT_W * 1.0,
    cy: -20 + Math.random() * 50,
    cz: nearCenter ? (Math.random() - 0.5) * 15 : (Math.random() - 0.5) * SHAFT_D * 1.0,
    radius: nearCenter ? 8 + Math.random() * 10 : 10 + Math.random() * 20,
    speed: 0.4 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
    bobSpeed: 0.3 + Math.random() * 0.8,
    bobAmp: 2 + Math.random() * 4,
    flapSpeed: 6 + Math.random() * 5,
  };

  crow.scale.setScalar(3.0 + Math.random() * 1.5);
  scene.add(crow);
  crows.push(crow);
}

// Update crows each frame
function updateCrows(t) {
  for (const crow of crows) {
    const d = crow.userData;
    const angle = t * d.speed + d.phase;

    // Circular orbit path
    const x = d.cx + Math.cos(angle) * d.radius;
    const y = d.cy + Math.sin(t * d.bobSpeed + d.phase) * d.bobAmp;
    const z = d.cz + Math.sin(angle) * d.radius;

    crow.position.set(x, y, z);

    // Face direction of flight
    const nextAngle = angle + 0.05;
    const nx = d.cx + Math.cos(nextAngle) * d.radius;
    const nz = d.cz + Math.sin(nextAngle) * d.radius;
    crow.lookAt(nx, y, nz);

    // Wing flap
    crow.children.forEach(c => {
      if (c.name === 'wing') {
        const flap = Math.sin(t * d.flapSpeed) * 0.6;
        c.rotation.z = c.userData.side * (0.3 + flap);
      }
    });
  }
}

// ============ TANJIRO (falling silhouette) ============
// ============ TANJIRO (3D model from GLB) ============
const tanjiro = new THREE.Group();
tanjiro.visible = false;
scene.add(tanjiro);

const gltfLoader = new GLTFLoader();
gltfLoader.load('/chars/tanjiro.glb', (gltf) => {
  const model = gltf.scene;
  // Target height: 0.8m (half of original 1.6)
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 0.8 / maxDim;
  model.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y = -scaledBox.min.y;
  model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2;
  model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2;

  // Vertex coloring by Y position
  const modelH = 1.9;
  model.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const x = pos.getX(i);
        const ny = y / modelH;
        let r, g2, b;
        if (ny > 0.88) { r=0.29; g2=0.08; b=0.08; }
        else if (ny > 0.78) { r=0.83; g2=0.65; b=0.46; }
        else if (ny > 0.73) { r=0.9; g2=0.88; b=0.85; }
        else if (ny > 0.42) {
          const ck = (Math.floor(x*8)+Math.floor(y*8))%2;
          if (ck===0) { r=0.13; g2=0.40; b=0.27; } else { r=0.08; g2=0.06; b=0.05; }
        }
        else if (ny > 0.38) { r=0.85; g2=0.85; b=0.82; }
        else if (ny > 0.12) { r=0.22; g2=0.13; b=0.09; }
        else if (ny > 0.05) { r=0.88; g2=0.86; b=0.83; }
        else { r=0.55; g2=0.15; b=0.10; }
        colors[i*3]=r; colors[i*3+1]=g2; colors[i*3+2]=b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      child.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
      child.castShadow = true;
    }
  });
  tanjiro.add(model);
}, undefined, (err) => {
  // Fallback
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x2a6644 }));
  fb.position.y = 0.4; tanjiro.add(fb);
});

// ============ CHARACTER FACTORY ============
function createFighter(config) {
  const g = new THREE.Group();
  const { skin, haori, hair, pants, belt, scaleY } = config;
  const skinMat = new THREE.MeshStandardMaterial({ color: skin || 0xd4a574, roughness: 0.8 });
  const haoriMat = new THREE.MeshStandardMaterial({ color: haori || 0x333333, roughness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair || 0x111111, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants || 0x1a1a1a, roughness: 0.85 });
  const beltMat = new THREE.MeshStandardMaterial({ color: belt || 0x2a1a0a, roughness: 0.7 });

  const sy = scaleY || 1;

  // === BODY ===
  // Upper body (kimono top)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45 * sy, 0.22), haoriMat);
  torso.position.set(0, 0.42 * sy, 0); g.add(torso);
  // Haori collar (V-shape front opening)
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.8 });
  const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3 * sy, 0.03), collarMat);
  collarL.position.set(-0.08, 0.48 * sy, 0.11); collarL.rotation.z = 0.15; g.add(collarL);
  const collarR = collarL.clone(); collarR.position.x = 0.08; collarR.rotation.z = -0.15; g.add(collarR);
  // Obi belt
  const obi = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.24), beltMat);
  obi.position.set(0, 0.22 * sy, 0); g.add(obi);

  // === HEAD (more detailed) ===
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skinMat);
  head.position.set(0, 0.78 * sy, 0); g.add(head);
  // Ears
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), skinMat);
    ear.position.set(s * 0.14, 0.76 * sy, 0); g.add(ear);
  }
  // Eyes (small dark spheres)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const s of [-0.045, 0.045]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), eyeMat);
    eye.position.set(s, 0.79 * sy, 0.12); g.add(eye);
  }
  // Nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.02), skinMat);
  nose.position.set(0, 0.76 * sy, 0.13); g.add(nose);
  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), skinMat);
  neck.position.set(0, 0.67 * sy, 0); g.add(neck);

  // === HAIR (base — extras added per character) ===
  // Top hair
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 5), hairMat);
  hairTop.position.set(0, 0.86 * sy, -0.01); hairTop.scale.set(1, 0.7, 1); g.add(hairTop);
  // Back hair
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15 * sy, 0.1), hairMat);
  hairBack.position.set(0, 0.73 * sy, -0.1); g.add(hairBack);

  // === ARMS (upper + forearm + hand) ===
  for (const s of [-1, 1]) {
    // Shoulder
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), haoriMat);
    shoulder.position.set(s * 0.22, 0.6 * sy, 0); g.add(shoulder);
    // Upper arm
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), haoriMat);
    upperArm.position.set(s * 0.28, 0.45 * sy, 0);
    upperArm.name = s < 0 ? 'armL' : 'armR';
    g.add(upperArm);
    // Forearm
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), skinMat);
    forearm.position.set(s * 0.3, 0.28 * sy, 0.03); g.add(forearm);
    // Hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 3), skinMat);
    hand.position.set(s * 0.3, 0.17 * sy, 0.05); g.add(hand);
  }

  // === LEGS (hakama pants) ===
  for (const s of [-0.08, 0.08]) {
    // Upper leg (hakama)
    const uLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.25, 0.14), pantsMat);
    uLeg.position.set(s, 0.02 * sy, 0); g.add(uLeg);
    // Lower leg
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), pantsMat);
    lLeg.position.set(s, -0.2 * sy, 0); g.add(lLeg);
    // Foot (tabi)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 }));
    foot.position.set(s, -0.32 * sy, 0.02); g.add(foot);
  }

  // === SWORD (nihontou) ===
  // Saya (scabbard) at waist
  const saya = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.6, 5),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  saya.position.set(-0.18, 0.1 * sy, -0.1); saya.rotation.z = 0.15; g.add(saya);
  // Blade
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.65, 0.008),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.15 }));
  blade.position.set(0.35, 0.3 * sy, 0.1); blade.rotation.z = 0.3; blade.name = 'sword'; g.add(blade);
  // Tsuba (guard)
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 6),
    new THREE.MeshStandardMaterial({ color: 0x888844, metalness: 0.7 }));
  tsuba.position.set(0.28, 0.15 * sy, 0.1); tsuba.rotation.x = Math.PI / 2; g.add(tsuba);
  // Tsuka (handle wrap)
  const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 5),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }));
  tsuka.position.set(0.24, 0.08 * sy, 0.1); g.add(tsuka);

  if (config.extraFn) config.extraFn(g, skinMat, haoriMat, hairMat);
  g.visible = false;
  scene.add(g);
  return g;
}

// === CHARACTER ROSTER (detailed) ===

// 탄지로 earrings 추가 (tanjiro는 이미 위에서 별도 생성됨 — 여기서는 나머지)

// 기유 — 반반 하오리 (왼쪽 빨강, 오른쪽 기하학 무늬), 긴 검은 머리, 포니테일
const giyu = createFighter({ skin: 0xd4a574, haori: 0x223355, hair: 0x050510, pants: 0x1a1a2e, belt: 0x2a1a0a,
  extraFn: (g) => {
    // Half-half haori (left side red patch)
    const redHalf = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.44, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x882222, roughness: 0.75 }));
    redHalf.position.set(-0.1, 0.42, -0.12); g.add(redHalf);
    // Ponytail
    const pony = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 0.9 }));
    pony.position.set(0, 0.65, -0.15); g.add(pony);
    // Water breathing blade — blue tint
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) bl.material = new THREE.MeshStandardMaterial({ color: 0x4488cc, emissive: 0x2266aa, emissiveIntensity: 0.3, metalness: 0.9 });
  }
});

// 아카자 — 분홍 피부, 파란 줄무늬 문신, 짧은 분홍 머리, 근육질, 맨주먹
const akaza = createFighter({ skin: 0xddaaaa, haori: 0x882244, hair: 0xdd6688, pants: 0x882244, belt: 0x444444, scaleY: 1.05,
  extraFn: (g) => {
    g.children.forEach(c => { if (c.name === 'sword') c.visible = false; });
    // 파괴살 문신 (파란 줄무늬)
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x3366ff, emissive: 0x2244cc, emissiveIntensity: 0.6 });
    for (const y of [0.3, 0.4, 0.5]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.015, 0.23), lineMat);
      line.position.set(0, y, 0); g.add(line);
    }
    // Face markings
    for (const [x, y] of [[-0.08, 0.82], [0.08, 0.82], [-0.06, 0.73], [0.06, 0.73]]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.01), lineMat);
      mark.position.set(x, y, 0.13); g.add(mark);
    }
    // Glowing fists
    const fistMat = new THREE.MeshStandardMaterial({ color: 0xff4488, emissive: 0xff2266, emissiveIntensity: 1.2 });
    for (const s of [-1, 1]) {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), fistMat);
      fist.position.set(s * 0.3, 0.17, 0.05); g.add(fist);
    }
    // Upper body more muscular
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.15, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xddaaaa, roughness: 0.8 }));
    chest.position.set(0, 0.55, 0.02); g.add(chest);
  }
});

// 시노부 — 나비 하오리 (보라+핑크 그라데이션), 나비 머리핀, 가느다란 칼
const shinobu = createFighter({ skin: 0xd4a574, haori: 0x6633aa, hair: 0x0a0a18, pants: 0x332244, belt: 0x8844aa, scaleY: 0.9,
  extraFn: (g, skinMat, haoriMat, hairMat) => {
    // Butterfly gradient on haori (pink lower half)
    const pinkHalf = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.2, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xcc55aa, roughness: 0.75 }));
    pinkHalf.position.set(0, 0.28, -0.12); g.add(pinkHalf);
    // Butterfly hair ornament
    const ornMat = new THREE.MeshStandardMaterial({ color: 0xee77cc, emissive: 0xcc44aa, emissiveIntensity: 0.4 });
    const orn = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), ornMat);
    orn.position.set(0.1, 0.92, 0); g.add(orn);
    // Large butterfly wings on haori back
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xbb55ee, emissive: 0x8833dd, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide
    });
    for (const s of [-1, 1]) {
      // Upper wing
      const wU = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.35), wingMat);
      wU.position.set(s * 0.25, 0.55, -0.14); wU.rotation.y = s * 0.4; wU.name = 'wing'; g.add(wU);
      // Lower wing (smaller)
      const wL = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xee77cc, emissive: 0xcc44aa, emissiveIntensity: 0.4, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      wL.position.set(s * 0.2, 0.38, -0.13); wL.rotation.y = s * 0.5; wL.name = 'wing'; g.add(wL);
    }
    // Thin stinger blade
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) { bl.scale.set(0.5, 1, 1); bl.material = new THREE.MeshStandardMaterial({ color: 0xccccdd, metalness: 0.95, roughness: 0.1 }); }
  }
});

// 도우마 — 금발 긴머리, 무지개 눈, 부채 2개, 연꽃 모자
const douma = createFighter({ skin: 0xe8d8c8, haori: 0x445566, hair: 0xeebb44, pants: 0x334455, belt: 0x556666, scaleY: 1.05,
  extraFn: (g) => {
    g.children.forEach(c => { if (c.name === 'sword') c.visible = false; });
    // Long golden hair
    const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xeebb44, roughness: 0.85 }));
    longHair.position.set(0, 0.6, -0.12); g.add(longHair);
    // Rainbow eyes
    const rEyeMat = new THREE.MeshStandardMaterial({ color: 0xff6688, emissive: 0xff4466, emissiveIntensity: 0.8 });
    for (const s of [-0.045, 0.045]) {
      const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), rEyeMat);
      rEye.position.set(s, 0.79, 0.125); g.add(rEye);
    }
    // Lotus hat
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x997744, roughness: 0.6 });
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 8), hatMat);
    hat.position.set(0, 0.95, -0.02); g.add(hat);
    // Ice fans (larger, more detailed)
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x88ddff, emissive: 0x44aaee, emissiveIntensity: 0.7, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.25, 10, 0, Math.PI), fanMat);
      fan.position.set(s * 0.4, 0.35, 0.15); fan.rotation.z = s * 0.4; g.add(fan);
      // Fan ribs
      for (let r = 0; r < 5; r++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.22, 0.005),
          new THREE.MeshStandardMaterial({ color: 0x667788 }));
        rib.position.set(s * 0.4, 0.35, 0.16); rib.rotation.z = s * (0.1 + r * 0.15); g.add(rib);
      }
    }
  }
});

// 무이치로 — 민트색 긴 머리, 하얀 안개 하오리, 어린 체형
const muichiro = createFighter({ skin: 0xd4a574, haori: 0xccddee, hair: 0x55ccaa, pants: 0xaabbcc, belt: 0x88aacc, scaleY: 0.85,
  extraFn: (g) => {
    // Long flowing mint hair
    const lHair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x55ccaa, roughness: 0.9 }));
    lHair.position.set(0, 0.55, -0.12); g.add(lHair);
    // Hair tips (lighter)
    const tips = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x88eedd, roughness: 0.9 }));
    tips.position.set(0, 0.4, -0.14); g.add(tips);
    // Mist blade
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) bl.material = new THREE.MeshStandardMaterial({ color: 0xddddff, emissive: 0xaabbee, emissiveIntensity: 0.2, metalness: 0.9 });
  }
});

// 코쿠시보 — 6개의 눈, 검보라 장발, 거대한 칼, 달 문양
const kokushibo = createFighter({ skin: 0xccbbaa, haori: 0x221133, hair: 0x110022, pants: 0x1a0a22, belt: 0x332244, scaleY: 1.15,
  extraFn: (g) => {
    // 6 glowing golden eyes
    const eyeGMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1.5 });
    const eyePositions = [[-0.06, 0.82], [0.06, 0.82], [-0.04, 0.76], [0.04, 0.76], [-0.02, 0.71], [0.02, 0.71]];
    for (const [x, y] of eyePositions) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), eyeGMat);
      eye.position.set(x, y, 0.125); g.add(eye);
    }
    // Eye glow
    const eLight = new THREE.PointLight(0xffcc00, 0.5, 5);
    eLight.position.set(0, 0.78, 0.2); g.add(eLight);
    // Very long dark purple hair
    const lHair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x110022, roughness: 0.9 }));
    lHair.position.set(0, 0.4, -0.14); g.add(lHair);
    // Moon crescent marks on face
    const moonMat = new THREE.MeshStandardMaterial({ color: 0x8866cc, emissive: 0x6644aa, emissiveIntensity: 0.4 });
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 8, Math.PI), moonMat);
    moon.position.set(0, 0.87, 0.1); moon.rotation.z = Math.PI; g.add(moon);
    // Moon breathing blade (longer, purple glow)
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) {
      bl.scale.set(1.3, 1.4, 1.5);
      bl.material = new THREE.MeshStandardMaterial({ color: 0x6644aa, emissive: 0x4422aa, emissiveIntensity: 0.6, metalness: 0.85 });
    }
  }
});

// 젠이츠 — 금발 (반반: 금+주황), 노란 하오리, 잠든 표정
const zenitsu = createFighter({ skin: 0xd4a574, haori: 0xccaa22, hair: 0xeebb33, pants: 0xcc9900, belt: 0xaa8800,
  extraFn: (g) => {
    // Orange-tipped hair
    const orangeTips = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xff8822, roughness: 0.9 }));
    orangeTips.position.set(0, 0.83, 0.02); g.add(orangeTips);
    // Closed eyes (sleeping form)
    // Lightning blade
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) bl.material = new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 1.0, metalness: 0.85 });
  }
});

// === 화뢰신 (Flaming Thunder God) Lightning Effect ===
const lightningGroup = new THREE.Group();
lightningGroup.visible = false;
scene.add(lightningGroup);

// Lightning bolts (jagged lines)
const boltMat = new THREE.LineBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.9, linewidth: 2 });
for (let b = 0; b < 8; b++) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    pts.push(new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      i * 0.3 - 1.5,
      (Math.random() - 0.5) * 2
    ));
  }
  const boltGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.name = 'bolt';
  lightningGroup.add(bolt);
}

// Lightning dragon body (glowing tube following the dash path)
const dragonMat = new THREE.MeshStandardMaterial({
  color: 0xffdd22, emissive: 0xffcc00, emissiveIntensity: 2,
  transparent: true, opacity: 0.6,
});
const dragonBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.05, 8, 6), dragonMat);
dragonBody.rotation.z = Math.PI / 2;
dragonBody.name = 'dragonBody';
lightningGroup.add(dragonBody);

// Dragon head (glowing sphere)
const dragonHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 3, transparent: true, opacity: 0.8 })
);
dragonHead.name = 'dragonHead';
lightningGroup.add(dragonHead);

// Flash light for impact
const flashLight = new THREE.PointLight(0xffee44, 0, 30, 1);
flashLight.name = 'flash';
lightningGroup.add(flashLight);

// Afterimage trails (copies of zenitsu at previous positions)
const afterimages = [];
const afterMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1, transparent: true, opacity: 0.3 });
for (let ai = 0; ai < 5; ai++) {
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.2), afterMat);
  ghost.visible = false;
  ghost.name = 'afterimage';
  scene.add(ghost);
  afterimages.push(ghost);
}

// 카이가쿠 — 검은 짧은 머리, 귀살대 탈영병, 검은 뇌 문양
const kaigaku = createFighter({ skin: 0xccbbaa, haori: 0x1a1a2e, hair: 0x050505, pants: 0x111122, belt: 0x222233,
  extraFn: (g) => {
    // Scar on face
    const scarMat = new THREE.MeshStandardMaterial({ color: 0x884444 });
    const scar = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.08, 0.01), scarMat);
    scar.position.set(0.06, 0.78, 0.13); g.add(scar);
    // Thunder blade (dark blue lightning)
    const bl = g.children.find(c => c.name === 'sword');
    if (bl) bl.material = new THREE.MeshStandardMaterial({ color: 0x2244aa, emissive: 0x1133aa, emissiveIntensity: 0.5, metalness: 0.85 });
    // Demon marks appearing
    const demonMark = new THREE.MeshStandardMaterial({ color: 0x4422aa, emissive: 0x3311aa, emissiveIntensity: 0.3 });
    for (const y of [0.74, 0.7]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.01), demonMark);
      mark.position.set(0.07, y, 0.12); g.add(mark);
    }
  }
});

// 무잔 — 하얀 피부, 마이클잭슨 스타일 흰 정장+페도라, 빨간 눈, 촉수
const muzan = createFighter({ skin: 0xeee8dd, haori: 0xf0f0f0, hair: 0x0a0a0a, pants: 0xeeeeee, belt: 0xdddddd, scaleY: 1.1,
  extraFn: (g) => {
    g.children.forEach(c => { if (c.name === 'sword') c.visible = false; });
    // White fedora hat
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 }));
    hatBrim.position.set(0, 0.92, 0); g.add(hatBrim);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }));
    hatTop.position.set(0, 1.0, 0); g.add(hatTop);
    // Hat band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    band.position.set(0, 0.95, 0); g.add(band);
    // Red glowing eyes (piercing)
    const rEyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.5 });
    for (const x of [-0.045, 0.045]) {
      const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), rEyeMat);
      rEye.position.set(x, 0.8, 0.125); g.add(rEye);
    }
    // Eye glow light
    const eyeL = new THREE.PointLight(0xff0000, 1, 5);
    eyeL.position.set(0, 0.8, 0.2); g.add(eyeL);
    // Curly black hair (under hat)
    const curl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 }));
    curl.position.set(0, 0.82, -0.02); g.add(curl);
    // Tentacle whips (from back, longer)
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0x550000, emissiveIntensity: 0.4 });
    for (let i = 0; i < 6; i++) {
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 1.8, 4), tentMat);
      tent.position.set((i - 2.5) * 0.1, 0.4, -0.15);
      tent.rotation.x = 0.4; tent.rotation.z = (i - 2.5) * 0.15;
      tent.name = 'tentacle'; g.add(tent);
    }
    // Neck tie
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111111 }));
    tie.position.set(0, 0.55, 0.12); g.add(tie);
  }
});

// All characters map
const characters = { giyu, akaza, shinobu, douma, muichiro, kokushibo_char: kokushibo, zenitsu_char: zenitsu, kaigaku, muzan_char: muzan };

// Character animation: position + rotation over time
// ============ BREATHING EFFECTS ============
const breathEffects = new THREE.Group();
scene.add(breathEffects);
const breathMeshes = [];

function createBreathEffect(color, emissive, count) {
  const efx = [];
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 1.5,
    transparent: true, opacity: 0.5, side: THREE.DoubleSide
  });
  for (let i = 0; i < count; i++) {
    const geo = i % 2 === 0
      ? new THREE.PlaneGeometry(0.6 + Math.random() * 0.4, 0.15)
      : new THREE.TorusGeometry(0.3 + Math.random() * 0.2, 0.03, 4, 8, Math.PI * (0.5 + Math.random()));
    const m = new THREE.Mesh(geo, mat.clone());
    m.visible = false;
    breathEffects.add(m);
    efx.push(m);
  }
  return efx;
}

// Pre-create effect pools for each breathing style
const waterEffects = createBreathEffect(0x4488ff, 0x2266cc, 8);
const moonEffects = createBreathEffect(0x8855cc, 0x6633aa, 8);
const mistEffects = createBreathEffect(0xccddff, 0xaabbee, 6);
const butterflyEffects = createBreathEffect(0xcc55ff, 0xaa33dd, 6);
const iceEffects = createBreathEffect(0x88ddff, 0x55aadd, 8);
const fistEffects = createBreathEffect(0xff4488, 0xff2266, 6);
const tentacleEffects = createBreathEffect(0x880000, 0x660000, 6);

function showBreathEffects(effects, cx, cy, cz, time, radius, speed) {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    e.visible = true;
    const angle = (i / effects.length) * Math.PI * 2 + time * speed;
    const r = radius + Math.sin(time * 3 + i) * 0.3;
    e.position.set(
      cx + Math.cos(angle) * r,
      cy + 0.3 + Math.sin(time * 2 + i * 0.5) * 0.5,
      cz + Math.sin(angle) * r
    );
    e.rotation.set(time * 2 + i, time + i * 0.7, Math.sin(time * 1.5 + i) * 0.5);
    e.material.opacity = 0.3 + Math.sin(time * 4 + i) * 0.2;
  }
}

function hideBreathEffects(effects) {
  effects.forEach(e => { e.visible = false; });
}

function hideAllEffects() {
  [waterEffects, moonEffects, mistEffects, butterflyEffects, iceEffects, fistEffects, tentacleEffects]
    .forEach(hideBreathEffects);
}

// ============ CHARACTER ANIMATION ============
function animateCharacter(char, x, y, z, time, style) {
  char.visible = true;
  char.position.set(x, y, z);

  if (style === 'fight_circle') {
    char.rotation.y = time * 2;
    char.children.forEach(c => {
      if (c.name === 'armR') c.rotation.z = 0.3 + Math.sin(time * 8) * 0.5;
      if (c.name === 'armL') c.rotation.z = -0.3 - Math.sin(time * 8 + 1) * 0.5;
    });
  } else if (style === 'attack') {
    // Sword combo: slash patterns cycling
    const combo = time % 3;
    char.children.forEach(c => {
      if (c.name === 'sword') {
        if (combo < 1) c.rotation.z = 0.3 + Math.sin(time * 15) * 1.2; // horizontal slash
        else if (combo < 2) { c.rotation.z = -0.5 + Math.sin(time * 12) * 0.8; c.rotation.x = Math.sin(time * 10) * 0.5; } // diagonal
        else c.rotation.z = Math.sin(time * 18) * 1.5; // rapid combo
      }
      if (c.name === 'armR') {
        if (combo < 1) c.rotation.z = Math.sin(time * 15) * 0.8;
        else c.rotation.z = -0.5 + Math.sin(time * 12) * 1.0;
      }
      if (c.name === 'armL') c.rotation.z = -0.3 + Math.sin(time * 6) * 0.3;
    });
    // Dodge/step: bob and weave
    char.position.y = y + Math.abs(Math.sin(time * 5)) * 0.15;
    char.rotation.x = Math.sin(time * 4) * 0.1;

  } else if (style === 'water_breath') {
    // 물의 호흡 — flowing water sword arcs
    char.children.forEach(c => {
      if (c.name === 'sword') c.rotation.z = Math.sin(time * 6) * 1.5;
      if (c.name === 'armR') c.rotation.z = Math.sin(time * 6) * 1.0;
      if (c.name === 'armL') c.rotation.z = -0.5 + Math.cos(time * 4) * 0.4;
    });
    char.rotation.y = time * 1.5;
    char.position.y = y + Math.sin(time * 3) * 0.2;
    showBreathEffects(waterEffects, x, y, z, time, 1.2, 2);

  } else if (style === 'moon_breath') {
    // 월의 호흡 — wide crescent slashes
    char.children.forEach(c => {
      if (c.name === 'sword') {
        c.rotation.z = Math.sin(time * 4) * 2.0;
        c.rotation.x = Math.cos(time * 3) * 0.8;
      }
      if (c.name === 'armR') c.rotation.z = Math.sin(time * 4) * 1.2;
    });
    char.rotation.y = time * 0.8;
    showBreathEffects(moonEffects, x, y, z, time, 1.8, 1.5);

  } else if (style === 'mist_breath') {
    // 안개의 호흡 — swift, ghostly movements
    char.children.forEach(c => {
      if (c.name === 'sword') c.rotation.z = Math.sin(time * 10) * 1.0;
      if (c.name === 'armR') c.rotation.z = Math.sin(time * 10) * 0.7;
    });
    char.rotation.y = time * 2.5;
    char.position.x = x + Math.sin(time * 5) * 0.3;
    char.position.z = z + Math.cos(time * 5) * 0.3;
    showBreathEffects(mistEffects, x, y, z, time, 1.0, 3);

  } else if (style === 'butterfly') {
    // 나비춤 — quick thrusts + wing flapping
    char.rotation.y = time * 2;
    char.children.forEach(c => {
      if (c.name === 'wing') c.rotation.y = Math.sin(time * 8) * 0.7;
      if (c.name === 'sword') c.rotation.z = -0.8 + Math.sin(time * 15) * 0.4; // rapid stabs
      if (c.name === 'armR') c.rotation.z = -0.5 + Math.sin(time * 15) * 0.3;
    });
    char.position.y = y + Math.sin(time * 4) * 0.15;
    showBreathEffects(butterflyEffects, x, y, z, time, 0.8, 4);

  } else if (style === 'fist_attack') {
    // 파괴살 — rapid punches + kicks
    const combo = time % 2;
    char.children.forEach(c => {
      if (combo < 0.5) {
        if (c.name === 'armR') c.rotation.z = -1.5 + Math.sin(time * 20) * 0.5; // right jab
        if (c.name === 'armL') c.rotation.z = 0.3;
      } else if (combo < 1) {
        if (c.name === 'armL') c.rotation.z = 1.5 - Math.sin(time * 20) * 0.5; // left hook
        if (c.name === 'armR') c.rotation.z = -0.3;
      } else {
        if (c.name === 'armR') c.rotation.z = Math.sin(time * 15) * 1.2; // both arms
        if (c.name === 'armL') c.rotation.z = Math.sin(time * 15 + Math.PI) * 1.2;
      }
    });
    char.rotation.y = time * 3;
    char.position.y = y + Math.abs(Math.sin(time * 8)) * 0.2;
    showBreathEffects(fistEffects, x, y, z, time, 1.0, 3);

  } else if (style === 'ice_fan') {
    // 도우마 부채 공격 — sweeping fan motions
    char.rotation.y = time * 1.2;
    char.position.y = y + Math.sin(time * 2) * 0.1;
    showBreathEffects(iceEffects, x, y, z, time, 2.0, 1.5);

  } else if (style === 'tentacle') {
    // 무잔 촉수 — whipping tentacles + body movement
    char.children.forEach(c => {
      if (c.name === 'tentacle') {
        c.rotation.x = 0.3 + Math.sin(time * 6 + c.position.x * 10) * 0.8;
        c.rotation.z = Math.sin(time * 4 + c.position.x * 8) * 0.5;
      }
    });
    char.rotation.y = Math.sin(time * 0.5) * 0.3;
    showBreathEffects(tentacleEffects, x, y, z, time, 2.5, 1);

  } else if (style === 'dash') {
    char.rotation.x = 0.4;
    char.children.forEach(c => {
      if (c.name === 'armR') c.rotation.z = -1.2;
      if (c.name === 'armL') c.rotation.z = 0.8;
      if (c.name === 'sword') c.rotation.z = -0.5;
    });
  } else if (style === 'run') {
    char.rotation.x = 0.2;
    char.children.forEach(c => {
      if (c.name === 'armR') c.rotation.z = Math.sin(time * 10) * 0.6;
      if (c.name === 'armL') c.rotation.z = Math.sin(time * 10 + Math.PI) * 0.6;
      if (c.name === 'sword') c.rotation.z = -0.3;
    });
  } else if (style === 'fall') {
    char.rotation.x = Math.sin(time) * 0.3;
    char.rotation.z = Math.sin(time * 1.5) * 0.2;
  } else if (style === 'idle') {
    char.rotation.y = time * 0.5;
    // Subtle breathing
    char.position.y = y + Math.sin(time * 2) * 0.02;
  }
}

function hideAllCharacters() {
  Object.values(characters).forEach(c => { c.visible = false; });
  Object.values(arenas).forEach(a => { a.visible = false; });
  tanjiro.visible = false;
  lightningGroup.visible = false;
  afterimages.forEach(a => { a.visible = false; });
  hideAllEffects();
}

function showArena(eventName) {
  const ec = eventCharacters[eventName];
  if (ec && ec.arena && arenas[ec.arena]) {
    arenas[ec.arena].visible = true;
  }
}

// ============ EVENT CHARACTER CONFIGS ============
// ============ BATTLE ARENAS (actual floor platforms for each event) ============
function createArena(x, y, z, w, d) {
  const arena = new THREE.Group();
  // Wooden floor
  arena.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), materials.wood), {}));
  // Edge beams
  for (const ez of [-d/2, d/2]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.1, 0.12), materials.frame);
    beam.position.z = ez; arena.add(beam);
  }
  for (const ex of [-w/2, w/2]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, d + 0.3), materials.frame);
    beam.position.x = ex; arena.add(beam);
  }
  // Pillars at corners
  for (const ex of [-w/2, w/2]) {
    for (const ez of [-d/2, d/2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), materials.frame);
      p.position.set(ex, 1.5, ez); arena.add(p);
    }
  }
  // Tatami floor panels
  for (let tx = -w/2 + 0.5; tx < w/2; tx += 1) {
    for (let tz = -d/2 + 0.5; tz < d/2; tz += 1.8) {
      const tatami = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.7),
        new THREE.MeshStandardMaterial({ color: 0x7a8a32, roughness: 0.95 }));
      tatami.position.set(tx, 0.09, tz); arena.add(tatami);
    }
  }
  arena.position.set(x, y, z);
  arena.visible = false;
  scene.add(arena);
  return arena;
}

// Create arenas at specific locations inside the shaft
// Arenas in center of shaft (±15 range, clear of wall buildings at ±30+)
const arenas = {
  akaza: createArena(0, 0, 0, 12, 10),
  douma: createArena(0, -10, 0, 14, 12),
  kokushibo: createArena(0, 10, 0, 10, 10),
  zenitsu: createArena(0, -5, 0, 16, 8),
  muzan: createArena(0, 15, 0, 16, 16),
};

const eventCharacters = {
  nakime: { chars: [] },
  akaza: {
    chars: ['giyu', 'akaza'],
    arena: 'akaza',
    animate(t, loop) {
      const bY = 0 + 0.1; // arena floor
      const landY = 15; // landing platform height (a building floor they land on)

      // Phase 1 (0-4): TANJIRO FALLING UPSIDE DOWN — flailing helplessly
      if (loop < 4) {
        akaza.visible = false;
        giyu.visible = true; tanjiro.visible = true;

        if (loop < 2.5) {
          // Tanjiro falling upside down, spinning
          const p = loop / 2.5;
          const fallY = 50 - p * 25;
          animateCharacter(tanjiro, Math.sin(loop * 2) * 1, fallY, Math.cos(loop * 1.5) * 0.5, loop, 'fall');
          tanjiro.rotation.x = Math.PI + Math.sin(loop * 3) * 0.3; // upside down!
          tanjiro.rotation.z = Math.sin(loop * 4) * 0.4; // spinning

          // Giyu diving down from above — controlled, faster
          const giyuY = 48 - p * 20;
          animateCharacter(giyu, Math.sin(loop * 2) * 0.8 - 0.5, giyuY, Math.cos(loop * 1.5) * 0.3 + 0.3, loop, 'dash');
          giyu.rotation.x = 0.5; // diving headfirst
        }
        else if (loop < 3.2) {
          // Giyu CATCHES Tanjiro — grabs him mid-air
          const p = (loop - 2.5) / 0.7;
          const catchY = 25 - p * 5;
          // Giyu grabs tanjiro — they're close together
          animateCharacter(giyu, 0, catchY, 0, loop, 'idle');
          animateCharacter(tanjiro, 0.3, catchY - 0.2, 0.1, loop, 'idle');
          // Tanjiro rights himself as Giyu holds him
          tanjiro.rotation.x = Math.PI * (1 - p); // flipping back to upright
          tanjiro.rotation.z = 0.3 * (1 - p);
          giyu.rotation.x = 0.3 * (1 - p);
        }
        else {
          // Together they angle toward a landing spot
          const p = (loop - 3.2) / 0.8;
          const landApproachY = 20 - p * (20 - landY);
          animateCharacter(giyu, -0.3, landApproachY, 0.2, loop, 'dash');
          animateCharacter(tanjiro, 0.3, landApproachY + 0.1, -0.1, loop, 'dash');
          tanjiro.rotation.x = 0; // fully upright now
          giyu.rotation.x = 0.2 * (1 - p);
        }
        return;
      }

      // Phase 2 (4-5): LANDING — both hit the platform
      if (loop < 5) {
        const p = loop - 4;
        akaza.visible = false;
        const landBounce = Math.sin(p * Math.PI) * 0.2 * (1 - p);
        // Giyu lands first, steady
        animateCharacter(giyu, -0.5, landY + landBounce * 0.3, 0.5, loop, 'idle');
        // Tanjiro stumbles a bit on landing
        animateCharacter(tanjiro, 1 + (1 - p) * 0.3, landY + landBounce, 0, loop, 'idle');
        tanjiro.rotation.z = (1 - p) * 0.2; // slight stumble
        // They look at each other, then forward
        tanjiro.rotation.y = -0.3 + p * 0.3;
        giyu.rotation.y = 0.2 - p * 0.2;
        return;
      }

      // Phase 3 (5-35): LONG RUNNING through castle — 30 seconds!
      if (loop < 35) {
        const runT = loop - 5; // 0-30 seconds of running
        const runP = runT / 30; // 0-1 overall progress
        akaza.visible = false;

        // Path stays on wall corridors (x or z near ±37 where buildings are)
        const W = SHAFT_W - 3; // 3m inside wall = on building verandas
        const waypoints = [
          // Leg 1: LEFT WALL corridor heading toward back-left corner
          { t: 0,  x: -W, y: landY, z: 0 },
          { t: 3,  x: -W, y: landY, z: -15 },
          { t: 5,  x: -W, y: landY, z: -W },
          // Leg 2: Turn corner → BACK WALL corridor
          { t: 7,  x: -20, y: landY, z: -W },
          { t: 9,  x: 0,   y: landY, z: -W },
          // Leg 3: Stairs down on back wall
          { t: 11, x: 10,  y: 12, z: -W },
          { t: 13, x: 20,  y: 10, z: -W },
          { t: 15, x: W,   y: 10, z: -W },
          // Leg 4: RIGHT WALL corridor heading toward front
          { t: 17, x: W,   y: 10, z: -15 },
          { t: 19, x: W,   y: 10, z: 0 },
          { t: 21, x: W,   y: 10, z: 15 },
          // Leg 5: Stairs down → FRONT WALL + cut inward
          { t: 23, x: W,   y: 8,  z: W },
          { t: 25, x: 20,  y: 7,  z: W },
          { t: 27, x: 10,  y: 6,  z: 20 },
          // Leg 6: Bridge across to arena
          { t: 29, x: 3,   y: bY + 0.5, z: 5 },
          { t: 30, x: -4,  y: bY, z: 0 },
        ];

        // Find current segment
        let wp0 = waypoints[0], wp1 = waypoints[1];
        for (let i = 0; i < waypoints.length - 1; i++) {
          if (runT >= waypoints[i].t && runT < waypoints[i + 1].t) {
            wp0 = waypoints[i]; wp1 = waypoints[i + 1]; break;
          }
        }
        const segP = (runT - wp0.t) / (wp1.t - wp0.t);
        const easeP = segP * segP * (3 - 2 * segP); // smoothstep
        const curX = wp0.x + (wp1.x - wp0.x) * easeP;
        const curY = wp0.y + (wp1.y - wp0.y) * easeP;
        const curZ = wp0.z + (wp1.z - wp0.z) * easeP;

        // Direction they're facing
        const dx = wp1.x - wp0.x, dz = wp1.z - wp0.z;
        const facing = Math.atan2(dx, dz);

        // Tanjiro
        animateCharacter(tanjiro, curX, curY, curZ - 0.4, loop, 'run');
        tanjiro.rotation.y = facing;
        tanjiro.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 12) * 0.5;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 12 + Math.PI) * 0.5;
        });

        // Giyu — slightly behind and offset
        const behindX = curX - Math.sin(facing) * 1.5;
        const behindZ = curZ + 0.6 - Math.cos(facing) * 1.5;
        animateCharacter(giyu, behindX, curY, behindZ, loop, 'run');
        giyu.rotation.y = facing;
        giyu.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 12 + 0.5) * 0.5;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 12 + Math.PI + 0.5) * 0.5;
        });
        return;
      }

      // Phase 4 (35-37): Arrive at arena, Akaza appears
      if (loop < 37) {
        const p = (loop - 35) / 2;
        animateCharacter(tanjiro, -4, bY, 0, loop, 'idle');
        animateCharacter(giyu, -4, bY, 1.5, loop, 'idle');

        // Akaza fades in
        akaza.visible = true;
        animateCharacter(akaza, 4, bY, 0, loop, 'idle');
        akaza.scale.setScalar(p); // grows from 0 to 1
        tanjiro.lookAt(akaza.position); giyu.lookAt(akaza.position); akaza.lookAt(tanjiro.position);
        return;
      }
      akaza.scale.setScalar(1);

      // Phase 5 (37+): Full battle — breathing techniques!
      hideAllEffects();
      const fightT = loop - 37;
      const a = fightT * 1.5;
      const r = 3;
      // Tanjiro: 히노카미 카구라 (water→fire breath)
      const tStyle = fightT < 6 ? 'fight_circle' : fightT < 12 ? 'water_breath' : 'attack';
      animateCharacter(tanjiro, Math.cos(a) * r, bY, Math.sin(a) * r, fightT, tStyle);
      // Giyu: 물의 호흡
      animateCharacter(giyu, Math.cos(a + 2) * r, bY, Math.sin(a + 2) * r, fightT, fightT < 6 ? 'fight_circle' : 'water_breath');
      // Akaza: 파괴살 (fist attacks)
      animateCharacter(akaza, Math.cos(a + Math.PI) * (r - 0.5), bY, Math.sin(a + Math.PI) * (r - 0.5), fightT, fightT < 6 ? 'fight_circle' : 'fist_attack');
      tanjiro.lookAt(akaza.position); giyu.lookAt(akaza.position); akaza.lookAt(tanjiro.position);
    }
  },
  douma: {
    chars: ['shinobu', 'douma'],
    arena: 'douma',
    animate(t, loop) {
      const bY = -10 + 0.1;
      const W = SHAFT_W - 3;
      douma.visible = false;

      // Fall (0-3)
      if (loop < 3) {
        const p = loop / 3;
        const fY = 40 - p * 55; // fall from 40 to -15
        animateCharacter(shinobu, Math.sin(loop * 2) * 0.5, fY, Math.cos(loop * 1.5) * 0.3, loop, 'fall');
        return;
      }
      // Land (3-4)
      if (loop < 4) {
        const bounce = Math.sin((loop - 3) * Math.PI) * 0.2;
        animateCharacter(shinobu, W, bY + 10 + bounce, 0, loop, 'idle');
        return;
      }
      // Run to arena (4-15) — shinobu running along corridors
      if (loop < 15) {
        const runT = loop - 4;
        const runP = runT / 11;
        const runX = W - runP * (W + 4); // from wall to center
        const runZ = Math.sin(runP * Math.PI * 3) * 8; // zigzag
        const runY2 = bY + 10 * (1 - runP); // descend to arena level
        animateCharacter(shinobu, runX, runY2, runZ, loop, 'run');
        shinobu.rotation.y = Math.atan2(-1, Math.cos(runP * Math.PI * 3) * 3);
        shinobu.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 12) * 0.5;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 12 + Math.PI) * 0.5;
        });
        return;
      }
      // Douma appears (15-16)
      if (loop < 16) {
        const p = loop - 15;
        animateCharacter(shinobu, -3, bY, 0, loop, 'idle');
        douma.visible = true;
        animateCharacter(douma, 3, bY, 0, loop, 'idle');
        douma.scale.setScalar(p);
        shinobu.lookAt(douma.position); douma.lookAt(shinobu.position);
        return;
      }
      douma.visible = true; douma.scale.setScalar(1);
      // Battle (16+) — 나비춤 vs 얼음 부채
      hideAllEffects();
      const fightT = loop - 16;
      const a = fightT * 1.2;
      animateCharacter(shinobu, Math.cos(a) * 4, bY, Math.sin(a) * 4, fightT, 'butterfly');
      animateCharacter(douma, Math.cos(a + Math.PI) * 2, bY, Math.sin(a + Math.PI) * 2, fightT, 'ice_fan');
      shinobu.lookAt(douma.position); douma.lookAt(shinobu.position);
    }
  },
  kokushibo: {
    chars: ['muichiro', 'kokushibo_char'],
    arena: 'kokushibo',
    animate(t, loop) {
      const bY = 10 + 0.1;
      const W = SHAFT_W - 3;
      kokushibo.visible = false;

      // Fall (0-3) — Muichiro falling
      if (loop < 3) {
        const p = loop / 3;
        const fY = 50 - p * 25;
        animateCharacter(muichiro, Math.sin(loop * 2.5) * 0.4, fY, Math.cos(loop * 2) * 0.4, loop, 'fall');
        return;
      }
      // Land (3-4)
      if (loop < 4) {
        const bounce = Math.sin((loop - 3) * Math.PI) * 0.2;
        animateCharacter(muichiro, -W, bY + 5 + bounce, -10, loop, 'idle');
        return;
      }
      // Run to arena (4-15)
      if (loop < 15) {
        const runT = loop - 4;
        const runP = runT / 11;
        const runX = -W + runP * (W - 4); // wall to center
        const runZ = -10 + runP * 10; // toward arena
        const runY2 = bY + 5 * (1 - runP);
        animateCharacter(muichiro, runX, runY2, runZ, loop, 'run');
        muichiro.rotation.y = Math.atan2(1, runP);
        muichiro.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 12) * 0.5;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 12 + Math.PI) * 0.5;
        });
        return;
      }
      // Kokushibo appears (15-17) — slow, menacing
      if (loop < 17) {
        const p = (loop - 15) / 2;
        animateCharacter(muichiro, -3, bY, 0, loop, 'idle');
        kokushibo.visible = true;
        animateCharacter(kokushibo, 3, bY, 0, loop, 'idle');
        kokushibo.scale.setScalar(p);
        muichiro.lookAt(kokushibo.position); kokushibo.lookAt(muichiro.position);
        return;
      }
      kokushibo.visible = true; kokushibo.scale.setScalar(1);
      // Battle (17+) — 안개의 호흡 vs 월의 호흡
      hideAllEffects();
      const fightT = loop - 17;
      const a = fightT * 0.8;
      animateCharacter(muichiro, Math.cos(a) * 3, bY, Math.sin(a) * 3, fightT, 'mist_breath');
      animateCharacter(kokushibo, 0, bY, 0, fightT, 'moon_breath');
      muichiro.lookAt(kokushibo.position); kokushibo.lookAt(muichiro.position);
    }
  },
  zenitsu: {
    chars: ['zenitsu_char', 'kaigaku'],
    arena: 'zenitsu',
    animate(t, loop) {
      const bY = -5 + 0.1;

      lightningGroup.visible = false;
      afterimages.forEach(ai => ai.visible = false);
      kaigaku.visible = false;

      // Phase 0 (0-3): Zenitsu falls alone
      if (loop < 3) {
        const p = loop / 3;
        const fY = 30 - p * 60; // fall to -30
        animateCharacter(zenitsu, Math.sin(loop * 2) * 0.3, fY, 0, loop, 'fall');
        return;
      }
      // Phase 0.5 (3-4): Land
      if (loop < 4) {
        const bounce = Math.sin((loop - 3) * Math.PI) * 0.2;
        animateCharacter(zenitsu, SHAFT_W - 3, bY + bounce, 10, loop, 'idle');
        return;
      }
      // Phase 0.7 (4-12): Run alone through dark corridors (lonely, tense)
      if (loop < 12) {
        const runT = loop - 4;
        const runP = runT / 8;
        const runX = (SHAFT_W - 3) - runP * (SHAFT_W - 3 + 6); // wall to -6
        const runZ = 10 - runP * 10; // toward arena
        animateCharacter(zenitsu, runX, bY, runZ, loop, 'run');
        zenitsu.rotation.y = Math.atan2(-1, -runP);
        zenitsu.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 10) * 0.4;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 10 + Math.PI) * 0.4;
        });
        return;
      }
      // Phase 1 (12-14): Arrive, Kaigaku appears
      if (loop < 14) {
        const p = (loop - 12) / 2;
        animateCharacter(zenitsu, -6 + p * 0.5, bY, 0, loop, 'idle');
        kaigaku.visible = true;
        animateCharacter(kaigaku, 6 - p * 0.5, bY, 0, loop, 'idle');
        kaigaku.scale.setScalar(p);
        zenitsu.lookAt(kaigaku.position); kaigaku.lookAt(zenitsu.position);
        return;
      }
      kaigaku.visible = true; kaigaku.scale.setScalar(1);

      // Fight timeline: ft starts at 14 (after fall+run+appear)
      const ft = loop - 14;

      // Standoff (ft 0-3)
      if (ft < 3) {
        animateCharacter(zenitsu, -5, bY, 0, ft, 'idle');
        animateCharacter(kaigaku, 5, bY, 0, ft, 'attack');
        zenitsu.lookAt(kaigaku.position); kaigaku.lookAt(zenitsu.position);
      }
      // 화뢰신 BUILDUP (ft 3-4)
      else if (ft < 4) {
        const p = ft - 3;
        animateCharacter(zenitsu, -5, bY, 0, ft, 'idle');
        animateCharacter(kaigaku, 5, bY, 0, ft, 'idle');
        zenitsu.lookAt(kaigaku.position);
        lightningGroup.visible = true;
        lightningGroup.position.set(-5, bY + 0.5, 0);
        lightningGroup.rotation.y = t * 8;
        lightningGroup.scale.setScalar(p * 1.5);
        lightningGroup.children.forEach(c => {
          if (c.name === 'dragonBody' || c.name === 'dragonHead') c.visible = false;
          if (c.name === 'bolt') { c.visible = true; c.material.opacity = p; }
          if (c.name === 'flash') c.intensity = p * 10;
        });
      }
      // 화뢰신 DASH (ft 4-5.5)
      else if (ft < 5.5) {
        const p = (ft - 4) / 1.5;
        const easeP = p < 0.3 ? p / 0.3 * 0.1 : 0.1 + (p - 0.3) / 0.7 * 0.9;
        const zX = -5 + easeP * 12;
        animateCharacter(zenitsu, zX, bY, 0, ft, 'dash');
        animateCharacter(kaigaku, 5, bY, 0, ft, 'attack');
        zenitsu.lookAt(kaigaku.position);
        lightningGroup.visible = true;
        lightningGroup.position.set(zX - 1, bY + 0.5, 0);
        lightningGroup.rotation.y = 0;
        lightningGroup.scale.setScalar(1);
        lightningGroup.children.forEach(c => {
          if (c.name === 'dragonBody') { c.visible = true; c.position.x = -2; }
          if (c.name === 'dragonHead') { c.visible = true; c.position.set(2, 0, 0); }
          if (c.name === 'bolt') { c.visible = true; c.position.x = (Math.random()-0.5)*4; c.material.opacity = 0.7+Math.random()*0.3; }
          if (c.name === 'flash') c.intensity = 15 + Math.sin(t * 20) * 10;
        });
        for (let ai = 0; ai < afterimages.length; ai++) {
          const trailP = Math.max(0, easeP - (ai + 1) * 0.08);
          afterimages[ai].visible = true;
          afterimages[ai].position.set(-5 + trailP * 12, bY + 0.4, 0);
          afterimages[ai].material.opacity = 0.25 - ai * 0.04;
        }
      }
      // IMPACT (ft 5.5-7)
      else if (ft < 7) {
        const p = (ft - 5.5) / 1.5;
        animateCharacter(zenitsu, 6, bY, 0, ft, 'idle');
        zenitsu.rotation.y = Math.PI;
        animateCharacter(kaigaku, 5 + p * 0.5, bY, p * 0.3, ft, 'idle');
        kaigaku.rotation.z = p * 0.5;
        lightningGroup.visible = true;
        lightningGroup.position.set(5, bY + 0.5, 0);
        lightningGroup.children.forEach(c => {
          if (c.name === 'flash') c.intensity = 20 * (1 - p);
          if (c.name === 'dragonBody') c.visible = false;
          if (c.name === 'dragonHead') { c.visible = true; c.material.opacity = 0.8 * (1 - p); }
          if (c.name === 'bolt') c.material.opacity = (1 - p) * 0.5;
        });
        afterimages.forEach(a => { a.material.opacity = 0.2 * (1 - p); });
      }
      // Aftermath (ft 7-11)
      else if (ft < 11) {
        const p = (ft - 7) / 4;
        animateCharacter(zenitsu, 6, bY, 0, ft, 'idle');
        zenitsu.rotation.y = Math.PI;

        if (p < 0.3) {
          // Kaigaku collapses
          kaigaku.visible = true;
          kaigaku.position.set(5.5, bY - p * 1.5, 0.3);
          kaigaku.rotation.z = p * 5;
          kaigaku.rotation.x = p * 2;
        } else {
          kaigaku.visible = false;
        }

        lightningGroup.visible = false;
        afterimages.forEach(a => a.visible = false);
      }
      // Phase 7 (15+): Resolution
      else {
        animateCharacter(zenitsu, 6, bY, 0, loop, 'idle');
        zenitsu.rotation.y = Math.PI;
        kaigaku.visible = false;
        lightningGroup.visible = false;
        afterimages.forEach(a => a.visible = false);
      }
    }
  },
  muzan: {
    chars: ['muzan_char'],
    arena: 'muzan',
    animate(t, loop) {
      const bY = 15 + 0.1;
      const W = SHAFT_W - 3;
      muzan.visible = false;

      // Fall (0-3)
      if (loop < 3) {
        const p = loop / 3;
        const fY = 55 - p * 15;
        animateCharacter(tanjiro, Math.sin(loop * 3) * 0.5, fY, Math.cos(loop * 2) * 0.5, loop, 'fall');
        return;
      }
      // Land (3-4)
      if (loop < 4) {
        animateCharacter(tanjiro, -W, bY + 5, -15, loop, 'idle');
        return;
      }
      // Run toward Muzan's arena (4-14)
      if (loop < 14) {
        const runT = loop - 4;
        const runP = runT / 10;
        const runX = -W + runP * (W - 5);
        const runZ = -15 + runP * 15;
        const runY2 = bY + 5 * (1 - runP);
        animateCharacter(tanjiro, runX, runY2, runZ, loop, 'run');
        tanjiro.rotation.y = Math.atan2(1, runP * 0.5);
        tanjiro.children.forEach(c => {
          if (c.name === 'armR') c.rotation.z = Math.sin(loop * 12) * 0.5;
          if (c.name === 'armL') c.rotation.z = Math.sin(loop * 12 + Math.PI) * 0.5;
        });
        return;
      }
      // Muzan appears (14-16)
      if (loop < 16) {
        const p = (loop - 14) / 2;
        animateCharacter(tanjiro, -5, bY, 0, loop, 'idle');
        muzan.visible = true;
        animateCharacter(muzan, 0, bY, 0, loop, 'tentacle');
        muzan.scale.setScalar(p);
        tanjiro.lookAt(muzan.position); muzan.lookAt(tanjiro.position);
        return;
      }
      muzan.visible = true; muzan.scale.setScalar(1);
      // Battle (16+) — 촉수 vs 히노카미 카구라
      hideAllEffects();
      animateCharacter(muzan, 0, bY, 0, loop, 'tentacle');
      tanjiro.visible = true;
      const a = (loop - 16) * 1.5;
      animateCharacter(tanjiro, Math.cos(a) * 5, bY, Math.sin(a) * 5, loop, 'water_breath');
      tanjiro.lookAt(muzan.position);
      muzan.lookAt(tanjiro.position);
    }
  },
  crow_eye: {
    chars: [],
    animate(t, loop) {
      // No characters — pure crow POV
      hideAllCharacters();
    }
  },
};

// Tanjiro's path (for nakime event)
const tanjiroPath = [
  // Start at Nakime's room floor
  { pos: [0, 55, 1], rot: [0, 0, 0], t: 0 },
  // Starts falling (arms out)
  { pos: [0.5, 53, 2], rot: [0.3, 0, 0.1], t: 3 },
  // Accelerating fall
  { pos: [1, 45, 3], rot: [0.5, 0.3, 0.2], t: 6 },
  // Tumbling through mid-section
  { pos: [3, 30, 5], rot: [1.0, 0.5, -0.3], t: 9 },
  // Fast fall past buildings
  { pos: [5, 15, 8], rot: [1.5, 1.0, 0.5], t: 11 },
  // Near the center glow
  { pos: [2, 3, 5], rot: [2.0, 1.5, -0.2], t: 13 },
  // Below center
  { pos: [-2, -10, 3], rot: [2.5, 2.0, 0.3], t: 15 },
  // Deep in the lower shaft
  { pos: [-5, -25, -5], rot: [3.0, 2.5, -0.5], t: 17 },
  // Bottoms out, starts rising
  { pos: [-3, -30, 0], rot: [3.5, 3.0, 0], t: 19 },
  // Rising back up
  { pos: [0, -15, -5], rot: [4.0, 3.5, 0.2], t: 21 },
  // Past center again
  { pos: [2, 5, 3], rot: [4.5, 4.0, -0.1], t: 23 },
  // Rising toward Nakime
  { pos: [1, 35, 2], rot: [5.0, 4.5, 0], t: 26 },
  // Back near room
  { pos: [0, 53, 1], rot: [6.28, 6.28, 0], t: 29 },
];

// ============ EVENT-BASED CINEMATIC TOURS ============
let autoTour = false;
let manualMode = false;
let currentEvent = 'nakime';
const NAKIME_Y = 55;
let tourTime = 0;

// Smoothstep helper
function ss(t) { return t * t * (3 - 2 * t); }

// Each event returns { camPos, camLook, fov, roll, showTanjiro, speed } based on time
const EVENT_TOURS = {
  // ======= 1. 나키메의 비파 → 무한성 진입 =======
  nakime: {
    duration: 32,
    getPhase(loop) {
      if (loop < 3) { const p = loop / 3;
        return { camPos: [0, NAKIME_Y+1, 1.5+p*3], camLook: [0,NAKIME_Y+0.8,0], fov:65, roll:0, showT:false, speed:0.3 };
      } if (loop < 6) { const p = (loop-3)/3; const tY = NAKIME_Y-p*12;
        return { camPos: [p*2,tY+2,4+p*3], camLook: [0,tY,0], fov:70+p*15, roll:p*0.1, showT:true, speed:1.5+p*2 };
      } if (loop < 10) { const p = (loop-6)/4; const tY = 43-p*35;
        return { camPos: [3+p*5,tY+6,5+p*3], camLook: [2+p*3,tY-3,3], fov:85+p*10, roll:Math.sin(p*Math.PI*2)*0.15, showT:true, speed:4+p*1.5 };
      } if (loop < 13) { const p = (loop-10)/3; const tY = 8-p*20;
        return { camPos: [5-p*8,tY+4,5-p*5], camLook: [-1,tY-5,0], fov:90-p*15, roll:p*Math.PI, showT:true, speed:5 };
      } if (loop < 17) { const p = (loop-13)/4; const tY = -12-p*15;
        return { camPos: [-3+p*10,tY+5,-2+p*8], camLook: [p*5,tY-3,p*3], fov:75+p*10, roll:Math.PI+p*0.2, showT:true, speed:3.5+p };
      } if (loop < 20) { const p = (loop-17)/3; const tY = -27+p*20;
        return { camPos: [7-p*5,tY+3,6-p*8], camLook: [0,tY,0], fov:85-p*15, roll:Math.PI*(1-p), showT:true, speed:4 };
      } if (loop < 25) { const p = (loop-20)/5; const tY = -7+p*40; const a=p*Math.PI*0.8;
        return { camPos: [Math.cos(a)*15,tY+3,Math.sin(a)*15], camLook: [0,tY,0], fov:70, roll:Math.sin(p*Math.PI)*0.08, showT:true, speed:2+p*2 };
      } { const p = (loop-25)/7; const tY = 33+p*22;
        return { camPos: [Math.cos(p*0.5)*(8-p*7),tY+1,Math.sin(p*0.5)*(8-p*7)+1], camLook: [0,NAKIME_Y+0.8*p,0], fov:70-p*5, roll:0, showT:p<0.7, speed:2-p*1.5 };
      }
    }
  },

  // ======= 2. 탄지로 & 기유 vs 아카자 — 격렬한 전투 =======
  akaza: {
    duration: 62,
    getPhase(loop) {
      const bY = 0;
      const landY = 15;

      // === TANJIRO UPSIDE-DOWN FALL (0-2.5) ===
      if (loop < 2.5) { const p = loop/2.5; const fY = 50-p*25;
        // Camera below, looking up at upside-down Tanjiro
        return { camPos: [2,fY-5,4], camLook: [0,fY+3,0], fov:80, roll:p*0.25, showT:true, speed:4 };
      }
      // === GIYU CATCHES (2.5-3.2) ===
      if (loop < 3.2) { const p = (loop-2.5)/0.7; const fY = 25-p*5;
        // Close-up of the catch moment
        return { camPos: [1.5,fY+1,2], camLook: [0,fY,0], fov:65, roll:0, showT:true, speed:1 };
      }
      // === TOGETHER DESCEND (3.2-4) ===
      if (loop < 4) { const p = (loop-3.2)/0.8; const fY = 20-p*(20-landY);
        return { camPos: [3,fY+2,3], camLook: [0,fY,0], fov:70, roll:0, showT:true, speed:3 };
      }
      // === LAND (4-5) ===
      if (loop < 5) { const p = loop-4; const sh = Math.sin(p*Math.PI*6)*0.12*(1-p);
        return { camPos: [3+sh,landY+1.5,3+sh], camLook: [0,landY+0.5+sh,0], fov:70, roll:sh*0.08, showT:true, speed:1 };
      }
      // === LONG RUN (5-35) — 30 seconds ===
      if (loop < 35) {
        const runT = loop - 5;
        const W = SHAFT_W - 3;
        const wps = [
          {t:0,x:-W,y:landY,z:0},{t:3,x:-W,y:landY,z:-15},
          {t:5,x:-W,y:landY,z:-W},{t:7,x:-20,y:landY,z:-W},
          {t:9,x:0,y:landY,z:-W},{t:11,x:10,y:12,z:-W},
          {t:13,x:20,y:10,z:-W},{t:15,x:W,y:10,z:-W},
          {t:17,x:W,y:10,z:-15},{t:19,x:W,y:10,z:0},
          {t:21,x:W,y:10,z:15},{t:23,x:W,y:8,z:W},
          {t:25,x:20,y:7,z:W},{t:27,x:10,y:6,z:20},
          {t:29,x:3,y:bY+0.5,z:5},{t:30,x:-4,y:bY,z:0},
        ];
        let w0=wps[0],w1=wps[1];
        for(let i=0;i<wps.length-1;i++){if(runT>=wps[i].t&&runT<wps[i+1].t){w0=wps[i];w1=wps[i+1];break;}}
        const sp=(runT-w0.t)/(w1.t-w0.t),ep=sp*sp*(3-2*sp);
        const cx=w0.x+(w1.x-w0.x)*ep,cy=w0.y+(w1.y-w0.y)*ep,cz=w0.z+(w1.z-w0.z)*ep;
        const dx=w1.x-w0.x,dz=w1.z-w0.z,facing=Math.atan2(dx,dz);
        const cs=Math.floor(runT/5)%4;
        if(cs===0) return{camPos:[cx-Math.sin(facing)*4,cy+1.5,cz-Math.cos(facing)*4],camLook:[cx+Math.sin(facing)*2,cy+0.6,cz+Math.cos(facing)*2],fov:75,roll:0,showT:true,speed:5};
        if(cs===1) return{camPos:[cx+Math.cos(facing)*4,cy+1.2,cz-Math.sin(facing)*4],camLook:[cx,cy+0.6,cz],fov:80,roll:Math.sin(runT*0.5)*0.04,showT:true,speed:5.5};
        if(cs===2) return{camPos:[cx+Math.sin(facing)*5,cy+1.5,cz+Math.cos(facing)*5],camLook:[cx,cy+0.8,cz],fov:70,roll:0,showT:true,speed:4.5};
        return{camPos:[cx+Math.cos(facing+0.5)*3,cy+0.4,cz-Math.sin(facing+0.5)*3],camLook:[cx,cy+0.8,cz],fov:85,roll:Math.sin(runT)*0.03,showT:true,speed:5};
      }
      // === AKAZA (35-37) ===
      if(loop<37){const p=(loop-35)/2;
        return{camPos:[0,bY+2,7-p*2],camLook:[0,bY+0.8,0],fov:60+p*10,roll:0,showT:true,speed:0.5};}
      // === BATTLE (37-62) ===
      const ft=loop-37;
      if(ft<6){const p=ft/6,a=p*Math.PI*2;
        return{camPos:[Math.cos(a)*6,bY+1.5,Math.sin(a)*6],camLook:[0,bY+1,0],fov:75+Math.sin(p*Math.PI*3)*8,roll:Math.sin(a)*0.08,showT:true,speed:4};}
      if(ft<10){const p=(ft-6)/4,sh=Math.sin(p*Math.PI*8)*0.2;
        return{camPos:[3+sh,bY+1.2,3+sh],camLook:[-0.5+sh*0.3,bY+0.8,-0.5],fov:85,roll:sh*0.04,showT:true,speed:5};}
      if(ft<14){const p=(ft-10)/4;
        return{camPos:[0,bY+2+p*6,7-p*3],camLook:[0,bY+0.5,0],fov:70,roll:p*Math.PI*0.2,showT:true,speed:3};}
      if(ft<18){const p=(ft-14)/4,a=p*Math.PI*0.5+Math.PI;
        return{camPos:[Math.cos(a)*4,bY+0.5,Math.sin(a)*4],camLook:[0,bY+0.8,0],fov:55,roll:0,showT:true,speed:0.5};}
      if(ft<22){const p=(ft-18)/4;
        return{camPos:[8-p*10,bY+1,6-p*8],camLook:[0,bY+0.8,0],fov:70+p*15,roll:p*0.08,showT:true,speed:3+p*3};}
      {const p=(ft-22)/2;
        return{camPos:[-3+p*5,bY+3+p*6,-3+p*5],camLook:[0,bY+1,0],fov:75,roll:0,showT:true,speed:2};}
    }
  },

  // ======= 3. 시노부 vs 도우마 — 독의 나비 =======
  douma: {
    duration: 40,
    getPhase(loop) {
      const bY = -10; // arena floor
      if (loop < 4) { // Approach arena
        const p = loop/4;
        return { camPos: [-10+p*5,bY+5-p*3,8-p*3], camLook: [0,bY+1,0], fov:65+p*10, roll:0, showT:true, speed:3 };
      } if (loop < 8) { // Butterfly dance — orbit at eye level
        const p = (loop-4)/4; const a = p*Math.PI*2;
        return { camPos: [Math.cos(a)*6,bY+1.5,Math.sin(a)*6], camLook: [0,bY+1,0], fov:65, roll:Math.sin(a)*0.08, showT:true, speed:2 };
      } if (loop < 12) { // Ice attacks — higher view
        const p = (loop-8)/4;
        return { camPos: [0,bY+2+p*5,8-p*3], camLook: [Math.sin(p*Math.PI)*3,bY+0.5,0], fov:70+p*10, roll:0, showT:true, speed:3 };
      } if (loop < 16) { // Sacrifice — slow close-up
        const p = (loop-12)/4;
        return { camPos: [5-p*4,bY+1.2,4-p*3], camLook: [0,bY+0.8,0], fov:60-p*15, roll:0, showT:true, speed:0.5 };
      } if (loop < 20) { // Poison — shaky close
        const p = (loop-16)/4; const shake = Math.sin(p*Math.PI*10)*0.3*(1-p);
        return { camPos: [2+shake,bY+1+shake,2+shake], camLook: [shake*0.2,bY+0.8,-0.5], fov:80, roll:shake*0.08, showT:true, speed:4 };
      } { // Pull out
        const p = (loop-20)/6;
        return { camPos: [p*8,bY+3+p*6,p*8], camLook: [0,bY+1,0], fov:60, roll:0, showT:p<0.5, speed:1.5 };
      }
    }
  },

  // ======= 4. 무이치로 & 겐야 vs 코쿠시보 — 상현 1 =======
  kokushibo: {
    duration: 40,
    getPhase(loop) {
      const bY = 10; // arena floor
      if (loop < 5) { // Approach
        const p = loop/5;
        return { camPos: [8-p*4,bY+6-p*4,10-p*5], camLook: [0,bY+1,0], fov:50+p*15, roll:0, showT:false, speed:0.5+p*0.5 };
      } if (loop < 10) { // Moon breathing — orbit at eye level
        const p = (loop-5)/5; const a = p*Math.PI*1.2;
        return { camPos: [Math.cos(a)*6,bY+1.5,Math.sin(a)*6], camLook: [0,bY+1,0], fov:70+Math.sin(p*Math.PI*3)*8, roll:Math.sin(a)*0.12, showT:true, speed:3+Math.abs(Math.sin(a))*2 };
      } if (loop < 14) { // World flip
        const p = (loop-10)/4;
        return { camPos: [4-p*8,bY+1+p*3,4-p*6], camLook: [0,bY+0.8,0], fov:80, roll:p*Math.PI, showT:true, speed:5 };
      } if (loop < 18) { // Flipped view
        const p = (loop-14)/4; const a = p*Math.PI;
        return { camPos: [Math.cos(a)*5,bY+2,Math.sin(a)*5], camLook: [0,bY+1,0], fov:75, roll:Math.PI-p*Math.PI*0.3, showT:true, speed:4 };
      } if (loop < 22) { // Explosion — pull up
        const p = (loop-18)/4;
        return { camPos: [0,bY+2+p*6,6-p*2], camLook: [0,bY+0.5,0], fov:85, roll:Math.PI*(0.7-p*0.7), showT:true, speed:3+p*2 };
      } { // Settle
        const p = (loop-22)/8; const a = p*Math.PI;
        return { camPos: [Math.cos(a)*7,bY+2,Math.sin(a)*7], camLook: [0,bY+1,0], fov:65, roll:0, showT:true, speed:1.5 };
      }
    }
  },

  // ======= 5. 젠이츠 vs 카이가쿠 — 번개 일격 =======
  zenitsu: {
    duration: 35,
    getPhase(loop) {
      const bY = -5;
      // Fall (0-3)
      if (loop < 3) { const p = loop/3; const fY = 30-p*35;
        return { camPos: [2,fY-3,3], camLook: [0,fY+1,0], fov:80, roll:p*0.15, showT:true, speed:4 };
      }
      // Land + Run alone (3-12) — behind camera, tense
      if (loop < 12) { const p = (loop-3)/9;
        const runX = (SHAFT_W-3) - p*(SHAFT_W-3+6);
        return { camPos: [runX-2,bY+1.5,2], camLook: [runX+2,bY+0.8,0], fov:70, roll:0, showT:true, speed:4 };
      }
      // Kaigaku appears (12-14) — wide shot both
      if (loop < 14) { const p = (loop-12)/2;
        return { camPos: [0,bY+1.5,5], camLook: [0,bY+0.8,0], fov:55+p*5, roll:0, showT:true, speed:0.5 };
      }
      // ft = fight time starting from 14
      const ft = loop - 14;
      // Standoff (ft 0-3) — side view, both visible
      if (ft < 3) {
        return { camPos: [0,bY+1.3,4], camLook: [0,bY+0.8,0], fov:50, roll:0, showT:true, speed:0.3 };
      }
      // 화뢰신 buildup (ft 3-4) — close-up on Zenitsu
      if (ft < 4) { const p = ft-3;
        return { camPos: [-3,bY+0.8,2], camLook: [-5,bY+0.6,0], fov:45+p*10, roll:p*0.05, showT:true, speed:0.5 };
      }
      // 화뢰신 DASH (ft 4-5.5) — side tracking, CLOSE to ground
      if (ft < 5.5) { const p = (ft-4)/1.5;
        return { camPos: [-5+p*13,bY+0.6,2.5], camLook: [-5+p*13,bY+0.5,0], fov:85+p*15, roll:p*0.1, showT:true, speed:6 };
      }
      // IMPACT (ft 5.5-7) — behind Zenitsu classic shot
      if (ft < 7) { const p = (ft-5.5)/1.5;
        return { camPos: [7,bY+1,1.5-p*0.5], camLook: [5,bY+0.7,0], fov:65-p*10, roll:0, showT:true, speed:1 };
      }
      // Aftermath (ft 7-11) — slow orbit around standing Zenitsu
      if (ft < 11) { const p = (ft-7)/4; const a = p*Math.PI*0.5;
        return { camPos: [6+Math.cos(a)*2,bY+1+p,Math.sin(a)*3], camLook: [6,bY+0.5,0], fov:55, roll:0, showT:true, speed:0.5 };
      }
      // Resolution
      { const p = (ft-11)/10;
        return { camPos: [4+p*3,bY+2+p*3,4+p*2], camLook: [4,bY+0.5,0], fov:60, roll:0, showT:p<0.6, speed:1 };
      }
    }
  },

  // ======= 6. 탄지로 vs 무잔 — 최종결전 =======
  muzan: {
    duration: 50,
    getPhase(loop) {
      const bY = 15; // muzan arena floor
      const shakeT = loop > 10 ? Math.sin(loop*8)*0.2*(1-Math.min(1,(loop-10)/25)) : 0;
      if (loop < 5) { // Approach muzan on the arena
        const p = loop/5;
        return { camPos: [10-p*5,bY+5-p*3,12-p*7], camLook: [0,bY+1,0], fov:50+p*10, roll:0, showT:false, speed:0.5 };
      } if (loop < 10) { // Muzan transforms — orbit at arena
        const p = (loop-5)/5; const a = p*Math.PI;
        return { camPos: [Math.cos(a)*8+shakeT,bY+2,Math.sin(a)*8], camLook: [0,bY+1,0], fov:65+p*20, roll:p*0.1+shakeT*0.3, showT:true, speed:2+p*3 };
      } if (loop < 15) { // All-out battle — rapid orbit + shake
        const p = (loop-10)/5; const a = p*Math.PI*2.5;
        return { camPos: [Math.cos(a)*6+shakeT,bY+1.5+Math.sin(p*Math.PI*4)*1.5+shakeT,Math.sin(a)*6], camLook: [shakeT,bY+0.8,shakeT], fov:80+Math.sin(p*Math.PI*6)*8, roll:Math.sin(a)*0.15+shakeT*0.5, showT:true, speed:5 };
      } if (loop < 19) { // Castle collapsing — world flips
        const p = (loop-15)/4;
        return { camPos: [shakeT*2,bY+2+p*5,8-p*4+shakeT], camLook: [shakeT,bY+0.5,shakeT], fov:90, roll:p*Math.PI*2+shakeT, showT:true, speed:5 };
      } if (loop < 24) { // Final attack — slow zoom
        const p = (loop-19)/5;
        return { camPos: [6-p*5+shakeT,bY+1.2,5-p*4], camLook: [shakeT*0.3,bY+0.8,0], fov:65-p*15, roll:shakeT*0.2, showT:true, speed:0.5+p*0.5 };
      } if (loop < 28) { // Rise up from arena
        const p = (loop-24)/4;
        return { camPos: [0,bY+3+p*15,5-p*2], camLook: [0,bY+1+p*10,0], fov:60+p*10, roll:0, showT:true, speed:3 };
      } { // Pull far out
        const p = (loop-28)/7; const a = p*Math.PI*0.5;
        return { camPos: [Math.cos(a)*15,bY+15,Math.sin(a)*15], camLook: [0,bY,0], fov:55, roll:0, showT:p<0.4, speed:1 };
      }
    }
  },

  // ======= 7. 까마귀의 눈 — 무한성 정찰 =======
  crow_eye: {
    duration: 45,
    getPhase(loop) {
      // Stay in OPEN CENTER of the shaft (±25 max, buildings are at ±30~40)
      const R = 20; // safe flight radius

      if (loop < 5) { // Circle high above center
        const p = loop/5; const a = p*Math.PI*0.8;
        return { camPos: [Math.cos(a)*R*0.6, 42-p*5, Math.sin(a)*R*0.6], camLook: [Math.cos(a+0.5)*5, 35-p*10, Math.sin(a+0.5)*5], fov:90, roll:Math.sin(a)*0.12, showT:false, speed:3 };
      }
      if (loop < 9) { // Dive straight down through center shaft
        const p = (loop-5)/4;
        const y = 37 - p*70;
        return { camPos: [Math.sin(p*Math.PI)*R*0.3, y, Math.cos(p*Math.PI)*R*0.3], camLook: [0, y-8, 0], fov:95, roll:p*0.15, showT:false, speed:5.5 };
      }
      if (loop < 13) { // Skim along bottom — weaving in center area
        const p = (loop-9)/4; const a = p*Math.PI*1.5;
        return { camPos: [Math.cos(a)*R*0.6, -33+p*8, Math.sin(a)*R*0.6], camLook: [Math.cos(a+0.5)*5, -35, Math.sin(a+0.5)*5], fov:85, roll:Math.sin(a)*0.1, showT:false, speed:5 };
      }
      if (loop < 17) { // Swoop up through center — looking at walls
        const p = (loop-13)/4;
        const y = -25 + p*55;
        const a = p*Math.PI*0.5;
        return { camPos: [Math.cos(a)*R*0.5, y, Math.sin(a)*R*0.5], camLook: [Math.cos(a)*R*1.5, y+3, Math.sin(a)*R*1.5], fov:80, roll:-p*0.08, showT:false, speed:4.5 };
      }
      if (loop < 21) { // Orbit center glow
        const p = (loop-17)/4; const a = p*Math.PI*2;
        return { camPos: [Math.cos(a)*R*0.4, 5+Math.sin(p*Math.PI*2)*8, Math.sin(a)*R*0.4], camLook: [0, 3, 0], fov:75, roll:Math.sin(a*2)*0.08, showT:false, speed:3 };
      }
      if (loop < 25) { // Fly between buildings — staying in corridor gaps, looking sideways at walls
        const p = (loop-21)/4;
        const y = 10 + Math.sin(p*Math.PI)*5;
        return { camPos: [Math.cos(p*Math.PI)*R*0.7, y, Math.sin(p*Math.PI)*R*0.7], camLook: [Math.cos(p*Math.PI+0.3)*R*1.2, y-2, Math.sin(p*Math.PI+0.3)*R*1.2], fov:80, roll:Math.sin(p*Math.PI*3)*0.06, showT:false, speed:4 };
      }
      if (loop < 30) { // Center shaft dive — world flip!
        const p = (loop-25)/5;
        const y = 25 - p*55;
        return { camPos: [Math.sin(p*Math.PI*2)*R*0.3, y, Math.cos(p*Math.PI*2)*R*0.3], camLook: [0, y-10, 0], fov:95+p*10, roll:p*Math.PI, showT:false, speed:6 };
      }
      if (loop < 35) { // Upside-down circle — looking up at inverted buildings
        const p = (loop-30)/5; const a = p*Math.PI;
        return { camPos: [Math.cos(a)*R*0.6, 40, Math.sin(a)*R*0.6], camLook: [Math.cos(a+0.3)*R*0.8, 45, Math.sin(a+0.3)*R*0.8], fov:80, roll:Math.PI*(1-p*0.5), showT:false, speed:4 };
      }
      if (loop < 40) { // Spiral down to center
        const p = (loop-35)/5; const a = p*Math.PI*3;
        const y = 35 - p*30;
        const r = R*0.7 - p*R*0.4;
        return { camPos: [Math.cos(a)*r, y, Math.sin(a)*r], camLook: [0, y-5, 0], fov:80-p*15, roll:Math.sin(a)*0.06+Math.PI*0.5*(1-p), showT:false, speed:4 };
      }
      { // Approach Nakime's room
        const p = (loop-40)/5; const a = p*Math.PI*0.5;
        return { camPos: [Math.cos(a)*5, 53+p*2, Math.sin(a)*5+2], camLook: [0, 55+0.8, 0], fov:65, roll:0, showT:false, speed:1.5 };
      }
    }
  },
};

function getTourPhase(t) {
  const tour = EVENT_TOURS[currentEvent];
  const loop = t % tour.duration;
  const phase = tour.getPhase(loop);
  return {
    camPos: phase.camPos,
    camLook: phase.camLook,
    fov: phase.fov,
    roll: phase.roll || 0,
    showTanjiro: phase.showT !== undefined ? phase.showT : true,
    speed: phase.speed || 1,
  };
}

function getTanjiroTransform(t) {
  const tour = EVENT_TOURS[currentEvent];
  const loop = t % tour.duration;
  for (let i = 0; i < tanjiroPath.length - 1; i++) {
    const a = tanjiroPath[i], b = tanjiroPath[i + 1];
    if (loop >= a.t && loop < b.t) {
      const p = ss((loop - a.t) / (b.t - a.t));
      return { x:a.pos[0]+(b.pos[0]-a.pos[0])*p, y:a.pos[1]+(b.pos[1]-a.pos[1])*p, z:a.pos[2]+(b.pos[2]-a.pos[2])*p,
        rx:a.rot[0]+(b.rot[0]-a.rot[0])*p, ry:a.rot[1]+(b.rot[1]-a.rot[1])*p, rz:a.rot[2]+(b.rot[2]-a.rot[2])*p };
    }
  }
  const last = tanjiroPath[tanjiroPath.length - 1];
  return { x:last.pos[0], y:last.pos[1], z:last.pos[2], rx:last.rot[0], ry:last.rot[1], rz:last.rot[2] };
}

function updateAutoTour(dt) {
  if (!autoTour) return;
  tourTime += dt;
  const phase = getTourPhase(tourTime);
  const tour = EVENT_TOURS[currentEvent];
  const loop = tourTime % tour.duration;

  camera.position.set(phase.camPos[0], phase.camPos[1], phase.camPos[2]);
  camera.lookAt(phase.camLook[0], phase.camLook[1], phase.camLook[2]);
  if (phase.roll !== 0) camera.rotateZ(phase.roll);
  camera.fov += (phase.fov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();

  // Event-specific character animation
  const ec = eventCharacters[currentEvent];
  if (ec && ec.animate) {
    ec.animate(tourTime, loop);
  } else {
    // Default: nakime event — use tanjiro path
    tanjiro.visible = phase.showTanjiro;
    if (phase.showTanjiro) {
      const tt = getTanjiroTransform(tourTime);
      tanjiro.position.set(tt.x, tt.y, tt.z);
      tanjiro.rotation.set(tt.rx, tt.ry, tt.rz);
    }
  }
}

// ============ SPEED LINES ============
const slCount = 300;
const slGeo2 = new THREE.BufferGeometry();
const slPos = new Float32Array(slCount * 6);
for (let i = 0; i < slCount; i++) {
  const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 4;
  const x = Math.cos(a) * r, y = Math.sin(a) * r, z = -Math.random() * 20;
  slPos[i * 6] = x; slPos[i * 6 + 1] = y; slPos[i * 6 + 2] = z;
  slPos[i * 6 + 3] = x; slPos[i * 6 + 4] = y; slPos[i * 6 + 5] = z - 3 - Math.random() * 5;
}
slGeo2.setAttribute('position', new THREE.BufferAttribute(slPos, 3));
const speedLines = new THREE.LineSegments(slGeo2,
  new THREE.LineBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
scene.add(speedLines);

// ============ AUDIO ============
let audioCtx = null, masterGain = null, windGain = null, windFilter = null;
let droneGain = null, biwaInterval = null, audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain(); masterGain.gain.value = 0.7;
  masterGain.connect(audioCtx.destination);

  // Drone
  droneGain = audioCtx.createGain(); droneGain.gain.value = 0.12; droneGain.connect(masterGain);
  const d1 = audioCtx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 55; d1.connect(droneGain); d1.start();
  const d2 = audioCtx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 82.4;
  const dg2 = audioCtx.createGain(); dg2.gain.value = 0.08; dg2.connect(masterGain); d2.connect(dg2); d2.start();
  const sub = audioCtx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 27.5;
  const sg = audioCtx.createGain(); sg.gain.value = 0.06; sg.connect(masterGain); sub.connect(sg); sub.start();
  const lfo = audioCtx.createOscillator(); lfo.frequency.value = 0.15;
  const lg = audioCtx.createGain(); lg.gain.value = 5; lfo.connect(lg); lg.connect(d1.frequency); lfo.start();

  // Wind
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const wn = audioCtx.createBufferSource(); wn.buffer = buf; wn.loop = true;
  windFilter = audioCtx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.5;
  windGain = audioCtx.createGain(); windGain.gain.value = 0;
  wn.connect(windFilter); windFilter.connect(windGain); windGain.connect(masterGain); wn.start();

  startBiwaLoop();
}

const biwaFreqs = [220, 233.08, 293.66, 329.63, 349.23, 440, 466.16, 587.33];
function playBiwaPluck() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  const freq = biwaFreqs[Math.floor(Math.random() * biwaFreqs.length)];
  const osc = audioCtx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 4;
  f.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 1.5);
  const env = audioCtx.createGain(); env.gain.setValueAtTime(0.25, now);
  env.gain.exponentialRampToValueAtTime(0.15, now + 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
  osc.connect(f); f.connect(env); env.connect(masterGain); osc.start(now); osc.stop(now + 2.0);
  const o2 = audioCtx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
  const e2 = audioCtx.createGain(); e2.gain.setValueAtTime(0.08, now);
  e2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  o2.connect(e2); e2.connect(masterGain); o2.start(now); o2.stop(now + 1.0);
}
function startBiwaLoop() {
  if (biwaInterval) return;
  function next() { playBiwaPluck(); biwaInterval = setTimeout(next, 1500 + Math.random() * 2500); }
  biwaInterval = setTimeout(next, 800);
}
function updateAudio(speed) {
  if (!audioCtx || !windGain) return;
  windGain.gain.value += (Math.max(0, (speed - 0.5) * 0.08) - windGain.gain.value) * 0.05;
  if (windFilter) windFilter.frequency.value += (300 + speed * 200 - windFilter.frequency.value) * 0.05;
  if (droneGain) droneGain.gain.value += ((speed < 1.5 ? 0.15 : 0.05) - droneGain.gain.value) * 0.02;
}

// ============ CONTROLS ============
const keys = {};
let moveSpeed = 0.3, yaw = 0, pitch = -0.05, isLocked = false, justStarted = false;

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && autoTour) {
    autoTour = false; manualMode = true;
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    yaw = Math.atan2(d.x, d.z); pitch = Math.asin(d.y);
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('click', () => {
  if (justStarted) { justStarted = false; return; }
  if (!isLocked && !autoTour && document.getElementById('overlay').classList.contains('hidden'))
    renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === renderer.domElement;
  if (isLocked && autoTour) {
    autoTour = false; manualMode = true;
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    yaw = Math.atan2(d.x, d.z); pitch = Math.asin(d.y);
  }
});
document.addEventListener('mousemove', e => {
  if (!isLocked) return;
  yaw -= e.movementX * 0.002;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.002));
});
document.addEventListener('wheel', e => { moveSpeed = Math.max(0.1, Math.min(2, moveSpeed + e.deltaY * 0.002)); });

window.startExperience = () => {
  document.getElementById('overlay').classList.add('hidden');
  autoTour = true; manualMode = false; justStarted = true;
  tourTime = 0;
};
window.startEvent = (eventName) => {
  currentEvent = eventName;
  hideAllCharacters();
  showArena(eventName);
  document.getElementById('overlay').classList.add('hidden');
  autoTour = true; manualMode = false; justStarted = true;
  tourTime = 0;
};

// Bind event buttons
document.querySelectorAll('[data-event]').forEach(btn => {
  btn.addEventListener('click', () => window.startEvent(btn.dataset.event));
});

// ============ LANGUAGE SWITCHING ============
const subtitles = { ko: '키부츠지 무잔의 거성', ja: '鬼舞辻無惨の居城', en: 'Fortress of Kibutsuji Muzan' };
let currentLang = 'ko';

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Update subtitle
    document.getElementById('subtitle').textContent = subtitles[currentLang];
    // Update event buttons
    document.querySelectorAll('[data-event]').forEach(eb => {
      const text = eb.getAttribute('data-' + currentLang);
      if (text) eb.textContent = text;
    });
  });
});

// ============ MUSIC SYSTEM (procedural Japanese-style BGM) ============
let musicCtx = null;
let musicPlaying = false;
let musicGain = null;
let musicNodes = [];

function createMusic() {
  if (musicCtx) {
    // Already created — just resume and restore volume
    if (musicCtx.state === 'suspended') musicCtx.resume();
    if (musicGain) musicGain.gain.value = 0.3;
    return;
  }
  musicCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicGain = musicCtx.createGain();
  musicGain.gain.value = 0.3;
  musicGain.connect(musicCtx.destination);

  // === Layer 1: Low drone (ominous pad) ===
  const drone = musicCtx.createOscillator();
  drone.type = 'sine'; drone.frequency.value = 55; // A1
  const droneG = musicCtx.createGain(); droneG.gain.value = 0.12;
  drone.connect(droneG); droneG.connect(musicGain); drone.start();
  musicNodes.push(drone);

  const drone2 = musicCtx.createOscillator();
  drone2.type = 'sine'; drone2.frequency.value = 82.4; // E2
  const droneG2 = musicCtx.createGain(); droneG2.gain.value = 0.08;
  drone2.connect(droneG2); droneG2.connect(musicGain); drone2.start();
  musicNodes.push(drone2);

  // Sub bass
  const sub = musicCtx.createOscillator();
  sub.type = 'sine'; sub.frequency.value = 27.5; // A0
  const subG = musicCtx.createGain(); subG.gain.value = 0.05;
  sub.connect(subG); subG.connect(musicGain); sub.start();
  musicNodes.push(sub);

  // Slow LFO on drone pitch
  const lfo = musicCtx.createOscillator();
  lfo.frequency.value = 0.1;
  const lfoG = musicCtx.createGain(); lfoG.gain.value = 3;
  lfo.connect(lfoG); lfoG.connect(drone.frequency); lfo.start();
  musicNodes.push(lfo);

  // === Layer 2: Biwa plucks (Japanese pentatonic scale) ===
  const biwaFreqs = [110, 146.83, 164.81, 220, 233.08, 293.66, 329.63, 440];

  function pluckBiwa() {
    if (!musicPlaying || !musicCtx || musicCtx.state !== 'running') return;
    const now = musicCtx.currentTime;
    const freq = biwaFreqs[Math.floor(Math.random() * biwaFreqs.length)];

    // Main string
    const osc = musicCtx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    const flt = musicCtx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = freq * 3;
    flt.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 2);
    const env = musicCtx.createGain();
    env.gain.setValueAtTime(0.18, now);
    env.gain.exponentialRampToValueAtTime(0.1, now + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    osc.connect(flt); flt.connect(env); env.connect(musicGain);
    osc.start(now); osc.stop(now + 2.5);

    // Harmonic overtone
    const h = musicCtx.createOscillator();
    h.type = 'triangle'; h.frequency.value = freq * 2;
    const hG = musicCtx.createGain();
    hG.gain.setValueAtTime(0.06, now);
    hG.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    h.connect(hG); hG.connect(musicGain);
    h.start(now); h.stop(now + 1.5);

    // Schedule next note (irregular spacing for atmosphere)
    const delay = 1800 + Math.random() * 3500;
    setTimeout(pluckBiwa, delay);
  }
  setTimeout(pluckBiwa, 500);

  // === Layer 3: Shamisen-like rhythmic pattern ===
  function playRhythm() {
    if (!musicPlaying || !musicCtx || musicCtx.state !== 'running') return;
    const now = musicCtx.currentTime;
    const freq = [110, 130.81, 146.83, 164.81][Math.floor(Math.random() * 4)];

    const o = musicCtx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const f = musicCtx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq * 2; f.Q.value = 2;
    const e = musicCtx.createGain();
    e.gain.setValueAtTime(0.04, now);
    e.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    o.connect(f); f.connect(e); e.connect(musicGain);
    o.start(now); o.stop(now + 0.15);

    // Rhythmic pattern: groups of 2-3 hits
    const pattern = Math.random();
    if (pattern < 0.4) {
      // Double hit
      setTimeout(playRhythm, 200);
    } else {
      // Pause then next group
      setTimeout(playRhythm, 2000 + Math.random() * 4000);
    }
  }
  setTimeout(playRhythm, 3000);

  // === Layer 4: Wind ambience ===
  const windBuf = musicCtx.createBuffer(1, musicCtx.sampleRate * 3, musicCtx.sampleRate);
  const ch = windBuf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const wind = musicCtx.createBufferSource();
  wind.buffer = windBuf; wind.loop = true;
  const wFlt = musicCtx.createBiquadFilter();
  wFlt.type = 'bandpass'; wFlt.frequency.value = 300; wFlt.Q.value = 0.3;
  const wG = musicCtx.createGain(); wG.gain.value = 0.03;
  wind.connect(wFlt); wFlt.connect(wG); wG.connect(musicGain);
  wind.start();
  musicNodes.push(wind);

  // Slow modulation of wind
  const wLfo = musicCtx.createOscillator();
  wLfo.frequency.value = 0.05;
  const wLfoG = musicCtx.createGain(); wLfoG.gain.value = 100;
  wLfo.connect(wLfoG); wLfoG.connect(wFlt.frequency); wLfo.start();
  musicNodes.push(wLfo);

  // === Layer 5: Taiko-like deep hit (rare) ===
  function playTaiko() {
    if (!musicPlaying || !musicCtx || musicCtx.state !== 'running') return;
    const now = musicCtx.currentTime;
    const o = musicCtx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(80, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    const e = musicCtx.createGain();
    e.gain.setValueAtTime(0.15, now);
    e.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    o.connect(e); e.connect(musicGain);
    o.start(now); o.stop(now + 1.0);

    // Noise burst for attack
    const nb = musicCtx.createBufferSource();
    const nBuf = musicCtx.createBuffer(1, musicCtx.sampleRate * 0.05, musicCtx.sampleRate);
    const nCh = nBuf.getChannelData(0);
    for (let i = 0; i < nCh.length; i++) nCh[i] = Math.random() * 2 - 1;
    nb.buffer = nBuf;
    const nE = musicCtx.createGain();
    nE.gain.setValueAtTime(0.1, now);
    nE.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    nb.connect(nE); nE.connect(musicGain);
    nb.start(now);

    setTimeout(playTaiko, 6000 + Math.random() * 10000);
  }
  setTimeout(playTaiko, 5000);
}

function toggleMusic() {
  const btn = document.getElementById('music-toggle');
  if (!musicPlaying) {
    musicPlaying = true; // set BEFORE createMusic so setTimeout callbacks see it
    createMusic();
    // Force resume on mobile (requires user gesture — this click IS the gesture)
    if (musicCtx && musicCtx.state === 'suspended') {
      musicCtx.resume().then(() => {
        console.log('AudioContext resumed');
      });
    }
    if (musicGain) musicGain.gain.value = 0.3;
    btn.textContent = '♪ Music ON';
    btn.style.borderColor = '#ffaa55';
  } else {
    musicPlaying = false;
    if (musicGain) musicGain.gain.value = 0;
    btn.textContent = '♪ Music OFF';
    btn.style.borderColor = '#ff662266';
  }
}

// Handle both click and touch — prevent double-fire
let musicBtnTouched = false;
document.getElementById('music-toggle').addEventListener('touchend', (e) => {
  e.preventDefault();
  musicBtnTouched = true;
  toggleMusic();
  setTimeout(() => { musicBtnTouched = false; }, 300);
});
document.getElementById('music-toggle').addEventListener('click', () => {
  if (!musicBtnTouched) toggleMusic();
});

// ============ ANIMATE ============
const clock = new THREE.Clock();
let lastTime = 0;
const _dir = new THREE.Vector3();

// Hide loading after castle is built
buildCastle().then(() => {
  setLoad(100, 'Ready!');
  setTimeout(() => {
    const ld = document.getElementById('loading');
    if (ld) ld.style.display = 'none';
  }, 300);
  animate();
});

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - lastTime, 0.1);
  lastTime = t;

  if (autoTour) { updateAutoTour(dt); }
  else {
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    if (keys['KeyW'] || keys['ArrowUp']) camera.position.addScaledVector(fwd, moveSpeed);
    if (keys['KeyS'] || keys['ArrowDown']) camera.position.addScaledVector(fwd, -moveSpeed);
    if (keys['KeyA'] || keys['ArrowLeft']) camera.position.addScaledVector(right, -moveSpeed);
    if (keys['KeyD'] || keys['ArrowRight']) camera.position.addScaledVector(right, moveSpeed);
    if (keys['Space']) camera.position.y += moveSpeed;
    if (keys['ShiftLeft'] || keys['ShiftRight']) camera.position.y -= moveSpeed;
    camera.lookAt(camera.position.x + fwd.x, camera.position.y + fwd.y, camera.position.z + fwd.z);
  }

  // Particles (update every other frame for perf)
  if (Math.floor(t * 30) % 2 === 0) {
    const pos = particles.geometry.attributes.position.array;
    for (let i = 0; i < pCount; i++) {
      pos[i * 3 + 1] += 0.02;
      if (pos[i * 3 + 1] > SHAFT_HEIGHT / 2) pos[i * 3 + 1] = -SHAFT_HEIGHT / 2;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // Core pulse
  coreLight.intensity = 8 * (1.0 + Math.sin(t * 0.8) * 0.3);
  coreOrb.material.opacity = 0.1 + Math.sin(t * 0.5) * 0.05;

  // Crows flying
  updateCrows(t);

  // Speed lines
  const phase = autoTour ? getTourPhase(tourTime) : null;
  const spd = phase ? phase.speed : 0;
  speedLines.material.opacity = Math.max(0, (spd - 2) * 0.2);
  speedLines.position.copy(camera.position);
  camera.getWorldDirection(_dir);
  speedLines.lookAt(camera.position.x + _dir.x, camera.position.y + _dir.y, camera.position.z + _dir.z);

  scene.fog.density = 0.003 + (1.0 / (spd + 2)) * 0.001;
  // updateAudio(spd);
  renderer.render(scene, camera);
}
// animate() is called by buildCastle().then()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
