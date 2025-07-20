#!/usr/bin/env node

const WORKER_URL = process.env.WORKER_URL || 'https://r2-worker.jaradd.workers.dev';

async function deleteAllBlogFiles() {
  console.log('Deleting all files with Blog/ prefix...');
  
  // Get all files with Blog/ prefix
  const response = await fetch(`${WORKER_URL}/api/list?prefix=Blog/`);
  if (!response.ok) {
    console.error('Failed to list files:', response.status);
    return;
  }
  
  const data = await response.json();
  console.log(`Found ${data.files.length} files to delete`);
  
  // Delete each file
  for (const file of data.files) {
    try {
      const encodedPath = encodeURIComponent(file.key);
      const deleteResponse = await fetch(`${WORKER_URL}/files/${encodedPath}`, {
        method: 'DELETE'
      });
      
      if (deleteResponse.ok) {
        console.log(`✓ Deleted: ${file.key}`);
      } else {
        console.error(`✗ Failed to delete ${file.key}: ${deleteResponse.status}`);
      }
    } catch (error) {
      console.error(`✗ Error deleting ${file.key}:`, error.message);
    }
  }
  
  console.log('Done!');
}

deleteAllBlogFiles().catch(console.error);