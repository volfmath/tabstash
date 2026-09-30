export interface SaveShortcutApi {
  openPopup(): Promise<void>
  openOptionsPage(): Promise<void>
}

export type SaveShortcutResult = 'popup' | 'options' | 'unavailable'

export async function openSavePopupOrOptions(api: SaveShortcutApi): Promise<SaveShortcutResult> {
  try {
    await api.openPopup()
    return 'popup'
  } catch {
    try {
      await api.openOptionsPage()
      return 'options'
    } catch {
      return 'unavailable'
    }
  }
}
