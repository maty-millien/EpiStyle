# EpiStyle

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/maty-millien.epitech-vs-coding-style?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/maty-millien.epitech-vs-coding-style?label=Installs&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/maty-millien.epitech-vs-coding-style?label=Rating&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Requires-Docker-2496ED?logo=docker)](https://www.docker.com/)

A Visual Studio Code extension that enforces and validates **Epitech coding style guidelines** for C projects. Integrates seamlessly with the editor to provide instant feedback and keep your code compliant.

## Features

- **Real-time Analysis** — Runs Docker-based style checks automatically on file save or open
- **In-Editor Diagnostics** — View coding style issues in the Problems panel and inline
- **Detailed Explanations** — Each violation includes a description for quick resolution
- **Customizable** — Control which files to analyze or exclude
- **Gitignore Aware** — Respects ignored files and directories

> **Tip:** For the best experience, install [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) to highlight errors directly in the editor.

## Requirements

- [Docker](https://www.docker.com/) installed and running

## Installation

1. Install Docker on your system
2. Install **EpiStyle** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style) or search `EpiStyle` in the Extensions panel
3. Reload VS Code and open your C project

## Usage

1. Open a C project in VS Code
2. On file save or open, EpiStyle automatically checks your code style
3. View errors and warnings in:
   - **Problems panel**
   - Inline diagnostics (enhanced with Error Lens)

## Known Issues

- Performance may degrade on very large projects
- Non-standard project structures might need extra configuration

## Contributing

Contributions are welcome. Please open issues or submit pull requests on [GitHub](https://github.com/maty-millien/EpiStyle).

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
