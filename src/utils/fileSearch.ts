import * as fs from "fs";
import * as path from "path";

export async function hasCFile(directory: string): Promise<boolean> {
  const cFileExtensions = [".c", ".h", ".cpp", ".hpp"];

  async function searchDirectory(currentPath: string): Promise<boolean> {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isFile() && cFileExtensions.includes(path.extname(entry.name))) {
        return true;
      }

      if (entry.isDirectory()) {
        const found = await searchDirectory(fullPath);
        if (found) return true;
      }
    }
    return false;
  }
  return searchDirectory(directory);
}
