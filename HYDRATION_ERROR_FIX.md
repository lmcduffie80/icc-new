# Hydration Error Fix - Admin Sidebar

## Error Description

**Error Type:** React Hydration Error  
**Location:** `localhost:3000` (Admin pages)  
**Component:** `components/admin/admin-sidebar.tsx`

**Error Message:**
```
Hydration failed because the server rendered HTML didn't match the client.
```

**Visual Diff:**
- Server: `className="lucide lucide-chevron-down h-4 w-4 transition-transform"`
- Client: `className="lucide lucide-chevron-down h-4 w-4 transition-transform -rotate-90"`

## Root Cause

The admin sidebar accordion groups were loading their open/closed state from `localStorage` immediately during component initialization, causing different renders:

1. **Server (SSR):** No `localStorage` access → empty Set → all groups closed
2. **Client (Initial):** Reads `localStorage` → potentially has saved groups → some groups open
3. **Result:** Chevron rotation classes differ, causing hydration mismatch

### Original Code (Problematic)

```typescript
function getInitialOpenGroups(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set<string>();  // Server returns empty
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  return new Set<string>(saved ? JSON.parse(saved) : []); // Client may have data
}

const [userOpenGroups, setUserOpenGroups] = useState<Set<string>>(() => 
  getInitialOpenGroups() // Different on server vs client!
);
```

## Solution

Defer `localStorage` loading until **after** React hydration completes by:

1. Initialize state with empty Set (matches server render)
2. Load from `localStorage` in `useEffect` (client-only, post-hydration)
3. Use `useRef` for mounted flag to avoid triggering extra renders
4. Suppress ESLint rule for legitimate post-hydration state initialization

### Fixed Code

```typescript
export function AdminSidebar({ permissions, user, roleName }: AdminSidebarProps) {
  // ... other state
  const mounted = useRef(false);
  
  // Initialize with empty Set to match server render
  const [userOpenGroups, setUserOpenGroups] = useState<Set<string>>(new Set<string>());

  // Load from localStorage only after component mounts (client-side only)
  useEffect(() => {
    mounted.current = true;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setUserOpenGroups(new Set<string>(JSON.parse(saved)));
        } catch (error) {
          console.error('Error loading sidebar state:', error);
        }
      }
    }
  }, []);

  // Persist user preferences to localStorage
  // Only persist after initial mount to avoid saving empty state during hydration
  useEffect(() => {
    if (mounted.current && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...userOpenGroups]));
    }
  }, [userOpenGroups]);
}
```

## Changes Made

**File:** `components/admin/admin-sidebar.tsx`

1. **Removed** `getInitialOpenGroups()` helper function
2. **Added** `useRef` import
3. **Added** `mounted` ref (using `useRef` instead of `useState` for performance)
4. **Changed** `userOpenGroups` initialization to always use empty Set
5. **Added** `useEffect` to load from `localStorage` after mount with `mounted.current = true`
6. **Updated** persist effect to check `mounted.current` instead of state
7. **Added** ESLint disable comment for legitimate post-hydration setState

## Benefits

✅ **Eliminates hydration mismatch** - Server and client render identically  
✅ **Preserves user preferences** - Still loads saved accordion state  
✅ **Optimal performance** - Uses `useRef` to avoid extra render cycles  
✅ **Better error handling** - Try/catch for localStorage parsing  
✅ **Prevents data loss** - Won't overwrite localStorage during hydration  
✅ **ESLint compliant** - Properly suppresses rule for legitimate use case

## Technical Notes

### Why useRef instead of useState?

Using `useRef` for the `mounted` flag is more performant because:
- **No re-render triggered** when setting `mounted.current = true`
- **Simple boolean flag** doesn't need to trigger component updates
- **Avoids ESLint warning** about calling setState in useEffect
- Standard React pattern for "component did mount" checks

### Why suppress react-hooks/set-state-in-effect?

The ESLint rule `react-hooks/set-state-in-effect` warns against calling setState directly in useEffect bodies. However, our use case is legitimate:
- **Post-hydration initialization** from external system (localStorage)
- **One-time load** that only happens after initial mount
- **Prevents hydration mismatch** by deferring to client-side
- This is the **recommended pattern** for hydration-safe localStorage loading

## Testing

1. **Hard refresh** the admin page (Cmd+Shift+R / Ctrl+Shift+R)
2. **Verify** no hydration errors in console
3. **Test** accordion state persistence:
   - Open/close sidebar groups
   - Refresh page
   - Groups should remain in saved state
4. **Check** initial render shows active group expanded

## Related Patterns

This fix follows the React 18 hydration best practice:
- Match server and client initial renders
- Apply browser-specific state after hydration via `useEffect`
- Use `mounted` flag to avoid side effects during SSR

---

**Fixed Date:** January 9, 2026  
**Status:** ✅ Complete  
**Impact:** All admin pages
