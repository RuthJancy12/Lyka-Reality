export type ThemeMode = 'light'

export const useTheme = () => {
  return { theme: 'light' as ThemeMode, setTheme: () => {}, toggleTheme: () => {}, isDark: false }
}

export default useTheme