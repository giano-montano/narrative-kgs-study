// Demo: extracción de KGs narrativos en vivo contra el gold.
"use strict";

const RELS = ["agent", "patient", "location", "next"];
const TYPES = ["Character", "Object", "Location", "Event"];
const MAIN_RELS = ["agent", "patient", "location"];

const REL_COLOR = { agent: "#22d3ee", patient: "#fb7185", location: "#facc15", next: "#a78bfa" };
const TYPE_COLOR = { Character: "#60a5fa", Object: "#f0abfc", Location: "#34d399", Event: "#a78bfa" };
const STATUS_COLOR = { hit: "#4ade80", fp: "#f87171", fn: "#fbbf24" };
const OTHER_COLOR = "#94a3b8";

const MODELS = {
  "openai/gpt-oss-120b": { short: "120b", hint: "117 B parámetros, 5,1 B activos por token (MoE)." },
  "openai/gpt-oss-20b": { short: "20b", hint: "21 B parámetros, 3,6 B activos por token (MoE)." },
};

const CONDITIONS = {
  texto: {
    short: "Una tripleta por línea: <code>evento | rel | arg [Tipo]</code>",
    tags: [["sin response_format", "warn"], ["streaming real", "good"], ["prompt más corto", "good"]],
    bullets: [
      "<b>Qué recibe:</b> las reglas de anotación y el bloque de formato de texto. No se envía <code>response_format</code>.",
      "<b>Qué se garantiza:</b> nada. El modelo podría escribir una relación fuera del esquema (<code>subject</code>) o una línea de comentario.",
      "<b>Cómo se juzga:</b> todo o nada. Basta una línea que no calce con el formato para que la salida entera cuente como grafo vacío.",
      "<b>Streaming:</b> Groq entrega el texto token a token, así que el grafo crece mientras el modelo escribe.",
    ],
  },
  json_objeto: {
    short: "JSON <code>{\"triples\": [...]}</code> en modo JSON",
    tags: [["JSON válido", "good"], ["esquema no garantizado", "warn"], ["llega en un bloque", "warn"]],
    bullets: [
      "<b>Qué recibe:</b> las mismas reglas y el bloque JSON, idéntico al de <code>json_estricto</code>. Se envía <code>response_format: {type: \"json_object\"}</code>.",
      "<b>Qué se garantiza:</b> que la salida sea JSON bien formado. No que tenga la clave <code>triples</code> ni que relaciones y tipos sean los permitidos.",
      "<b>Cómo se juzga:</b> se valida contra el esquema Pydantic; si una sola tripleta falla, la salida entera cuenta como vacía.",
      "<b>Streaming:</b> Groq comprueba el JSON antes de soltarlo, así que el contenido llega en un solo bloque. En vivo solo se ve el razonamiento.",
    ],
  },
  json_estricto: {
    short: "El mismo prompt JSON, con decodificación restringida",
    tags: [["0 % inválidas por construcción", "good"], ["+ tokens del esquema", "warn"], ["llega en un bloque", "warn"]],
    bullets: [
      "<b>Qué recibe:</b> exactamente el mismo prompt que <code>json_objeto</code>, más el esquema (<code>json_schema</code> con <code>strict: true</code>).",
      "<b>Qué se garantiza:</b> el decodificador solo permite tokens que respetan el esquema: relaciones y tipos cerrados, sin claves extra. Una salida inválida es imposible.",
      "<b>Costo:</b> el esquema cuenta como tokens de prompt: ≈1 102 frente a ≈968 de <code>json_objeto</code> y ≈806 de <code>texto</code>.",
      "<b>Streaming:</b> como en <code>json_objeto</code>, el contenido llega de una vez.",
    ],
  },
};

const state = {
  data: null,
  story: null,
  model: "openai/gpt-oss-120b",
  condition: "texto",
  colorMode: "rel",
  running: false,
  current: null,   // resultado mostrado en el panel del modelo
  history: [],     // corridas de la historia actual
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt2 = (x) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(2));

/* ---------- normalización, parseo y puntuación (igual que score.py) ---------- */

// minúsculas y sin puntuación, luego separar en palabras
function norm(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s]/gu, "").split(/\s+/).filter(Boolean);
}

// clave de acierto: primera palabra del evento, primera de rel, última del argumento
function tripleKey(t) {
  const e = norm(t.event), r = norm(t.rel), a = norm(t.arg);
  return `${e[0] || ""}|${r[0] || ""}|${a.length ? a[a.length - 1] : ""}`;
}

const LINE_RE = /^\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|\[]+?)\s*\[\s*([^\]]+?)\s*\]\s*$/;

function inSchema(t) {
  return RELS.includes(t.rel) && TYPES.includes(t.arg_type);
}

function parseLine(line) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  return { event: m[1], rel: m[2], arg: m[3], arg_type: m[4] };
}

// salida completa: devuelve la lista de tripletas o null si es inválida (todo o nada)
function parseFinal(raw, condition) {
  if (condition === "texto") {
    const out = [];
    for (const line of raw.split(/\r\n|\r|\n/)) {
      if (!line.trim()) continue;
      const t = parseLine(line);
      if (!t || !inSchema(t)) return null;
      out.push(t);
    }
    return out;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const plain = (o) => o && typeof o === "object" && !Array.isArray(o);
  if (!plain(obj) || Object.keys(obj).join() !== "triples" || !Array.isArray(obj.triples)) return null;
  const keys = ["event", "rel", "arg", "arg_type"];
  for (const t of obj.triples) {
    if (!plain(t)) return null;
    const k = Object.keys(t);
    if (k.length !== 4 || !keys.every((x) => typeof t[x] === "string")) return null;
    if (!inSchema(t)) return null;
  }
  return obj.triples;
}

// parseo parcial mientras llega el stream: lo que ya se puede dibujar
function parsePartial(raw, condition, done) {
  if (condition === "texto") {
    const lines = raw.split(/\r\n|\r|\n/);
    if (!done) lines.pop();
    const triples = [];
    const marks = [];
    for (const line of lines) {
      if (!line.trim()) { marks.push(null); continue; }
      const t = parseLine(line);
      const ok = !!t && inSchema(t);
      marks.push(ok);
      if (t) triples.push(t);
    }
    return { triples, marks };
  }
  const triples = [];
  for (const m of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      const t = JSON.parse(m[0]);
      if (t && typeof t.event === "string" && typeof t.rel === "string" && typeof t.arg === "string") {
        triples.push({ event: t.event, rel: t.rel, arg: t.arg, arg_type: String(t.arg_type ?? "") });
      }
    } catch { /* objeto a medias */ }
  }
  return { triples, marks: null };
}

