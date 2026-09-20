import argparse
import csv
import time
from datetime import datetime, timezone
from pathlib import Path

import groq
import pandas as pd

from schema import Graph

TEMPERATURE = 1.0
REASONING_EFFORT = "low"
MAX_RETRIES = 3

ROOT = Path(__file__).parent
RUNS = ROOT / "runs"
LOG = RUNS / "log.csv"
LOG_COLUMNS = ["timestamp", "model", "condition", "run", "story_id",
               "prompt_tokens", "completion_tokens", "latency_s", "error"]

FORMAT_FILES = {
    "texto": "format_text.txt",
    "json_objeto": "format_json.txt",
    "json_estricto": "format_json.txt",
}


def response_format(condition):
    # tabla de la sección 3
    if condition == "texto":
        return None
    if condition == "json_objeto":
        return {"type": "json_object"}
    return {"type": "json_schema",
            "json_schema": {"name": "graph", "strict": True,
                            "schema": Graph.model_json_schema()}}


def system_prompt(condition):
    instructions = (ROOT / "prompts" / "instructions.txt").read_text(encoding="utf-8").strip()
    fmt = (ROOT / "prompts" / FORMAT_FILES[condition]).read_text(encoding="utf-8").strip()
    return instructions + "\n\n" + fmt


def raw_path(model, condition, run, story_id):
    # la "/" del modelo se reemplaza por "_"
    return RUNS / model.replace("/", "_") / condition / str(run) / f"{story_id}.txt"


def call_model(client, model, condition, system, user):
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=TEMPERATURE,
        reasoning_effort=REASONING_EFFORT,
        # el razonamiento va en message.reasoning; se excluye igual en las 3 condiciones
        include_reasoning=False,
    )
    fmt = response_format(condition)
    if fmt is not None:
        kwargs["response_format"] = fmt
    return client.chat.completions.create(**kwargs)


def call_with_retry(client, model, condition, system, user):
    # ante 429 espera retry-after y reintenta, máximo MAX_RETRIES veces
    for attempt in range(MAX_RETRIES + 1):
        try:
            return call_model(client, model, condition, system, user)
        except groq.RateLimitError as e:
            if attempt == MAX_RETRIES:
                raise
            wait = float(e.response.headers.get("retry-after", 1))
            print(f"  429, esperando {wait}s (reintento {attempt + 1}/{MAX_RETRIES})")
            time.sleep(wait)


def append_log(row):
    new = not LOG.exists()
    with LOG.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_COLUMNS)
        if new:
            writer.writeheader()
        writer.writerow(row)


def process_story(client, args, system, story):
    path = raw_path(args.model, args.condition, args.run, story["story_id"])
    if path.exists():
        print(f"{story['story_id']}: ya existe, se salta")
        return
    user = " ".join(story[f"s{i}"] for i in range(1, 6))
    row = {"timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "model": args.model, "condition": args.condition, "run": args.run,
           "story_id": story["story_id"], "prompt_tokens": "",
           "completion_tokens": "", "latency_s": "", "error": ""}
    start = time.perf_counter()
    try:
        resp = call_with_retry(client, args.model, args.condition, system, user)
        row["latency_s"] = round(time.perf_counter() - start, 3)
        row["prompt_tokens"] = resp.usage.prompt_tokens
        row["completion_tokens"] = resp.usage.completion_tokens
        path.parent.mkdir(parents=True, exist_ok=True)
        # modo "x": nunca sobrescribe
        with path.open("x", encoding="utf-8", newline="") as f:
            f.write(resp.choices[0].message.content or "")
        print(f"{story['story_id']}: ok")
    except Exception as e:
        row["error"] = f"{type(e).__name__}: {e}"
        print(f"{story['story_id']}: error {row['error']}")
    append_log(row)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--condition", required=True, choices=list(FORMAT_FILES))
    parser.add_argument("--run", required=True, type=int)
    parser.add_argument("--stories", required=True, help="CSV con story_id, split, s1..s5")
    args = parser.parse_args()

    stories = pd.read_csv(args.stories, dtype=str)
    system = system_prompt(args.condition)
    # sin reintentos automáticos del SDK: el 429 se maneja aquí
    client = groq.Groq(max_retries=0)
    for story in stories.to_dict("records"):
        process_story(client, args, system, story)


if __name__ == "__main__":
    main()
