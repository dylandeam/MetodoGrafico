// ---------- Utilidades numéricas ----------
const EPS = 1e-7;

function nearlyEqual(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function solve2x2(a1, b1, c1, a2, b2, c2) {
  // Resuelve:
  // a1 x + b1 y = c1
  // a2 x + b2 y = c2
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < EPS) return null; // Paralelas o coincidentes
  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;
  return { x, y };
}

function asLE(a, b, sign, c) {
  // Convierte a*x + b*y [<=, >=, =] c en uno o dos semiplanos <=
  if (sign === "<=") return [{ a, b, c }];
  if (sign === ">=") return [{ a: -a, b: -b, c: -c }];
  // "=" -> dos lados
  return [
    { a, b, c },
    { a: -a, b: -b, c: -c },
  ];
}

function satisfies(point, semiplanes, eps = 1e-6) {
  return semiplanes.every(({ a, b, c }) => a * point.x + b * point.y <= c + eps);
}

// ---------- Estado y UI ----------
const constraintsEl = document.getElementById("constraints");
const addBtn = document.getElementById("addConstraint");
const clearBtn = document.getElementById("clearConstraints");
const solveBtn = document.getElementById("solveBtn");
const verticesList = document.getElementById("verticesList");
const resultBox = document.getElementById("resultBox");
const plot = document.getElementById("plot");
const ctx = plot.getContext("2d");

const nnx = document.getElementById("nnx");
const nny = document.getElementById("nny");

function mode() {
  const v = [...document.querySelectorAll('input[name="mode"]')]
    .find(r => r.checked)?.value;
  return v === "min" ? "min" : "max";
}

// Agregar fila de restricción
function addConstraintRow({ a = "", b = "", sign = "<=", c = "" } = {}) {
  const row = document.createElement("div");
  row.className = "constraint-row";

  row.innerHTML = `
    <div class="eq">
      <label>a (x)</label>
      <input type="number" step="any" class="a" placeholder="ej. 2" value="${a}">
    </div>
    <div class="eq">
      <label>b (y)</label>
      <input type="number" step="any" class="b" placeholder="ej. 1" value="${b}">
    </div>
    <div class="eq">
      <label>&nbsp;</label>
      <select class="sign">
        <option value="<=" ${sign === "<=" ? "selected" : ""}>&le;</option>
        <option value="=" ${sign === "=" ? "selected" : ""}>=</option>
        <option value=">=" ${sign === ">=" ? "selected" : ""}>&ge;</option>
      </select>
    </div>
    <div class="eq">
      <label>c</label>
      <input type="number" step="any" class="c" placeholder="ej. 10" value="${c}">
    </div>
    <button class="remove" title="Eliminar">&times;</button>
  `;

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
  });

  constraintsEl.appendChild(row);
}

addBtn.addEventListener("click", () => addConstraintRow());
clearBtn.addEventListener("click", () => { constraintsEl.innerHTML = ""; });

// Cargar ejemplo clásico (sillas/mesas del PDF)
document.getElementById("example1").addEventListener("click", () => {
  document.getElementById("foA").value = "50";
  document.getElementById("foB").value = "80";
  document.querySelector('input[name="mode"][value="max"]').checked = true;

  constraintsEl.innerHTML = "";
  addConstraintRow({ a: 1, b: 2, sign: "<=", c: 120 });
  addConstraintRow({ a: 1, b: 1, sign: "<=", c: 90 });
  nnx.checked = true;
  nny.checked = true;
});

// Inicial: una restricción vacía
addConstraintRow();