function prf(tp, nPred, nGold) {
  const p = nPred ? tp / nPred : 0;
  const r = nGold ? tp / nGold : 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, tp, nPred, nGold };
}

function score(predTriples, goldTriples) {
  const pred = new Map();
  for (const t of predTriples) { const k = tripleKey(t); if (!pred.has(k)) pred.set(k, t); }
  const gold = new Map();
  for (const t of goldTriples) { const k = tripleKey(t); if (!gold.has(k)) gold.set(k, t); }
  const relOf = (k) => k.split("|")[1];
  const group = (rels) => {
    const p = [...pred.keys()].filter((k) => rels.includes(relOf(k)));
    const g = [...gold.keys()].filter((k) => rels.includes(relOf(k)));
    const tp = p.filter((k) => gold.has(k)).length;
    return prf(tp, p.length, g.length);
  };
  const main = group(MAIN_RELS);
  const byRel = Object.fromEntries(RELS.map((r) => [r, group([r])]));
  const common = [...pred.keys()].filter((k) => gold.has(k) && MAIN_RELS.includes(relOf(k)));
  const typeOk = common.filter((k) => pred.get(k).arg_type === gold.get(k).arg_type).length;
  const status = new Map();
  for (const k of pred.keys()) status.set(k, gold.has(k) ? "hit" : "fp");
  for (const k of gold.keys()) if (!pred.has(k)) status.set(k, "fn");
  return {
    main, byRel, status, pred, gold,
    typeAcc: common.length ? typeOk / common.length : null,
  };
}

/* ---------- grafo D3 ---------- */

