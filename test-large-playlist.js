#!/usr/bin/env node

/**
 * Test script to verify large playlist handling
 * This script simulates the pagination logic to ensure it works correctly
 */

// Mock the Jellyfin API response structure
function createMockResponse(startIndex, limit, totalItems) {
  const items = [];
  const endIndex = Math.min(startIndex + limit, totalItems);
  
  for (let i = startIndex; i < endIndex; i++) {
    items.push({
      Id: `item-${i}`,
      Name: `Song ${i + 1}`,
      AlbumArtist: `Artist ${Math.floor(i / 10) + 1}`,
      Album: `Album ${Math.floor(i / 20) + 1}`,
      RunTimeTicks: 2400000000, // 4 minutes in ticks
    });
  }
  
  return {
    data: {
      Items: items,
      TotalRecordCount: totalItems,
    }
  };
}

// Simulate the pagination logic from our getPlaylistItemsPaginated method
async function testPagination(totalItems) {
  console.log(`\n🧪 Testing pagination with ${totalItems} items`);
  
  const limit = 200;
  let startIndex = 0;
  let allItems = [];
  let hasMoreItems = true;
  let requestCount = 0;

  while (hasMoreItems) {
    requestCount++;
    console.log(`📄 Request ${requestCount}: Fetching items ${startIndex} to ${startIndex + limit - 1}`);
    
    // Simulate API call
    const response = createMockResponse(startIndex, limit, totalItems);
    const items = response.data.Items;
    
    console.log(`✅ Fetched ${items.length} items in this batch`);
    allItems = allItems.concat(items);

    // Check if we have more items to fetch
    const totalRecordCount = response.data.TotalRecordCount;
    hasMoreItems = startIndex + limit < totalRecordCount;
    startIndex += limit;

    console.log(`📊 Progress: ${allItems.length}/${totalRecordCount} items loaded`);
    
    // Simulate small delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log(`🎵 Successfully loaded ${allItems.length} total items in ${requestCount} requests`);
  
  // Verify we got all items
  if (allItems.length === totalItems) {
    console.log(`✅ SUCCESS: All ${totalItems} items loaded correctly`);
  } else {
    console.log(`❌ ERROR: Expected ${totalItems} items, got ${allItems.length}`);
  }
  
  return allItems;
}

// Test different playlist sizes
async function runTests() {
  console.log("🚀 Testing large playlist pagination logic\n");
  
  // Test cases
  const testCases = [
    50,   // Small playlist (single request)
    150,  // Medium playlist (single request, but close to limit)
    250,  // Large playlist (2 requests)
    500,  // Very large playlist (3 requests)
    1000, // Huge playlist (5 requests)
  ];
  
  for (const size of testCases) {
    await testPagination(size);
  }
  
  console.log("\n🎉 All tests completed!");
}

// Run the tests
runTests().catch(console.error);
