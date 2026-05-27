"""Parse Biyokimya PDFs into biyokimya_corpus.json."""
import json
import os
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

ENVANTER = r"C:\Users\fatih\OneDrive\Desktop\notlar\extracted\envanter.json"
ROOT = r"C:\Users\fatih\OneDrive\Desktop\notlar\extracted\ders-notlari"
OUT = r"C:\Users\fatih\OneDrive\Desktop\notlar\extracted\biyokimya_corpus.json"


def derive_title(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r"^Biyokimya\s+", "", name, flags=re.IGNORECASE)
    name = re.sub(r"^(s\d+\)|uyg\d+\))\s*", "", name, flags=re.IGNORECASE)
    return name.strip(" _\t")


def find_pdf(filename):
    for dirpath, _dirs, files in os.walk(ROOT):
        if filename in files:
            return os.path.join(dirpath, filename)
    target = filename.lower()
    for dirpath, _dirs, files in os.walk(ROOT):
        for f in files:
            if f.lower() == target:
                return os.path.join(dirpath, f)
    return None


def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    parts = []
    for i, page in enumerate(doc, start=1):
        parts.append(f"\n\n=== Sayfa {i} ===\n\n{page.get_text()}")
    n = doc.page_count
    doc.close()
    return "".join(parts).lstrip("\n"), n


def main():
    with open(ENVANTER, encoding="utf-8") as f:
        envanter = json.load(f)
    bio_files = [f for f in envanter["files"] if f.get("konu") == "Biyokimya"]
    print(f"[INFO] {len(bio_files)} Biyokimya dosyasi bulundu.")

    corpus = []
    total_chars = 0
    missing = []
    for idx, entry in enumerate(bio_files, start=1):
        filename = entry["file"]
        week = entry["hafta"]
        kind = entry["tur"]
        path = find_pdf(filename)
        if path is None:
            print(f"[WARN] ({idx}/{len(bio_files)}) BULUNAMADI: {filename}")
            missing.append(filename)
            continue
        try:
            text, page_count = extract_text(path)
        except Exception as exc:
            print(f"[ERR]  ({idx}/{len(bio_files)}) {filename}: {exc}")
            missing.append(filename)
            continue
        corpus.append(
            {
                "file": filename,
                "week": week,
                "type": kind,
                "title": derive_title(filename),
                "pages": page_count,
                "text": text,
            }
        )
        total_chars += len(text)
        print(
            f"[OK]   ({idx:2d}/{len(bio_files)}) {week} | {kind:5s} | "
            f"{page_count:3d}p | {len(text):>7d} chars | {filename[:65]}"
        )

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(corpus, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 80)
    print(f"[DONE] {len(corpus)} dokuman -> {OUT}")
    print(f"[STAT] Toplam karakter: {total_chars:,}")
    print(f"[STAT] Ortalama karakter/doc: {total_chars // max(len(corpus), 1):,}")
    if missing:
        print(f"[STAT] Eksik: {len(missing)}")
        for m in missing:
            print(f"        - {m}")


if __name__ == "__main__":
    main()
