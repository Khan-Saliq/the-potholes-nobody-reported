import { useEffect, useState, useMemo } from 'react'
import { Layout } from '../components/layout/Layout'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { IssueMap } from '../components/map/IssueMap'
import { IssueCard } from '../components/issues/IssueCard'
import { getAllIssues } from '../services/issueService'
import { useGeolocation } from '../hooks/useGeolocation'
import { searchLocationCoordinates } from '../utils/geocoding'
import type { Issue } from '../types'
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Filter,
  Flame,
  Layers,
  MapPin,
  Search,
  Wrench,
} from 'lucide-react'

type StatusFilter = 'ALL' | 'REPORTED' | 'IN_PROGRESS' | 'REPAIRED'

// Helper to compute distance in km using Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((R * c).toFixed(2))
}

export function PotholeMap() {
  const geo = useGeolocation()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Map View & Search States
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [radiusKm, setRadiusKm] = useState<number>(0) // 0 = All / Global
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState<{ lat: number; lng: number; displayName: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  // Active Center Location (Defaults to User location or Mumbai default)
  const [centerLoc, setCenterLoc] = useState<{ lat: number; lng: number; name: string }>({
    lat: 19.076,
    lng: 72.8777,
    name: 'Mumbai City Center',
  })
  const [zoomLevel, setZoomLevel] = useState(12)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)

  // Fetch all issues from backend API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const list = await getAllIssues()
        setIssues(list)
      } catch (err: any) {
        setError(err.message || 'Failed to load potholes database')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Update center when geolocation becomes available
  useEffect(() => {
    if (geo.lat != null && geo.lng != null) {
      setCenterLoc({
        lat: geo.lat,
        lng: geo.lng,
        name: 'Your Device Location',
      })
    }
  }, [geo.lat, geo.lng])

  // Handle Location Search Input
  const handleSearchInputChange = async (val: string) => {
    setSearchQuery(val)
    if (val.trim().length >= 3) {
      setIsSearching(true)
      const results = await searchLocationCoordinates(val)
      setSearchSuggestions(results)
      setIsSearching(false)
    } else {
      setSearchSuggestions([])
    }
  }

  const handleSelectLocationSuggestion = (s: { lat: number; lng: number; displayName: string }) => {
    setCenterLoc({
      lat: s.lat,
      lng: s.lng,
      name: s.displayName.split(',')[0],
    })
    setZoomLevel(14)
    setSearchQuery(s.displayName.split(',')[0])
    setSearchSuggestions([])
  }

  const handleUseMyLocation = () => {
    if (geo.lat != null && geo.lng != null) {
      setCenterLoc({
        lat: geo.lat,
        lng: geo.lng,
        name: 'Your Device Location',
      })
      setZoomLevel(14)
    }
  }

  // Filter Issues by Status and Distance Radius
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // 1. Status Filter
      if (statusFilter === 'REPORTED') {
        if (issue.status !== 'reported' && issue.status !== 'under_review' && issue.status !== 'awaiting_assignment') {
          return false
        }
      } else if (statusFilter === 'IN_PROGRESS') {
        if (issue.status !== 'assigned' && issue.status !== 'accepted' && issue.status !== 'repair_in_progress' && issue.status !== 'after_photo_submitted' && issue.status !== 'ai_verification') {
          return false
        }
      } else if (statusFilter === 'REPAIRED') {
        if (issue.status !== 'completed' && issue.status !== 'verified' && issue.status !== 'resolved') {
          return false
        }
      }

      // 2. Distance Radius Filter (if set)
      if (radiusKm > 0 && centerLoc) {
        const dist = calculateDistanceKm(centerLoc.lat, centerLoc.lng, issue.location.lat, issue.location.lng)
        if (dist > radiusKm) return false
      }

      return true
    })
  }, [issues, statusFilter, radiusKm, centerLoc])

  // Count summaries by category
  const reportedCount = useMemo(() => issues.filter(i => i.status === 'reported' || i.status === 'under_review' || i.status === 'awaiting_assignment').length, [issues])
  const inProgressCount = useMemo(() => issues.filter(i => i.status === 'assigned' || i.status === 'accepted' || i.status === 'repair_in_progress' || i.status === 'after_photo_submitted' || i.status === 'ai_verification').length, [issues])
  const repairedCount = useMemo(() => issues.filter(i => i.status === 'completed' || i.status === 'verified' || i.status === 'resolved').length, [issues])

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-6 w-6 text-cyan-400" />
                <h1 className="text-2xl font-bold text-slate-100">Interactive Pothole Map</h1>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Explore reported, in-progress, and repaired potholes near your location or search any location worldwide.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition border ${
                  showHeatmap
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'btn-ghost text-slate-300 border-white/10'
                }`}
              >
                {showHeatmap ? <Flame className="w-4 h-4 text-amber-400" /> : <Layers className="w-4 h-4 text-cyan-400" />}
                {showHeatmap ? 'Heatmap View Active' : 'Switch to Heatmap'}
              </button>
            </div>
          </div>

          {/* Search & Location Bar */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl space-y-4">
            <div className="grid gap-4 md:grid-cols-12 items-center">
              {/* Search Location Input */}
              <div className="relative md:col-span-6">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchInputChange(e.target.value)}
                    placeholder="Search any location, city, area, or street (e.g. Mumbai, MG Road)..."
                    className="input-dark pl-10 pr-4 text-xs h-10 w-full"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  )}
                </div>

                {/* Search Auto-Suggestions Dropdown */}
                {searchSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden divide-y divide-white/5">
                    {searchSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectLocationSuggestion(s)}
                        className="w-full text-left px-3.5 py-2.5 text-xs text-slate-200 hover:bg-cyan-500/20 hover:text-cyan-300 transition flex items-center gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{s.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Use My Location Button */}
              <div className="md:col-span-3">
                <button
                  onClick={handleUseMyLocation}
                  disabled={geo.loading}
                  className="w-full h-10 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 flex items-center justify-center gap-2"
                >
                  <Compass className="w-4 h-4 text-cyan-400" />
                  {geo.loading ? 'Detecting GPS...' : 'Use My Location'}
                </button>
              </div>

              {/* Radius Filter */}
              <div className="md:col-span-3 flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="input-dark text-xs h-10 w-full"
                >
                  <option value={0}>Radius: All / Worldwide</option>
                  <option value={1}>Within 1 km</option>
                  <option value={5}>Within 5 km</option>
                  <option value={10}>Within 10 km</option>
                  <option value={25}>Within 25 km</option>
                  <option value={50}>Within 50 km</option>
                </select>
              </div>
            </div>

            {/* Active Location Info Pill */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-white/5 pt-3">
              <span className="flex items-center gap-1.5 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Active Center: <strong className="text-cyan-300">{centerLoc.name}</strong> ({centerLoc.lat.toFixed(4)}, {centerLoc.lng.toFixed(4)})
              </span>
              <span>Showing <strong className="text-white">{filteredIssues.length}</strong> of {issues.length} total potholes</span>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
                statusFilter === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                  : 'btn-ghost text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>All Potholes</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[0.65rem]">
                {issues.length}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('REPORTED')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
                statusFilter === 'REPORTED'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'btn-ghost text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Reported</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[0.65rem]">
                {reportedCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                  : 'btn-ghost text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>In Progress</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[0.65rem]">
                {inProgressCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('REPAIRED')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
                statusFilter === 'REPAIRED'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'btn-ghost text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Repaired & Verified</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[0.65rem]">
                {repairedCount}
              </span>
            </button>
          </div>

          {/* Interactive Leaflet Map Component */}
          {loading ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 text-slate-400 animate-pulse">
              Loading pothole map & coordinates...
            </div>
          ) : error ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-950/20 text-rose-300">
              {error}
            </div>
          ) : (
            <IssueMap
              issues={filteredIssues}
              showHeatmap={showHeatmap}
              height="520px"
              center={[centerLoc.lat, centerLoc.lng]}
              zoom={zoomLevel}
              onSelectIssue={(issue) => setSelectedIssue(issue)}
            />
          )}

          {/* Selected Pothole Card Banner */}
          {selectedIssue && (
            <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-5 shadow-2xl space-y-3 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-300">
                  SELECTED: {selectedIssue.complaintId || `PT-2026-${selectedIssue.id.slice(-5).toUpperCase()}`}
                </span>
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-white">{selectedIssue.title}</h3>
                  <p className="text-xs text-slate-300">{selectedIssue.description}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    {selectedIssue.location.address}
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-slate-400">Severity: <strong className="text-amber-400">{selectedIssue.severity}/5</strong></span>
                    <span className="text-slate-400">• Priority Score: <strong className="text-cyan-300">{selectedIssue.priorityScore}</strong></span>
                  </div>
                </div>

                {/* Before & After Proof Photos */}
                <div className="flex gap-2">
                  {selectedIssue.imageUrl && (
                    <div className="relative flex-1 aspect-video rounded-xl overflow-hidden border border-white/10 bg-slate-900">
                      <img src={selectedIssue.imageUrl} alt="Pothole Before" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 text-[0.6rem] text-amber-300 font-bold rounded">
                        BEFORE
                      </div>
                    </div>
                  )}
                  {selectedIssue.afterImage && (
                    <div className="relative flex-1 aspect-video rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-900">
                      <img src={selectedIssue.afterImage} alt="Repair After" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 left-1 bg-emerald-950/90 px-1.5 py-0.5 text-[0.6rem] text-emerald-300 font-bold rounded border border-emerald-500/30">
                        REPAIRED
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* List of Matching Potholes Grid */}
          <div className="space-y-4 pt-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center justify-between">
              <span>Matching Potholes List</span>
              <span className="text-xs font-normal text-slate-400">{filteredIssues.length} results</span>
            </h2>

            {filteredIssues.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-400">
                No potholes match the selected status filter or search location radius.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredIssues.map((issue, idx) => (
                  <div
                    key={issue.id}
                    onClick={() => setSelectedIssue(issue)}
                    className="cursor-pointer transition-transform hover:-translate-y-1"
                  >
                    <IssueCard issue={issue} delay={idx * 40} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    </Layout>
  )
}