function createGraph(svgNode, id) {
  const svg = d3.select(svgNode);
  const wrap = svgNode.parentElement;
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "tl-grad");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#a78bfa").attr("stop-opacity", 0);
  grad.append("stop").attr("offset", "20%").attr("stop-color", "#a78bfa").attr("stop-opacity", 0.35);
  grad.append("stop").attr("offset", "80%").attr("stop-color", "#60a5fa").attr("stop-opacity", 0.35);
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#60a5fa").attr("stop-opacity", 0);
  const glow = defs.append("filter").attr("id", `${id}-glow`).attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3.5).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");
  const markerColors = { ...REL_COLOR, ...STATUS_COLOR, other: OTHER_COLOR };
  for (const [k, c] of Object.entries(markerColors)) {
    defs.append("marker").attr("id", `${id}-arrow-${k}`).attr("viewBox", "0 -5 10 10")
      .attr("refX", 9).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L10,0L0,4").attr("fill", c);
  }

  const root = svg.append("g");
  const timeline = root.append("line").attr("class", "timeline");
  const bands = root.append("g");
  const linkG = root.append("g");
  const nodeG = root.append("g");

  let W = 600, H = 470;
  let nodes = [], links = [];
  let tokens = [];
  let statuses = null;
  let colorMode = "rel";
  let onHover = () => {};

  const sim = d3.forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id)
      .distance((d) => (d.rel === "next" ? 60 : 90))
      .strength((d) => (d.rel === "next" ? 0.02 : 0.18)))
    .force("charge", d3.forceManyBody().strength((d) => (d.kind === "event" ? -90 : -200)).distanceMax(220))
    .force("x", d3.forceX((d) => d.tx).strength((d) => (d.kind === "event" ? 0.9 : 0.1)))
    .force("y", d3.forceY((d) => d.ty).strength((d) => (d.kind === "event" ? 0.9 : 0.35)))
    .force("collide", d3.forceCollide((d) => d.r + 5).strength(0.9))
    .alphaDecay(0.035)
    .on("tick", ticked);

  function bandY(type) {
    if (type === "Character") return H * 0.17;
    if (type === "Location") return H * 0.86;
    if (type === "Object") return H * 0.76;
    return H * 0.8;
  }

  function drawBands() {
    const y = H * 0.48;
    timeline.attr("x1", 0).attr("x2", W).attr("y1", y).attr("y2", y);
    const labels = [["personajes", H * 0.06], ["eventos →", y - 34], ["objetos · lugares", H - 6]];
    bands.selectAll("text").data(labels).join("text").attr("class", "band-label")
      .attr("x", 4).attr("y", (d) => d[1]).text((d) => d[0]);
  }

  // x de cada evento según dónde aparece en la historia; así ambos grafos quedan alineados
  function computeTargets() {
    const margin = Math.min(70, W * 0.1);
    const n = Math.max(tokens.length - 1, 1);
    const xOf = (pos) => margin + (pos / n) * (W - 2 * margin);
    let prev = -0.6;
    for (const d of nodes.filter((d) => d.kind === "event").sort((a, b) => a.order - b.order)) {
      const idx = tokens.indexOf(d.word);
      const pos = idx >= 0 ? idx : Math.min(prev + 0.6, n);
      prev = Math.max(prev, pos);
      d.tx = xOf(pos);
      d.ty = H * 0.48;
    }
    for (const d of nodes.filter((d) => d.kind === "entity")) {
      const ev = links.filter((l) => (l.target.id || l.target) === d.id).map((l) => nodes.find((n) => n.id === (l.source.id || l.source)));
      const xs = ev.filter(Boolean).map((e) => e.tx);
      d.tx = xs.length ? d3.mean(xs) : W / 2;
      d.ty = bandY(d.type);
    }
  }

  function build(triples) {
    const nodeMap = new Map();
    const linkMap = new Map();
    let order = 0;
    const addEvent = (word, label) => {
      const nid = "e:" + word;
      if (!nodeMap.has(nid)) nodeMap.set(nid, { id: nid, word, kind: "event", label, order: order++ });
      return nid;
    };
    for (const t of triples) {
      const e = norm(t.event)[0];
      const aw = norm(t.arg);
      const a = aw[aw.length - 1];
      const r = norm(t.rel)[0] || "";
      if (!e || !a) continue;
      const eLabel = String(t.event).trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "") || e;
      const aLabel = String(t.arg).trim().split(/\s+/).pop().replace(/[^\p{L}\p{N}'-]/gu, "") || a;
      const src = addEvent(e, eLabel);
      let tgt;
      if (r === "next") {
        tgt = addEvent(a, aLabel);
      } else {
        tgt = "a:" + a;
        if (!nodeMap.has(tgt)) nodeMap.set(tgt, { id: tgt, word: a, kind: "entity", label: aLabel, type: t.arg_type });
      }
      const key = `${e}|${r}|${a}`;
      if (!linkMap.has(key)) linkMap.set(key, { key, source: src, target: tgt, rel: r, triple: t });
    }
    return { nodeMap, linkMap };
  }

  function update(triples) {
    const { nodeMap, linkMap } = build(triples);
    const old = new Map(nodes.map((d) => [d.id, d]));
    const fresh = new Set();
    nodes = [...nodeMap.values()].map((d) => {
      const o = old.get(d.id);
      if (o) return Object.assign(o, { label: o.label, order: d.order, type: o.type || d.type });
      fresh.add(d.id);
      return d;
    });
    const oldLinks = new Map(links.map((l) => [l.key, l]));
    const freshLinks = new Set();
    links = [...linkMap.values()].map((l) => {
      if (oldLinks.has(l.key)) return oldLinks.get(l.key);
      freshLinks.add(l.key);
      return l;
    });
    computeTargets();
    // los nodos nuevos nacen junto al evento que los trae
    for (const d of nodes) {
      if (!fresh.has(d.id)) continue;
      const l = links.find((l) => (l.target.id || l.target) === d.id && (l.source.id || l.source) !== d.id);
      const src = l && nodes.find((n) => n.id === (l.source.id || l.source) && n.x != null);
      d.x = src ? src.x : d.tx;
      d.y = src ? src.y : d.ty - 30;
    }
    render(fresh, freshLinks);
    sim.nodes(nodes);
    sim.force("link").links(links);
    sim.alpha(fresh.size ? 0.7 : 0.25).restart();
  }

  function linkColorKey(l) {
    if (colorMode === "match" && statuses && statuses.has(l.key)) return statuses.get(l.key);
    return REL_COLOR[l.rel] ? l.rel : "other";
  }

  function styleLinks() {
    linkG.selectAll("path.link").each(function (l) {
      const k = linkColorKey(l);
      const color = STATUS_COLOR[k] || REL_COLOR[k] || OTHER_COLOR;
      d3.select(this)
        .attr("stroke", color)
        .attr("marker-end", `url(#${id}-arrow-${k})`)
        .classed("next", l.rel === "next" && colorMode === "rel")
        .classed("fn", colorMode === "match" && k === "fn");
    });
  }

  function render(fresh = new Set(), freshLinks = new Set()) {
    const lsel = linkG.selectAll("g.lk").data(links, (d) => d.key);
    lsel.exit().remove();
    const lenter = lsel.enter().append("g").attr("class", "lk");
    lenter.append("path").attr("class", "link");
    lenter.append("path").attr("class", "link-hit")
      .on("mouseenter", (ev, d) => showTip(ev, linkTip(d)))
      .on("mousemove", (ev) => moveTip(ev))
      .on("mouseleave", hideTip);
    lenter.filter((d) => freshLinks.has(d.key)).select("path.link")
      .attr("pathLength", 1).classed("drawing", true)
      .each(function () {
        const el = this;
        setTimeout(() => { el.removeAttribute("pathLength"); el.classList.remove("drawing"); }, 750);
      });
    styleLinks();

    const nsel = nodeG.selectAll("g.node").data(nodes, (d) => d.id);
    nsel.exit().remove();
    const nenter = nsel.enter().append("g").attr("class", (d) => `node ${d.kind}`)
      .on("mouseenter", (ev, d) => { highlight(d.word); onHover(d.word); showTip(ev, nodeTip(d)); })
      .on("mousemove", (ev) => moveTip(ev))
      .on("mouseleave", () => { highlight(null); onHover(null); hideTip(); })
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    nenter.each(function (d) {
      const g = d3.select(this);
      const color = d.kind === "event" ? TYPE_COLOR.Event : TYPE_COLOR[d.type] || OTHER_COLOR;
      g.append("circle").attr("class", "ripple").attr("r", 12).attr("stroke", color);
      const inner = g.append("g").attr("class", "inner");
      if (d.kind === "event") {
        const w = Math.max(d.label.length * 7.6 + 22, 40);
        d.r = w / 2.4;
        inner.append("rect").attr("class", "pill").attr("x", -w / 2).attr("y", -13).attr("width", w).attr("height", 26).attr("rx", 13)
          .attr("filter", `url(#${id}-glow)`);
        inner.append("text").attr("class", "label").attr("text-anchor", "middle").attr("dy", "0.35em").text(d.label);
      } else {
        d.r = 13;
        inner.append("circle").attr("class", "dot").attr("r", 9).attr("fill", color).attr("filter", `url(#${id}-glow)`);
        inner.append("text").attr("class", "label").attr("text-anchor", "middle")
          .attr("dy", d.type === "Character" ? -15 : 24).text(d.label);
      }
    });
    nenter.filter((d) => fresh.has(d.id)).classed("new", true)
      .each(function () { const el = this; setTimeout(() => el.classList.remove("new"), 950); });
  }

  // punto del borde del nodo en dirección a (px, py)
  function edge(n, px, py) {
    const dx = px - n.x, dy = py - n.y;
    const len = Math.hypot(dx, dy) || 1;
    if (n.kind === "event") {
      const hw = Math.max(n.label.length * 7.6 + 22, 40) / 2 + 2, hh = 15;
      const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      return [n.x + dx * Math.min(t, 1), n.y + dy * Math.min(t, 1)];
    }
    return [n.x + (dx / len) * 12, n.y + (dy / len) * 12];
  }

  function linkPath(l) {
    const s = l.source, t = l.target;
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
    const dx = t.x - s.x, dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    // next se arquea sobre la línea de tiempo; el resto, curva leve
    const bend = l.rel === "next" ? -Math.min(len * 0.45, 70) * Math.sign(dx || 1) : len * 0.12;
    const cx = mx + (-dy / len) * bend, cy = my + (dx / len) * bend;
    const [x1, y1] = edge(s, cx, cy);
    const [x2, y2] = edge(t, cx, cy);
    return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
  }

  function ticked() {
    for (const d of nodes) {
      d.x = Math.max(20, Math.min(W - 20, d.x));
      d.y = Math.max(18, Math.min(H - 18, d.y));
    }
    linkG.selectAll("g.lk").each(function (l) {
      if (!l.source.x && l.source.x !== 0) return;
      const p = linkPath(l);
      d3.select(this).selectAll("path").attr("d", p);
    });
    nodeG.selectAll("g.node").attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  function highlight(word) {
    wrap.classList.toggle("dim", !!word);
    nodeG.selectAll("g.node").classed("hl", (d) => !!word && d.word === word);
    linkG.selectAll("path.link").classed("hl", (l) => !!word && (l.source.word === word || l.target.word === word));
    if (word) {
      const neighbors = new Set();
      links.forEach((l) => {
        if (l.source.word === word) neighbors.add(l.target.id);
        if (l.target.word === word) neighbors.add(l.source.id);
      });
      nodeG.selectAll("g.node").classed("hl", (d) => d.word === word || neighbors.has(d.id));
    }
  }

  function linkTip(l) {
    const t = l.triple;
    const st = statuses && statuses.get(l.key);
    const label = { hit: "✓ acierto", fp: "✗ no está en el gold", fn: "△ faltó en el modelo" }[st] || "";
    return `<b>${esc(t.event)}</b> —${esc(t.rel)}→ <b>${esc(t.arg)}</b> <span style="color:#8b93a8">[${esc(t.arg_type)}]</span>` +
      (label ? `<br><span style="color:${STATUS_COLOR[st]}">${label}</span>` : "");
  }

  function nodeTip(d) {
    const deg = links.filter((l) => l.source.id === d.id || l.target.id === d.id).length;
    return `<b>${esc(d.label)}</b> <span style="color:#8b93a8">${d.kind === "event" ? "evento" : esc(d.type)} · ${deg} aristas</span>`;
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    W = Math.max(r.width, 280);
    H = Math.max(r.height, 280);
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    drawBands();
    computeTargets();
    sim.alpha(0.3).restart();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  return {
    update,
    setTokens(t) { tokens = t; },
    clear() { nodes = []; links = []; statuses = null; render(); sim.nodes([]); sim.force("link").links([]); },
    setStatuses(s) { statuses = s; styleLinks(); },
    setColorMode(m) { colorMode = m; styleLinks(); },
    highlight,
    onHover(fn) { onHover = fn; },
  };
}

/* ---------- tooltip y avisos ---------- */

const tip = $("#tooltip");
function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
function moveTip(ev) {
  const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + "px";
  tip.style.top = ev.clientY + 14 + "px";
}
function hideTip() { tip.hidden = true; }

let toastTimer;
function toast(msg, ms = 6000) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

/* ---------- historia ---------- */

let graphModel, graphGold;

function storyTokens(story) {
  return norm(story.sentences.join(" "));
}

function goldTriples(story) {
  return (state.data.gold[story.id] || []).map(([event, rel, arg, arg_type]) => ({ event, rel, arg, arg_type }));
}

function renderStoryText() {
  const el = $("#story-text");
  el.innerHTML = state.story.sentences.map((s) =>
    s.split(/(\s+)/).map((w) => {
      if (!w.trim()) return w;
      const n = norm(w)[0] || "";
      return `<span class="w" data-n="${esc(n)}">${esc(w)}</span>`;
    }).join("")
  ).join(" ");
  el.querySelectorAll(".w").forEach((span) => {
    span.addEventListener("mouseenter", () => { hoverWord(span.dataset.n); });
    span.addEventListener("mouseleave", () => { hoverWord(null); });
  });
  $("#story-split").textContent = state.story.split === "dev" ? "dev · se usó para ajustar prompts" : "test";
}

function hoverWord(word) {
  graphModel.highlight(word);
  graphGold.highlight(word);
  document.querySelectorAll("#story-text .w").forEach((s) => s.classList.toggle("hl", !!word && s.dataset.n === word));
}

// subraya en el texto lo que el modelo ya extrajo
function markStory(triples) {
  const events = new Set(), ents = new Map();
  for (const t of triples) {
    const e = norm(t.event)[0];
    const a = norm(t.arg).pop();
    if (e) events.add(e);
    if (a && t.rel === "next") events.add(a);
    else if (a && !ents.has(a)) ents.set(a, t.arg_type);
  }
  document.querySelectorAll("#story-text .w").forEach((s) => {
    const n = s.dataset.n;
    const wasEv = s.classList.contains("ev");
    const wasEnt = [...s.classList].some((c) => c.startsWith("ent-"));
    s.className = "w" + (s.classList.contains("hl") ? " hl" : "");
    if (events.has(n)) s.classList.add("ev");
    else if (ents.has(n)) s.classList.add("ent-" + ents.get(n));
    const isNow = events.has(n) || ents.has(n);
    if (isNow && !wasEv && !wasEnt) { void s.offsetWidth; s.classList.add("flash"); }
  });
}

function selectStory(id) {
  state.story = state.data.stories.find((s) => s.id === id);
  state.history = [];
  state.current = null;
  const tokens = storyTokens(state.story);
  graphModel.setTokens(tokens);
  graphGold.setTokens(tokens);
  reveal(graphModel, [], 0);
  graphModel.clear();
  graphGold.clear();
  renderStoryText();
  resetModelPanel();
  renderHistory();
  const gold = goldTriples(state.story);
  $("#gold-count").textContent = `${gold.length} tripletas`;
  reveal(graphGold, gold, 45);
  renderPrompt();
}

// muestra tripletas de a pocas para animar la entrada; una nueva llamada cancela la anterior
const revealGen = new WeakMap();
function reveal(graph, triples, interval, done) {
  const gen = (revealGen.get(graph) || 0) + 1;
  revealGen.set(graph, gen);
  let i = 0;
  const step = () => {
    if (revealGen.get(graph) !== gen) return;
    i = Math.min(i + 1, triples.length);
    graph.update(triples.slice(0, i));
    if (i < triples.length) return setTimeout(step, interval);
    if (done) done();
  };
  if (triples.length) step(); else if (done) done();
}

/* ---------- panel del modelo ---------- */

function setStatus(text, cls = "") {
  const el = $("#status");
  el.textContent = text;
  el.className = "status " + cls;
}

function resetModelPanel() {
  setStatus("en espera");
  $("#model-empty").hidden = false;
  $("#invalid").hidden = true;
  $("#thought").hidden = true;
  $("#raw").innerHTML = "";
  $("#reasoning").textContent = "";
  $("#chunk-info").textContent = "";
  $("#model-caption").textContent = "";
  $("#diff").innerHTML = '<p class="hint">Aparecen cuando el modelo responde.</p>';
  graphGold.setStatuses(null);
  graphModel.setStatuses(null);
  markStory([]);
  renderMetrics(null);
}

function renderRaw(raw, condition, done, marks) {
  const el = $("#raw");
  let html;
  if (condition === "texto" && marks) {
    const lines = raw.split(/\r\n|\r|\n/);
    html = lines.map((line, i) => {
      const m = marks[i];
      if (m === true) return `<span class="ok">${esc(line)}</span>`;
      if (m === false) return `<span class="bad">${esc(line)}</span>`;
      return esc(line);
    }).join("\n");
  } else {
    html = esc(raw);
  }
  el.innerHTML = html + (done ? "" : '<span class="caret"></span>');
  el.scrollTop = el.scrollHeight;
}

function renderDiff(sc) {
  const el = $("#diff");
  const chip = (k, cls) => {
    const t = (cls === "fn" ? sc.gold : sc.pred).get(k);
    const [e, r, a] = k.split("|");
    let typeWarn = "";
    if (cls === "hit" && r !== "next" && sc.pred.get(k).arg_type !== sc.gold.get(k).arg_type) {
      typeWarn = ` <span class="warn-type" title="tipo distinto al gold">${esc(sc.pred.get(k).arg_type)}≠${esc(sc.gold.get(k).arg_type)}</span>`;
    }
    return `<span class="chip ${cls}">${esc(e)} <em>${esc(r)}</em> ${esc(a)}${typeWarn}</span>`;
  };
  const groups = { hit: [], fp: [], fn: [] };
  for (const [k, st] of sc.status) groups[st].push(k);
  const sec = (cls, title, keys) => keys.length
    ? `<div><h4 class="${cls}">${title} (${keys.length})</h4><div class="chips">${keys.map((k) => chip(k, cls)).join("")}</div></div>`
    : "";
  el.innerHTML =
    sec("hit", "✓ Aciertos", groups.hit) +
    sec("fp", "✗ Sobran: el modelo las puso y el gold no", groups.fp) +
    sec("fn", "△ Faltan: están en el gold y el modelo no las puso", groups.fn) ||
    '<p class="hint">Sin tripletas.</p>';
}

function drawGauge(value) {
  const svg = d3.select("#gauge");
  const arc = d3.arc().innerRadius(58).outerRadius(70).startAngle(0).cornerRadius(6);
  let g = svg.select("g.g");
  if (g.empty()) {
    const defs = svg.append("defs");
    const lg = defs.append("linearGradient").attr("id", "gauge-grad").attr("x1", 0).attr("x2", 1).attr("y1", 0).attr("y2", 1);
    lg.append("stop").attr("offset", "0%").attr("stop-color", "#a78bfa");
    lg.append("stop").attr("offset", "100%").attr("stop-color", "#34d399");
    g = svg.append("g").attr("class", "g").attr("transform", "translate(80,80)");
    g.append("path").attr("class", "gauge-bg").attr("d", arc.endAngle(2 * Math.PI)).attr("fill", "rgba(255,255,255,0.08)");
    g.append("path").attr("class", "gauge-fg").attr("fill", "url(#gauge-grad)").datum(0).attr("d", arc.endAngle(0));
    g.append("text").attr("class", "gauge-num").attr("text-anchor", "middle").attr("dy", "0.25em").text("–");
    g.append("text").attr("class", "gauge-lbl").attr("text-anchor", "middle").attr("dy", "2.6em").text("F1 SIN NEXT");
  }
  const fg = g.select(".gauge-fg");
  const from = fg.datum() || 0;
  const to = value == null ? 0 : value;
  fg.datum(to).transition().duration(900).ease(d3.easeCubicOut)
    .attrTween("d", () => { const i = d3.interpolate(from, to); return (t) => arc.endAngle(i(t) * 2 * Math.PI)(); });
  const num = g.select(".gauge-num").interrupt();
  if (value == null) { num.text("–"); return; }
  num.transition().duration(900).tween("text", function () {
    const i = d3.interpolate(from, to);
    return (t) => { this.textContent = i(t).toFixed(2); };
  });
}

function renderMetrics(sc, info = {}) {
  drawGauge(sc ? sc.main.f1 : null);
  $("#bar-p").style.width = sc ? sc.main.p * 100 + "%" : "0";
  $("#bar-r").style.width = sc ? sc.main.r * 100 + "%" : "0";
  $("#val-p").textContent = sc ? fmt2(sc.main.p) : "–";
  $("#val-r").textContent = sc ? fmt2(sc.main.r) : "–";
  $("#rel-bars").innerHTML = RELS.map((r) => {
    const m = sc && sc.byRel[r];
    return `<div class="rel-row"><span style="color:${REL_COLOR[r]}">${r}</span>` +
      `<div class="bar"><i style="width:${m ? m.f1 * 100 : 0}%;background:${REL_COLOR[r]}"></i></div>` +
      `<span>${m ? `${m.tp}/${m.nGold} · ${fmt2(m.f1)}` : "–"}</span></div>`;
  }).join("");
  const note = $("#metrics-note");
  note.innerHTML = info.provisional
    ? '<span class="provisional">Provisional: se recalcula al terminar, cuando se juzga si la salida es válida.</span>'
    : "Sin <code>next</code>, como la métrica principal del estudio. Acierto = <code>(evento, relación, argumento)</code> idéntico al gold tras normalizar.";
  const u = info.usage;
  const facts = [
    ["Salida", info.valid == null ? "–" : info.valid ? "✓ válida" : "✗ inválida", info.valid === false ? "cuenta como grafo vacío" : ""],
    ["Tipos correctos", sc && sc.typeAcc != null ? Math.round(sc.typeAcc * 100) + " %" : "–", "entre los aciertos"],
    ["Tokens", u ? `${u.prompt_tokens} + ${u.completion_tokens}` : "–", u ? `prompt + salida (${u.completion_tokens_details?.reasoning_tokens ?? "?"} de razonamiento)` : ""],
    ["Tiempo", info.latency ? info.latency.toFixed(1) + " s" : "–", info.ttfc ? `contenido a los ${info.ttfc.toFixed(1)} s` : ""],
  ];
  $("#facts").innerHTML = facts.map(([k, v, s]) =>
    `<div class="stat"><span>${k}</span><b>${v}</b>${s ? `<br><small>${s}</small>` : ""}</div>`).join("");
}

function showResult(res, { animate, fresh } = {}) {
  state.current = res;
  const gold = goldTriples(state.story);
  const scored = score(res.valid ? res.triples : [], gold);
  const shown = res.partial;  // lo dibujado, aunque la salida sea inválida
  $("#model-empty").hidden = true;
  $("#thought").hidden = true;
  $("#model-caption").textContent = `${MODELS[res.model].short} · ${res.condition}`;
  renderRaw(res.raw, res.condition, true, parsePartial(res.raw, res.condition, true).marks);
  $("#reasoning").textContent = res.reasoning || "(sin razonamiento)";
  $("#chunk-info").textContent = res.chunks > 1
    ? `llegó en ${res.chunks} fragmentos (streaming real)`
    : "llegó en 1 solo bloque";
  const finish = () => {
    // en el grafo del modelo: aciertos y sobrantes; en el gold: aciertos y faltantes
    const shownScore = score(shown, gold);
    graphModel.setStatuses(shownScore.status);
    graphGold.setStatuses(scored.status);
    markStory(shown);
    renderDiff(scored);
    if (state.colorMode === "rel" && fresh) setColorMode("match");
  };
  if (animate) reveal(graphModel, shown, 70, finish);
  else { graphModel.update(shown); finish(); }
  const invalid = $("#invalid");
  invalid.hidden = res.valid;
  if (!res.valid) {
    invalid.innerHTML = res.condition === "texto"
      ? "✗ Salida inválida: al menos una línea no calza con el formato. Se puntúa como grafo vacío."
      : "✗ Salida inválida: no valida contra el esquema. Se puntúa como grafo vacío.";
  }
  setStatus(res.valid ? `F1 ${fmt2(scored.main.f1)}` : "inválida", res.valid ? "done" : "bad");
  renderMetrics(scored, { valid: res.valid, usage: res.usage, latency: res.latency, ttfc: res.ttfc });
  renderHistory();
}

/* ---------- llamada en vivo ---------- */

async function run() {
  if (state.running) return;
  state.running = true;
  const btn = $("#run");
  btn.disabled = true;
  btn.classList.add("busy");
  btn.querySelector(".run-label").textContent = "Extrayendo…";
  const { model, condition } = state;
  const story = state.story;

  reveal(graphModel, [], 0);
  graphModel.clear();
  graphModel.setStatuses(null);
  graphGold.setStatuses(null);
  if (state.colorMode === "match") setColorMode("rel");
  $("#model-empty").hidden = true;
  $("#invalid").hidden = true;
  $("#diff").innerHTML = '<p class="hint">Esperando la respuesta…</p>';
  $("#model-caption").textContent = `${MODELS[model].short} · ${condition}`;
  $("#chunk-info").textContent = "";
  markStory([]);
  renderMetrics(null);
  setStatus("conectando…", "live");
  const thought = $("#thought");
  const thoughtText = $("#thought-text");

  let raw = "", reasoning = "", usage = null, chunks = 0, ttfc = null;
  let lastCount = 0;
  const t0 = performance.now();
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ story_id: story.id, model, condition }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const retry = res.headers.get("retry-after");
      const err = new Error(j.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.retry = retry;
      throw err;
    }
    setStatus("pensando…", "live");
    thought.hidden = false;
    thoughtText.textContent = "";
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let j;
        try { j = JSON.parse(payload); } catch { continue; }
        if (j.error) throw new Error(j.error.message || "error de Groq");
        if (j.x_groq && j.x_groq.usage) usage = j.x_groq.usage;
        const d = (j.choices && j.choices[0] && j.choices[0].delta) || {};
        if (d.reasoning) {
          reasoning += d.reasoning;
          thoughtText.textContent = reasoning.slice(-220);
          $("#reasoning").textContent = reasoning;
        }
        if (d.content) {
          if (ttfc == null) ttfc = (performance.now() - t0) / 1000;
          chunks++;
          raw += d.content;
          thought.hidden = true;
          setStatus(condition === "texto" ? "escribiendo…" : "recibido", "live");
          const part = parsePartial(raw, condition, false);
          renderRaw(raw, condition, false, part.marks);
          // en texto el grafo crece en vivo; en JSON llega todo junto y se anima después
          if (condition === "texto" && part.triples.length !== lastCount) {
            lastCount = part.triples.length;
            graphModel.update(part.triples);
            markStory(part.triples);
            renderMetrics(score(part.triples, goldTriples(story)), { provisional: true });
          }
        }
      }
    }
    const latency = (performance.now() - t0) / 1000;
    const parsed = parseFinal(raw, condition);
    const result = {
      model, condition, raw, reasoning, usage, chunks, latency, ttfc,
      valid: parsed !== null,
      triples: parsed || [],
      partial: parsePartial(raw, condition, true).triples,
      storyId: story.id,
    };
    if (state.story.id !== story.id) return;
    state.history.push(result);
    showResult(result, { animate: condition !== "texto", fresh: true });
  } catch (err) {
    thought.hidden = true;
    setStatus("error", "bad");
    $("#model-empty").hidden = !!raw;
    if (err.status === 429) {
      const s = err.retry ? ` Intenta de nuevo en ~${Math.ceil(Number(err.retry))} s.` : "";
      toast(`Límite del plan gratuito alcanzado.${s} ${err.message}`, 9000);
    } else {
      toast(`No se pudo completar la extracción: ${err.message}`);
    }
    $("#diff").innerHTML = '<p class="hint">Sin resultado.</p>';
  } finally {
    state.running = false;
    btn.disabled = false;
    btn.classList.remove("busy");
    btn.querySelector(".run-label").textContent = "Extraer grafo";
  }
}

