# Desktop Residency Verification

P1b-A validates local desktop behavior only. It must not wake OpenAB services
or add cloud credentials to Electron.

## Manual interaction checks

1. Launch `npm run dev:electron` and confirm the tray icon is visible.
2. Select the **—** button beside the chat button to minimize the pet. `Alt+F4`
   must have the same result. The pet and any history window must disappear,
   while the tray icon remains available. On Wayland, the tray must restore the
   minimized window rather than calling `show()` on a hidden surface so the
   compositor retains its current-session placement.
3. Use the tray menu to show the pet again, then use **Reset position**.
4. Move and resize the pet, quit from the tray, and relaunch. The new bounds
   must be restored.
5. On X11 or Windows, move the saved state off-screen (for example, disconnect
   an external display), relaunch, and confirm the pet is recovered onto the
   primary display. On native Wayland, a compositor may choose placement at
   every fresh launch; only in-session minimize/restore placement is guaranteed.
6. Choose **Quit Jellii** and verify there is no remaining Electron process.

## Linux resource measurement

RSS values from individual Electron processes must not be summed: Chromium
shares pages between its browser, renderer, GPU, and utility processes. Launch
the complete process tree in a temporary systemd user scope instead:

```bash
systemd-run --user --scope --unit=jellii-metrics --collect --quiet \
  bash -lc 'cd /path/to/openab-companion-live2d && exec npm run dev:electron'
```

Read the scope's cgroup v2 counters after each scenario:

```bash
scope=$(systemctl --user show jellii-metrics.scope -p ControlGroup --value)
base=/sys/fs/cgroup$scope
cat "$base/memory.current" "$base/memory.peak" "$base/cpu.stat"
```

Capture visible idle, hidden-to-tray idle, history open, and a mock SSE stream.
`memory.current` is the current process-tree footprint; `memory.peak` records
the high-water mark; `cpu.stat` supplies the CPU delta. Stop the temporary
scope after the final Quit check:

```bash
systemctl --user stop jellii-metrics.scope
```
