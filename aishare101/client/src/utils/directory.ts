export interface FileWithRelativePath {
  file: File;
  relativePath: string;
}

/**
 * Recursively traverses a FileSystemEntry (file or directory) and returns flat list of files with relative paths.
 */
const traverseEntry = async (entry: FileSystemEntry, path: string = ''): Promise<FileWithRelativePath[]> => {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve, reject) => {
      fileEntry.file(
        (file) => {
          resolve([{ file, relativePath: path ? `${path}/${file.name}` : file.name }]);
        },
        (err) => reject(err)
      );
    });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();

    // DirectoryReader.readEntries might only return a batch, so we must read recursively until empty
    const readEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        const allEntries: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries(
            (entries) => {
              if (entries.length === 0) {
                resolve(allEntries);
              } else {
                allEntries.push(...entries);
                readBatch(); // Call recursively to read any remaining entries
              }
            },
            (err) => reject(err)
          );
        };
        readBatch();
      });
    };

    try {
      const entries = await readEntries();
      const currentPath = path ? `${path}/${dirEntry.name}` : dirEntry.name;
      const promises = entries.map((childEntry) => traverseEntry(childEntry, currentPath));
      const results = await Promise.all(promises);
      return results.flat();
    } catch (err) {
      console.error('Failed to read directory entries:', err);
      return [];
    }
  }
  return [];
};

/**
 * Extracts and traverses all files from dropped DataTransfer items.
 * Preserves nested directory structures for folders.
 */
export const getFilesFromDroppedItems = async (dataTransfer: DataTransfer): Promise<FileWithRelativePath[]> => {
  const items = Array.from(dataTransfer.items);
  const promises = items.map((item) => {
    if (item.kind === 'file') {
      // Use webkitGetAsEntry to obtain file/directory entry
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          return traverseEntry(entry);
        }
      }
      // Fallback to getAsFile
      const file = item.getAsFile();
      if (file) {
        return Promise.resolve([{ file, relativePath: file.name }]);
      }
    }
    return Promise.resolve([]);
  });

  const results = await Promise.all(promises);
  return results.flat();
};
