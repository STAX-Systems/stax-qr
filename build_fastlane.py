import os
import sys
import zipfile
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).parent
OUTPUT_DIR = ROOT_DIR / "dist"
INDEX_FILE = ROOT_DIR / "index.html"
CSS_FILE = ROOT_DIR / "style.css"
JS_FILE = ROOT_DIR / "app.js"
JSZIP_FILE = ROOT_DIR / "jszip.min.js"
QRIOUS_FILE = ROOT_DIR / "qrious.min.js"
SHARED_DIR = ROOT_DIR.parent / "shared"
STOREFRONT_FILE = SHARED_DIR / "storefront.js"
PAYMENT_FILE = SHARED_DIR / "payment.js"

def build():
    print("======================================================================")
    print(" [FASTLANE] BULK QR CODE GENERATOR BUILDER")
    print("======================================================================")
    
    if not OUTPUT_DIR.exists():
        OUTPUT_DIR.mkdir()
        
    print("[1] Reading source files...")
    try:
        html = INDEX_FILE.read_text(encoding="utf-8")
        css = CSS_FILE.read_text(encoding="utf-8")
        js = JS_FILE.read_text(encoding="utf-8")
        jszip = JSZIP_FILE.read_text(encoding="utf-8")
        qrious = QRIOUS_FILE.read_text(encoding="utf-8")
        storefront_js = STOREFRONT_FILE.read_text(encoding="utf-8")
        payment_js = PAYMENT_FILE.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[ERROR] Failed to read source files: {e}")
        sys.exit(1)

    print("[2] Inlining Styles & Scripts...")
    # Inline libraries first
    html = html.replace(
        '<script src="jszip.min.js"></script>',
        f'<script>\n{jszip}\n</script>'
    )
    html = html.replace(
        '<script src="qrious.min.js"></script>',
        f'<script>\n{qrious}\n</script>'
    )

    # Inline shared payment modules
    html = html.replace(
        '<script src="../shared/storefront.js"></script>',
        f'<script>\n{storefront_js}\n</script>'
    )
    html = html.replace(
        '<script src="../shared/payment.js"></script>',
        f'<script>\n{payment_js}\n</script>'
    )

    # Inline custom stylesheet
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        f'<style>\n{css}\n</style>'
    )

    # Inline custom app logic
    html = html.replace(
        '<script type="module" src="app.js"></script>',
        f'<script type="module">\n{js}\n</script>'
    )
    
    single_file_path = OUTPUT_DIR / "BulkQRGenerator.html"
    single_file_path.write_text(html, encoding="utf-8")
    print(f"[3] Generated single-file executable: {single_file_path.name} ({single_file_path.stat().st_size / 1024:.1f} KB)")
    
    zip_path = OUTPUT_DIR / "BulkQRGenerator-v1.zip"
    print(f"[4] Packaging ZIP bundle...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(single_file_path, arcname="BulkQRGenerator.html")
        
    print(f"[SUCCESS] Fastlane deploy complete! Output at: dist/BulkQRGenerator-v1.zip")

if __name__ == "__main__":
    build()
