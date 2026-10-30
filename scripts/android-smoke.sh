#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/android-diagnostics
capture_failure() {
  status=$?
  if [ "$status" -ne 0 ]; then
    adb exec-out screencap -p > artifacts/android-diagnostics/failure.png || true
    adb shell uiautomator dump /sdcard/yakumo-failure.xml || true
    adb exec-out cat /sdcard/yakumo-failure.xml > artifacts/android-diagnostics/failure.xml || true
    adb shell dumpsys window > artifacts/android-diagnostics/window.txt || true
    adb shell dumpsys activity activities > artifacts/android-diagnostics/activity.txt || true
    adb logcat -b crash -d > artifacts/android-diagnostics/crash.txt || true
  fi
  exit "$status"
}
trap capture_failure EXIT

python3 scripts/android-emulator-prepare.py
apk=$(find "artifacts/android-$BUILD_MODE" -maxdepth 1 -name '*.apk' -print -quit)
test -n "$apk"
adb logcat -c
adb install -r "$apk"
adb shell am force-stop app.yakumo.client
adb shell monkey -p app.yakumo.client -c android.intent.category.LAUNCHER 1
sleep 5
adb shell pidof app.yakumo.client
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep -F app.yakumo.client
mkdir -p artifacts/android-diagnostics
adb exec-out screencap -p > artifacts/android-diagnostics/launch.png
adb shell uiautomator dump /sdcard/yakumo-window.xml
adb exec-out cat /sdcard/yakumo-window.xml > artifacts/android-diagnostics/launch.xml
python3 scripts/android-ui-smoke.py
adb install -r "$apk"
adb shell am force-stop app.yakumo.client
adb shell monkey -p app.yakumo.client -c android.intent.category.LAUNCHER 1
sleep 3
adb shell pidof app.yakumo.client
pid=$(adb shell pidof app.yakumo.client | tr -d '\r')
crashes=$(adb logcat --pid="$pid" -b crash -d)
if grep -q 'FATAL EXCEPTION\|Fatal signal' <<< "$crashes"; then
  echo 'Application crashed during install/start validation'
  exit 1
fi
echo 'Android install, cold start, and same-key reinstall passed'
