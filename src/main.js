import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

// ------------------------------------------------------------
// 基础设置
// ------------------------------------------------------------

const container = document.querySelector('#scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
} catch (error) {
  container.innerHTML = `
    <div class="error">
      无法启动 WebGL。请启用浏览器硬件加速，
      或使用支持 WebGL 2 的新版 Chrome、Edge、Firefox。
    </div>`;
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7d8c1');
scene.fog = new THREE.Fog('#e7d8c1', 220, 550);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.5,
  1200
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.maxPolarAngle = Math.PI / 2.12;
controls.minPolarAngle = 0.18;
controls.minDistance = 32;
controls.maxDistance = 600;
controls.autoRotateSpeed = 0.45;
controls.enablePan = true;

const hemisphere = new THREE.HemisphereLight('#fff1d8', '#68775a', 2.1);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight('#ffd29c', 3.2);
sun.position.set(-65, 95, 65);
sun.target.position.set(0, 0, -5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -85;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.normalBias = 0.06;
sun.shadow.bias = -0.00015;
scene.add(sun, sun.target);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({
    color: '#cbbfa8',
    roughness: 1
  })
);
backdrop.rotation.x = -Math.PI / 2;
backdrop.position.y = -2.9;
backdrop.receiveShadow = true;
scene.add(backdrop);

// ------------------------------------------------------------
// 确定性随机数，以及按材质分类的体素实例队列
// 整个建筑群共享一个单位立方体 Geometry。
// ------------------------------------------------------------

let seed = 202503;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function choose(items) {
  return items[Math.floor(random() * items.length)];
}
const clamp = THREE.MathUtils.clamp;

const C = {
  stone: '#b8b3a3',
  stoneLight: '#d9d0ba',
  stoneDark: '#8f958c',
  red: '#a43d30',
  redLight: '#ba503b',
  redDark: '#752e28',
  wood: '#64412d',
  woodLight: '#9e6c3c',
  gold: '#e1af55',
  dark: '#303c38',
  leaf: ['#56714a', '#688450', '#7d9358', '#486443'],
  jade: ['#337c75', '#3b8b80', '#29695f', '#508f7c'],
  yellow: ['#d79a3e', '#e5aa47', '#bc8032', '#edb854']
};

const buckets = new Map();

function box(
  x, y, z,
  sx, sy, sz,
  color,
  bucket = 'structure',
  rotation = 0
) {
  if (sx <= 0 || sy <= 0 || sz <= 0) return;
  if (!buckets.has(bucket)) buckets.set(bucket, []);
  buckets.get(bucket).push({
    x, y, z, sx, sy, sz, color, rotation
  });
}

// 创建局部坐标构建器，使配殿可以旋转朝向中轴。
// 局部 +Z 始终代表建筑正面。
function builder(cx, cz, rotation = 0) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const b = (x, y, z, sx, sy, sz, color, bucket = 'structure') => {
    box(
      cx + x * cos + z * sin,
      y,
      cz - x * sin + z * cos,
      sx, sy, sz,
      color,
      bucket,
      rotation
    );
  };

  b.point = (x, y, z) => new THREE.Vector3(
    cx + x * cos + z * sin,
    y,
    cz - x * sin + z * cos
  );
  b.rotation = rotation;
  return b;
}

// ------------------------------------------------------------
// 地形、院落、道路
// ------------------------------------------------------------

// 厚实的沙盘基底。
box(0, -1.48, 0, 110, 2.6, 122, '#858776', 'terrain');
box(0, -0.18, 0, 109, 0.32, 121, '#87916b', 'terrain');
box(0, -2.6, 0, 111, 0.35, 123, '#a5a38f', 'terrain');

// 院落铺砖；水池区域预留，不用水面覆盖大量无用砖块。
const paving = ['#b7b5a5', '#c2bead', '#bcb9a9', '#aaaE9e'];

for (let x = -22.5; x <= 22.5; x += 1.5) {
  for (let z = -15; z <= 34.5; z += 1.5) {
    const inPool =
      Math.abs(Math.abs(x) - 15) < 4.5 &&
      Math.abs(z - 12) < 6.6;

    if (!inPool) {
      box(x, 0.035, z, 1.44, 0.14, 1.44, choose(paving), 'paving');
    }
  }
}