/* ---------- historial, controles e implicaciones ---------- */

function renderHistory() {
  const box = $("#history");
  box.hidden = state.history.length === 0;
  const gold = state.story ? goldTriples(state.story) : [];
  $("#history-list").innerHTML = state.history.map((h, i) => {
    const sc = score(h.valid ? h.triples : [], gold);
    return `<button data-i="${i}" class="${h === state.current ? "on" : ""}">` +
      `<b>${MODELS[h.model].short} · ${h.condition}</b>` +
      `<small>F1 ${fmt2(sc.main.f1)} · ${h.valid ? "válida" : "inválida"} · ${h.usage ? h.usage.total_tokens + " tokens" : ""}</small></button>`;
  }).join("");
  $("#history-list").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      if (state.running) return;
      reveal(graphModel, [], 0);
      graphModel.clear();
      showResult(state.history[Number(b.dataset.i)], { animate: true });
    });
  });
}

function setColorMode(m) {
  state.colorMode = m;
  document.querySelectorAll("#color-mode button").forEach((b) => b.classList.toggle("on", b.dataset.v === m));
  graphModel.setColorMode(m);
  graphGold.setColorMode(m);
  renderLegend();
}

function renderLegend() {
  const node = (c, label, cls = "") => `<span><i class="${cls}" style="background:${c}"></i>${label}</span>`;
  const line = (c, label, dashed) => `<span style="color:${c}"><i class="line${dashed ? " dashed" : ""}" style="background:${c}"></i><span style="color:var(--muted)">${label}</span></span>`;
  const parts = [
    node(TYPE_COLOR.Event, "evento", "pill"),
    node(TYPE_COLOR.Character, "Character"),
    node(TYPE_COLOR.Object, "Object"),
    node(TYPE_COLOR.Location, "Location"),
  ];
  if (state.colorMode === "rel") {
    parts.push(line(REL_COLOR.agent, "agent"), line(REL_COLOR.patient, "patient"),
      line(REL_COLOR.location, "location"), line(REL_COLOR.next, "next", true));
  } else {
    parts.push(line(STATUS_COLOR.hit, "acierto"), line(STATUS_COLOR.fp, "sobra (modelo)"), line(STATUS_COLOR.fn, "falta (gold)", true));
  }
  $("#legend").innerHTML = parts.join("");
}

