import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { getIssueById, submitRepairEvidence, type PotholeAnalysisResult } from '../../services/issueService'
import { generateUUID, base64ToBlob, compressImageIfNeeded } from '../../utils/offlineHelpers'
import { saveOfflineQueueItem, updateCachedIssue, getCachedIssueById, type OfflineQueueItem } from '../../services/offlineStorage'
import { triggerSync } from '../../services/offlineSyncEngine'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { Issue } from '../../types'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Compass,
  Loader,
  MapPin,
  Sparkles,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react'

export function ContractorTaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Repair Upload State
  const [afterImageBase64, setAfterImageBase64] = useState<string | null>(null)
  const [afterImagePreview, setAfterImagePreview] = useState<string | null>(null)
  const [afterGps, setAfterGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // Live Photo Scanning & AI Verification States
  const [isScanning, setIsScanning] = useState(false)
  const [aiResult, setAiResult] = useState<PotholeAnalysisResult | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { user } = useAuth()

  const loadIssue = async (isSilent = false) => {
    if (!id) return
    try {
      if (!isSilent) setLoading(true)

      // Try IndexedDB cache first
      const cached = await getCachedIssueById(id)
      if (cached) {
        setIssue(cached)
      }

      if (navigator.onLine) {
        const data = await getIssueById(id)
        if (data) {
          setIssue(data)
          await updateCachedIssue(data)
        }
      }
    } catch (err: any) {
      console.warn('Network issue load failed, using cached task:', err.message)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  const handleCaptureGps = (silent = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!silent) toast.error('Geolocation Unsupported', 'Geolocation hardware or API is not supported by your browser.')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const roundedLat = Number(pos.coords.latitude.toFixed(6))
        const roundedLng = Number(pos.coords.longitude.toFixed(6))
        const acc = Math.round(pos.coords.accuracy)
        setAfterGps({
          lat: roundedLat,
          lng: roundedLng,
        })
        setGpsLoading(false)
        if (!silent) {
          toast.success(
            '📡 Repair GNSS GPS Captured',
            `Lat: ${roundedLat}, Lng: ${roundedLng} (Accuracy: ±${acc}m). Captured directly from device hardware.`
          )
        }
      },
      (err) => {
        console.warn('Geolocation capture error:', err.message)
        if (!silent) {
          toast.error('GPS Signal Failure', `Unable to acquire device GNSS signal: ${err.message}. Move to an open area and tap Auto-Capture GPS.`)
        }
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  useEffect(() => {
    loadIssue(false)
    // Auto-capture contractor's location on page load
    handleCaptureGps(true)

    const handleSyncEvent = (e: Event) => {
      const customEvt = e as CustomEvent
      if (!customEvt.detail || customEvt.detail.type === 'ITEM_SYNCED') {
        loadIssue(true)
      }
    }
    window.addEventListener('civicsync_sync_event', handleSyncEvent)
    return () => window.removeEventListener('civicsync_sync_event', handleSyncEvent)
  }, [id])

  const processAutoRepairSubmission = async (file: File) => {
    if (!issue) return
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid File', 'Please upload an image file (JPG, PNG, WebP).')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setAfterImagePreview(previewUrl)
    setAiResult(null)
    setIsScanning(true)
    setSubmitting(true)
    setError(null)

    // Ensure GPS is captured or acquire it
    let currentGps = afterGps
    if (!currentGps && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        currentGps = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
          )
        })
        if (currentGps) setAfterGps(currentGps)
      } catch (e) {
        console.warn('Auto GPS fetch during submission skipped:', e)
      }
    }

    const reader = new FileReader()
    reader.onload = async (evt) => {
      if (evt.target?.result) {
        const base64 = evt.target.result as string
        setAfterImageBase64(base64)

        if (!navigator.onLine) {
          try {
            const operationId = generateUUID()
            const deviceCapturedAt = new Date().toISOString()
            const rawBlob = base64ToBlob(base64)
            const compressedBlob = await compressImageIfNeeded(rawBlob)

            const queueItem: OfflineQueueItem = {
              operationId,
              userId: user?.id || 'contractor',
              userRole: 'contractor',
              actionType: 'SUBMIT_CONTRACTOR_PROOF',
              entityType: 'issue',
              entityId: issue.id,
              payload: {
                issueId: issue.id,
                afterGps: currentGps || { lat: issue.location.lat, lng: issue.location.lng },
              },
              photoBlob: compressedBlob,
              photoMetadata: {
                fileName: `repair_${issue.complaintId || issue.id}.jpg`,
                mimeType: 'image/jpeg',
                size: compressedBlob.size,
                capturedAt: deviceCapturedAt,
              },
              location: {
                latitude: currentGps?.lat || issue.location.lat,
                longitude: currentGps?.lng || issue.location.lng,
              },
              capturedAt: deviceCapturedAt,
              createdAt: deviceCapturedAt,
              status: 'WAITING_FOR_SYNC',
              retryCount: 0,
            }

            await saveOfflineQueueItem(queueItem)
            const updatedOffline = {
              ...issue,
              afterImage: base64,
              afterGps: currentGps || { lat: issue.location.lat, lng: issue.location.lng },
              status: 'repair_in_progress',
              isOfflinePending: true,
              syncStatus: 'WAITING_FOR_SYNC',
            }
            await updateCachedIssue(updatedOffline)
            setIssue(updatedOffline as any)
            toast.info(
              '📌 Repair Proof Saved Offline',
              'Your repair evidence is stored safely on this device. It will be uploaded automatically when network returns.'
            )
            triggerSync().catch(() => {})
          } catch (offlineErr: any) {
            toast.error('Offline Save Error', 'Could not store repair evidence in device storage.')
          } finally {
            setIsScanning(false)
            setSubmitting(false)
          }
          return
        }

        // Online Zero-Touch Submission & AI Verification
        try {
          const updated = await submitRepairEvidence(issue.id, base64, currentGps || undefined)
          setIssue(updated)
          await updateCachedIssue(updated)

          const res = updated.verificationResult?.overallResult || 'VERIFIED'
          if (res === 'VERIFIED' || updated.status === 'completed') {
            const successScan: PotholeAnalysisResult = {
              success: true,
              isPothole: true,
              confidence: updated.verificationResult?.overallConfidence || 95,
              severity: 'NORMAL',
              suggestedSeverity: 3,
              imageQuality: 'GOOD',
              clearEnough: true,
              isAiGenerated: false,
              reason: updated.verificationResult?.reasons?.join('. ') || 'Confirmed real road repair surface with asphalt patch completion. Work completed!',
              status: 'ACCEPTED',
              message: '✅ REPAIR VERIFIED & WORK COMPLETED!',
              analyzedBy: 'Multi-Signal AI Verification Engine',
            }
            setAiResult(successScan)
            toast.success(
              '🟢 REPAIR VERIFIED & COMPLETED',
              'Multi-signal AI verified location, landmarks, perspective & repair. Complaint closed automatically!'
            )
            setTimeout(() => {
              navigate('/contractor/dashboard')
            }, 3500)
          } else if (res === 'SUSPICIOUS') {
            const suspiciousScan: PotholeAnalysisResult = {
              success: false,
              isPothole: false,
              confidence: updated.verificationResult?.overallConfidence || 40,
              severity: 'NORMAL',
              suggestedSeverity: 3,
              imageQuality: 'POOR',
              clearEnough: false,
              isAiGenerated: false,
              reason: updated.verificationResult?.reasons?.join('. ') || 'Photo or location mismatch detected. Flagged for Admin exception review.',
              status: 'REJECTED',
              message: '❌ SUSPICIOUS REPAIR SUBMISSION',
              analyzedBy: 'Multi-Signal AI Verification Engine',
            }
            setAiResult(suspiciousScan)
            toast.error(
              '🔴 SUSPICIOUS REPAIR SUBMISSION',
              'Photo or location mismatch detected. Flagged for Admin exception review.'
            )
          } else {
            const uncertainScan: PotholeAnalysisResult = {
              success: true,
              isPothole: true,
              confidence: updated.verificationResult?.overallConfidence || 70,
              severity: 'NORMAL',
              suggestedSeverity: 3,
              imageQuality: 'GOOD',
              clearEnough: true,
              isAiGenerated: false,
              reason: updated.verificationResult?.reasons?.join('. ') || 'Camera angle or perspective shift detected. Sent to Admin exception review queue.',
              status: 'ACCEPTED',
              message: '🟡 SENT TO REVIEW',
              analyzedBy: 'Multi-Signal AI Verification Engine',
            }
            setAiResult(uncertainScan)
            toast.warning(
              '🟡 VERIFICATION UNCERTAIN',
              'Camera angle or perspective shift detected. Sent to Admin exception review queue.'
            )
          }
        } catch (err: any) {
          console.warn('Network repair evidence submission failed:', err)
          const errorReason = err.response?.data?.message || err.message || 'Upload a valid proof photo showing fixed road patch.'
          const failedScan: PotholeAnalysisResult = {
            success: false,
            isPothole: false,
            confidence: 20,
            severity: 'NORMAL',
            suggestedSeverity: 3,
            imageQuality: 'POOR',
            clearEnough: false,
            isAiGenerated: false,
            reason: errorReason,
            status: 'REJECTED',
            message: '❌ INVALID REPAIR PROOF',
            analyzedBy: 'Multi-Signal AI Verification Engine',
          }
          setAiResult(failedScan)
          toast.error('Upload a Valid Proof', errorReason)
        } finally {
          setIsScanning(false)
          setSubmitting(false)
        }
      }
    }
    reader.readAsDataURL(file)
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processAutoRepairSubmission(file)
    }
  }

  const triggerCameraInput = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="py-20 text-center text-slate-400">Loading task details...</div>
      </Layout>
    )
  }

  if (error || !issue) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <p className="text-rose-400">{error || 'Task not found'}</p>
          <button onClick={() => navigate('/contractor/dashboard')} className="btn-ghost mt-4">
            ← Back to Dashboard
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/contractor/dashboard')} className="btn-ghost text-xs">
              ← Back to Contractor Dashboard
            </button>
            <StatusBadge status={issue.status} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-amber-400">
                  {issue.complaintId || `PT-2026-${issue.id.slice(-5).toUpperCase()}`}
                </span>
                <h1 className="text-2xl font-bold text-slate-100">{issue.title}</h1>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                  {issue.location.address}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Severity Level</span>
                <span className="text-lg font-bold text-amber-400">{issue.severity} / 5</span>
              </div>
            </div>

            {/* Task Details Grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column: ORIGINAL Citizen Pothole Photo */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  BEFORE Photo (Original Citizen Report)
                </h2>

                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 border border-white/10 shadow-lg">
                  {issue.imageUrl ? (
                    <img src={issue.imageUrl} alt="Pothole Before" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      No Before Image
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-[0.7rem] font-bold text-amber-400">
                    BEFORE (Pothole Location)
                  </div>
                </div>

                <div className="rounded-xl bg-white/5 p-3 text-xs space-y-1 text-slate-300">
                  <p><strong className="text-slate-200">Description:</strong> {issue.description}</p>
                  <p><strong className="text-slate-200">Reported By:</strong> {issue.reporterName}</p>
                  <p><strong className="text-slate-200">Department:</strong> {issue.responsibleDepartment}</p>
                </div>
              </div>

              {/* Right Column: AFTER Photo Evidence & Zero-Touch Verification */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    AFTER Repair Photo Evidence
                  </span>
                  {!issue.afterImage && (
                    <span className="text-[10px] text-cyan-400 font-mono font-bold">Zero-Touch Auto Verification</span>
                  )}
                </h2>

                {/* If After photo already uploaded & verified */}
                {issue.afterImage && !afterImagePreview ? (
                  <div className="space-y-3">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 border border-emerald-500/30 shadow-lg">
                      <img src={issue.afterImage} alt="Repaired Road After" className="h-full w-full object-cover" />
                      <div className="absolute bottom-2 left-2 rounded bg-emerald-950/90 px-2 py-1 text-[0.7rem] font-bold text-emerald-300 border border-emerald-500/40">
                        AFTER REPAIR (Contractor Submission)
                      </div>
                    </div>
                    {issue.status === 'completed' && (
                      <div className="rounded-xl bg-emerald-950/80 border border-emerald-500/40 p-4 text-xs text-emerald-200 flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold text-emerald-300 text-sm">Work Verified & Done!</p>
                          <p className="text-emerald-200/80 text-[11px] mt-0.5">
                            Repair proof passed multi-signal AI verification. Complaint closed automatically.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Upload & Take Photo Buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={triggerCameraInput}
                        disabled={submitting || isScanning}
                        className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4 text-cyan-400" /> Take / Capture Photo
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={submitting || isScanning}
                        onChange={handleImageFileChange}
                        className="flex-1 text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-300 hover:file:bg-cyan-500/30 cursor-pointer disabled:opacity-50"
                      />
                    </div>

                    {/* Hidden Camera Input */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />

                    {/* Live Scanning Image Preview & Output Display */}
                    {(afterImagePreview || afterImageBase64) ? (
                      <div className="relative mt-2 rounded-2xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl transition-all">
                        {/* Uploaded Photo Image */}
                        <div className={`relative h-60 w-full overflow-hidden ${isScanning ? 'scanning-container' : ''}`}>
                          <img
                            src={afterImagePreview || afterImageBase64!}
                            alt="Repair Proof Preview"
                            className={`h-full w-full object-cover transition-all duration-500 ${
                              isScanning ? 'brightness-110 contrast-125' : 'brightness-100'
                            }`}
                          />

                          {/* Transparent Cybernetic HUD Target Overlay */}
                          <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                            {/* Top HUD Brackets */}
                            <div className="flex justify-between items-center text-cyan-400/80 font-mono text-[10px]">
                              <span className="border-t-2 border-l-2 border-cyan-400 w-5 h-5 rounded-tl-md"></span>
                              <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300 font-bold backdrop-blur-md">
                                {isScanning ? '⚡ AI AUTO-VERIFYING PROOF' : aiResult ? `AI STATUS: ${aiResult.status}` : 'PROOF UPLOADED'}
                              </span>
                              <span className="border-t-2 border-r-2 border-cyan-400 w-5 h-5 rounded-tr-md"></span>
                            </div>

                            {/* Center Target Reticle while Scanning */}
                            {isScanning && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-24 h-24 border border-dashed border-cyan-400/60 rounded-full animate-spin duration-3000 flex items-center justify-center">
                                  <div className="w-14 h-14 border border-cyan-400/40 rounded-full flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Bottom HUD Brackets & Live Status Bar */}
                            <div className="flex justify-between items-end">
                              <span className="border-b-2 border-l-2 border-cyan-400 w-5 h-5 rounded-bl-md"></span>
                              {isScanning && (
                                <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-xl border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-bold flex items-center gap-2 shadow-lg animate-pulse">
                                  <Loader className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                  <span>VERIFYING REPAIR & GEOMETRY MATCH...</span>
                                </div>
                              )}
                              <span className="border-b-2 border-r-2 border-cyan-400 w-5 h-5 rounded-br-md"></span>
                            </div>
                          </div>
                        </div>

                        {/* AI Verification Decision Banner */}
                        {!isScanning && aiResult && (
                          <div
                            className={`p-4 border-t text-xs space-y-2 transition-all animate-fade-in-up ${
                              aiResult.status === 'ACCEPTED'
                                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                                : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5 text-xs">
                                {aiResult.status === 'ACCEPTED' ? (
                                  <>
                                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                                    <span>🟢 REPAIR VERIFIED — WORK COMPLETED AUTOMATICALLY</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                                    <span>❌ INVALID REPAIR PROOF — REJECTED</span>
                                  </>
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-500/30">
                                {aiResult.confidence}% AI Match
                              </span>
                            </div>

                            <p className="text-slate-300 text-[11px] leading-relaxed font-medium">
                              {aiResult.reason}
                            </p>

                            {aiResult.status === 'ACCEPTED' ? (
                              <p className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1 pt-1">
                                <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" />
                                Redirecting to Contractor Dashboard in 3 seconds...
                              </p>
                            ) : (
                              <p className="text-rose-300 text-[10px] font-semibold pt-1">
                                ⚠️ Please select or capture a valid repair photo showing the fixed road surface.
                              </p>
                            )}

                            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/10 text-[10px] text-slate-400">
                              <span>Image Quality: <strong className="text-slate-200">{aiResult.imageQuality}</strong></span>
                              <span>Repair Signal: <strong className={aiResult.status === 'ACCEPTED' ? 'text-emerald-300' : 'text-rose-400'}>{aiResult.status === 'ACCEPTED' ? 'VERIFIED_SURFACE' : 'INVALID_PROOF'}</strong></span>
                              <span>Verification Engine: <strong className="text-violet-300">{aiResult.analyzedBy}</strong></span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-4 text-center">
                        <Upload className="h-8 w-8 text-slate-400 mb-2" />
                        <p className="text-xs text-slate-300 font-medium">Upload or Take Repaired Road Photo</p>
                        <p className="text-[0.7rem] text-slate-500">Zero-Touch: Select photo to auto-verify & complete task</p>
                      </div>
                    )}

                    {/* GPS Auto Capture */}
                    <div className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-xs">
                      <div>
                        <span className="text-slate-300 block font-medium">Contractor Auto-GNSS Location</span>
                        <span className="text-slate-500 text-[0.7rem]">
                          {afterGps ? `Lat: ${afterGps.lat}, Lng: ${afterGps.lng}` : gpsLoading ? 'Acquiring device GNSS...' : 'Auto-fetching on page load'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCaptureGps(false)}
                        disabled={gpsLoading}
                        className="btn-ghost text-xs flex items-center gap-1 text-cyan-300 cursor-pointer"
                      >
                        <Compass className="h-3.5 w-3.5" />
                        {gpsLoading ? 'Capturing...' : 'Re-Capture GPS'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI Verification Results Card */}
            {issue.verificationResult && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-cyan-400" />
                    AI Repair Verification Breakdown
                  </h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold border ${
                      issue.verificationResult.overallResult === 'VERIFIED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : issue.verificationResult.overallResult === 'SUSPICIOUS'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    RESULT: {issue.verificationResult.overallResult}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-lg bg-black/40 p-3 border border-white/5">
                    <span className="text-[0.7rem] text-slate-400 block">GPS Match</span>
                    <span className="text-base font-bold text-cyan-300">
                      {issue.verificationResult.gpsMatchScore ?? 0}%
                    </span>
                    <span className="text-[0.65rem] text-slate-500 block">
                      {issue.verificationResult.gpsDistanceMeters != null
                        ? `${issue.verificationResult.gpsDistanceMeters}m dist`
                        : 'GPS N/A'}
                    </span>
                  </div>

                  <div className="rounded-lg bg-black/40 p-3 border border-white/5">
                    <span className="text-[0.7rem] text-slate-400 block">Landmarks</span>
                    <span className="text-base font-bold text-purple-300">
                      {issue.verificationResult.backgroundScore ?? 0}%
                    </span>
                    <span className="text-[0.65rem] text-slate-500 block">
                      {issue.verificationResult.backgroundResult || issue.verificationResult.surroundingsStatus || 'MATCH'}
                    </span>
                  </div>

                  <div className="rounded-lg bg-black/40 p-3 border border-white/5">
                    <span className="text-[0.7rem] text-slate-400 block">Perspective</span>
                    <span className="text-base font-bold text-amber-300">
                      {issue.verificationResult.perspectiveScore ?? 0}%
                    </span>
                    <span className="text-[0.65rem] text-slate-500 block">
                      {issue.verificationResult.perspectiveResult || issue.verificationResult.cameraViewStatus || 'MATCH'}
                    </span>
                  </div>

                  <div className="rounded-lg bg-black/40 p-3 border border-white/5">
                    <span className="text-[0.7rem] text-slate-400 block">Repair Evidence</span>
                    <span className="text-base font-bold text-emerald-300">
                      {issue.verificationResult.repairEvidenceResult || (issue.verificationResult.potholeRepairStatus === 'CONFIRMED' ? 'REPAIRED' : 'UNCONFIRMED')}
                    </span>
                    <span className="text-[0.65rem] text-slate-500 block">Surface Patch</span>
                  </div>
                </div>

                {issue.verificationResult.reasons && (
                  <div className="space-y-1 text-xs text-slate-300 bg-black/30 p-3 rounded-lg border border-white/5">
                    <span className="font-semibold text-cyan-200 block mb-1">Verification Signals & Findings:</span>
                    {issue.verificationResult.reasons.map((reason, idx) => (
                      <p key={idx} className="flex items-center gap-1.5">
                        <span className="text-cyan-400">•</span> {reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    </Layout>
  )
}
