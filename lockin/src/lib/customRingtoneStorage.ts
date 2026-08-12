/**
 * Persistent storage for custom ringtones using IndexedDB via idb-keyval.
 * Blob URLs are temporary and die on page refresh, so we store the actual
 * File/Blob data in IndexedDB and recreate blob URLs on load.
 */

import { get, set, del, keys } from 'idb-keyval'

const CUSTOM_RINGTONE_PREFIX = 'custom-ringtone-'

export type StoredRingtone = {
  id: string
  file: File
  blobUrl: string
}

/**
 * Save a custom ringtone file to IndexedDB.
 * Returns the created blob URL and a unique ID.
 */
export async function saveCustomRingtone(file: File): Promise<{ id: string; blobUrl: string }> {
  const id = `${CUSTOM_RINGTONE_PREFIX}${Date.now()}`
  await set(id, file)
  const blobUrl = URL.createObjectURL(file)
  return { id, blobUrl }
}

/**
 * Load all custom ringtones from IndexedDB and recreate blob URLs.
 */
export async function loadCustomRingtones(): Promise<StoredRingtone[]> {
  const allKeys = await keys()
  const ringtoneKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(CUSTOM_RINGTONE_PREFIX),
  )

  const ringtones: StoredRingtone[] = []
  for (const key of ringtoneKeys) {
    const file = await get(key as string)
    if (file instanceof File) {
      const blobUrl = URL.createObjectURL(file)
      ringtones.push({ id: key as string, file, blobUrl })
    }
  }
  return ringtones
}

/**
 * Remove a custom ringtone from IndexedDB.
 */
export async function removeCustomRingtone(id: string): Promise<void> {
  await del(id)
}
