"""Verify packaged launcher resources; no account or signing material is read."""

import io
import json
import os
import pathlib
import re
import subprocess
import zipfile

from PIL import Image


SOURCE = pathlib.Path('src-tauri/icons/android')
DENSITIES = ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
NAMES = ('ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground')


def visible_pixels(image):
    rgba = image.convert('RGBA')
    return Image.alpha_composite(Image.new('RGBA', rgba.size, 'white'), rgba).convert('RGB').tobytes()


def verify_images(package_path, diagnostics):
    checked = []
    with zipfile.ZipFile(package_path) as package:
        paths = package.namelist()
        for density in DENSITIES:
            for name in NAMES:
                pattern = rf'(?:base/)?res/mipmap-{density}(?:-v\d+)?/{name}\.png'
                matches = [path for path in paths if re.fullmatch(pattern, path)]
                if len(matches) != 1:
                    raise RuntimeError(f'Expected one packaged {density}/{name} icon')
                with Image.open(io.BytesIO(package.read(matches[0]))) as actual, Image.open(
                    SOURCE / f'mipmap-{density}' / f'{name}.png'
                ) as expected:
                    if actual.size != expected.size or visible_pixels(actual) != visible_pixels(expected):
                        raise RuntimeError(f'Packaged brand icon mismatch: {density}/{name}')
                    if density == 'xxxhdpi' and package_path.suffix == '.apk':
                        actual.save(diagnostics / f'{name}.png')
                checked.append(matches[0])
    return checked


def verify_apk_references(apk):
    aapt = pathlib.Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0/aapt'

    def run(*arguments):
        return subprocess.run([str(aapt), *map(str, arguments)], check=True, capture_output=True, text=True).stdout

    resources = run('dump', 'resources', apk)
    ids = {}
    for name in (*NAMES, 'ic_launcher_background'):
        kind = 'color' if name.endswith('background') else 'mipmap'
        match = re.search(rf'(?:spec )?resource (0x[\da-fA-F]+) [^\s:]+:{kind}/{name}:', resources)
        if not match:
            raise RuntimeError(f'Packaged icon resource missing: {name}')
        ids[name] = match.group(1).lower()
    manifest = run('dump', 'xmltree', apk, 'AndroidManifest.xml').lower()
    for attribute, name in [('icon', 'ic_launcher'), ('roundicon', 'ic_launcher_round')]:
        if not re.search(rf'android:{attribute}\([^)]*\)=@{ids[name]}\b', manifest):
            raise RuntimeError(f'Application {attribute} does not reference the brand icon')
    with zipfile.ZipFile(apk) as package:
        for name in ('ic_launcher', 'ic_launcher_round'):
            paths = [path for path in package.namelist() if re.fullmatch(rf'res/mipmap-anydpi-v26/{name}\.xml', path)]
            if len(paths) != 1:
                raise RuntimeError(f'Packaged adaptive icon missing: {name}')
            xml = run('dump', 'xmltree', apk, paths[0]).lower()
            if 'e: adaptive-icon' not in xml:
                raise RuntimeError(f'Expected an adaptive brand icon: {name}')
            for tag, target in [('foreground', 'ic_launcher_foreground'), ('background', 'ic_launcher_background')]:
                if not re.search(rf'e: {tag}\b[^\n]*\n\s+a: android:drawable\([^)]*\)=@{ids[target]}\b', xml):
                    raise RuntimeError(f'Adaptive {tag} does not reference brand resources')


def main():
    mode = os.environ['BUILD_MODE']
    if mode not in ('debug', 'release'):
        raise RuntimeError('Unsupported Android build mode')
    artifacts = pathlib.Path('artifacts') / f'android-{mode}'
    packages = sorted(artifacts.glob('*.apk')) + sorted(artifacts.glob('*.aab'))
    if len(packages) != (2 if mode == 'release' else 1):
        raise RuntimeError('Expected one APK and, for release, one AAB')
    diagnostics = pathlib.Path('artifacts/android-diagnostics')
    diagnostics.mkdir(parents=True, exist_ok=True)
    report = {}
    for package in packages:
        report[package.name] = verify_images(package, diagnostics)
        if package.suffix == '.apk':
            verify_apk_references(package)
    (diagnostics / 'launcher-icons.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified packaged brand pixels at all densities and APK launcher/adaptive references')


if __name__ == '__main__':
    main()