function expRow(model, condition) {
  const m = state.data.results.metrics.filter((r) => r.model === model.replace("/", "_") && r.condition === condition);
  const byRun = Object.fromEntries(m.map((r) => [r.run, r]));
  const stab = state.data.results.stability.find((r) => r.model === model.replace("/", "_") && r.condition === condition);
  return { r1: byRun["1"], r2: byRun["2"], stab };
}

function renderImplication() {
  const c = CONDITIONS[state.condition];
  const { r1, r2, stab } = expRow(state.model, state.condition);
  const mixed = state.model === "openai/gpt-oss-20b" && state.condition === "texto";
  $("#implication").innerHTML = `
    <div class="fade-swap">
      <h3>Qué implica <code>${state.condition}</code></h3>
      <ul>${c.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
    </div>
    <div class="fade-swap">
      <h3>En el experimento con ${MODELS[state.model].short}</h3>
      <div class="exp-numbers">
        <div class="stat"><span>F1 corrida 1</span><b>${fmt2(r1 && r1.f1)}</b>${mixed ? "<br><small>celda con prompts mezclados</small>" : ""}</div>
        <div class="stat"><span>F1 corrida 2</span><b>${fmt2(r2 && r2.f1)}</b></div>
        <div class="stat"><span>Tokens de prompt</span><b>≈${r2 ? Math.round(r2.prompt_tokens) : "–"}</b></div>
        <div class="stat"><span>Estabilidad</span><b>${fmt2(stab && stab.jaccard)}</b><br><small>Jaccard corrida 1 vs 2</small></div>
      </div>
      <p class="hint">Salidas válidas: 100 % en las tres condiciones y ambos modelos.</p>
    </div>`;
  highlightExpRow();
}

