// Reverse geocoding utility - converts coordinates to readable area names
// Works globally - will show area names like "Govandi", "Wadala", "Kurla" in Mumbai, or any area worldwide
export async function getAreaFromCoordinates(lat: number, lng: number): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
  try {
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'CivicPulseApp/1.0',
          'Accept-Language': 'en'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`Geocoding failed with status ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.address) {
      throw new Error('No address data in response')
    }
    
    // Extract area information from the response
    const address = data.address
    
    // Try to get the most specific area name available
    // Priority: suburb > neighbourhood > quarter > city_district > district > city > town > village
    const areaName = 
      address.suburb ||
      address.neighbourhood ||
      address.quarter ||
      address.city_district ||
      address.district ||
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.county ||
      address.state ||
      'Unknown Area'
    
    return areaName
  } catch (error) {
    console.error('Reverse geocoding error:', error)
    // Fallback to coordinates if geocoding fails
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

// Get formatted area display string with city and area
export async function getFormattedArea(lat: number, lng: number): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'CivicPulseApp/1.0',
          'Accept-Language': 'en'
        }
      }
    )
    
    if (!response.ok) {
      return await getAreaFromCoordinates(lat, lng)
    }
    
    const data = await response.json()
    const address = data.address
    
    // Build a more descriptive area name
    const parts = []
    
    // Add specific area (suburb/neighbourhood)
    const specificArea = address.suburb || address.neighbourhood || address.quarter
    if (specificArea) {
      parts.push(specificArea)
    }
    
    // Add city/district
    const city = address.city || address.town || address.village
    if (city && city !== specificArea) {
      parts.push(city)
    }
    
    // If we have parts, join them; otherwise fallback
    if (parts.length > 0) {
      return parts.join(', ')
    }
    
    return await getAreaFromCoordinates(lat, lng)
  } catch (error) {
    console.error('Formatted area error:', error)
    return await getAreaFromCoordinates(lat, lng)
  }
}

// Forward geocoding utility - converts search query text to coordinates & address
export async function searchLocationCoordinates(query: string): Promise<{ lat: number; lng: number; displayName: string }[]> {
  if (!query || query.trim().length < 2) return []
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'CivicPulseApp/1.0',
          'Accept-Language': 'en'
        }
      }
    )
    if (!response.ok) return []
    const data = await response.json()
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name,
    }))
  } catch (error) {
    console.error('Forward geocoding search error:', error)
    return []
  }
}