// ---------- Resolver ----------
solveBtn.addEventListener("click", () => {
  const aFO = parseFloat(document.getElementById("foA").value);
  const bFO = parseFloat(document.getElementById("foB").value);
  if (!isFinite(aFO) || !isFinite(bFO)) {
    showResult("Completa la función objetivo.", "bad");
    return;
  }

  const rows = [...document.querySelectorAll(".constraint-row")];
  const constraints = [];
  for (const r of rows) {
    const a = parseFloat(r.querySelector(".a").value);
    const b = parseFloat(r.querySelector(".b").value);
    const c = parseFloat(r.querySelector(".c").value);
    const sign = r.querySelector(".sign").value;
    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) {
      showResult("Hay restricciones incompletas.", "bad");
      return;
    }
    constraints.push({ a, b, sign, c });
  }

  // Restringir x>=0, y>=0 si están tildadas
  if (nnx.checked) constraints.push({ a: 1, b: 0, sign: ">=", c: 0 }); // x >= 0
  if (nny.checked) constraints.push({ a: 0, b: 1, sign: ">=", c: 0 }); // y >= 0

  const semiplanes = constraints.flatMap(k => asLE(k.a, k.b, k.sign, k.c));

  // Construir conjunto de rectas de frontera (para candidatos de intersección)
  const boundaries = [];
  for (const k of constraints) {
    // si es "=", mantenemos una sola recta; si es <= o >= también basta una recta
    boundaries.push({ a: k.a, b: k.b, c: k.c });
  }

  // Candidatos: intersecciones de todas las parejas de rectas de frontera
  const candidates = [];
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const p = solve2x2(
        boundaries[i].a, boundaries[i].b, boundaries[i].c,
        boundaries[j].a, boundaries[j].b, boundaries[j].c
      );
      if (p && isFinite(p.x) && isFinite(p.y)) {
        candidates.push(p);
      }
    }
  }

  // Añadir potencialmente intersecciones con ejes si no se incluyeron no-negatividad
  // (Optativo: ya cubierto si nnx/nny están incluidas)

  // Filtrar por factibilidad
  const feasible = candidates.filter(p => satisfies(p, semiplanes));

  if (feasible.length === 0) {
    drawScene([], constraints, null);
    showResult("Región factible vacía (no factible).", "bad");
    verticesList.innerHTML = "";
    return;
  }

  // Evaluar FO en candidatos factibles
  const evaluated = feasible.map(p => ({
    x: p.x,
    y: p.y,
    z: aFO * p.x + bFO * p.y
  }));

  // Ordenar y elegir óptimo
  evaluated.sort((p, q) => p.z - q.z);
  const opt = mode() === "max" ? evaluated[evaluated.length - 1] : evaluated[0];

  // Render
  listVertices(evaluated);
  drawScene(evaluated, constraints, opt);
  const lbl = mode() === "max" ? "Máximo" : "Mínimo";
  showResult(`${lbl}: Z = ${round(opt.z)} en (x=${round(opt.x)}, y=${round(opt.y)})`, "ok");
});

// ---------- UI de resultados ----------
function listVertices(points) {
  // Uniquificar puntos cercanos
  const uniq = [];
  for (const p of points) {
    if (!uniq.some(q => nearlyEqual(p.x, q.x) && nearlyEqual(p.y, q.y))) {
      uniq.push(p);
    }
  }
  // Orden por valor descendente para max intuitivo
  const sorted = uniq.slice().sort((a, b) => b.z - a.z);
  verticesList.innerHTML = "";
  for (const v of sorted) {
    const item = document.createElement("div");
    item.className = "vertex";
    item.innerHTML = `
      <div><strong>(x,y):</strong> (${round(v.x)}, ${round(v.y)})</div>
      <div class="tag"><strong>Z:</strong> ${round(v.z)}</div>
    `;
    verticesList.appendChild(item);
  }
}

function showResult(text, cls = "") {
  resultBox.className = "result";
  if (cls) resultBox.classList.add(cls);
  resultBox.textContent = text;
}

function round(n, d = 4) {
  return Math.abs(n) < 1e-12 ? 0 : Number(n.toFixed(d));
}

