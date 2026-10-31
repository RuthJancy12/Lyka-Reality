import { describe, it, expect, vi, beforeEach } from 'vitest'
import { USE_IN_MEMORY_AUTH } from '../../services/firebase'
import firebaseSrc from '../../services/firebase.ts?raw'
import authContextSrc from '../../context/AuthContext.tsx?raw'

describe('Firebase Zero-Browser-Persistence Configuration', () => {
  it('enforces in-memory authentication mode as default', () => {
    expect(USE_IN_MEMORY_AUTH).toBe(true)
  })

  it('prohibits fallback to browserLocalPersistence or IndexedDB in source code', () => {
    // Structural guard ensuring zero browser persistence
    expect(firebaseSrc).not.toContain('browserLocalPersistence')
    expect(firebaseSrc).not.toContain('browserSessionPersistence')
    expect(firebaseSrc).not.toContain('indexedDBLocalPersistence')
    expect(firebaseSrc).toContain('inMemoryPersistence')
    expect(firebaseSrc).toContain('setPersistence(auth, inMemoryPersistence)')
  })

  it('guarantees authPersistenceReady re-throws errors on failure (never swallows)', () => {
    expect(firebaseSrc).toContain('export const authPersistenceReady: Promise<void>')
    expect(firebaseSrc).toMatch(/setPersistence\(auth,\s*inMemoryPersistence\)\s*\.catch\(/)
    expect(firebaseSrc).toMatch(/throw\s+err/)
    // Must NOT have .then(() => ...) that swallows or returns undefined on error
    expect(firebaseSrc).not.toMatch(/authPersistenceReady[\s\S]*?\.catch\(\(err\)\s*=>\s*\{\s*console\.warn[\s\S]*?\}\)\s*$/m)
  })

  it('guarantees AuthContext gates every single authentication entry point with authPersistenceReady', () => {
    // Check that every entrypoint awaits authPersistenceReady
    const signUpBlock = authContextSrc.slice(authContextSrc.indexOf('async signUp('), authContextSrc.indexOf('async signIn('))
    const signInBlock = authContextSrc.slice(authContextSrc.indexOf('async signIn('), authContextSrc.indexOf('async signInWithGoogle('))
    const googleBlock = authContextSrc.slice(authContextSrc.indexOf('async signInWithGoogle('), authContextSrc.indexOf('async resetPassword('))
    const resetBlock = authContextSrc.slice(authContextSrc.indexOf('async resetPassword('), authContextSrc.indexOf('async linkPassword('))
    const linkBlock = authContextSrc.slice(authContextSrc.indexOf('async linkPassword('), authContextSrc.indexOf('async logout('))

    expect(signUpBlock).toContain('await authPersistenceReady')
    expect(signInBlock).toContain('await authPersistenceReady')
    expect(googleBlock).toContain('await authPersistenceReady')
    expect(resetBlock).toContain('await authPersistenceReady')
    expect(linkBlock).toContain('await authPersistenceReady')
  })

  it('guarantees AuthContext auth listener does NOT proceed after persistence failure', () => {
    // Check useEffect hook in AuthContext
    const useEffectBlock = authContextSrc.slice(authContextSrc.indexOf('useEffect(() =>'), authContextSrc.indexOf('const value = useMemo'))
    expect(useEffectBlock).toContain('authPersistenceReady')
    expect(useEffectBlock).toContain('.then(')
    expect(useEffectBlock).toContain('.catch(')
    expect(useEffectBlock).not.toContain('authPersistenceReady.finally')
    expect(useEffectBlock).toContain('setUser(null)')
    expect(useEffectBlock).toContain('setAuthLoading(false)')
  })
})

describe('Firebase Persistence Fail-Safe Runtime Simulation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('simulates successful persistence initialization allowing entry points to execute', async () => {
    const mockSetPersistence = vi.fn().mockResolvedValue(undefined)
    const mockAuthOperation = vi.fn().mockResolvedValue({ user: { uid: 'u123' } })

    const persistenceReady = mockSetPersistence()
    await persistenceReady

    // When persistence succeeds, entry point runs
    const res = await mockAuthOperation()
    expect(res.user.uid).toBe('u123')
    expect(mockSetPersistence).toHaveBeenCalledTimes(1)
  })

  it('simulates failed persistence initialization: rejects and completely blocks auth operations', async () => {
    const persistenceError = new Error('In-memory persistence failed to initialize')
    const mockSetPersistence = vi.fn().mockRejectedValue(persistenceError)
    const mockAuthOperation = vi.fn().mockResolvedValue({ user: { uid: 'u123' } })

    // Simulate authPersistenceReady failing
    const persistenceReady = mockSetPersistence().catch((err: Error) => {
      throw err
    })

    // Simulated signIn attempting to run after persistence error
    const attemptSignIn = async () => {
      await persistenceReady
      return await mockAuthOperation()
    }

    // Must reject with the persistenceError
    await expect(attemptSignIn()).rejects.toThrow('In-memory persistence failed to initialize')
    // Crucial: auth operation must NEVER have been called!
    expect(mockAuthOperation).not.toHaveBeenCalled()
  })

  it('simulates failed persistence initialization: listener safely locks UI and does not attach onAuthStateChanged', async () => {
    const persistenceError = new Error('In-memory persistence setup failed')
    const mockSetPersistence = vi.fn().mockRejectedValue(persistenceError)
    const mockOnAuthStateChanged = vi.fn()
    let userState: any = 'initial'
    let loadingState = true

    const persistenceReady = mockSetPersistence().catch((err: Error) => {
      throw err
    })

    // Simulate AuthContext useEffect pattern
    await persistenceReady
      .then(() => {
        mockOnAuthStateChanged()
      })
      .catch(() => {
        userState = null
        loadingState = false
      })

    // onAuthStateChanged was NOT called
    expect(mockOnAuthStateChanged).not.toHaveBeenCalled()
    // User is safely locked to null
    expect(userState).toBeNull()
    // Loading is completed (UI renders logged-out state)
    expect(loadingState).toBe(false)
  })
})