function path(x, z, width, depth) {
  const step = 1.25;
  const nx = Math.max(1, Math.round(width / step));
  const nz = Math.max(1, Math.round(depth / step));

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const edge = ix === 0 || ix === nx - 1;
      box(
        x - width / 2 + (ix + 0.5) * width / nx,
        0.14,
        z - depth / 2 + (iz + 0.5) * depth / nz,
        width / nx - 0.035,
        0.18,
        depth / nz - 0.035,
        edge ? '#9c9c8d' : choose(['#d3cbb6', '#c9c3af', '#ded5bf']),
        'paving'
      );
    }
  }
}

// 山门 → 庭院 → 主殿，一条连续的中轴道路。
path(0, 22, 7.5, 76);
path(0, -7, 74, 5);
path(0, 29, 75, 4);

// 中轴上的浅色石板纹样。
for (let z = -5; z <= 38; z += 5) {
  box(0, 0.245, z, 0.6, 0.035, 1.7, '#a99d80', 'paving');
  box(-0.8, 0.245, z, 0.35, 0.035, 0.6, '#b5a787', 'paving');
  box(0.8, 0.245, z, 0.35, 0.035, 0.6, '#b5a787', 'paving');
}

// ------------------------------------------------------------
// 屋顶：阶梯状庑殿顶、歇山顶、攒尖顶
// 屋面为独立立方体瓦块；角部额外抬升形成飞檐。
// ------------------------------------------------------------

function roof(
  b,
  y,
  width,
  depth,
  rise,
  palette = C.jade,
  style = 'hip'
) {
  const unit = 0.8;
  const nx = Math.ceil(width / unit);
  const nz = Math.ceil(depth / unit);
  const hx = nx * unit / 2;
  const hz = nz * unit / 2;
  const gableX = Math.max(unit, hx - hz * 0.52);

  for (let ix = 0; ix < nx; ix++) {
    const x = (ix + 0.5) * unit - hx;

    for (let iz = 0; iz < nz; iz++) {
      const z = (iz + 0.5) * unit - hz;
      const ax = Math.abs(x);
      const az = Math.abs(z);

      // 靠脊较陡、近檐较缓，量化后形成体素折线。
      const zSlope = rise * (1 - Math.pow(az / hz, 0.78));
      const xSlope = rise * Math.min(1, (hx - ax) / hz);
      let height = Math.min(zSlope, xSlope);

      if (style === 'xieshan') {
        height = ax < gableX
          ? zSlope
          : Math.min(
              zSlope,
              rise * 0.5 * (hx - ax) / (hx - gableX)
            );
      }

      const cornerX = clamp((ax / hx - 0.65) / 0.35, 0, 1);
      const cornerZ = clamp((az / hz - 0.65) / 0.35, 0, 1);
      height += 1.7 * cornerX * cornerZ;
      height = Math.round(height / 0.4) * 0.4;

      const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;

      b(
        x, y + height, z,
        unit, unit, unit,
        edge ? C.gold : choose(palette),
        'roof'
      );

      // 深色檐口压边，增强悬挑层次。
      if (edge) {
        b(
          x, y + height - 0.55, z,
          unit, 0.3, unit,
          C.wood,
          'wood'
        );
      }
    }
  }

  // 歇山顶上部的木质山花，填充上部悬山端面。
  if (style === 'xieshan') {
    for (const sign of [-1, 1]) {
      for (let iz = 0; iz < nz; iz++) {
        const z = (iz + 0.5) * unit - hz;
        const top = rise * (1 - Math.pow(Math.abs(z) / hz, 0.78));
        const height = top - rise * 0.47;

        if (height > 0) {
          b(
            sign * (gableX - 0.15),
            y + rise * 0.47 + height / 2,
            z,
            0.45, height, unit,
            C.redDark,
            'wood'
          );
        }
      }
    }
  }

  const ridgeHalf = style === 'xieshan'
    ? gableX
    : Math.max(0, hx - hz);

  // 正脊及两端鸱吻的体素抽象。
  for (let x = -ridgeHalf; x <= ridgeHalf; x += unit) {
    b(x, y + rise + 0.35, 0, unit, 0.65, 0.7, C.gold, 'roof');
  }

  if (ridgeHalf > 1) {
    for (const sign of [-1, 1]) {
      b(sign * ridgeHalf, y + rise + 0.85, 0, 0.8, 0.9, 0.8, C.gold, 'roof');
      b(sign * (ridgeHalf - 0.35), y + rise + 1.4, 0, 0.6, 0.5, 0.6, C.gold, 'roof');
    }
  } else {
    // 攒尖顶宝顶。
    b(0, y + rise + 0.9, 0, 1, 1, 1, C.gold, 'roof');
    b(0, y + rise + 1.8, 0, 0.45, 1.1, 0.45, C.gold, 'roof');
  }

  // 四角以逐级上升的小方块延伸，形成明显翘角。
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        b(
          sx * (hx - 0.4 + k * 0.45),
          y + 1.65 + k * 0.4,
          sz * (hz - 0.4 + k * 0.45),
          0.65, 0.6, 0.65,
          C.gold,
          'roof'
        );
      }
    }
  }
}

