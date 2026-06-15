/**
 * GLSL-шейдеры неоновой линии маршрута в стиле Need for Speed.
 *
 * Вершинный шейдер пробрасывает UV (u — вдоль трубы, v — поперёк).
 * Фрагментный шейдер комбинирует:
 *  - бегущие «энергетические» полосы (анимация движения к цели);
 *  - шевроны-стрелки направления, текущие вдоль линии;
 *  - пульсацию яркости;
 *  - градиентное затухание к краям трубы (псевдо-френель);
 *  - горячее белое ядро для эффекта свечения под Bloom.
 */

export const routeVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const routeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uLength;       // длина маршрута в метрах
  uniform float uProgress;     // пройденная доля [0..1]
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    // Координата вдоль маршрута в метрах
    float along = vUv.x * uLength;

    // ── Бегущие энергетические полосы ──
    float flow = fract(along * 0.45 - uTime * 2.2);
    float stripes = smoothstep(0.0, 0.25, flow) * smoothstep(0.62, 0.38, flow);

    // ── Шевроны-стрелки (каждые ~2.2 м) ──
    float chevronPeriod = 2.2;
    float cx = fract(along / chevronPeriod - uTime * 0.9);
    // V-образная форма: вершина шеврона смещается поперёк трубы
    float v = abs(vUv.y * 2.0 - 1.0);          // 0 в центре, 1 на краях
    float chevron = smoothstep(0.16, 0.0, abs(cx - 0.5 + v * 0.18));

    // ── Пульсация всей линии ──
    float pulse = 0.82 + 0.18 * sin(uTime * 3.4);

    // ── Затухание к краям трубы (псевдо-френель) ──
    float edgeFade = pow(1.0 - v, 0.6);

    // ── Затемнение пройденной части маршрута ──
    float passed = smoothstep(uProgress, uProgress + 0.02, vUv.x);
    float passedDim = mix(0.18, 1.0, passed);

    // ── Сборка цвета ──
    vec3 base = uColor * (0.5 + stripes * 1.1);
    vec3 hot = vec3(1.0) * chevron * 1.6;      // белое ядро стрелок для Bloom
    vec3 color = (base + hot + uColor * chevron * 2.0) * pulse * passedDim;

    float alpha = (0.42 + stripes * 0.4 + chevron * 0.6) * edgeFade * uOpacity * passedDim;

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Шейдер частиц, летящих вдоль маршрута. */
export const particleVertexShader = /* glsl */ `
  attribute float aOffset;     // фаза частицы [0..1]
  attribute float aScale;
  attribute float aSide;       // поперечное смещение [-1..1]

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float twinkle = 0.6 + 0.4 * sin(uTime * 4.0 + aOffset * 40.0);
    vAlpha = twinkle;
    gl_PointSize = aScale * uPixelRatio * twinkle * (130.0 / -mvPosition.z);
  }
`;

export const particleFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float circle = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(uColor * 1.4, circle * vAlpha);
  }
`;
