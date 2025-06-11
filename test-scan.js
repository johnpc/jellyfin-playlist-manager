#!/usr/bin/env node

// Simple test script to verify the library scan task tracking
// Run with: node test-scan.js

const { jellyfinClient } = require('./src/lib/api/jellyfin');

async function testScanTracking() {
  try {
    console.log('🧪 Testing Jellyfin library scan task tracking...');
    
    // You'll need to set these environment variables or modify this
    const config = {
      serverUrl: process.env.JELLYFIN_SERVER_URL || 'http://localhost:8096',
      username: process.env.JELLYFIN_ADMIN_USER || 'admin',
      password: process.env.JELLYFIN_ADMIN_PASSWORD || 'password'
    };
    
    console.log(`🔗 Connecting to Jellyfin at ${config.serverUrl}...`);
    
    // Authenticate
    const auth = await jellyfinClient.authenticate(config);
    console.log(`✅ Authenticated as ${auth.user.name}`);
    
    // Get current tasks
    console.log('\n📋 Current active tasks:');
    const tasks = await jellyfinClient.getActiveTasks();
    tasks.forEach(task => {
      console.log(`  • ${task.Name} (${task.State}) - ${task.CurrentProgressPercentage || 0}%`);
    });
    
    // Trigger music library scan
    console.log('\n🎵 Triggering music library scan...');
    const musicLibraryId = await jellyfinClient.triggerMusicLibraryScan();
    
    if (musicLibraryId) {
      console.log(`✅ Music library scan triggered for library: ${musicLibraryId}`);
      
      // Wait for completion
      console.log('\n⏳ Waiting for scan to complete...');
      const completed = await jellyfinClient.waitForLibraryScanCompletion(60000, 2000);
      
      if (completed) {
        console.log('✅ Scan completed successfully!');
      } else {
        console.log('⏰ Scan did not complete within timeout');
      }
    } else {
      console.log('❌ Failed to trigger music library scan');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testScanTracking();
}

module.exports = { testScanTracking };
