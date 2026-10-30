"""Prepare only the disposable Actions emulator, never a user's Android device."""
import os
import subprocess

SETUP_PACKAGE = 'com.google.android.googlesdksetup'


def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=30)


def prepare_emulator(command=adb):
    if command('shell', 'getprop', 'ro.kernel.qemu').strip() != '1':
        raise RuntimeError('Refusing to prepare a non-emulator Android device')
    package = f'package:{SETUP_PACKAGE}'
    installed = command('shell', 'pm', 'list', 'packages', SETUP_PACKAGE)
    if package not in installed.splitlines():
        print('Google SDK setup package is absent; emulator is ready')
        return
    command('shell', 'am', 'force-stop', SETUP_PACKAGE)
    command('shell', 'pm', 'disable-user', '--user', '0', SETUP_PACKAGE)
    disabled = command('shell', 'pm', 'list', 'packages', '-d', SETUP_PACKAGE)
    if package not in disabled.splitlines():
        raise RuntimeError('Google SDK setup package could not be disabled')
    print('Google SDK setup disabled in the disposable emulator')


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Emulator preparation is restricted to GitHub Actions')
    prepare_emulator()


if __name__ == '__main__':
    main()
