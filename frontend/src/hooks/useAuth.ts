import { useAuth as useAuthContext } from '../context/AuthContext'

/**
 * useAuth hook provides access to the current authenticated user session,
 * user profile, token retrieval, login/logout actions, and role verification.
 */
export const useAuth = () => {
  return useAuthContext()
}

export default useAuth

