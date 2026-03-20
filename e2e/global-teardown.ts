/**
 * Global teardown runs once after all tests complete.
 * Optional cleanup can be added here.
 */
async function globalTeardown() {
  console.log('\n🧹 E2E tests completed. Cleanup if needed.\n');

  // Optional: Clean up test data
  // For now, we leave test data for debugging purposes
  // You can add cleanup logic here if needed
}

export default globalTeardown;
