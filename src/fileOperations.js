// src/fileOperations.js
// File management operations (HU 3): delete, move to trash, open location

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let trashModule = null;
try {
  const trashExport = require('trash');
  trashModule = trashExport.default || trashExport;
} catch (e) {
  trashModule = null;
}

class FileOperations {
  // Move file to recycle bin / trash
  async moveToTrash(filePath) {
    try {
      if (trashModule) {
        await trashModule(filePath);
        return { success: true, message: 'Movido a la papelera' };
      }
      // Fallback: use shell command on Windows
      if (process.platform === 'win32') {
        return new Promise((resolve) => {
          const fs_stat = require('fs').statSync(filePath);
          const isDir = fs_stat.isDirectory();
          const escapedPath = filePath.replace(/'/g, "''");
          let cmd;
          if (isDir) {
            cmd = `powershell -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escapedPath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;
          } else {
            cmd = `powershell -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escapedPath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;
          }
          exec(cmd, (err) => {
            if (err) resolve({ success: false, message: err.message });
            else resolve({ success: true, message: 'Movido a la papelera' });
          });
        });
      }
      return { success: false, message: 'Módulo de papelera no disponible' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Permanently delete a file
  async deleteFile(filePath) {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        await fs.promises.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(filePath);
      }
      return { success: true, message: 'Deleted permanently' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Open file location in system explorer
  async openLocation(filePath) {
    try {
      const dir = path.dirname(filePath);
      if (process.platform === 'win32') {
        exec(`explorer /select,"${filePath}"`);
      } else if (process.platform === 'darwin') {
        exec(`open -R "${filePath}"`);
      } else {
        exec(`xdg-open "${dir}"`);
      }
      return { success: true, message: 'Opened location' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Open file with default application
  async openFile(filePath) {
    try {
      if (process.platform === 'win32') {
        exec(`start "" "${filePath}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${filePath}"`);
      } else {
        exec(`xdg-open "${filePath}"`);
      }
      return { success: true, message: 'Opened file' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Get file info
  async getFileInfo(filePath) {
    try {
      const stat = await fs.promises.stat(filePath);
      return {
        success: true,
        info: {
          name: path.basename(filePath),
          path: filePath,
          size: stat.size,
          isDirectory: stat.isDirectory(),
          modified: stat.mtimeMs,
          created: stat.birthtimeMs,
          locked: false
        }
      };
    } catch (err) {
      // Carpeta/archivo sin acceso
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        return {
          success: true,
          info: {
            name: path.basename(filePath),
            path: filePath,
            size: 0,
            isDirectory: true,
            modified: 0,
            created: 0,
            locked: true
          }
        };
      }
      return { success: false, message: err.message };
    }
  }
}

module.exports = { FileOperations };