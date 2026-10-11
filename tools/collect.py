import json, shutil
from pathlib import Path
R = Path(__file__).resolve().parents[1]
tasks = []
for t in ["mnist", "gan", "ngp", "shakespeare"]:
    src = R.parent / t / "results"
    (R / "data" / t).mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        shutil.copy(f, R / "data" / t / f.name)
    m = json.loads((src / "metrics.json").read_text())
    m["artifacts"] = [f"data/{t}/{Path(a).name}" for a in m["artifacts"]]
    tasks.append({k: m[k] for k in ["task", "title", "params", "train_seconds", "device", "curves", "final", "artifacts"]})
(R / "data" / "index.json").write_text(json.dumps({"tasks": tasks}))