// ------------------------------------------------------------
// 柱、斗拱、灯笼、牌匾、台阶、栏杆
// ------------------------------------------------------------

function column(b, x, z, base, height) {
  b(x, base + 0.18, z, 1.12, 0.36, 1.12, C.stoneLight);
  b(x, base + height / 2, z, 0.65, height, 0.65, C.red, 'wood');
  b(x, base + height - 0.2, z, 0.85, 0.25, 0.85, C.gold, 'wood');

  // 三层互相交错的承托，抽象斗、拱、昂。
  const y = base + height;
  b(x, y, z, 1.25, 0.36, 1.15, C.woodLight, 'wood');
  b(x, y + 0.34, z, 1.8, 0.32, 0.62, C.redDark, 'wood');
  b(x, y + 0.66, z, 0.7, 0.32, 1.95, C.woodLight, 'wood');

  for (const sign of [-1, 1]) {
    b(x + sign * 0.7, y + 0.48, z, 0.42, 0.55, 0.6, C.gold, 'wood');
    b(x, y + 0.8, z + sign * 0.7, 0.6, 0.36, 0.55, C.redDark, 'wood');
  }
}

function lantern(b, x, y, z) {
  b(x, y + 0.85, z, 0.09, 0.8, 0.09, C.wood, 'wood');
  b(x, y + 0.35, z, 0.8, 0.18, 0.8, C.gold, 'wood');
  b(x, y - 0.15, z, 0.78, 0.9, 0.78, '#e76432', 'glow');
  b(x, y - 0.7, z, 0.85, 0.18, 0.85, C.gold, 'wood');
  b(x, y - 1.05, z, 0.15, 0.55, 0.15, '#bc3a29', 'wood');

  for (const sign of [-1, 1]) {
    b(x + sign * 0.29, y - 0.15, z + 0.4, 0.055, 0.85, 0.05, C.gold, 'wood');
  }
}

function plaque(b, text, y, z, width = 5) {
  b(0, y, z, width, 1.55, 0.3, C.gold, 'wood');
  b(0, y, z + 0.19, width - 0.2, 1.34, 0.12, '#253a36', 'wood');

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffe1a0';
  ctx.font = 'bold 136px "Songti SC", SimSun, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 384, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.42, 1.2),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  );

  mesh.position.copy(b.point(0, y, z + 0.26));
  mesh.rotation.y = b.rotation;
  scene.add(mesh);
}

function stairs(b, width, front, height, count = 6) {
  const run = 0.65;

  for (let i = 0; i < count; i++) {
    const h = height * (i + 1) / count;
    b(
      0,
      h / 2,
      front + (count - i - 0.5) * run,
      width, h, run + 0.035,
      i % 2 ? C.stoneLight : C.stone
    );
  }
}

function railing(b, x1, z1, x2, z2, y) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const count = Math.max(1, Math.ceil(length / 2.2));

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = THREE.MathUtils.lerp(x1, x2, t);
    const z = THREE.MathUtils.lerp(z1, z2, t);

    b(x, y + 0.7, z, 0.4, 1.4, 0.4, C.stoneLight);
    b(x, y + 1.46, z, 0.56, 0.22, 0.56, C.stoneLight);
  }

  const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  for (const h of [0.48, 1.06]) {
    b(
      (x1 + x2) / 2, y + h, (z1 + z2) / 2,
      horizontal ? length : 0.24,
      0.23,
      horizontal ? 0.24 : length,
      C.stoneLight
    );
  }
}

function windowPanel(b, x, y, z, width, height) {
  b(x, y, z, width, height, 0.2, C.dark, 'wood');

  for (let i = -2; i <= 2; i++) {
    b(
      x + i * width / 5,
      y,
      z + 0.14,
      0.09, height, 0.12,
      C.woodLight,
      'wood'
    );
  }

  for (let i = -1; i <= 1; i++) {
    b(
      x,
      y + i * height / 3,
      z + 0.15,
      width, 0.09, 0.12,
      C.gold,
      'wood'
    );
  }

  b(x, y - height / 2 - 0.1, z, width + 0.25, 0.2, 0.4, C.woodLight, 'wood');
}

// ------------------------------------------------------------
// 殿堂：主殿 / 两座朝内配殿 / 可穿行山门
// ------------------------------------------------------------

