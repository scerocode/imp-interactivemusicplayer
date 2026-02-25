# IMP Music Player — Desktop Widget

A compact always-on-top music player widget for your PC desktop.

---

## ⚡ Quick Start (No Install Required)

### Windows
Double-click **`Launch_Widget.bat`**

Requires Chrome or Edge to be installed (they almost certainly are).

### Mac / Linux
```bash
chmod +x launch_widget.sh
./launch_widget.sh
```

---

## 🪟 Always-On-Top Widget (Optional Upgrade)

For a true floating desktop widget that stays above all windows:

1. Install Python 3 (https://python.org)
2. Run in terminal:
   ```
   pip install pywebview
   python launch_widget.py
   ```

This creates a proper desktop window that floats above everything.

---

## 🎵 Adding Music

1. Launch the widget
2. Click the **SETTINGS** tab (bottom of the player)
3. Click **📁 Add Files** or **📂 Add Folder**
4. Select your MP3s/WAV/FLAC files
5. Go to **LIBRARY** tab → click a song to play!

Your library is saved automatically between sessions.

---

## 📐 Resizing the Widget

**Batch/Shell launchers:** Edit `Launch_Widget.bat` or `launch_widget.sh` and change:
```
WIDTH=380
HEIGHT=660
```

**Python launcher:** Edit `launch_widget.py` and change:
```python
width=380,
height=660,
```

---

## 📁 File Structure

```
IMP_Widget/
├── index.html          ← Main app
├── script.js           ← App logic
├── styles.css          ← Styling
├── Launch_Widget.bat   ← Windows launcher ✅
├── launch_widget.sh    ← Mac/Linux launcher ✅
├── launch_widget.py    ← Python always-on-top launcher ✅
└── README.txt          ← This file
```

---

## 🛠 Troubleshooting

**Black screen on launch:** Right-click the window → Reload (or press F5)

**"Chrome not found":** Install Chrome or Edge, or use the Python launcher

**Music won't play:** Files must stay in their original folder — the app stores paths, not files

**Library disappears:** The bat/sh launchers use a separate browser profile saved in `chrome_profile/` inside this folder, so the library persists