function renderConds() {
  $("#conds").innerHTML = Object.entries(CONDITIONS).map(([k, c]) =>
    `<button class="cond" data-v="${k}" role="radio"><b>${k}</b><p>${c.short}</p>` +
    `<div class="tags">${c.tags.map(([t, cls]) => `<span class="tag ${cls}">${t}</span>`).join("")}</div></button>`
  ).join("");
  $("#conds").querySelectorAll(".cond").forEach((b) => b.addEventListener("click", () => {
    if (state.running) return;
    state.condition = b.dataset.v;
    syncControls();
  }));
}

function syncControls() {
  document.querySelectorAll("#model button").forEach((b) => {
    const on = b.dataset.v === state.model;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", on);
  });
  document.querySelectorAll("#conds .cond").forEach((b) => {
    const on = b.dataset.v === state.condition;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", on);
  });
  $("#model-hint").textContent = MODELS[state.model].hint;
  renderImplication();
  renderPrompt();
}

function renderPrompt() {
  if (!state.story) return;
  const p = state.data.prompts;
  const system = p.instructions + "\n\n" + (state.condition === "texto" ? p.format_text : p.format_json);
  let rf = "(ninguno)";
  if (state.condition === "json_objeto") rf = JSON.stringify({ type: "json_object" });
  if (state.condition === "json_estricto") rf = JSON.stringify({ type: "json_schema", json_schema: { name: "graph", strict: true, schema: state.data.schema } }, null, 2);
  $("#prompt").textContent =
    `model: ${state.model}\ntemperature: 1.0\nreasoning_effort: low\nresponse_format: ${rf}\n\n` +
    `── system ──\n${system}\n\n── user ──\n${state.story.sentences.join(" ")}`;
}

