# Android: app closes after duplicating a recipe

The cause is not established. Existing duplication tests pass on both Jest
platforms, but they cannot reproduce Android native view/gesture teardown.
No runtime change has been made for this report.

## Send with the report

- Phone manufacturer/model and Android version.
- Installed XBRW++ app version and build/versionCode (not the phone's build number).
- Exact door: home **COPY** swipe tray, home long-press menu **Duplicate**, or
  editor **More > Duplicate**. Say if using a shelf or a screen reader.
- Source recipe: name, where it came from, whether edited before copying, and
  whether this affects one recipe or every recipe tried. Share recipe details privately.
- Does it return to the XBRW++ library, or to the phone's OS launcher? Does the
  app disappear, freeze, or show an error? A short screen recording can help.
- Exact local time and time zone of the event; does it happen every time?
- After reopening XBRW++, does the copy exist, and can it be opened?

Returning from the editor to the library after duplicating is intentional.
Returning to the phone's launcher is not that navigation.

## No computer: take an Android bug report

1. Enable **Developer options**: in Settings, find **About phone > Build number**
   (sometimes under **Software information**) and tap it seven times. Follow
   any unlock prompt. Menu names and report availability vary by manufacturer.
2. Reproduce the closure and note the time. Immediately open **Developer options >
   Take bug report**, choose an available report type and tap **Report**.
3. Wait for the report-ready notification, tap it, and share the report privately
   with the maintainer along with the details above. If unavailable, send those
   details first; do not install an unknown log-collection app.

**Privacy:** bug reports and logcat files can contain private information from
the phone and other apps. Do not post them in public issues or upload them to
public log services. Review before sharing and use a private channel agreed
with the maintainer.

## Computer alternative: adb

With Android Platform Tools installed, enable **USB debugging**, connect your
phone and approve only your trusted computer. After reproducing, capture the
existing crash buffer (do not clear logs):

```sh
adb logcat -b crash -d -v threadtime > xbrw-crash.txt
```

If it contains no matching failure, start a live capture **before** reproducing:

```sh
adb logcat -v threadtime > xbrw-logcat.txt
```

Reproduce once, note the time, then stop capture with **Ctrl-C**. Share the files
privately. These captures are deliberately not PID-filtered: a process can die
and restart, and system messages may explain a closure absent from the crash
buffer. The app package is `com.hessius.xbrwplusplus`. Disable USB debugging
afterwards if no longer needed.

Official Android instructions: [bug reports](https://developer.android.com/studio/debug/bug-report),
[Developer options](https://developer.android.com/studio/debug/dev-options),
[logcat](https://developer.android.com/tools/logcat).
