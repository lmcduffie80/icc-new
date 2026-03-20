import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Global setup runs once before all tests.
 * Seeds the test database with predictable data.
 */
async function globalSetup() {
  // Ensure .auth directory exists for session storage
  const authDir = join(__dirname, '.auth');
  if (!existsSync(authDir)) {
    console.log('📁 Creating .auth directory...\n');
    mkdirSync(authDir, { recursive: true });
  }

  console.log('🌱 Seeding test database...\n');

  try {
    // Run the database seeding script
    execSync('pnpm db:seed:test', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('\n✅ Test database seeded successfully\n');
  } catch (error) {
    console.error('\n❌ Failed to seed test database:', error);
    throw error;
  }
}

export default globalSetup;
