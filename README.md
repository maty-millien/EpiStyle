<div align="center">

<img src="https://raw.githubusercontent.com/maty-millien/EpiStyle/main/assets/icon.png" alt="EpiStyle" width="128" height="128" />

# EpiStyle

**Real-time Epitech coding style checker for Visual Studio Code**

Catch style violations as you type and ship code that passes the Epitech norm — every time.

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/maty-millien.epitech-vs-coding-style.svg?style=flat-square&label=Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![Visual Studio Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/maty-millien.epitech-vs-coding-style.svg?style=flat-square&label=Installs&color=4c1)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![Visual Studio Marketplace Rating](https://vsmarketplacebadges.dev/rating-short/maty-millien.epitech-vs-coding-style.svg?style=flat-square&label=Rating&color=ffb400)](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/Requires-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## Overview

**EpiStyle** integrates the official Epitech coding style checker directly into Visual Studio Code. It runs automatically in the background and surfaces violations inline, in the Problems panel, and with detailed explanations — so you can fix issues before they ever reach a moulinette.

## Preview

<div align="center">

<img src="https://raw.githubusercontent.com/maty-millien/EpiStyle/main/assets/demo.png" alt="EpiStyle inline diagnostics showing rule codes and descriptions" width="720" />

<sub>Inline diagnostics with rule codes and plain-language descriptions, shown alongside <a href="https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens">Error Lens</a>.</sub>

</div>

## Features

- **Real-time analysis** — Style checks run automatically on file save
- **Fast** — A persistent background container keeps per-save latency in milliseconds
- **Inline diagnostics** — Warnings appear in the Problems panel and inline
- **Detailed explanations** — Every violation comes with a clear description
- **Customizable** — Toggle the checker on or off from settings or the status bar
- **Gitignore-aware** — Respects ignored files and directories
- **Zero configuration** — Install, open a C project, and start coding

> **Tip:** Pair EpiStyle with [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) for inline highlighting of warnings.

## Requirements

| Dependency                                                   | Purpose                                       |
| ------------------------------------------------------------ | --------------------------------------------- |
| [Docker](https://www.docker.com/)                            | Runs the official Epitech style checker image |
| [Visual Studio Code](https://code.visualstudio.com/) `1.74+` | Editor integration                            |

Any Docker-compatible runtime works — [Docker Desktop](https://www.docker.com/products/docker-desktop/), [OrbStack](https://orbstack.dev/), [Colima](https://github.com/abiosoft/colima), [Rancher Desktop](https://rancherdesktop.io/), or a native `dockerd` on Linux. Make sure it is running before launching VS Code.

## Installation

1. Install **Docker** and make sure the daemon is running
2. Open VS Code, head to the **Extensions** panel, and search for `EpiStyle` — or grab it directly from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style)
3. Reload VS Code and open any C project — EpiStyle starts watching automatically

## Usage

Save any `.c`, `.h`, or `Makefile` and EpiStyle takes over:

- Style violations appear in the **Problems** panel
- Inline diagnostics highlight the offending lines
- Each entry includes the rule reference and a short explanation

No commands to run, no flags to remember.

## Configuration

| Setting                               | Default      | Description                                                                        |
| ------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| `epitech-coding-style.enable`         | `true`       | Enable or disable real-time style checks                                           |
| `epitech-coding-style.persistLogFile` | `false`      | Keep `.vscode/coding-style-reports.log` after each analysis run                    |
| `epitech-coding-style.excludePaths`   | `["tests/"]` | Gitignore-style patterns to exclude from analysis (applied on top of `.gitignore`) |

Open VS Code settings (`Cmd`/`Ctrl + ,`) and search for **EpiStyle** to adjust.

## Commands

Open the command palette (`Cmd`/`Ctrl + Shift + P`) and type **EpiStyle** to access:

| Command                                | Description                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `EpiStyle: Restart Checker Containers` | Stops the background checker container, re-pulls the latest official image, and starts fresh. Use it after upstream updates. |

## Known Issues

- Performance may degrade on very large projects
- Non-standard project structures may require additional configuration

## Contributing

Contributions are welcome. Open an issue or submit a pull request on the [GitHub repository](https://github.com/maty-millien/EpiStyle).

## Disclaimer

EpiStyle is an independent, community-maintained open-source project and is **not affiliated with, endorsed by, or sponsored by Epitech**. "Epitech" is a trademark of its respective owner. This extension is a thin wrapper around the publicly available [`Epitech/coding-style-checker`](https://github.com/Epitech/coding-style-checker) Docker image, which is pulled directly from Epitech's official registry on the user's machine — EpiStyle neither bundles nor redistributes it.

## License

Distributed under the [MIT License](LICENSE) — © [Maty MILLIEN](https://github.com/maty-millien)
