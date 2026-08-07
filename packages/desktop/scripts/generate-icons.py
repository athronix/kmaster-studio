"""Generate kmaster-studio app icons: icon.png, icon.ico, icon.icns.
Uses PIL to render a dark-background "K" logo at required sizes."""

import os
from PIL import Image, ImageDraw, ImageFont

BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "build")
BG_COLOR = (26, 26, 46)  # #1a1a2e dark slate
K_COLOR = (255, 255, 255)  # white


def _find_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Try system fonts, fall back to PIL default."""
    font_paths = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",  # Segoe UI Bold
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except OSError:
                continue
    # macOS / Linux paths
    for fp in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except OSError:
                continue
    return ImageFont.load_default()


def create_icon(size: int) -> Image.Image:
    """Square icon: dark bg + centered white 'K'."""
    img = Image.new("RGBA", (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    font_size = int(size * 0.55)
    font = _find_font(font_size)

    text = "K"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]
    draw.text((x, y), text, fill=K_COLOR, font=font)

    return img


def main() -> None:
    os.makedirs(BUILD_DIR, exist_ok=True)

    # 1. icon.png 512x512
    print("Generating icon.png (512x512)...")
    png512 = create_icon(512)
    png512.save(os.path.join(BUILD_DIR, "icon.png"), "PNG")
    print("  icon.png done")

    # 2. icon.ico 256x256
    print("Generating icon.ico (256x256)...")
    ico = create_icon(256)
    ico.save(os.path.join(BUILD_DIR, "icon.ico"), "ICO", sizes=[(256, 256)])
    print("  icon.ico done")

    # 3. icon.icns (multi-res macOS)
    print("Generating icon.icns...")
    sizes = [16, 32, 64, 128, 256, 512]
    icons = [create_icon(s) for s in sizes]
    try:
        icons[0].save(
            os.path.join(BUILD_DIR, "icon.icns"),
            "ICNS",
            append_images=icons[1:],
        )
        print("  icon.icns done")
    except Exception as exc:
        print(f"  icon.icns PIL ICNS failed ({exc}), using PNG fallback")
        # electron-builder on macOS accepts PNG renamed to .icns as a fallback
        png512.save(os.path.join(BUILD_DIR, "icon.icns"), "PNG")

    # Report
    print()
    print("All icons generated:")
    for fname in ["icon.png", "icon.ico", "icon.icns"]:
        fpath = os.path.join(BUILD_DIR, fname)
        size_kb = os.path.getsize(fpath) / 1024
        print(f"  {fname}: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
