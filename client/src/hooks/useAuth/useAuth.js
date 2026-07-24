// Auth state moved into a shared context (client-side routing needs a single
// owner). Re-exported here so existing imports and test mocks keep working.
export { useAuth } from '../../context/AuthContext.jsx'
