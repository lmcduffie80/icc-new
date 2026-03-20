#!/bin/bash

# Production Migration Runner
# This script helps you run the database migration on production safely
# NO EXTERNAL DEPENDENCIES REQUIRED - uses direct environment variables

set -e  # Exit on error

echo "================================"
echo "Production Migration Runner"
echo "================================"
echo ""
echo "This will run migration 054_add_product_soft_delete.sql on your production database."
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found!"
    echo ""
    echo "Please create .env.production with your production DATABASE_URL:"
    echo ""
    echo "  echo 'DATABASE_URL=your_production_url_here' > .env.production"
    echo ""
    echo "Get your DATABASE_URL from:"
    echo "  Vercel Dashboard → Your Project → Settings → Environment Variables"
    echo ""
    echo "Alternative: Run migration directly with environment variable:"
    echo "  DATABASE_URL=\"your_url\" pnpm exec tsx scripts/migrate.ts"
    echo ""
    exit 1
fi

# Read DATABASE_URL from .env.production
if ! grep -q "DATABASE_URL" .env.production; then
    echo "❌ Error: DATABASE_URL not found in .env.production"
    echo ""
    echo "Please add DATABASE_URL to .env.production:"
    echo "  echo 'DATABASE_URL=your_production_url_here' > .env.production"
    echo ""
    exit 1
fi

# Extract DATABASE_URL from file
export $(grep "^DATABASE_URL=" .env.production | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL is empty in .env.production"
    exit 1
fi

echo "✅ Found .env.production"
echo "✅ DATABASE_URL loaded"
echo ""
echo "⚠️  WARNING: This will modify your PRODUCTION database!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled. No changes made."
    exit 0
fi

echo ""
echo "Running migration..."
echo ""

# Run the migration with environment variable
if DATABASE_URL="$DATABASE_URL" pnpm exec tsx scripts/migrate.ts; then
    echo ""
    echo "================================"
    echo "✅ Migration completed successfully!"
    echo "================================"
    echo ""
    echo "Next steps:"
    echo "1. Delete .env.production (contains production credentials):"
    echo "   rm .env.production"
    echo ""
    echo "2. Test your production site:"
    echo "   https://innovativeagrecords.com/admin/products"
    echo ""
    echo "3. Verify the product list loads without errors"
    echo ""
else
    echo ""
    echo "================================"
    echo "❌ Migration failed!"
    echo "================================"
    echo ""
    echo "Please check the error messages above."
    echo "If you need help, check the Vercel logs or database console."
    exit 1
fi
