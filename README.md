# 🎨 EpiStyle

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/editor-VS%20Code-blue?logo=visualstudiocode)](#)
[![Docker](https://img.shields.io/badge/dependency-Docker-2496ED?logo=docker)](#)

A Visual Studio Code extension that enforces and validates **Epitech coding style guidelines** for your C projects. It integrates seamlessly with the editor to provide instant feedback and keep your code compliant.

## ✨ Features

* ⚡ **Real-time Analysis:** Runs a Docker-based style check automatically when you save or open a file.
* 🐞 **In-Editor Diagnostics:** See coding style issues directly in the **Problems panel** and inline in the editor.
* 📖 **Detailed Explanations:** Each violation includes a description for quick fixes.
* ⚙️ **Customizable:** Control which files to analyze or exclude.
* 📂 **.gitignore Aware:** Respects ignored files and directories.

## ⚠️ Requirements

* [Docker](https://www.docker.com/) installed and running.

## ⬇️ Installation

1. Install Docker on your system.
2. Install **EpiStyle** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=maty-millien.epitech-vs-coding-style) or search `EpiStyle` in the Extensions panel.
3. Reload VS Code and open your C project.

## 🚀 Usage

1. Open a C project in VS Code.
2. On file save or open, EpiStyle will automatically check your code style.
3. View errors and warnings in:

   * **Problems panel**
   * Inline diagnostics inside the editor

## 🐛 Known Issues

* Performance may degrade on very large projects.
* Non-standard project structures might need extra configuration.

## 🤝 Contributing

Contributions are welcome. Please open issues or submit pull requests.

## 📜 License

Distributed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
