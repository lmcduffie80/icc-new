# Port 3000 Already in Use - Quick Fix

## 🚨 Problem

You're seeing this error when trying to start the dev server:

```
Error: listen EADDRINUSE: address already in use :::3000
```

This means another process is already using port 3000.

---

## ⚡ Quick Fix (Copy-Paste)

**One-liner solution:**

```bash
lsof -ti:3000 | xargs kill -9 && sleep 2 && pnpm dev
```

This will:
1. Kill any process using port 3000
2. Wait 2 seconds
3. Start the dev server

---

## 📋 Step-by-Step Fix

If you prefer to run commands separately:

### Step 1: Find what's using port 3000

```bash
lsof -ti:3000
```

This shows the Process ID (PID) using port 3000.

### Step 2: Kill the process

```bash
lsof -ti:3000 | xargs kill -9
```

The `-9` flag forces the process to stop immediately.

### Step 3: Wait a moment

```bash
sleep 2
```

Give the system 2 seconds to fully release the port.

### Step 4: Start dev server

```bash
pnpm dev
```

Your server should now start successfully on port 3000!

---

## 🔍 Alternative Solutions

### Solution 1: Check for other terminals

Before killing processes, check if you already have the dev server running:

1. Look through all your terminal windows/tabs
2. Search for one showing "Ready" or "Next.js" output
3. If found, you can either:
   - Use that terminal (server is already running!)
   - Stop it with `Ctrl+C`, then restart

### Solution 2: Use a different port

If you want to keep what's on port 3000:

```bash
# Start on port 3001 instead
pnpm dev -- --port 3001
```

Then access your app at: `http://localhost:3001`

### Solution 3: Find and manually kill the process

See what's using the port:

```bash
lsof -i:3000
```

This shows detailed info including:
- Process name
- PID (Process ID)
- Who started it

To kill a specific PID:

```bash
kill -9 <PID>
```

Replace `<PID>` with the actual process ID number.

---

## 🛡️ Prevention Tips

### Tip 1: Proper shutdown

Always stop your dev server properly:
- Press `Ctrl+C` in the terminal
- Wait for "Closing database pool..." message
- Don't force-quit the terminal

### Tip 2: Use terminal tabs

Instead of closing terminals, use tabs:
- Keep your dev server in one tab
- Use other tabs for commands
- Easier to find running servers

### Tip 3: Check before starting

Before running `pnpm dev`, check if it's already running:

```bash
lsof -ti:3000 && echo "Port 3000 is in use" || echo "Port 3000 is free"
```

---

## 🔧 Troubleshooting

### "lsof: command not found"

If `lsof` isn't available, install it:

```bash
# macOS (usually pre-installed)
xcode-select --install

# Or use this alternative
netstat -vanp tcp | grep 3000
```

### Permission denied

If you get permission errors:

```bash
# Use sudo (will ask for password)
sudo lsof -ti:3000 | xargs sudo kill -9
```

### Port still in use after killing

Wait longer and try again:

```bash
# Kill process
lsof -ti:3000 | xargs kill -9

# Wait 5 seconds
sleep 5

# Try starting again
pnpm dev
```

### Multiple processes on port 3000

Kill all of them:

```bash
# This will kill all processes using port 3000
lsof -ti:3000 | xargs kill -9

# Or one by one
lsof -i:3000
# Note the PIDs, then:
kill -9 <PID1> <PID2> <PID3>
```

---

## 📊 Understanding the Error

### What does EADDRINUSE mean?

- **EADDRINUSE** = Error: Address Already In Use
- Port 3000 is like a door - only one process can use it at a time
- When you try to start a second server on port 3000, you get this error

### Common causes

1. **Dev server already running** - Most common!
   - Forgot you started it
   - Running in another terminal
   - Left it running from yesterday

2. **Crashed dev server** - Zombie process
   - Server crashed but didn't clean up
   - Terminal was force-closed
   - Computer was restarted while running

3. **Other application** - Something else using port 3000
   - Another Next.js project
   - React dev server
   - Different web framework
   - Docker container

### Why kill -9?

- `-9` is the SIGKILL signal
- Forces immediate termination
- No cleanup, no graceful shutdown
- Use when `Ctrl+C` doesn't work

---

## ✅ Verify It's Fixed

After running the fix:

1. **Check terminal output:**
   ```
   ▲ Next.js 16.0.10
   - Local:        http://localhost:3000
   ✓ Ready in 2s
   ```

2. **Visit the site:**
   - Open browser
   - Go to `http://localhost:3000`
   - Should see your app

3. **Test an API endpoint:**
   - Visit `http://localhost:3000/api/products`
   - Should return JSON (not 404)

4. **Check for errors:**
   - Look at terminal for any red error messages
   - Check browser console (F12)

---

## 🎯 Quick Reference Commands

```bash
# Check if port 3000 is in use
lsof -ti:3000

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Start dev server
pnpm dev

# Start on different port
pnpm dev -- --port 3001

# See detailed info about port 3000
lsof -i:3000

# One-liner fix
lsof -ti:3000 | xargs kill -9 && sleep 2 && pnpm dev
```

---

## 📚 Related Documentation

- [START_DEV_SERVER.md](START_DEV_SERVER.md) - How to start the dev server
- [FIX_PRODUCT_IMAGES.md](FIX_PRODUCT_IMAGES.md) - Fix missing product images
- [PRODUCT_IMAGES_DIAGNOSIS_COMPLETE.md](PRODUCT_IMAGES_DIAGNOSIS_COMPLETE.md) - Image setup guide

---

## 🆘 Still Having Issues?

If the port conflict persists:

1. **Reboot your computer**
   - Sometimes the nuclear option is fastest
   - Kills all processes cleanly
   - Fresh start

2. **Check Docker containers**
   ```bash
   docker ps
   ```
   Stop any containers using port 3000

3. **Check system services**
   ```bash
   sudo lsof -i:3000
   ```
   Might reveal system-level processes

4. **Use a different port permanently**
   - Update `package.json`:
   ```json
   "scripts": {
     "dev": "next dev --port 3001"
   }
   ```

---

**Ready to fix it?** Run the one-liner command at the top! ⚡
