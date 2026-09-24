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
    return {key(r.story_id, r.event, r.rel, r.arg): r.arg_type for r in gold.itertuples()}


def raw_files():
    # runs/<modelo>/<condicion>/<corrida>/<story_id>.txt
    for path in sorted(RUNS.glob("*/*/*/*.txt")):
        model, condition, run = path.parts[-4:-1]
        yield model, condition, run, path


def type_accuracy(pred_types, gold_types):
    common = set(pred_types) & set(gold_types)
    if not common:
        return None
    correct = sum(1 for k in common if pred_types[k] == gold_types[k])
    return (correct / len(common)) * 100


def mean_tokens(log, model_dir, condition, run, story_ids):
    mask = (
        (log["model"].str.replace("/", "_") == model_dir) &
        (log["condition"] == condition) &
        (log["run"] == str(run)) &
        (log["story_id"].isin(story_ids)) &
        (log["error"].isna() | (log["error"] == ""))
    )
    filtered = log[mask]
    if filtered.empty:
        return None, None
    return float(filtered["prompt_tokens"].astype(float).mean()), float(filtered["completion_tokens"].astype(float).mean())


def prf(pred, gold):
    tp = len(pred & gold)
    p = tp / len(pred) if pred else 0.0
    r = tp / len(gold) if gold else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return tp, p, r, f1


def score_cell(outputs, gold, log, model, condition, run):
    # outputs: {story_id: lista de Triple o None}; P/R/F1 micro
    stories = set(outputs)
    pred = {}
    for sid, triples in outputs.items():
        for t in (triples or []):
            k = key(sid, t.event, t.rel, t.arg)
            if k not in pred:
                pred[k] = t.arg_type
    
    g_types = {g: gold[g] for g in gold if g[0] in stories}
    
    m_prompt, m_comp = mean_tokens(log, model, condition, run, stories)
    
    pct_valid = 100 * sum(t is not None for t in outputs.values()) / len(outputs)
    rows = []
    for group, rels in GROUPS.items():
        p_set = {k for k in pred if k[2] in rels}
        g_set = {k for k in g_types if k[2] in rels}
        tp, p, r, f1 = prf(p_set, g_set)
        
        if group == "all_no_next":
            p_types = {k: pred[k] for k in p_set}
            g_types_sub = {k: g_types[k] for k in g_set}
            pct_type = type_accuracy(p_types, g_types_sub)
        else:
            pct_type = None

        rows.append({"group": group, "precision": p, "recall": r, "f1": f1,
                     "tp": tp, "n_pred": len(p_set), "n_gold": len(g_set),
                     "n_stories": len(outputs), "pct_valid": pct_valid,
                     "pct_type_correct": pct_type,
                     "mean_prompt_tokens": m_prompt,
                     "mean_completion_tokens": m_comp})
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

    log_path = RUNS / "log.csv"
    if log_path.exists():
        log = pd.read_csv(log_path, dtype=str)
    else:
        log = pd.DataFrame(columns=["model", "condition", "run", "story_id", "prompt_tokens", "completion_tokens", "error"])

    rows = []
    for (model, condition, run), outputs in sorted(cells.items()):
        for row in score_cell(outputs, gold, log, model, condition, run):
            rows.append({"model": model, "condition": condition, "run": run, **row})
    METRICS.parent.mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(METRICS, index=False, float_format="%.4f")
    print(f"escrito {METRICS} ({len(rows)} filas) con gold {args.gold}")


if __name__ == "__main__":
    main()
