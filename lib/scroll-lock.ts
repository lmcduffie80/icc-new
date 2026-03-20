// Centralized scroll lock manager to prevent race conditions
// when multiple overlays independently manage body scroll

let lockCount = 0;

export function lockScroll(): void {
  lockCount++;
  if (lockCount === 1) {
    document.body.style.overflow = 'hidden';
  }
}

export function unlockScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = 'unset';
  }
}

