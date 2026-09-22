import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect } from 'react'

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [center, zoom, map])
  return null
}
import L from 'leaflet'
import type { Issue } from '../../types'
import { useConfig } from '../../context/ConfigContext'
import { HeatmapLayer } from './HeatmapLayer'
import 'leaflet/dist/leaflet.css'

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface IssueMapProps {
  issues: Issue[]
  showHeatmap?: boolean
  height?: string
  center?: [number, number] | null
  zoom?: number
  onSelectIssue?: (issue: Issue) => void
}

import { memo } from 'react'

export const IssueMap = memo(function IssueMap({
  issues,
  showHeatmap = false,
  height = '400px',
  center,
  zoom = 11,
  onSelectIssue,
}: IssueMapProps) {
  const { config } = useConfig()
  const mapCenter: [number, number] =
    center ??
    (issues[0]
      ? [issues[0].location.lat, issues[0].location.lng]
      : [20.5937, 78.9629])

  const heatPoints: [number, number, number][] = issues.map((i) => [
    i.location.lat,
    i.location.lng,
    i.priorityScore / (config?.highPriorityThreshold ?? 10),
  ])

  if (center === null) {
    return (
      <div
        className="flex animate-scale-in items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400"
        style={{ height }}
      >
        Waiting for location...
      </div>
    )
  }

  return (
    <div
      className="animate-scale-in overflow-hidden rounded-2xl border border-white/10 shadow-2xl ring-1 ring-white/5"
      style={{ height }}
    >
      <MapContainer center={mapCenter} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <MapController center={mapCenter} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showHeatmap && <HeatmapLayer points={heatPoints} />}
        {issues.map((issue) => (
          <Marker
            key={issue.id}
            position={[issue.location.lat, issue.location.lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectIssue?.(issue),
            }}
          >
            <Popup>
              <div className="min-w-[180px]">
                <span className="font-mono text-[0.65rem] font-bold text-cyan-400">
                  {issue.complaintId || `PT-2026-${issue.id.slice(-5).toUpperCase()}`}
                </span>
                <p className="font-semibold text-slate-100">{issue.title}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Status: <strong className="text-emerald-400">{issue.status.replace(/_/g, ' ')}</strong>
                </p>
                <p className="text-xs text-slate-500">{issue.location.address}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
})
