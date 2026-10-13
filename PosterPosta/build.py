"""Build a self-contained offline preview and the distributable source archive.
Run with Python 3: python3 build.py. No third-party packages are required.
"""
from pathlib import Path
import base64
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent


def data_url(path):
    mime = 'image/jpeg' if path.suffix == '.jpg' else 'font/ttf'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def build():
    html = (ROOT / 'index.html').read_text()
    css = (ROOT / 'styles.css').read_text()
    engine = (ROOT / 'engine.js').read_text()
    app = (ROOT / 'app.js').read_text()
    images = {p.name: data_url(p) for p in sorted((ROOT / 'assets').glob('*.jpg'))}
    expected = set(re.findall(r"'([^']+\.jpg)'", engine))
    missing = expected - images.keys()
    if missing:
        raise RuntimeError('Missing image assets: ' + ', '.join(missing))
    for font in (ROOT / 'assets').glob('*.ttf'):
        css = css.replace('assets/' + font.name, data_url(font))
    engine = engine.replace("img: 'assets/' + image", "img: (window.POSTA_EMBEDDED[image] || 'assets/' + image)")
    embedded = 'window.POSTA_EMBEDDED=' + json.dumps(images, ensure_ascii=True) + ';\n' + engine
    html, style_count = re.subn(r'<link\b[^>]*href="styles\.css"[^>]*>', lambda _: '<style>' + css + '</style>', html)
    if style_count != 1:
        raise RuntimeError('Expected exactly one stylesheet link to inline.')
    html = re.sub(r'\sdata-page-node-id="[^"]*"', '', html)
    html = html.replace('<script defer src="engine.js"></script>', '')
    html = html.replace('<script defer src="app.js"></script>', '')
    html = html.replace('</body>', '<script>' + embedded + '\n' + app + '</script>\n</body>')
    licenses = '\n\n'.join((ROOT / 'assets' / name).read_text() for name in ['dmsans-OFL.txt', 'librecaslondisplay-OFL.txt'])
    html = html.replace('</head>', '<!-- Font licenses\n' + licenses.replace('--', '-') + '\n-->\n</head>')
    standalone = OUTPUT / 'PosterPosta.html'
    standalone.write_text(html)
    archive = OUTPUT / 'PosterPosta-source.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in sorted(ROOT.rglob('*')):
            if not path.is_file() or any(part in {'.git', '__pycache__', 'node_modules', '.DS_Store'} for part in path.relative_to(ROOT).parts):
                continue
            z.write(path, Path('PosterPosta') / path.relative_to(ROOT))
    print(json.dumps({'standalone': str(standalone), 'bytes': standalone.stat().st_size, 'archive': str(archive), 'archive_bytes': archive.stat().st_size, 'embedded_images': len(images)}, ensure_ascii=False))


if __name__ == '__main__':
    build()
