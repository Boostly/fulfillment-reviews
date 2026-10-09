#!/usr/bin/env python3
"""Downsize bundled images in place.

Reads a JSON list of {"path", "max_px", "quality"} objects on stdin. For each raster image
(png/jpg/jpeg/webp; svg and gif are skipped) it:
  - applies EXIF orientation,
  - limits the long edge to MAX_PX,
  - keeps PNG only when the image actually uses alpha,
  - otherwise re-encodes as JPEG at QUALITY and renames the file to .jpg.
Small images (under MIN_BYTES and within MAX_PX) are left untouched so
crisp UI screenshots are not needlessly recompressed.

Prints a JSON object {old_path: new_path} for every file it rewrote.
"""
import json
import os
import sys

from PIL import Image, ImageOps

MIN_BYTES = 300_000      # leave small, in-bounds files untouched
RASTER = (".png", ".jpg", ".jpeg", ".webp")


def has_alpha(im):
    if im.mode in ("RGBA", "LA"):
        return im.getextrema()[-1][0] < 255
    if im.mode == "P":
        return "transparency" in im.info
    return False


def shrink(path, max_px, quality, keep_png=False):
    ext = os.path.splitext(path)[1].lower()
    if ext not in RASTER:
        return None
    size = os.path.getsize(path)
    try:
        im = Image.open(path)
        im.load()
    except Exception:
        return None
    too_big = max(im.size) > max_px
    if size < MIN_BYTES and not too_big:
        return None
    im = ImageOps.exif_transpose(im)
    if too_big:
        im.thumbnail((max_px, max_px), Image.LANCZOS)
    if has_alpha(im) or (keep_png and ext == ".png"):
        im = im.convert("RGBA") if has_alpha(im) else im.convert("RGB")
        im.save(path, "PNG", optimize=True)
        return path
    new = os.path.splitext(path)[0] + ".jpg"
    im.convert("RGB").save(new, "JPEG", quality=quality, optimize=True, progressive=True)
    if new != path:
        os.remove(path)
    return new


def main():
    jobs = json.load(sys.stdin)
    out = {}
    for job in jobs:
        p = job["path"]
        new = shrink(p, int(job.get("max_px", 1600)), int(job.get("quality", 82)), bool(job.get("keep_png", False)))
        if new is not None:
            out[p] = new
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
