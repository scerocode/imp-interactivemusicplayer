#!/usr/bin/env python3
"""
IMP Music Player - Python Widget Launcher
Provides a true always-on-top desktop widget experience.

Requirements:
  pip install pywebview

Run:
  python launch_widget.py
"""

import os
import sys

def check_pywebview():
    try:
        import webview
        return True
    except ImportError:
        return False

def launch_with_pywebview():
    import webview

    script_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(script_dir, "index.html")

    if not os.path.exists(html_path):
        print(f"ERROR: index.html not found at {html_path}")
        sys.exit(1)

    # Create the widget window
    window = webview.create_window(
        title="IMP Music Player",
        url=f"file://{html_path}",
        width=380,
        height=660,
        resizable=True,
        frameless=False,           # Set True for a completely borderless widget
        on_top=True,               # Always on top of other windows
        background_color="#0a0a0a",
        min_size=(300, 500),
    )

    print("")
    print(" =============================================")
    print("  IMP Interactive Music Player - Widget Mode")
    print(" =============================================")
    print("")
    print("  Window: 380x660 | Always on top: YES")
    print("  Close the window to exit.")
    print("")

    webview.start(debug=False)

def launch_fallback():
    """Open in browser as fallback if pywebview not available."""
    import subprocess
    import platform

    script_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(script_dir, "index.html")

    print("")
    print(" pywebview not installed. Install it for always-on-top support:")
    print("   pip install pywebview")
    print("")
    print(" Falling back to Chrome app mode...")
    print("")

    system = platform.system()
    chrome_paths = []

    if system == "Windows":
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]
    elif system == "Darwin":  # macOS
        chrome_paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ]
    else:  # Linux
        chrome_paths = ["/usr/bin/google-chrome", "/usr/bin/chromium-browser"]

    chrome = next((p for p in chrome_paths if os.path.exists(p)), None)

    if chrome:
        profile_dir = os.path.join(script_dir, "chrome_profile")
        subprocess.Popen([
            chrome,
            f"--app=file://{html_path}",
            "--window-size=380,660",
            "--no-first-run",
            f"--user-data-dir={profile_dir}",
        ])
    else:
        import webbrowser
        webbrowser.open(f"file://{html_path}")

if __name__ == "__main__":
    if check_pywebview():
        launch_with_pywebview()
    else:
        launch_fallback()
