import argparse
import json
import re
from pathlib import Path

import pandas as pd
from pydantic import ValidationError

from schema import Graph, Triple

ROOT = Path(__file__).parent
RUNS = ROOT / "runs"
METRICS = ROOT / "results" / "metrics.csv"

# línea de texto: event | rel | arg [arg_type]
LINE_RE = re.compile(r"^\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|\[]+?)\s*\[\s*([^\]]+?)\s*\]\s*$")

# grupos de métricas: principal sin next, y una por relación
GROUPS = {
    "all_no_next": {"agent", "patient", "location"},
    "agent": {"agent"},
    "patient": {"patient"},
    "location": {"location"},
    "next": {"next"},
}


def parse_text(raw):
    # regla A: la salida entera es válida solo si cada línea no vacía calza y valida.
    # Es lo mismo que hace Graph.model_validate con el JSON: todo o nada.
    lines = [l for l in raw.splitlines() if l.strip()]
    triples = []
    for line in lines:
        m = LINE_RE.match(line)
        if not m:
            return None
        event, rel, arg, arg_type = m.groups()
        triples.append(Triple(event=event, rel=rel, arg=arg, arg_type=arg_type))
    return triples


def parse_json(raw):
    return Graph.model_validate(json.loads(raw)).triples


def parse(raw, condition):
    # devuelve lista de Triple, o None si la salida es inválida
    try:
        return parse_text(raw) if condition == "texto" else parse_json(raw)
    except (ValidationError, json.JSONDecodeError):
        return None


def norm(s):
    return re.sub(r"[^\w\s]", "", s.lower()).split()


def key(story_id, event, rel, arg):
    # sección 5: primera palabra del evento, última del argumento
    e, r, a = norm(event), norm(rel), norm(arg)
    return (story_id, e[0] if e else "", r[0] if r else "", a[-1] if a else "")


def load_gold(path):
    gold = pd.read_csv(path, dtype=str)
    return {key(r.story_id, r.event, r.rel, r.arg) for r in gold.itertuples()}


def raw_files():
    # runs/<modelo>/<condicion>/<corrida>/<story_id>.txt
    for path in sorted(RUNS.glob("*/*/*/*.txt")):
        model, condition, run = path.parts[-4:-1]
        yield model, condition, run, path


def prf(pred, gold):
    tp = len(pred & gold)
    p = tp / len(pred) if pred else 0.0
    r = tp / len(gold) if gold else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return tp, p, r, f1


def score_cell(outputs, gold):
    # outputs: {story_id: lista de Triple o None}; P/R/F1 micro
    stories = set(outputs)
    pred = {key(sid, t.event, t.rel, t.arg)
            for sid, triples in outputs.items() for t in (triples or [])}
    gold = {g for g in gold if g[0] in stories}
    pct_valid = 100 * sum(t is not None for t in outputs.values()) / len(outputs)
    rows = []
    for group, rels in GROUPS.items():
        p_set = {k for k in pred if k[2] in rels}
        g_set = {k for k in gold if k[2] in rels}
        tp, p, r, f1 = prf(p_set, g_set)
        rows.append({"group": group, "precision": p, "recall": r, "f1": f1,
                     "tp": tp, "n_pred": len(p_set), "n_gold": len(g_set),
                     "n_stories": len(outputs), "pct_valid": pct_valid})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", default="data/gold.csv",
                        help="CSV del gold con story_id, event, rel, arg, arg_type "
                             "(default: data/gold.csv; para la prueba: data/gold_example.csv)")
    args = parser.parse_args()

    gold = load_gold(args.gold)
    gold_ids = {g[0] for g in gold}
    cells = {}
    for model, condition, run, path in raw_files():
        if path.stem not in gold_ids:
            print(f"aviso: {path} no tiene gold, se ignora")
            continue
        raw = path.read_text(encoding="utf-8")
        cells.setdefault((model, condition, run), {})[path.stem] = parse(raw, condition)

    rows = []
    for (model, condition, run), outputs in sorted(cells.items()):
        for row in score_cell(outputs, gold):
            rows.append({"model": model, "condition": condition, "run": run, **row})
    METRICS.parent.mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(METRICS, index=False, float_format="%.4f")
    print(f"escrito {METRICS} ({len(rows)} filas) con gold {args.gold}")


if __name__ == "__main__":
    main()
