import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Camera, MapPin, Loader, CheckCircle2, XCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useOffline } from '../../context/OfflineContext'
import { useGeolocation } from '../../hooks/useGeolocation'
import {
  findDuplicateCandidates,
  analyzePotholePhoto,
  submitAISmartReport,
  type PotholeAnalysisResult,
  type AISmartReportResult,
} from '../../services/issueService'
import { getFormattedArea } from '../../utils/geocoding'
import { generateUUID, generateTempComplaintCode, generateTempId, compressImageIfNeeded } from '../../utils/offlineHelpers'
import { saveOfflineQueueItem, updateCachedIssue, type OfflineQueueItem } from '../../services/offlineStorage'
import { triggerSync } from '../../services/offlineSyncEngine'
import type { Issue, IssueCategory } from '../../types'

// Citizen Pothole Complaint Submission Page with Live AI Photo Scanning & Pre-Verification

export function ReportIssue() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { isOnline } = useOffline()
  const geo = useGeolocation()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Lock category strictly to Potholes & Road Damage
  const category: IssueCategory = 'potholes_and_road_damage'
  const [severity, setSeverity] = useState(3)
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  
  // Live Photo Scanning & AI Analysis States
  const [isScanning, setIsScanning] = useState(false)
  const [aiResult, setAiResult] = useState<PotholeAnalysisResult | null>(null)
  const [smartOutcome, setSmartOutcome] = useState<AISmartReportResult | null>(null)

  const [mergeWithId, setMergeWithId] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<Issue[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [locationRefreshing, setLocationRefreshing] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (geo.lat != null && geo.lng != null) {
      setLat(geo.lat)
      setLng(geo.lng)

      const trimmedAddr = (address || '').trim()
      const isRawCoordAddress =
        !trimmedAddr ||
        trimmedAddr === 'Detecting location...' ||
        /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(trimmedAddr)

      if (isOnline || navigator.onLine) {
        if (isRawCoordAddress) {
          getFormattedArea(geo.lat, geo.lng)
            .then((area) => {
              if (area) setAddress(area)
            })
            .catch(() => {})
        }
        findDuplicateCandidates('pothole', geo.lat, geo.lng)
          .then(setDuplicates)
          .catch(() => {})
      } else if (isRawCoordAddress) {
        setAddress(`${geo.lat.toFixed(6)}, ${geo.lng.toFixed(6)}`)
      }
    } else if ((isOnline || navigator.onLine) && (lat == null || lng == null || geo.error)) {
      // Auto-retry acquiring device location when network is online
      geo.refreshLocation()
    }
  }, [geo.lat, geo.lng, isOnline])

  const checkDuplicates = async () => {
    if (lat != null && lng != null && navigator.onLine) {
      try {
        const result = await findDuplicateCandidates(title || 'pothole', lat, lng)
        setDuplicates(result)
      } catch {
        setDuplicates([])
      }
    }
  }

  const validateForm = () => {
    setFormError(null)

    if (!imageFile) return 'Upload a valid proof: Pothole photo proof is required.'
    if (aiResult?.status === 'REJECTED') {
      return `Upload a valid proof: ${aiResult.reason || 'Photo did not match clear road pothole features.'}`
    }
    return null
  }

  const refreshLocation = async () => {
    setLocationRefreshing(true)
    const result = await geo.refreshLocation()
    setLocationRefreshing(false)

    if (result.lat != null && result.lng != null) {
      setLat(result.lat)
      setLng(result.lng)
      const addrString = `${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`
      setAddress(addrString)
      toast.success(
        '📡 Device GPS Captured',
        `Lat: ${result.lat.toFixed(6)}, Lng: ${result.lng.toFixed(6)}${result.accuracy ? ` (Accuracy: ±${result.accuracy}m)` : ''}`
      )
      if (navigator.onLine) {
        getFormattedArea(result.lat, result.lng).then((area) => setAddress(area)).catch(() => {})
        findDuplicateCandidates('pothole', result.lat, result.lng).then(setDuplicates).catch(() => {})
      }
    } else {
      toast.error('GPS Signal Failure', result.error || 'Unable to acquire device GPS coordinates.')
    }
  }

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const saveOfflineReport = async (reason?: string) => {
    if (!user) return
    try {
      console.log('🌐 Saving citizen report offline to IndexedDB queue. Reason:', reason || 'offline mode')
      const operationId = generateUUID()
      const tempId = generateTempId()
      const tempCode = generateTempComplaintCode()
      const deviceCapturedAt = new Date().toISOString()

      const compressedBlob = imageFile
        ? await compressImageIfNeeded(imageFile)
        : new Blob([], { type: 'image/jpeg' })

      const queueItem: OfflineQueueItem = {
        operationId,
        userId: user.id,
        userRole: 'citizen',
        actionType: 'CREATE_CITIZEN_REPORT',
        entityType: 'issue',
        entityId: tempCode,
        payload: {
          title: title?.trim() || 'Pothole Road Damage',
          description: description?.trim() || 'Offline Pothole Report',
          category,
          severity,
          location: { lat: Number(lat || 25.578321), lng: Number(lng || 91.893421), address: (address || 'Captured Location').trim() },
          area: (address || 'Captured Location').trim(),
          beforeGps: { lat: Number(lat || 25.578321), lng: Number(lng || 91.893421) },
          mergeWithId: mergeWithId || undefined,
        },
        photoBlob: compressedBlob,
        photoMetadata: {
          fileName: imageFile?.name || 'pothole_proof.jpg',
          mimeType: imageFile?.type || 'image/jpeg',
          size: compressedBlob.size,
          capturedAt: deviceCapturedAt,
        },
        location: {
          latitude: Number(lat || 25.578321),
          longitude: Number(lng || 91.893421),
          address: (address || 'Captured Location').trim(),
        },
        capturedAt: deviceCapturedAt,
        createdAt: deviceCapturedAt,
        status: 'WAITING_FOR_SYNC',
        retryCount: 0,
      }

      await saveOfflineQueueItem(queueItem)

      const tempIssue = {
        id: tempId,
        complaintId: tempCode,
        title: title?.trim() || 'Pothole Road Damage',
        description: description?.trim() || 'Offline Pothole Report',
        category,
        severity,
        status: 'reported' as const,
        isOffline: true,
        syncStatus: 'WAITING_FOR_SYNC' as const,
        location: { lat: Number(lat || 25.578321), lng: Number(lng || 91.893421), address: (address || 'Captured Location').trim() },
        imageUrl: imagePreview || undefined,
        reporterId: user.id,
        reporterName: user.name,
        createdAt: deviceCapturedAt,
        updatedAt: deviceCapturedAt,
      }
      await updateCachedIssue(tempIssue)

      setSubmitted(true)
      toast.info(
        '📌 Report Saved Offline',
        'Your report, photo proof, and GPS location are safely stored on this device. It will be uploaded automatically when internet returns.'
      )

      triggerSync().catch(() => {})
      setTimeout(() => navigate('/my-issues'), 1500)
    } catch (offlineErr: any) {
      setFormError(`Failed to save report offline: ${offlineErr.message}`)
      toast.error('Offline Save Error', 'Could not access local device storage.')
    }
  }

  // Execute Zero-Touch Auto-Submission / Auto-Rejection upon photo upload
  const processAutoReportSubmission = async (file: File) => {
    if (!user) return

    setSubmitting(true)
    setIsScanning(true)
    setFormError(null)
    setSmartOutcome(null)
    setAiResult(null)

    try {
      const base64 = await fileToBase64(file)

      // Live Pre-Verification for UI HUD Status feedback
      const visionResult = await analyzePotholePhoto(base64).catch(() => null)
      if (visionResult) {
        setAiResult(visionResult)
        if (visionResult.suggestedSeverity) setSeverity(visionResult.suggestedSeverity)
      }

      // Check if device is offline upfront
      if (!navigator.onLine) {
        await saveOfflineReport('Device is currently offline')
        return
      }

      console.log('🤖 Zero-Touch 6-Agent AI Pipeline starting for photo upload...')
      const smartResult = await submitAISmartReport({
        photo: base64,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        gpsAccuracy: geo.accuracy || null,
        timestamp: new Date().toISOString(),
        description: description?.trim() || title?.trim() || undefined,
        operationId: generateUUID(),
      })

      setSmartOutcome(smartResult)

      if (smartResult.decision === 'AUTO_ACCEPT') {
        setSubmitted(true)
        toast.success(
          '🚀 AI Auto-Verified & Submitted!',
          smartResult.message || 'Pothole verified by 6 AI agents! Auto-assigned to contractor.'
        )
        setTimeout(() => navigate('/my-issues'), 2200)
      } else if (smartResult.decision === 'NEEDS_REVIEW') {
        setSubmitted(true)
        toast.info(
          '🔎 Sent to Admin Review Queue',
          smartResult.message || 'Pothole logged and queued for quick admin confirmation.'
        )
        setTimeout(() => navigate('/my-issues'), 2200)
      } else if (smartResult.decision === 'POSSIBLE_DUPLICATE') {
        setSubmitted(true)
        toast.warning(
          '🔁 Duplicate Report Detected',
          smartResult.message || 'Similar complaint exists nearby. Your report has upvoted it.'
        )
        setTimeout(() => navigate('/my-issues'), 2200)
      } else if (smartResult.decision === 'AUTO_REJECT') {
        setSubmitted(false)
        setFormError(`❌ Auto-Rejected by AI: ${smartResult.message}`)
        toast.error('❌ Photo Auto-Rejected', smartResult.message || 'Photo did not match clear road pothole features.')
      }
    } catch (err: any) {
      console.warn('Network submission failed, falling back to IndexedDB offline storage:', err.message)
      await saveOfflineReport(err.message)
    } finally {
      setIsScanning(false)
      setSubmitting(false)
    }
  }

  // Handle Photo Selection & Trigger Zero-Touch Auto-Submission / Auto-Rejection
  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      // Automatically trigger zero-touch report submission/rejection!
      await processAutoReportSubmission(file)
    }
  }

  const triggerImageInput = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const clientValidation = validateForm()
    if (clientValidation) {
      setFormError(clientValidation)
      return
    }

    if (imageFile) {
      await processAutoReportSubmission(imageFile)
    }
  }

  return (
    <Layout>
      <AnimatedPage>
        <h1 className="text-2xl font-bold text-slate-100">
          Report a <span className="text-gradient">Pothole Complaint</span>
        </h1>
        <p className="mt-1 text-slate-400">
          Capture or upload a pothole image for instant AI auto-verification and location tracking.
        </p>

        {geo.loading && (
          <div className="mt-3 p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 text-xs flex items-center gap-2 font-mono">
            <Loader className="w-4 h-4 animate-spin text-cyan-400" />
            <span>📡 Acquiring device GNSS GPS signal...</span>
          </div>
        )}

        {geo.error && (
          <div className="mt-3 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex flex-wrap items-center justify-between gap-2">
            <span>⚠️ {geo.error}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshLocation}
                className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs transition cursor-pointer"
              >
                📡 Retry GPS
              </button>
              <button
                type="button"
                onClick={() => {
                  setLat(25.578321)
                  setLng(91.893421)
                  setAddress('Shillong, Meghalaya')
                  toast.info('Location Set', 'Using default city location (Shillong).')
                }}
                className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-bold text-xs transition cursor-pointer"
              >
                📍 Use Shillong Location
              </button>
            </div>
          </div>
        )}

        {!geo.loading && !geo.error && lat != null && lng != null && (
          <div className="mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs space-y-1">
            <div className="flex items-center justify-between font-mono font-bold">
              <span>✅ Device GPS Detected: Lat {lat.toFixed(6)}, Lng {lng.toFixed(6)} {geo.accuracy ? `(Accuracy: ±${geo.accuracy} m)` : ''}</span>
              <span className="text-[10px] text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30">
                {navigator.onLine ? 'GNSS Online' : '📡 Offline Device GNSS Active'}
              </span>
            </div>
            {!navigator.onLine && (
              <p className="text-[11px] text-slate-300 font-sans">
                Location acquired directly from device GNSS hardware. Coordinates will be safely saved offline and uploaded when internet returns.
              </p>
            )}
          </div>
        )}

        {smartOutcome && (
          <div
            className={`animate-scale-in mt-4 rounded-xl border p-4 space-y-2 text-sm ${
              smartOutcome.decision === 'AUTO_ACCEPT'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : smartOutcome.decision === 'POSSIBLE_DUPLICATE'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                : smartOutcome.decision === 'NEEDS_REVIEW'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span>AI Agent Decision: {smartOutcome.decision}</span>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-white/10 font-mono">
                {smartOutcome.issue?.complaintId || 'PT-2026-REPORT'}
              </span>
            </div>
            <p className="text-xs text-slate-300">{smartOutcome.message}</p>
          </div>
        )}

        {submitted && !smartOutcome && (
          <div className="animate-scale-in mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300">
            Pothole complaint submitted successfully! Redirecting...
          </div>
        )}

        {formError && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-rose-200">
            <strong>Form error:</strong> {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="glass-card space-y-5 p-6">
            {/* 1. One-Tap Photo Upload & Live AI Computer Vision Scanning */}
            <div>
              <label className="mb-2 flex items-center justify-between text-sm font-bold text-slate-200">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <Camera className="h-5 w-5 text-cyan-400" /> One-Tap Pothole Photo Proof
                </span>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                  ⚡ Live AI Verification
                </span>
              </label>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={triggerImageInput}
                    className="flex-1 rounded-xl border border-cyan-500/40 bg-cyan-500/20 px-4 py-3 text-sm font-bold text-cyan-200 transition hover:bg-cyan-500/30 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    <Camera className="w-5 h-5 text-cyan-300" /> 📷 Take Photo / Upload Pothole Proof
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImage}
                    className="hidden"
                  />
                </div>

                {/* Hidden camera capture input */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImage}
                  className="hidden"
                />

                {/* Live Scanning Image Preview & Output Display */}
                {imagePreview && (
                  <div className="relative mt-3 rounded-2xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl transition-all">
                    {/* Uploaded Photo Image — Always Fully Visible during AI Scanning */}
                    <div className={`relative h-64 w-full overflow-hidden ${isScanning ? 'scanning-container' : ''}`}>
                      <img
                        src={imagePreview}
                        alt="Pothole Preview"
                        className={`h-full w-full object-cover transition-all duration-500 ${
                          isScanning ? 'brightness-110 contrast-125' : 'brightness-100'
                        }`}
                      />

                      {/* Transparent Cybernetic HUD Target Bounding Box Overlay */}
                      <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                        {/* Top HUD Brackets */}
                        <div className="flex justify-between items-center text-cyan-400/80 font-mono text-[10px]">
                          <span className="border-t-2 border-l-2 border-cyan-400 w-6 h-6 rounded-tl-md"></span>
                          <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300 font-bold backdrop-blur-md">
                            {isScanning ? '⚡ AI PREVIEW SCAN ACTIVE' : aiResult ? `AI STATUS: ${aiResult.status}` : 'PROOF UPLOADED'}
                          </span>
                          <span className="border-t-2 border-r-2 border-cyan-400 w-6 h-6 rounded-tr-md"></span>
                        </div>

                        {/* Center Target Reticle while Scanning */}
                        {isScanning && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-28 h-28 border border-dashed border-cyan-400/60 rounded-full animate-spin duration-3000 flex items-center justify-center">
                              <div className="w-16 h-16 border border-cyan-400/40 rounded-full flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-cyan-400 animate-pulse" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Bottom HUD Brackets & Live Status Bar */}
                        <div className="flex justify-between items-end">
                          <span className="border-b-2 border-l-2 border-cyan-400 w-6 h-6 rounded-bl-md"></span>
                          {isScanning && (
                            <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 shadow-lg animate-pulse">
                              <Loader className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                              <span>SCANNING ROAD SURFACE & CAVITY DEPTH...</span>
                            </div>
                          )}
                          <span className="border-b-2 border-r-2 border-cyan-400 w-6 h-6 rounded-br-md"></span>
                        </div>
                      </div>
                    </div>

                    {/* AI Verification Output Card — Generated after scanning completes */}
                    {!isScanning && aiResult && (
                      <div
                        className={`p-4 border-t text-xs space-y-2 transition-all animate-fade-in-up ${
                          aiResult.status === 'ACCEPTED'
                            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1.5 text-sm">
                            {aiResult.status === 'ACCEPTED' ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span>REPORT ACCEPTED — Real Road Pothole</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-rose-400" />
                                <span>INVALID PHOTO — Not a Road Pothole</span>
                              </>
                            )}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-500/30">
                            {aiResult.confidence}% AI Match
                          </span>
                        </div>

                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          {aiResult.reason}
                        </p>

                        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/10 text-[10px] text-slate-400">
                          <span>Image Quality: <strong className="text-slate-200">{aiResult.imageQuality}</strong></span>
                          <span>Detected Severity: <strong className="text-cyan-300">{aiResult.severity}</strong></span>
                          <span>Verification Engine: <strong className="text-violet-300">{aiResult.analyzedBy}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button right below photo card */}
            <button
              type="submit"
              disabled={submitting || isScanning || !imageFile || aiResult?.status === 'REJECTED'}
              className={`w-full py-3.5 text-sm font-extrabold shadow-xl rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
                aiResult?.status === 'REJECTED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 opacity-75 cursor-not-allowed'
                  : 'btn-primary shadow-cyan-500/20 disabled:opacity-60 text-white'
              }`}
            >
              <Sparkles className="w-5 h-5 text-cyan-300 animate-pulse" />
              {submitting
                ? 'Submitting Report to 6-Agent AI Engine...'
                : aiResult?.status === 'REJECTED'
                ? 'Upload a Valid Road Photo to Submit'
                : '🚀 Submit One-Tap AI Report'}
            </button>

            {/* 2. Location Address & Device GNSS Coordinates */}
            <div className="space-y-2 pt-3 border-t border-white/10">
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-violet-400" /> Location Address / Coordinates
                </span>
                <button
                  type="button"
                  onClick={refreshLocation}
                  disabled={locationRefreshing}
                  className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer font-bold"
                  title="Recapture GNSS device coordinates"
                >
                  {locationRefreshing ? (
                    <>
                      <Loader className="h-3 w-3 animate-spin" /> Acquiring GNSS...
                    </>
                  ) : (
                    <>📡 Recapture Device GPS</>
                  )}
                </button>
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input-dark mb-2 text-xs"
                placeholder="Street address or area coordinates (auto-captured)"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-mono block mb-0.5">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={lat ?? ''}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="input-dark text-xs font-mono"
                    placeholder="Latitude"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono block mb-0.5">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={lng ?? ''}
                    onChange={(e) => setLng(Number(e.target.value))}
                    className="input-dark text-xs font-mono"
                    placeholder="Longitude"
                  />
                </div>
              </div>
            </div>

            {/* 3. Optional Additional Details */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Additional Details (Optional)</span>
                <span className="text-[10px] text-cyan-400 font-mono">AI will auto-generate if left blank</span>
              </div>

              {/* Optional Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Title <span className="text-slate-500">(Optional)</span></label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={checkDuplicates}
                  placeholder="Optional — AI will auto-generate title if left blank"
                  className="input-dark text-xs"
                />
              </div>

              {/* Optional Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Description <span className="text-slate-500">(Optional)</span></label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — AI will auto-generate description from vision analysis"
                  className="input-dark text-xs resize-none"
                />
              </div>

              {/* Severity Rating */}
              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>Severity Rating: <strong className="text-cyan-400">{severity} / 5</strong></span>
                  {aiResult?.severity && (
                    <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      AI Suggested: {aiResult.severity}
                    </span>
                  )}
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right Sidebar Details & Duplicates */}
          <div className="space-y-4">
            {duplicates.length > 0 && (
              <div className="animate-scale-in rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertCircle className="h-5 w-5" />
                  <h3 className="font-semibold">Possible Duplicates Found</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {duplicates.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-500/20 bg-white/5 p-3"
                    >
                      <input
                        type="radio"
                        name="merge"
                        checked={mergeWithId === d.id}
                        onChange={() => setMergeWithId(d.id)}
                        className="mt-1 accent-amber-500"
                      />
                      <div>
                        <p className="font-medium text-slate-100">{d.title}</p>
                        <p className="text-xs text-slate-500">
                          {d.reportCount} reports · Priority {d.priorityScore}
                        </p>
                      </div>
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                    <input
                      type="radio"
                      name="merge"
                      checked={mergeWithId === null}
                      onChange={() => setMergeWithId(null)}
                      className="accent-cyan-500"
                    />
                    This is a new issue
                  </label>
                </div>
              </div>
            )}

            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <span>Transparent Computer Vision Verification</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                When you upload a pothole photo, our computer-vision engine auto-verifies road surface features, depth, and clarity before logging the complaint for municipal repair tracking.
              </p>
              <div className="pt-2 border-t border-white/5 text-xs text-slate-400">
                Your trust score is <span className="text-cyan-400 font-bold">{user?.trustScore}%</span>.
              </div>
            </div>
          </div>
        </form>
      </AnimatedPage>
    </Layout>
  )
}