function hall({
  x, z,
  width,
  depth,
  height = 6,
  base = 1.2,
  rotation = 0,
  name,
  main = false,
  gate = false
}) {
  const b = builder(x, z, rotation);
  const front = depth / 2;
  const roofY = base + height + 0.6;

  b(0, base / 2, 0, width + 3, base, depth + 3, C.stone);
  b(0, base - 0.08, 0, width + 3.5, 0.25, depth + 3.5, C.stoneLight);
  b(0, base + 0.12, 0, width + 0.8, 0.22, depth + 0.8, '#a99b83');

  stairs(b, gate ? 8 : main ? 10 : 6, front + 1.75, base, main ? 7 : 4);

  if (gate) {
    const blockWidth = (width - 7) / 2;
    for (const sign of [-1, 1]) {
      b(
        sign * (3.5 + blockWidth / 2),
        base + height / 2,
        -0.4,
        blockWidth, height - 0.3, depth - 2,
        C.red
      );
    }
    // 山门后方同样设置台阶，通向中庭。
    const back = builder(x, z, rotation + Math.PI);
    stairs(back, 8, front + 1.75, base, 4);
  } else {
    // 柱廊内部的围护墙，保留外檐空间。
    b(0, base + height / 2, -front + 1, width - 1, height - 0.3, 0.6, C.red);
    for (const sign of [-1, 1]) {
      b(
        sign * (width / 2 - 0.8),
        base + height / 2,
        0,
        0.65, height - 0.3, depth - 1.5,
        C.red
      );
    }

    // 前立面分格，中央为双扇门，两侧为木格窗。
    const count = main ? 6 : 4;
    const spacing = (width - 2) / (count - 1);

    for (let i = 0; i < count - 1; i++) {
      const px = -(width - 2) / 2 + (i + 0.5) * spacing;
      const central = i === (count - 2) / 2;
      const pz = front - 1.1;

      if (central) {
        b(px, base + 2.55, pz, spacing - 0.2, 5.1, 0.3, C.redDark, 'wood');

        for (const sign of [-1, 1]) {
          b(px + sign * 0.12, base + 2.6, pz + 0.2, 0.11, 4.9, 0.15, C.gold, 'wood');
          b(px + sign * 0.43, base + 2.35, pz + 0.32, 0.18, 0.25, 0.18, C.gold, 'wood');

          for (let row = 0; row < 4; row++) {
            b(
              px + sign * spacing * 0.28,
              base + 1.1 + row * 0.9,
              pz + 0.22,
              0.13, 0.13, 0.13,
              C.gold,
              'wood'
            );
          }
        }
      } else {
        b(px, base + 1, pz, spacing - 0.15, 2, 0.4, C.red);
        b(px, base + height - 0.75, pz, spacing - 0.15, 1.5, 0.4, C.red);
        windowPanel(
          b,
          px,
          base + height * 0.54,
          pz + 0.22,
          spacing - 0.65,
          height * 0.43
        );
      }
    }
  }

  const columnCount = main ? 6 : 4;
  for (let i = 0; i < columnCount; i++) {
    const px = -(width - 2) / 2 + i * (width - 2) / (columnCount - 1);
    column(b, px, front - 0.1, base, height);
    column(b, px, -front + 0.1, base, height);
  }

  for (const sign of [-1, 1]) {
    column(b, sign * (width / 2 - 1), 0, base, height);
  }

  // 额枋、檐枋与彩色收边。
  for (const sign of [-1, 1]) {
    b(0, base + height - 0.15, sign * front, width + 0.6, 0.6, 0.55, C.redDark, 'wood');
    b(0, base + height + 0.22, sign * front, width + 1, 0.25, 0.8, C.gold, 'wood');
    b(sign * width / 2, base + height, 0, 0.65, 0.5, depth, C.woodLight, 'wood');
  }

  if (main) {
    // 重檐：下层庑殿檐，上层歇山顶。
    roof(b, roofY, width + 6, depth + 6, 2.7, C.yellow, 'hip');

    b(
      0, roofY + 1.25, 0,
      width - 2.5, 2.5, depth - 2.5,
      C.redDark
    );

    roof(
      b,
      roofY + 2.5,
      width + 3.5,
      depth + 3.5,
      4.7,
      C.yellow,
      'xieshan'
    );

    const railZ = front + 1.55;
    railing(b, -width / 2 - 1.3, railZ, -5.6, railZ, base);
    railing(b, 5.6, railZ, width / 2 + 1.3, railZ, base);

    for (const sign of [-1, 1]) {
      railing(
        b,
        sign * (width / 2 + 1.3), -front - 1.3,
        sign * (width / 2 + 1.3), railZ,
        base
      );
    }
  } else {
    roof(
      b, roofY, width + 5, depth + 5,
      gate ? 3.2 : 3.8,
      C.jade,
      gate ? 'hip' : 'xieshan'
    );
  }

  plaque(b, name, base + height - 0.6, front + 0.46, main ? 5.6 : 4.5);

  for (const sign of [-1, 1]) {
    lantern(b, sign * (width / 2 - 2.2), base + height - 1.6, front + 0.75);
  }
}

