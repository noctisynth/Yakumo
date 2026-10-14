#!/usr/bin/env bash
set -euo pipefail
apk=$(find "artifacts/android-$BUILD_MODE" -maxdepth 1 -name '*.apk' -print -quit)
test -n "$apk"
adb logcat -c
adb install -r "$apk"
adb shell am force-stop app.yakumo.client
adb shell monkey -p app.yakumo.client -c android.intent.category.LAUNCHER 1
sleep 5
adb shell pidof app.yakumo.client
adb shell dumpsys activity activities | grep app.yakumo.client
adb install -r "$apk"
adb shell am force-stop app.yakumo.client
adb shell monkey -p app.yakumo.client -c android.intent.category.LAUNCHER 1
sleep 3
adb shell pidof app.yakumo.client
crashes=$(adb logcat -b crash -d)
if grep -q 'FATAL EXCEPTION\|Fatal signal' <<< "$crashes"; then
  echo 'Application crashed during install/start validation'
  exit 1
fi
echo 'Android install, cold start, and same-key reinstall passed'
