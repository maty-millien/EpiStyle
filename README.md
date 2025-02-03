# Epitech Coding Style Checker VS Code Extension

A Visual Studio Code extension that enforces and validates Epitech coding style guidelines for your C projects.

## Features

- **Real-time Analysis:** Automatically runs a Docker-based style check when you save or open a file.
- **In-Editor Diagnostics:** Displays coding style issues directly in the Problems panel.
- **Detailed Error Descriptions:** Provides explanations for each coding style violation.
- **Customizable:** Configure which files to analyze and exclude.

## Requirements

- [Docker](https://www.docker.com/) installed and running.
- Visual Studio Code version 1.50.0 or later.

## Installation

1. Ensure Docker is installed on your machine.
2. Install this extension from the VS Code Marketplace or using the Extensions panel.
3. Reload VS Code and open your project.

## Usage

Once installed, the extension automatically checks your code on file save and file open. Detected issues appear in the Problems panel with detailed descriptions.

## Extension Settings

This extension contributes the following settings (adjustable in your `settings.json`):

* `epitechCodingStyle.enable`: Enable or disable the extension.
* `epitechCodingStyle.exclusions`: Array of file patterns to exclude from style checks.

## Known Issues

- Performance may be affected on very large projects.
- Some non-standard project structures may require additional configuration.

## Contributing

Contributions are welcome! Please review the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

## License

Distributed under the MIT License. See the [LICENSE](LICENSE) file for details.

## More Information

- [Visual Studio Code API](https://code.visualstudio.com/api)
- [Docker Documentation](https://docs.docker.com/)

**Enjoy coding in style!**