hall({
  x: 0, z: -28,
  width: 30, depth: 20,
  height: 7.1, base: 2.1,
  name: '太和殿',
  main: true
});

hall({
  x: -32, z: -8,
  width: 21, depth: 13,
  height: 5.5, base: 1.2,
  rotation: Math.PI / 2,
  name: '崇文阁'
});

hall({
  x: 32, z: -8,
  width: 21, depth: 13,
  height: 5.5, base: 1.2,
  rotation: -Math.PI / 2,
  name: '尚武阁'
});

hall({
  x: 0, z: 46,
  width: 22, depth: 8,
  height: 5.3, base: 0.9,
  name: '承天门',
  gate: true
});

// ------------------------------------------------------------
// 对称钟鼓楼：三层收分体量 + 层层攒尖飞檐
// ------------------------------------------------------------

function tower(x, z, isBell) {
  const b = builder(x, z);
  b(0, 0.65, 0, 13, 1.3, 13, C.stone);
  b(0, 1.3, 0, 13.5, 0.3, 13.5, C.stoneLight);
  stairs(b, 5, 6.75, 1.4, 4);

  for (let level = 0; level < 3; level++) {
    const width = 10.5 - level * 1.65;
    const floor = 1.45 + level * 6.15;
    const height = 4.2;
    const r = width / 2 - 0.6;

    b(0, floor, 0, width + 1.2, 0.4, width + 1.2, C.woodLight, 'wood');

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        column(b, sx * r, sz * r, floor, height);
      }
    }

    if (level !== 1) {
      b(0, floor + 1.8, 0, width - 2.7, 3.6, width - 2.7, C.redDark);
      windowPanel(b, 0, floor + 2.1, r - 0.65, width - 3.8, 2.3);
    } else {
      // 中层透空，显露悬钟或大鼓。
      if (isBell) {
        b(0, floor + 3.6, 0, 0.22, 1.2, 0.22, C.wood, 'wood');
        b(0, floor + 2.6, 0, 1.35, 1.2, 1.35, '#927744', 'metal');
        b(0, floor + 1.8, 0, 1.95, 0.8, 1.95, '#aa8a4a', 'metal');
        b(0, floor + 1.28, 0, 2.2, 0.25, 2.2, C.gold, 'metal');
      } else {
        b(0, floor + 1.0, 0, 2.6, 0.3, 1.6, C.wood, 'wood');
        for (const sign of [-1, 1]) {
          b(sign * 0.9, floor + 0.75, 0, 0.3, 1.4, 1.5, C.red, 'wood');
        }
        b(0, floor + 2, 0, 2.6, 2.2, 1.6, C.red, 'wood');
        b(0, floor + 2, 0.88, 2.25, 1.85, 0.2, '#d5bb83', 'wood');
        b(0, floor + 2, -0.88, 2.25, 1.85, 0.2, '#d5bb83', 'wood');
      }
    }

    // 方形木栏杆，正面中央留出视线。
    for (const sign of [-1, 1]) {
      b(sign * r, floor + 0.9, 0, 0.2, 0.22, width - 1, C.red, 'wood');
      b(0, floor + 0.9, sign * r, width - 1, 0.22, 0.2, C.red, 'wood');

      for (let i = -2; i <= 2; i++) {
        b(i * r / 2.4, floor + 0.5, sign * r, 0.15, 0.8, 0.15, C.woodLight, 'wood');
        b(sign * r, floor + 0.5, i * r / 2.4, 0.15, 0.8, 0.15, C.woodLight, 'wood');
      }
    }

    roof(b, floor + height + 0.5, width + 3.2, width + 3.2, 3, C.jade, 'hip');
  }

  plaque(b, isBell ? '钟楼' : '鼓楼', 4.6, 5.15, 3.5);
}

tower(-32, 27, true);
tower(32, 27, false);

// ------------------------------------------------------------
// 院墙：连续红墙、瓦顶、垛柱，前端为山门留出入口。
// ------------------------------------------------------------

