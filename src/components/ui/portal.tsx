import { createPortal } from 'react-dom';

/** Portal helper that guards against SSR/early-mount edge cases. */
export function createRootPortal(node: React.ReactNode) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
