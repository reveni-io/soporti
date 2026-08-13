import { useEffect, useState } from 'react'
import { getAttachmentImage } from '../../services/services.js'

export function useAttachmentImage(token, imageId) {
  const [image, setImage] = useState(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!token || !imageId) return

    let active = true
    async function load() {
      try {
        const data = await getAttachmentImage(token, imageId)
        if (active) setImage(data.image)
      } catch {
        if (active) setExpired(true)
      }
    }
    load()

    return () => {
      active = false
    }
  }, [token, imageId])

  return { image, expired }
}