function wall(cx, cz, length, rotation = 0) {
  const b = builder(cx, cz, rotation);
  b(0, 0.35, 0, length, 0.7, 1.5, C.stone);
  b(0, 1.9, 0, length, 2.7, 0.85, '#a6513f');
  b(0, 3.25, 0, length + 0.2, 0.28, 1.2, C.wood, 'wood');

  for (let x = -length / 2 + 0.4; x < length / 2; x += 0.8) {
    b(x, 3.5, 0, 0.8, 0.4, 1.8, choose(C.jade), 'roof');
    b(x, 3.85, 0, 0.8, 0.35, 0.8, choose(C.jade), 'roof');
  }

  const count = Math.ceil(length / 8);
  for (let i = 0; i <= count; i++) {
    const x = -length / 2 + i * length / count;
    b(x, 1.9, 0, 1.4, 3.8, 1.45, C.redLight);
    b(x, 3.95, 0, 1.85, 0.4, 1.9, C.stoneLight);
    b(x, 4.25, 0, 1.5, 0.3, 1.5, C.jade[0], 'roof');
  }
}

wall(0, -49, 100);
wall(-50, -1.5, 95, Math.PI / 2);
wall(50, -1.5, 95, Math.PI / 2);
wall(-31.5, 46, 37);
wall(31.5, 46, 37);

// ------------------------------------------------------------
// 对称方池、石灯、松树、石狮
// ------------------------------------------------------------

function pond(x, z) {
  const b = builder(x, z);

  b(0, 0.0, 0, 8.7, 0.3, 12.7, '#5b746c', 'terrain');
  b(0, 0.18, 0, 7.5, 0.15, 11.5, '#558e8c', 'water');

  for (const sign of [-1, 1]) {
    b(sign * 4.1, 0.32, 0, 0.65, 0.65, 12.8, C.stoneLight);
    b(0, 0.32, sign * 6.1, 8.7, 0.65, 0.65, C.stoneLight);
  }

  // 水纹使用几组薄方块，保持像素风，不做昂贵反射。
  for (let i = 0; i < 13; i++) {
    b(
      (random() - 0.5) * 6.5,
      0.265,
      (random() - 0.5) * 10,
      0.6 + random() * 1.3,
      0.025,
      0.13,
      '#83b5ab',
      'water'
    );
  }

  for (let i = 0; i < 4; i++) {
    const px = (random() - 0.5) * 5;
    const pz = (random() - 0.5) * 8;
    b(px, 0.29, pz, 0.9, 0.12, 0.85, '#547b4e', 'foliage');
    if (i % 2 === 0) {
      b(px, 0.46, pz, 0.3, 0.3, 0.3, '#ddac91', 'foliage');
    }
  }
}

pond(-15, 12);
pond(15, 12);

function stoneLamp(x, z) {
  const b = builder(x, z);
  b(0, 0.2, 0, 1.35, 0.4, 1.35, C.stoneDark);
  b(0, 1.1, 0, 0.45, 1.6, 0.45, C.stoneLight);
  b(0, 1.85, 0, 1.1, 0.3, 1.1, C.stone);
  b(0, 2.3, 0, 0.7, 0.65, 0.7, '#e7b969', 'glow');

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b(sx * 0.42, 2.3, sz * 0.42, 0.18, 0.85, 0.18, C.stoneLight);
    }
  }

  b(0, 2.85, 0, 1.45, 0.3, 1.45, C.stoneDark);
  b(0, 3.12, 0, 0.95, 0.3, 0.95, C.stone);
  b(0, 3.4, 0, 0.4, 0.3, 0.4, C.stoneLight);
}

for (const x of [-6.5, 6.5]) {
  for (const z of [-5, 22, 36]) stoneLamp(x, z);
}

function tree(x, z, size = 1) {
  const b = builder(x, z);

  b(0, 0.2, 0, 3.4, 0.45, 3.4, C.stoneDark);
  b(0, 0.45, 0, 2.8, 0.2, 2.8, '#68734f', 'terrain');

  b(0, 2.5 * size, 0, 0.8 * size, 5 * size, 0.8 * size, C.wood, 'wood');
  b(-0.8 * size, 4.1 * size, 0, 1.8 * size, 0.55 * size, 0.6 * size, C.wood, 'wood');
  b(1.0 * size, 5.5 * size, 0, 2.4 * size, 0.55 * size, 0.6 * size, C.wood, 'wood');

  const clusters = [
    [-1.5, 5.1, 0, 2.5],
    [1.5, 6.4, 0.4, 2.7],
    [0, 7.8, -0.3, 2.3]
  ];

  for (const [cx, cy, cz, radius] of clusters) {
    for (let ix = -2; ix <= 2; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        for (let iy = 0; iy <= 1; iy++) {
          const distance = Math.hypot(ix, iz);
          if (distance > radius || (distance > 1.6 && random() < 0.18)) continue;

          b(
            (cx + ix * 1.05) * size,
            (cy + iy * 0.8) * size,
            (cz + iz * 1.05) * size,
            1.15 * size, 1.1 * size, 1.15 * size,
            choose(C.leaf),
            'foliage'
          );
        }
      }
    }
  }
}

