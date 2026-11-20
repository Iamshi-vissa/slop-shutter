#!/usr/bin/env python3
"""Pull last night's sensor dumps off the Pi and merge them into one CSV."""

import csv
import subprocess
import sys
from pathlib import Path

PI = "pi@greenhouse.local"
REMOTE = "/home/pi/logs"
OUT = Path.home() / "greenhouse" / "merged.csv"


def pull(dest: Path) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(["rsync", "-a", f"{PI}:{REMOTE}/", str(dest)], check=True)
    return sorted(dest.glob("*.csv"))


def rows(paths):
    for p in paths:
        with p.open() as f:
            r = csv.reader(f)
            next(r, None)  # header differs between firmware versions, skip it
            for row in r:
                # old firmware wrote temp in F. anything over 60 is obviously F
                t = float(row[1])
                if t > 60:
                    row[1] = f"{(t - 32) * 5 / 9:.1f}"
                yield row


def main():
    files = pull(Path("/tmp/gh"))
    if not files:
        sys.exit("nothing pulled - is the pi up?")
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ts", "temp_c", "humidity", "soil"])
        n = sum(1 for _ in map(w.writerow, rows(files)))
    print(f"{n} rows -> {OUT}")


if __name__ == "__main__":
    main()
