import { useEffect, useState, useCallback } from 'react'

export interface DetailedGeoState {
  lat: number | null
  lng: number | null
  accuracy: number | null
  altitude: number | null
  capturedAt: string | null
  loading: boolean
  error: string | null
  permissionState: 'granted' | 'denied' | 'prompt' | 'unknown'
}

export function useGeolocation() {
  const [state, setState] = useState<DetailedGeoState>({
    lat: null,
    lng: null,
    accuracy: null,
    altitude: null,
    capturedAt: null,
    loading: true,
    error: null,
    permissionState: 'unknown',
  })

  // Check geolocation permission if Permissions API is available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((permission) => {
          setState((prev) => ({ ...prev, permissionState: permission.state }))
          permission.onchange = () => {
            setState((prev) => ({ ...prev, permissionState: permission.state }))
          }
        })
        .catch(() => {})
    }
  }, [])

  const fallbackToIpOrCity = async (
    safeResolve: (val: DetailedGeoState) => void,
    reason: string
  ) => {
    console.log('📍 GNSS location unavailable or timed out:', reason, '— acquiring IP/city fallback location...')

    const defaultState: DetailedGeoState = {
      lat: 25.578321,
      lng: 91.893421,
      accuracy: 2500,
      altitude: null,
      capturedAt: new Date().toISOString(),
      loading: false,
      error: null,
      permissionState: 'unknown',
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)
        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          if (data.latitude && data.longitude) {
            safeResolve({
              lat: Number(data.latitude),
              lng: Number(data.longitude),
              accuracy: 1500,
              altitude: null,
              capturedAt: new Date().toISOString(),
              loading: false,
              error: null,
              permissionState: 'granted',
            })
            return
          }
        }
      } catch {}
    }

    safeResolve(defaultState)
  }

  const captureDeviceGPS = useCallback((): Promise<DetailedGeoState> => {
    return new Promise((resolve) => {
      let isResolved = false

      const safeResolve = (newState: DetailedGeoState) => {
        if (isResolved) return
        isResolved = true
        setState(newState)
        resolve(newState)
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        fallbackToIpOrCity(safeResolve, 'Geolocation hardware or API is unsupported on this device.')
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      // Hard safety timer: If browser geolocation hangs or times out for > 3.0s, force instant fallback
      const hardTimer = setTimeout(() => {
        if (!isResolved) {
          console.warn('⏱️ Hard 3.0s safety timer reached — forcing IP/city fallback location...')
          fallbackToIpOrCity(safeResolve, 'Browser GNSS request timed out.')
        }
      }, 3000)

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(hardTimer)
            const timestamp = new Date().toISOString()
            safeResolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy),
              altitude: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : null,
              capturedAt: timestamp,
              loading: false,
              error: null,
              permissionState: 'granted',
            })
          },
          (err) => {
            clearTimeout(hardTimer)
            console.warn('⚠️ Browser geolocation error:', err.message)
            fallbackToIpOrCity(safeResolve, err.message || 'GPS signal unavailable.')
          },
          {
            enableHighAccuracy: true,
            timeout: 2500,
            maximumAge: 10000,
          }
        )
      } catch (e: any) {
        clearTimeout(hardTimer)
        fallbackToIpOrCity(safeResolve, e?.message || 'Geolocation exception.')
      }
    })
  }, [])

  useEffect(() => {
    captureDeviceGPS()
  }, [captureDeviceGPS])

  // Auto-retry location capture when coming back online or when window gains focus
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network came online — refreshing device geolocation...')
      captureDeviceGPS()
    }

    const handleFocus = () => {
      if (state.lat == null || state.error) {
        console.log('🔍 Window focused & location missing — retrying device geolocation...')
        captureDeviceGPS()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('focus', handleFocus)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('focus', handleFocus)
      }
    }
  }, [captureDeviceGPS, state.lat, state.error])

  return {
    ...state,
    refreshLocation: captureDeviceGPS,
  }
}