for (const sign of [-1, 1]) {
  for (const z of [-35, -15, 7, 32]) tree(sign * 43, z, 0.85);
  tree(sign * 17, -43, 0.82);
}

// 体素石狮：朝向场地入口，即 +Z。
function lion(x, z, scale = 1) {
  const local = builder(x, z);
  const b = (px, py, pz, sx, sy, sz, color = C.stoneLight) => {
    local(
      px * scale, py * scale, pz * scale,
      sx * scale, sy * scale, sz * scale,
      color
    );
  };

  b(0, 0.25, 0, 1.9, 0.5, 2.3, C.stoneDark);
  b(0, 0.62, 0, 1.65, 0.25, 2.0);
  b(0, 1.35, -0.1, 1.15, 1.3, 1.35);
  b(0, 2.25, 0.25, 1.4, 1.25, 1.2, C.stone);
  b(0, 2.25, 0.92, 0.88, 0.55, 0.5);
  b(0, 2.46, 1.22, 0.36, 0.25, 0.18, C.stoneDark);

  for (const sign of [-1, 1]) {
    b(sign * 0.54, 0.98, 0.72, 0.42, 0.7, 0.95);
    b(sign * 0.62, 2.95, 0.15, 0.36, 0.4, 0.4);
    b(sign * 0.42, 2.55, 0.88, 0.13, 0.14, 0.1, '#49524b');

    for (let i = 0; i < 3; i++) {
      b(sign * 0.73, 1.9 + i * 0.35, 0.1, 0.3, 0.3, 0.55, C.stoneDark);
    }
  }

  b(0.6, 1.6, -0.85, 0.45, 0.4, 0.8, C.stone);
  b(0.6, 1.98, -1.12, 0.4, 0.65, 0.4, C.stone);
  b(-0.5, 0.94, 1.25, 0.65, 0.6, 0.65, C.stone);
}

for (const sign of [-1, 1]) {
  lion(sign * 7.3, -12.6, 1.12);
  lion(sign * 7, 54, 1);
}

// 庭院两侧低矮灌木，避开所有通道。
for (const sign of [-1, 1]) {
  for (const z of [37, 40]) {
    for (let i = 0; i < 9; i++) {
      box(
        sign * (14 + i * 1.2), 0.6, z,
        1.08, 1.1, 1.1,
        choose(C.leaf),
        'foliage'
      );
    }
  }
}

// ------------------------------------------------------------
// 将所有静态体素一次性提交为 InstancedMesh。
// 无逐方块 Mesh，无逐方块动画。
// ------------------------------------------------------------

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const colors = new Map();
let voxelCount = 0;

for (const [type, items] of buckets) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: type === 'water' ? 0.38 : type === 'roof' ? 0.72 : 0.94,
    metalness: type === 'metal' ? 0.32 : 0
  });

  if (type === 'glow') {
    material.emissive = new THREE.Color('#ee6a23');
    material.emissiveIntensity = 0.65;
  }

  const mesh = new THREE.InstancedMesh(
    cubeGeometry,
    material,
    items.length
  );

  mesh.name = `voxel-${type}`;
  mesh.castShadow = !['paving', 'terrain', 'water'].includes(type);
  mesh.receiveShadow = true;

  items.forEach((item, index) => {
    position.set(item.x, item.y, item.z);
    quaternion.setFromAxisAngle(yAxis, item.rotation);
    scaleVector.set(item.sx, item.sy, item.sz);
    matrix.compose(position, quaternion, scaleVector);
    mesh.setMatrixAt(index, matrix);

    if (!colors.has(item.color)) {
      colors.set(item.color, new THREE.Color(item.color));
    }
    mesh.setColorAt(index, colors.get(item.color));
  });

  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;

  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  scene.add(mesh);

  voxelCount += items.length;
}

// 构建队列不再需要，释放其 JS 对象。
buckets.clear();

