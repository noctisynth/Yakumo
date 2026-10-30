"""Offline command fixtures; no SDK, adb process or Android device is used."""
import importlib.util
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    'emulator_prepare', Path(__file__).with_name('android-emulator-prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
PACKAGE = 'com.google.android.googlesdksetup'


class EmulatorPreparationTests(unittest.TestCase):
    def test_disables_only_the_google_setup_package_and_verifies_it(self):
        command = Mock(side_effect=['1\n', f'package:{PACKAGE}\n', '', '', f'package:{PACKAGE}\n'])
        prepare.prepare_emulator(command)
        self.assertEqual([call.args for call in command.call_args_list], [
            ('shell', 'getprop', 'ro.kernel.qemu'),
            ('shell', 'pm', 'list', 'packages', PACKAGE),
            ('shell', 'am', 'force-stop', PACKAGE),
            ('shell', 'pm', 'disable-user', '--user', '0', PACKAGE),
            ('shell', 'pm', 'list', 'packages', '-d', PACKAGE),
        ])

    def test_real_device_is_rejected_before_package_mutation(self):
        for value in ['', '0', 'true']:
            command = Mock(return_value=value)
            with self.assertRaisesRegex(RuntimeError, 'non-emulator'):
                prepare.prepare_emulator(command)
            self.assertEqual(command.call_count, 1)

    def test_absent_or_similarly_named_package_is_not_disabled(self):
        for installed in ['', f'package:{PACKAGE}.other\n']:
            command = Mock(side_effect=['1', installed])
            prepare.prepare_emulator(command)
            self.assertEqual(command.call_count, 2)

    def test_unsuccessful_disable_stops_validation(self):
        command = Mock(side_effect=['1', f'package:{PACKAGE}', '', '', ''])
        with self.assertRaisesRegex(RuntimeError, 'could not be disabled'):
            prepare.prepare_emulator(command)

    def test_adb_failure_is_not_ignored(self):
        command = Mock(side_effect=subprocess.CalledProcessError(1, 'adb'))
        with self.assertRaises(subprocess.CalledProcessError):
            prepare.prepare_emulator(command)

    def test_entry_point_rejects_local_runs_before_using_adb(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), patch.object(prepare, 'prepare_emulator') as command:
            with self.assertRaisesRegex(RuntimeError, 'GitHub Actions'):
                prepare.main()
            command.assert_not_called()


class SmokeDiagnosticsTests(unittest.TestCase):
    def test_failure_diagnostics_preserve_the_original_exit_status(self):
        bash = shutil.which('bash')
        if not bash and os.name == 'nt':
            candidate = Path('C:/Program Files/Git/bin/bash.exe')
            if candidate.is_file():
                bash = str(candidate)
        if not bash:
            self.skipTest('Bash is not available')
        script = Path(__file__).with_name('android-smoke.sh').resolve()
        with tempfile.TemporaryDirectory(prefix='yakumo-smoke-fixture-') as root:
            directory = Path(root)
            commands = directory / 'bin'
            commands.mkdir()
            # Fail preparation before any real install or application launch.
            (commands / 'python3').write_text('#!/usr/bin/env bash\nexit 17\n')
            (commands / 'adb').write_text('#!/usr/bin/env bash\nprintf "synthetic diagnostic\\n"\n')
            for command in commands.iterdir():
                command.chmod(0o755)
            result = subprocess.run(
                [bash, '-c', 'export PATH="$(cd "$1" && pwd):$PATH"; exec bash "$2"',
                 'smoke-fixture', str(commands), str(script)],
                cwd=directory, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 17, result.stderr)
            for name in ['failure.png', 'failure.xml', 'window.txt', 'activity.txt', 'crash.txt']:
                self.assertEqual((directory / 'artifacts/android-diagnostics' / name).read_text(),
                                 'synthetic diagnostic\n')


if __name__ == '__main__':
    unittest.main()
