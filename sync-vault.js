#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Configuration
const VAULT_PATH = process.env.VAULT_PATH || '/home/delorenj/code/DeLoDocs';
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787'; // Change to your deployed URL
// Authentication token for secure endpoints (if needed in future)
// const SYNC_TOKEN = process.env.SYNC_TOKEN;
const BATCH_SIZE = 50; // Upload files in batches
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max file size

// File extensions to sync
const ALLOWED_EXTENSIONS = [
  '.md', '.txt', '.json', '.yml', '.yaml', 
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.pdf', '.csv', '.excalidraw'
];

// Folders to ignore
const IGNORE_FOLDERS = ['.obsidian', '.trash', 'node_modules', '.git'];

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      if (!IGNORE_FOLDERS.includes(item.name)) {
        files.push(...await getAllFiles(fullPath, baseDir));
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        const stats = await fs.stat(fullPath);
        if (stats.size <= MAX_FILE_SIZE) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push({
            fullPath,
            relativePath: relativePath.replace(/\\/g, '/'), // Normalize path separators
          });
        } else {
          console.warn(`Skipping large file (${(stats.size / 1024 / 1024).toFixed(2)}MB): ${fullPath}`);
        }
      }
    }
  }
  
  return files;
}

async function getFileHash(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

async function getRemoteFiles() {
  try {
    const fileMap = new Map();
    let cursor = null;
    let hasMore = true;
    
    while (hasMore) {
      const url = new URL(`${WORKER_URL}/api/list`);
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Failed to fetch remote files: ${response.status}`);
      }
      
      const data = await response.json();
      
      for (const file of data.files) {
        // Store the full file object for comparison
        fileMap.set(file.key, {
          size: file.size,
          uploaded: file.uploaded,
          modified: file.customMetadata?.modified
        });
      }
      
      hasMore = data.truncated;
      cursor = data.cursor;
      
      if (hasMore) {
        console.log(`Fetched ${fileMap.size} files so far...`);
      }
    }
    
    return fileMap;
  } catch (error) {
    console.error('Error fetching remote files:', error);
    return new Map();
  }
}

async function uploadFiles(files) {
  const filesToUpload = [];
  
  for (const file of files) {
    try {
      const stats = await fs.stat(file.fullPath);
      const content = await fs.readFile(file.fullPath);
      const base64Content = content.toString('base64');
      const hash = crypto.createHash('md5').update(content).digest('hex');
      
      filesToUpload.push({
        path: file.relativePath,
        content: base64Content,
        type: getContentType(file.relativePath),
        modified: stats.mtime.toISOString(),
        md5: hash
      });
    } catch (error) {
      console.error(`Error reading file ${file.fullPath}:`, error.message);
    }
  }
  
  // Upload in batches
  for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
    const batch = filesToUpload.slice(i, i + BATCH_SIZE);
    
    try {
      const response = await fetch(`${WORKER_URL}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batch)
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      const successful = result.results.filter(r => r.status === 'success').length;
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: Uploaded ${successful}/${batch.length} files`);
    } catch (error) {
      console.error(`Error uploading batch:`, error.message);
    }
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.excalidraw': 'application/json',
  };
  return types[ext] || 'application/octet-stream';
}

async function deleteRemoteFiles(filesToDelete) {
  for (const file of filesToDelete) {
    try {
      // Properly encode the file path for the URL, but only encode each path segment
      const encodedPath = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const response = await fetch(`${WORKER_URL}/files/${encodedPath}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        console.log(`Deleted remote file: ${file}`);
      } else {
        console.error(`Failed to delete ${file}: ${response.status} ${response.statusText}`);
        const body = await response.text();
        console.error(`Response: ${body}`);
      }
    } catch (error) {
      console.error(`Error deleting ${file}:`, error.message);
    }
  }
}

async function sync() {
  console.log(`Syncing vault from: ${VAULT_PATH}`);
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log('-----------------------------------');
  
  // Get all local files
  console.log('Scanning local files...');
  const localFiles = await getAllFiles(VAULT_PATH);
  console.log(`Found ${localFiles.length} local files`);
  
  // Get remote files
  console.log('Fetching remote files...');
  const remoteFiles = await getRemoteFiles();
  console.log(`Found ${remoteFiles.size} remote files`);
  
  // Determine files to upload
  const filesToUpload = [];
  const localFileSet = new Set();
  
  for (const file of localFiles) {
    localFileSet.add(file.relativePath);
    const remoteFile = remoteFiles.get(file.relativePath);
    
    if (!remoteFile) {
      // File doesn't exist remotely
      filesToUpload.push(file);
    } else {
      // Compare using file size and modification time as a heuristic
      const stats = await fs.stat(file.fullPath);
      const localSize = stats.size;
      const localModified = stats.mtime.getTime();
      const remoteSize = remoteFile.size;
      const remoteModified = new Date(remoteFile.modified || remoteFile.uploaded).getTime();
      
      // Upload if size differs or local file is newer
      if (localSize !== remoteSize || localModified > remoteModified) {
        filesToUpload.push(file);
      }
    }
  }
  
  // Determine files to delete (exist remotely but not locally)
  const filesToDelete = [];
  for (const [remotePath] of remoteFiles) {
    if (!localFileSet.has(remotePath)) {
      filesToDelete.push(remotePath);
    }
  }
  
  console.log(`Files to upload: ${filesToUpload.length}`);
  console.log(`Files to delete: ${filesToDelete.length}`);
  
  // Upload new/changed files
  if (filesToUpload.length > 0) {
    console.log('Uploading files...');
    await uploadFiles(filesToUpload);
  }
  
  // Delete orphaned remote files
  if (filesToDelete.length > 0) {
    console.log('Deleting orphaned remote files...');
    await deleteRemoteFiles(filesToDelete);
  }
  
  console.log('Sync complete!');
}

// Run sync
sync().catch(console.error);