// ------------------------------------------------------------
// 相机：依据场景包围盒与屏幕纵横比，计算全景取景距离。
// 手机竖屏同样会自动适配，不需要用户先缩放。
// ------------------------------------------------------------

const bounds = new THREE.Box3(
  new THREE.Vector3(-56, -3, -62),
  new THREE.Vector3(56, 26, 62)
);

let userInteracted = false;
let currentView = 'home';

controls.addEventListener('start', () => {
  userInteracted = true;
});

function frameScene(view = 'home') {
  currentView = view;

  const direction = view === 'axis'
    ? new THREE.Vector3(0, 0.65, 1).normalize()
    : new THREE.Vector3(1.05, 0.92, 1.25).normalize();

  const target = new THREE.Vector3(0, 4, 0);
  const right = new THREE.Vector3().crossVectors(yAxis, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;

  let distance = 0;

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).sub(target);
        const needed =
          p.dot(direction) +
          Math.max(
            Math.abs(p.dot(right)) / tanH,
            Math.abs(p.dot(up)) / tanV
          );

        distance = Math.max(distance, needed);
      }
    }
  }

  // 少量留白，避免屋顶或基底贴住屏幕边缘。
  distance *= 1.1;

  // 雾距离随取景等比缩放。窄屏取景需后退很远，
  // 固定雾距会把建筑冲淡成远处一团。
  scene.fog.near = distance * 1.04;
  scene.fog.far = distance * 2.6;

  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(direction, distance);
  controls.maxDistance = Math.max(450, distance * 1.6);
  camera.far = Math.max(1200, distance * 3);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  controls.update();
}

frameScene();

document.querySelector('#home').addEventListener('click', () => {
  userInteracted = false;
  frameScene('home');
});

document.querySelector('#axis').addEventListener('click', () => {
  userInteracted = false;
  frameScene('axis');
});

const orbitButton = document.querySelector('#orbit');

function toggleOrbit() {
  controls.autoRotate = !controls.autoRotate;
  orbitButton.classList.toggle('active', controls.autoRotate);
  orbitButton.setAttribute('aria-pressed', String(controls.autoRotate));
}

orbitButton.addEventListener('click', toggleOrbit);

let evening = true;

document.querySelector('#light').addEventListener('click', () => {
  evening = !evening;

  scene.background.set(evening ? '#e7d8c1' : '#d9e5de');
  scene.fog.color.copy(scene.background);

  hemisphere.color.set(evening ? '#fff1d8' : '#eaf5ff');
  hemisphere.groundColor.set(evening ? '#68775a' : '#758567');
  hemisphere.intensity = evening ? 2.1 : 2.5;

  sun.color.set(evening ? '#ffd29c' : '#fff2d5');
  sun.intensity = evening ? 3.2 : 2.8;
  sun.position.set(evening ? -65 : 60, evening ? 95 : 115, 65);

  backdrop.material.color.set(evening ? '#cbbfa8' : '#bdc9b7');

  document.querySelector('#time-label').textContent =
    evening ? '日暮 · 暖阳' : '清晨 · 晴空';

  document.querySelector('#light span').textContent =
    evening ? '切换晨光' : '切换暮色';
});

window.addEventListener('keydown', (event) => {
  const element = document.activeElement;
  if (element?.matches('button, input, textarea, select, [contenteditable]')) return;

  if (event.key.toLowerCase() === 'r') {
    userInteracted = false;
    frameScene('home');
  }

  if (event.code === 'Space') {
    event.preventDefault();
    toggleOrbit();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  if (!userInteracted) frameScene(currentView);
});

// ------------------------------------------------------------
// 渲染与真实帧率显示；不会预设或伪造 FPS。
// ------------------------------------------------------------

const performanceLabel = document.querySelector('#performance');
performanceLabel.title = `${voxelCount.toLocaleString()} 个实例化体素块`;

let frameCount = 0;
let sampleStart = performance.now();
let lastTime = sampleStart;

function animate(now) {
  requestAnimationFrame(animate);

  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  controls.update(delta);
  renderer.render(scene, camera);

  frameCount++;

  if (now - sampleStart >= 1000) {
    const fps = Math.round(frameCount * 1000 / (now - sampleStart));
    performanceLabel.textContent = `6 座建筑 · ${fps} FPS`;
    sampleStart = now;
    frameCount = 0;
  }
}

document.addEventListener('visibilitychange', () => {
  sampleStart = performance.now();
  lastTime = sampleStart;
  frameCount = 0;
});

requestAnimationFrame(animate);

console.info(
  `[山河营造] 构建完成：6 座建筑，${voxelCount.toLocaleString()} 个实例化体素块。`
);