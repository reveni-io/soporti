import { useSyncExternalStore } from 'react'
import {
  getInstallPrompt,
  isIos,
  isStandalone,
  onInstallPromptChange,
  promptInstall,
  wasAppInstalled,
} from '../../../../pwa/install-prompt.js'

export function useInstallPrompt() {
  const prompt = useSyncExternalStore(onInstallPromptChange, getInstallPrompt)
  const wasInstalled = useSyncExternalStore(onInstallPromptChange, wasAppInstalled)
  const isInstalled = isStandalone()

  return {
    canInstall: Boolean(prompt) && !isInstalled,
    isInstalled,
    wasInstalled,
    isIos: isIos(),
    install: promptInstall,
  }
}
