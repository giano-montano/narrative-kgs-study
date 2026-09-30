"""Empaqueta historias, gold, prompts, esquema y resultados en public/data.json.

Correr desde la raíz del repo: python demo/build_data.py
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from schema import Graph  # noqa: E402

OUT = Path(__file__).resolve().parent / "public" / "data.json"


def read_csv(path):
    with open(ROOT / path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def prompt(name):
    return (ROOT / "prompts" / name).read_text(encoding="utf-8").strip()


def main():
    stories = [{"id": r["story_id"], "split": r["split"],
                "sentences": [r[f"s{i}"] for i in range(1, 6)]}
               for r in read_csv("data/stories.csv")]
    gold = {}
    for r in read_csv("data/gold.csv"):
        gold.setdefault(r["story_id"], []).append(
            [r["event"], r["rel"], r["arg"], r["arg_type"]])

    # solo test y la métrica principal (sin next)
    metrics = [{"model": r["model"], "condition": r["condition"], "run": r["run"],
                "precision": float(r["precision"]), "recall": float(r["recall"]),
                "f1": float(r["f1"]),
                "prompt_tokens": float(r["mean_prompt_tokens"]),
                "completion_tokens": float(r["mean_completion_tokens"])}
               for r in read_csv("results/metrics.csv")
               if r["group"] == "all_no_next" and r["run"] in ("1", "2")]
    bootstrap = [{k: (float(v) if k.startswith(("mean", "ci")) else v) for k, v in r.items()}
                 for r in read_csv("results/bootstrap.csv")]
    stability = [{"model": r["model"], "condition": r["condition"],
                  "jaccard": float(r["mean_jaccard"])}
                 for r in read_csv("results/stability.csv")]

    data = {
        "stories": stories,
        "gold": gold,
        "prompts": {"instructions": prompt("instructions.txt"),
                    "format_text": prompt("format_text.txt"),
                    "format_json": prompt("format_json.txt")},
        # mismo esquema que run.py manda en json_estricto
        "schema": Graph.model_json_schema(),
        "results": {"metrics": metrics, "bootstrap": bootstrap, "stability": stability},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"escrito {OUT} ({len(stories)} historias, {sum(map(len, gold.values()))} filas de gold)")


if __name__ == "__main__":
    main()
