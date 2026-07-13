/**
 * useAuth — consumer hook for AuthContext.
 *
 * Re-exported for convenience from context/AuthContext.tsx.
 * This thin re-export avoids circular imports in screens that
 * import from hooks/ rather than context/.
 */

export { useAuth } from '../context/AuthContext';
export type { AuthContextValue } from '../context/AuthContext';
