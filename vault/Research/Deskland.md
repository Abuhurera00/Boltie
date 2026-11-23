# Deskland

what it is
- desktop wallpaper app with a little animated world (themes like meadow and beach). installed on this machine at `%LOCALAPPDATA%\Programs\Deskland`, version 0.1.27.

what we actually looked at (REA, static only, didn't run it)
- `host\bin\Deskland.exe` is a small .NET Framework WinForms app (~180 KB). REA evidence `ev_61558ede...`
- references WebView2 (WinForms + Core), Steamworks.NET, System.Net.Http, WinRT bits
- so it's a thin native host and the whole world is a web page rendered in WebView2. pages are served from a local `prototype` folder through a virtual host (`app.local`)

from its own log file (`%LOCALAPPDATA%\Deskland\host.log`)
- mounts itself as a layered child of `Progman`, under the desktop icons. that's the wallpaper-engine trick, not an overlay
- WebGL2 context with alpha, running on ANGLE/D3D11
- pauses when any window is maximized or fullscreen
- reads desktop icon positions (SysListView32) and reacts when they change
- registers Ctrl+Alt+H as a hotkey

what we take from it
- pause rendering when something fullscreen is in front. it saves battery and nobody sees us anyway. added to [[Roadmap]] v0.2
- thin native host + web renderer is a fine split, same as ours

what's different
- it's behind your windows, we're in front. we need click-through, it doesn't
- it has no agent, no shell access