// ---------- Gráfico ----------
function drawScene(points, constraints, optimum) {
  // Determinar líneas a dibujar
  const lines = constraints.map(k => ({ a: k.a, b: k.b, c: k.c, sign: k.sign }));

  // Límites del mundo (para ajustar zoom)
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  // Si no hay puntos, generar algunos cortes de ejes a partir de líneas
  if (xs.length === 0 && ys.length === 0) {
    for (const L of lines) {
      // Intersecciones con ejes: x=0 => b*y=c ; y=0 => a*x=c
      if (Math.abs(L.b) > EPS) ys.push(L.c / L.b);
      if (Math.abs(L.a) > EPS) xs.push(L.c / L.a);
    }
  }

  let minX = Math.min(0, ...(xs.filter(Number.isFinite)));
  let maxX = Math.max(1, ...(xs.filter(Number.isFinite)));
  let minY = Math.min(0, ...(ys.filter(Number.isFinite)));
  let maxY = Math.max(1, ...(ys.filter(Number.isFinite)));

  if (!isFinite(minX)) minX = 0;
  if (!isFinite(maxX)) maxX = 10;
  if (!isFinite(minY)) minY = 0;
  if (!isFinite(maxY)) maxY = 10;

  // Margen
  const padX = (maxX - minX) * 0.2 || 1;
  const padY = (maxY - minY) * 0.2 || 1;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;

  // Funciones de transformación (mundo -> pantalla)
  const W = plot.width, H = plot.height;
  function toScreen(p) {
    const sx = ((p.x - minX) / (maxX - minX)) * W;
    const sy = H - ((p.y - minY) / (maxY - minY)) * H;
    return { x: sx, y: sy };
  }

  // Limpiar
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#081017";
  ctx.fillRect(0, 0, W, H);

  // Ejes
  ctx.strokeStyle = "#243242";
  ctx.lineWidth = 1;
  // Eje X (y=0)
  if (minY <= 0 && maxY >= 0) {
    const p1 = toScreen({ x: minX, y: 0 });
    const p2 = toScreen({ x: maxX, y: 0 });
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  // Eje Y (x=0)
  if (minX <= 0 && maxX >= 0) {
    const p1 = toScreen({ x: 0, y: minY });
    const p2 = toScreen({ x: 0, y: maxY });
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }

  // Dibujar rectas de restricciones
  for (const L of lines) {
    // Tomar dos puntos lejanos sobre la recta a*x + b*y = c
    let pts = [];
    if (Math.abs(L.b) > EPS) {
      const y1 = (L.c - L.a * minX) / L.b;
      const y2 = (L.c - L.a * maxX) / L.b;
      pts = [{ x: minX, y: y1 }, { x: maxX, y: y2 }];
    } else if (Math.abs(L.a) > EPS) {
      const x = L.c / L.a;
      pts = [{ x, y: minY }, { x, y: maxY }];
    } else {
      continue;
    }

    const s1 = toScreen(pts[0]);
    const s2 = toScreen(pts[1]);
    ctx.strokeStyle = "#3a4c63";
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
  }

  // Región factible: aproximar con hull si hay puntos
  if (points.length >= 2) {
    const hull = convexHull(points);
    if (hull.length >= 2) {
      ctx.fillStyle = "rgba(79, 209, 197, 0.15)";
      ctx.strokeStyle = "rgba(79, 209, 197, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const p0 = toScreen(hull[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < hull.length; i++) {
        const pi = toScreen(hull[i]);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Vértices
  for (const p of points) {
    const s = toScreen(p);
    ctx.fillStyle = "#69a1ff";
    ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Óptimo
  if (optimum) {
    const s = toScreen(optimum);
    ctx.fillStyle = "#00d27a";
    ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
  }

  // Pequeñas marcas en ejes
  ctx.fillStyle = "#6f8196";
  ctx.font = "12px ui-sans-serif, system-ui";
  if (minX <= 0 && maxX >= 0) {
    const s = toScreen({ x: 0, y: 0 });
    ctx.fillText("0", s.x + 4, s.y - 4);
  }
}

// Convex hull (Monotone chain) para ordenar la región
function convexHull(points) {
  const pts = points
    .map(p => ({ x: p.x, y: p.y }))
    .sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  const cross = (o, a, b) => (a.x - o.x)*(b.y - o.y) - (a.y - o.y)*(b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= EPS) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= EPS) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
