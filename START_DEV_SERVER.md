# Dev Server Not Running - Quick Fix

## 🚨 Issue

The Next.js development server is not running, causing:
- ❌ 404 errors for all API endpoints (`/api/products`, `/api/categories`, etc.)
- ❌ Products not loading
- ❌ Images not loading
- ❌ App not functional

## ✅ Solution

Start the development server:

```bash
pnpm dev
```

This will:
- Start Next.js on `http://localhost:3000`
- Enable all API routes
- Hot reload on file changes
- Show server logs in terminal

## 📋 Expected Output

When the server starts successfully, you should see:

```
▲ Next.js 16.0.10
- Local:        http://localhost:3000
- Environments: .env.local

✓ Ready in 2s
```

## 🔍 Verify It's Working

Once the server is running:

1. **Check the terminal** - Should show "Ready" and no errors
2. **Visit** `http://localhost:3000` - Homepage should load
3. **Check** `/api/products` - Should return JSON (not 404)
4. **Browse** products at `/shop` - Products should display

## ⚠️ Before Starting

Make sure AWS credentials are in `.env.local` (for product images):

```bash
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

If these aren't set, images won't load (but products will still show).

## 🛠️ Troubleshooting

### ⚠️ Port 3000 Already in Use (COMMON ISSUE)

**Error message:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Quick fix:**
```bash
# One-liner solution
lsof -ti:3000 | xargs kill -9 && sleep 2 && pnpm dev
```

**Step-by-step:**
```bash
# 1. Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# 2. Wait 2 seconds
sleep 2

# 3. Start dev server
pnpm dev
```

**Need more help?** See [PORT_CONFLICT_FIX.md](PORT_CONFLICT_FIX.md) for:
- Alternative solutions
- Detailed troubleshooting
- Prevention tips
- Different port options

### Database Connection Errors

If you see "DATABASE_URL not set":

1. Check `.env.local` has `DATABASE_URL`
2. Verify database is accessible
3. Try running: `pnpm diagnose:images` to check all env vars

### Build Errors

If the server fails to start with TypeScript errors:

```bash
# Check for errors
pnpm lint
npx tsc --noEmit

# Fix any errors, then try again
pnpm dev
```

## 📝 Development Workflow

**Normal workflow:**

1. Open terminal in project root
2. Run `pnpm dev`
3. Leave terminal open (shows logs)
4. Make code changes
5. Server auto-reloads
6. Check browser for updates

**When done:**
- Press `Ctrl+C` to stop server
- Close terminal

## 🎯 Quick Commands

```bash
# Start dev server
pnpm dev

# Stop server
Ctrl+C

# Restart server (if needed)
Ctrl+C
pnpm dev

# Check all environment variables
pnpm diagnose:images

# Run tests (in separate terminal)
pnpm test

# Check for errors
pnpm lint
```

---

**Next Step:** Run `pnpm dev` in your terminal now! 🚀
