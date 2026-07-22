import '@testing-library/jest-dom'
import { vi } from 'vitest'

if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.getItem) {
  const store = {}
  globalThis.localStorage = {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = String(value)
    },
    removeItem: key => {
      delete store[key]
    },
    clear: () => {
      for (const k in store) delete store[k]
    },
    get length() {
      return Object.keys(store).length
    },
    key: i => Object.keys(store)[i] ?? null,
  }
}

Element.prototype.scrollIntoView = vi.fn()

if (!import.meta.env.VITE_API_URL) {
  import.meta.env.VITE_API_URL = ''
}