/* ---------- gráfico del experimento ---------- */

let expSel;
function renderExperiment() {
  const rows = [];
  for (const model of Object.keys(MODELS)) {
    for (const cond of Object.keys(CONDITIONS)) {
      const { r1, r2, stab } = expRow(model, cond);
      rows.push({ model, cond, r1: r1.f1, r2: r2.f1, stab: stab.jaccard });
    }
  }
  const svg = d3.select("#exp-chart");
  const draw = () => {
    const W = svg.node().getBoundingClientRect().width || 600;
    const H = 300;
    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const m = { l: 150, r: 64, t: 12, b: 34 };
    const x = d3.scaleLinear().domain([0.6, 0.82]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((r, i) => i)).range([m.t, H - m.b]).padding(0.28);
    svg.append("g").attr("class", "exp-axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
    svg.append("g").attr("class", "exp-axis").selectAll("line").data(x.ticks(5)).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke-dasharray", "2 4");
    const color = { texto: "#fbbf24", json_objeto: "#60a5fa", json_estricto: "#a78bfa" };
    const g = svg.selectAll("g.exp-row").data(rows).join("g").attr("class", "exp-row")
      .attr("transform", (d, i) => `translate(0,${y(i)})`);
    g.append("rect").attr("class", "exp-row-bg").attr("x", 0).attr("width", W).attr("height", y.bandwidth()).attr("rx", 8);
    g.append("text").attr("class", "exp-row-label").attr("x", 10).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
      .text((d) => `${MODELS[d.model].short} · ${d.cond}`);
    g.append("line").attr("y1", y.bandwidth() / 2).attr("y2", y.bandwidth() / 2)
      .attr("x1", (d) => x(Math.min(d.r1, d.r2))).attr("x2", (d) => x(Math.min(d.r1, d.r2)))
      .attr("stroke", (d) => color[d.cond]).attr("stroke-width", 3).attr("stroke-opacity", 0.45)
      .transition().duration(900).delay((d, i) => i * 90).attr("x2", (d) => x(Math.max(d.r1, d.r2)));
    for (const [k, shape] of [["r1", "circle"], ["r2", "rect"]]) {
      const sel = g.append(shape).attr("fill", (d) => color[d.cond]).attr("stroke", "#0b0f1c").attr("stroke-width", 1.5);
      if (shape === "circle") sel.attr("cy", y.bandwidth() / 2).attr("r", 0).attr("cx", (d) => x(d[k]))
        .transition().duration(600).delay((d, i) => 300 + i * 90).attr("r", 6);
      else sel.attr("y", y.bandwidth() / 2 - 5).attr("width", 10).attr("height", 10).attr("x", (d) => x(d[k]) - 5)
        .attr("transform", (d) => `rotate(45 ${x(d[k])} ${y.bandwidth() / 2})`).attr("opacity", 0)
        .transition().duration(600).delay((d, i) => 400 + i * 90).attr("opacity", 1);
    }
    g.append("text").attr("class", "exp-row-label").attr("x", W - m.r + 12).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
      .attr("fill", "#8b93a8").style("fill", "#8b93a8").text((d) => `J ${fmt2(d.stab)}`);
    g.append("title").text((d) => `${d.model} · ${d.cond}\nF1 corrida 1: ${fmt2(d.r1)}\nF1 corrida 2: ${fmt2(d.r2)}\nEstabilidad (Jaccard): ${fmt2(d.stab)}`);
    expSel = g;
    highlightExpRow();
  };
  new ResizeObserver(draw).observe(svg.node());
  $("#exp-text").innerHTML = `
    <p><b>Ningún formato gana con claridad.</b> Las 12 comparaciones pareadas entre condiciones (bootstrap de 1 000 remuestreos de historias) tienen un IC 95 % que incluye el 0.</p>
    <p>En 120b, <code>texto</code> queda ≈0,04 por debajo de los JSON en ambas corridas, pero sin significancia estadística.</p>
    <p><b>El tamaño sí pesa:</b> 120b saca ≈0,09 más de F1 que 20b y es más estable entre corridas (Jaccard ≈0,77 frente a ≈0,58).</p>
    <p>Las tres condiciones dieron 100 % de salidas válidas, así que la garantía de <code>json_estricto</code> no llegó a necesitarse.</p>
    <p class="hint">● corrida 1 &nbsp; ◆ corrida 2 &nbsp; J = estabilidad (Jaccard). En 20b · texto, la corrida 1 mezcla prompts (ver limitaciones del estudio).</p>`;
}

function highlightExpRow() {
  if (!expSel) return;
  expSel.classed("sel", (d) => d.model === state.model && d.cond === state.condition);
}

/* ---------- arranque ---------- */

async function init() {
  state.data = await (await fetch("data.json")).json();
  graphModel = createGraph($("#g-model"), "gm");
  graphGold = createGraph($("#g-gold"), "gg");
  graphModel.onHover((w) => hoverWord(w));
  graphGold.onHover((w) => hoverWord(w));

  const sel = $("#story");
  sel.innerHTML = ["dev", "test"].map((split) =>
    `<optgroup label="${split}">` +
    state.data.stories.filter((s) => s.split === split)
      .map((s) => `<option value="${s.id}">${esc(s.sentences[0])}</option>`).join("") +
    "</optgroup>").join("");
  sel.addEventListener("change", () => { if (!state.running) selectStory(sel.value); else sel.value = state.story.id; });
  $("#shuffle").addEventListener("click", () => {
    if (state.running) return;
    const others = state.data.stories.filter((s) => s.id !== state.story.id);
    const pick = others[Math.floor(Math.random() * others.length)];
    sel.value = pick.id;
    selectStory(pick.id);
  });
  document.querySelectorAll("#model button").forEach((b) => b.addEventListener("click", () => {
    if (state.running) return;
    state.model = b.dataset.v;
    syncControls();
  }));
  document.querySelectorAll("#color-mode button").forEach((b) => b.addEventListener("click", () => setColorMode(b.dataset.v)));
  $("#run").addEventListener("click", run);

  renderConds();
  renderExperiment();
  setColorMode("rel");
  const first = state.data.stories.find((s) => s.id.startsWith("52dff8fd")) || state.data.stories[0];
  sel.value = first.id;
  selectStory(first.id);
  syncControls();
}

init().catch((e) => toast("No se pudieron cargar los datos: " + e.message, 20000));
