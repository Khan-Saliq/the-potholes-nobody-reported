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

  const captureDeviceGPS = useCallback((): Promise<DetailedGeoState> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const errState: DetailedGeoState = {
          lat: null,
          lng: null,
          accuracy: null,
          altitude: null,
          capturedAt: null,
          loading: false,
          error: 'Geolocation hardware or API is unsupported on this device.',
          permissionState: 'denied',
        }
        setState(errState)
        resolve(errState)
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      const tryGetPosition = (options: PositionOptions, isFallback = false) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const timestamp = new Date().toISOString()
            const newState: DetailedGeoState = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy),
              altitude: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : null,
              capturedAt: timestamp,
              loading: false,
              error: null,
              permissionState: 'granted',
            }
            setState(newState)
            resolve(newState)
          },
          (err) => {
            if (!isFallback && (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE)) {
              console.warn('⚠️ High accuracy GPS request timed out or unavailable, trying network location fallback...')
              tryGetPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }, true)
              return
            }

            let errorMsg = 'Unable to acquire device GPS signal.'
            if (err.code === err.PERMISSION_DENIED) {
              errorMsg = 'Location permission denied. Please grant location access in browser settings.'
            } else if (err.code === err.POSITION_UNAVAILABLE) {
              errorMsg = 'GPS signal unavailable. Move to an open area away from tall structures and retry.'
            } else if (err.code === err.TIMEOUT) {
              errorMsg = 'GPS location request timed out. Please tap "Retry GPS" in an open area.'
            }

            const errState: DetailedGeoState = {
              lat: null,
              lng: null,
              accuracy: null,
              altitude: null,
              capturedAt: null,
              loading: false,
              error: errorMsg,
              permissionState: err.code === err.PERMISSION_DENIED ? 'denied' : 'granted',
            }
            setState(errState)
            resolve(errState)
          },
          options
        )
      }

      tryGetPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }, false)
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
