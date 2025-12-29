# Jamal - Drawing Application

A desktop drawing application built with Tauri, React, and TypeScript.

## Font Requirements

This application uses **Outfit** and **DM Sans** fonts which are bundled with the app. For development or if you want to install the fonts system-wide:

1. Download fonts from Google Fonts:
   - [Outfit](https://fonts.google.com/specimen/Outfit)
   - [DM Sans](https://fonts.google.com/specimen/DM+Sans)

2. Install the fonts on your system:
   - **Windows**: Right-click the font files and select "Install"
   - **macOS**: Double-click the font files and click "Install Font"
   - **Linux**: Copy fonts to `~/.local/share/fonts/` and run `fc-cache -fv`

> **Note**: The fonts are bundled in `src/assets/fonts/` and will work without system installation.

## Development

```bash
# Install dependencies
bun install

# Run development server
bun tauri dev

# Build for production
bun tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
