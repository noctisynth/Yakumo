"""Exercise installed updater builds only on isolated CI runners/emulators."""
import json, os, pathlib, re, signal, ssl, subprocess, sys, time, xml.etree.ElementTree as ET

platform = sys.argv[1]
root = pathlib.Path('.verification/updater-validation').resolve()
package = 'app.yakumo.client.updatervalidation'
diagnostics = pathlib.Path('artifacts/updater-validation-' + platform)
diagnostics.mkdir(parents=True, exist_ok=True)
windows = os.name == 'nt'
startup = subprocess.STARTUPINFO() if windows else None
if startup: startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
server_cmd = [sys.executable, 'scripts/updater-validation-server.py', str(root)]
if not windows: server_cmd = ['sudo', '-n', *server_cmd]
server = subprocess.Popen(server_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, startupinfo=startup)
process = None
appdata = pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home() / '.local/share'))) / package
if platform.startswith('macos'): appdata = pathlib.Path.home() / 'Library/Application Support' / package
report = appdata / 'validation-events.jsonl'
history = []

def adb(*args): return subprocess.check_output(['adb', *args], stderr=subprocess.DEVNULL)
def read_events():
    try:
        data = adb('shell', 'cat', '/data/user/0/' + package + '/files/validation-events.jsonl').decode() if platform == 'android' else report.read_text()
        return [json.loads(line) for line in data.splitlines() if line.strip()]
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError): return []
def wait_event(event, version='99.0.1', timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        events = read_events()
        if any(row['event'] == event and row['version'] == version for row in events):
            history.append({'case': event, 'version': version, 'events': events})
            return
        if any(row['event'] in ['builder_failed', 'check_failed', 'install_failed', 'invalid_validation_version'] for row in events): raise RuntimeError('Native updater validation failed: ' + json.dumps(events))
        time.sleep(1)
    raise RuntimeError('Timed out waiting for ' + event + ': ' + json.dumps(read_events()))
def stop():
    global process
    if platform == 'android':
        adb('shell', 'am', 'force-stop', package)
    elif process and process.poll() is None:
        if windows: subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            try: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: pass
    time.sleep(1)
def clear_events():
    if platform == 'android': adb('shell', 'rm', '-f', '/data/user/0/' + package + '/files/validation-events.jsonl')
    else: report.unlink(missing_ok=True)
def launch():
    global process
    if platform == 'android': adb('shell', 'monkey', '-p', package, '-c', 'android.intent.category.LAUNCHER', '1')
    else: process = subprocess.Popen([str(executable)], startupinfo=startup, start_new_session=not windows, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def case(flag, event):
    stop(); clear_events()
    if flag: (root / flag).touch()
    launch(); wait_event(event)
    stop()
    if flag: (root / flag).unlink()
def snapshot():
    adb('shell', 'uiautomator', 'dump', '/sdcard/updater-ui.xml')
    data = adb('exec-out', 'cat', '/sdcard/updater-ui.xml')
    (diagnostics / 'last-ui.xml').write_bytes(data)
    return ET.fromstring(data)
def click(predicate, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for node in snapshot().iter('node'):
            bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
            if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1] and predicate(node):
                adb('shell', 'input', 'tap', str((bounds[0]+bounds[2])//2), str((bounds[1]+bounds[3])//2)); time.sleep(1); return
        time.sleep(1)
    raise RuntimeError('System updater confirmation not found')
try:
    time.sleep(2)
    if server.poll() is not None: raise RuntimeError('Local HTTPS fixture did not start')
    if platform == 'android':
        adb('root'); adb('wait-for-device'); adb('reverse', 'tcp:443', 'tcp:443')
        baseline = next((root / 'baseline').glob('*.apk'))
        adb('install', '--no-streaming', '-r', str(baseline))
        details = adb('shell', 'dumpsys', 'package', package).decode()
        if 'versionName=99.0.1' not in details: raise RuntimeError('Baseline version not installed')
    elif windows:
        installer = next((root / 'baseline').glob('*.exe'))
        installed = root / 'installed'
        subprocess.run([str(installer), '/S', '/D=' + str(installed)], check=True, startupinfo=startup)
        executable = installed / 'yakumo.exe'
    elif platform.startswith('macos'):
        executable = root / 'baseline/YakumoUpdaterValidation.app/Contents/MacOS/yakumo'
    else: executable = next((root / 'baseline').glob('*.AppImage'))
    case('no-update', 'no_update')
    case('wrong-version', 'manifest_rejected')
    case('tamper', 'download_or_verification_failed')
    if platform == 'android':
        adb('shell', 'touch', '/data/user/0/' + package + '/files/cancel-download')
    else:
        appdata.mkdir(parents=True, exist_ok=True); (appdata / 'cancel-download').touch()
    case(None, 'download_cancelled')
    if platform == 'android': adb('shell', 'rm', '/data/user/0/' + package + '/files/cancel-download')
    else: (appdata / 'cancel-download').unlink()
    clear_events(); launch()
    if platform == 'android':
        wait_event('install_started')
        # First deny the system source permission by returning without granting it.
        time.sleep(3); adb('shell', 'input', 'keyevent', '4'); wait_event('INSTALL_PERMISSION_DENIED')
        stop(); clear_events(); launch(); wait_event('install_started')
        click(lambda node: node.get('class') in ['android.widget.Switch', 'android.widget.SwitchCompat'] or node.get('resource-id', '').endswith('switch_widget'))
        adb('shell', 'input', 'keyevent', '4')
        click(lambda node: node.get('text', '').lower() == 'cancel')
        wait_event('INSTALL_CANCELLED')
        stop(); clear_events(); launch(); wait_event('install_started')
        click(lambda node: node.get('text', '').lower() == 'install')
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if 'versionName=99.0.2' in adb('shell', 'dumpsys', 'package', package).decode(): break
            time.sleep(2)
        else: raise RuntimeError('Android system installer did not upgrade the package')
        adb('shell', 'monkey', '-p', package, '-c', 'android.intent.category.LAUNCHER', '1')
    wait_event('launched', '99.0.2', 240)
    requests = [json.loads(line) for line in (root / 'requests.jsonl').read_text().splitlines()]
    for resource in ['manifest', 'artifact']:
        if not any(row['host'] == 'ghfast.top' and row['status'] == 503 and row['resource'] == resource for row in requests): raise RuntimeError('Primary fallback was not exercised')
        if not any(row['host'] == 'gh-proxy.com' and row['status'] == 200 and row['resource'] == resource for row in requests): raise RuntimeError('Backup success was not exercised')
    (diagnostics / 'results.json').write_text(json.dumps({'platform': platform, 'baseline': '99.0.1', 'installed': '99.0.2', 'cases': history, 'requests': requests}, indent=2))
    print('Real installed-app 99.0.1 -> 99.0.2 upgrade, mirror fallback and rejection cases passed: ' + platform)
finally:
    if platform == 'android':
        try: (diagnostics / 'screen.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        except subprocess.CalledProcessError: pass
    (diagnostics / 'events.json').write_text(json.dumps(read_events(), indent=2))
    if (root / 'requests.jsonl').exists(): (diagnostics / 'requests.jsonl').write_text((root / 'requests.jsonl').read_text())
    stop()
    if windows: server.terminate()
    else: subprocess.run(['sudo', '-n', 'kill', '-TERM', str(server.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
