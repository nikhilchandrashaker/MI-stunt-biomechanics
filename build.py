"""Builds index.html (repo, full page) from src/template.html + src/engine.js + data CSV.

    python src/build.py                    # writes index.html in the repo root
    python src/build.py --fragment OUT     # also writes the bare fragment (no doctype) to OUT
"""
import argparse
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fragment", help="also write the bare fragment here")
    args = ap.parse_args()

    frag = read("src", "template.html")
    frag = frag.replace("/*ENGINE*/", read("src", "engine.js"))
    frag = frag.replace("/*CSV*/", read("data", "ethan_stunts.csv").strip())

    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<style>:root{color-scheme:light}html,body{margin:0}</style>\n</head>\n<body>\n'
            + frag + '\n</body>\n</html>\n')
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page)
    if args.fragment:
        with open(args.fragment, "w", encoding="utf-8") as fh:
            fh.write(frag)
    print("built index.html", len(page), "bytes")


if __name__ == "__main__":
    main()
