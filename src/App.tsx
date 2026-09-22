import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfigProvider } from './context/ConfigContext'
import { IssueProvider } from './context/IssueContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { OfflineProvider } from './context/OfflineContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'

// Core pages (loaded synchronously or fast)
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

// Single Unified Interactive Pothole Map Page
const PotholeMap = lazy(() => import('./pages/PotholeMap').then(m => ({ default: m.PotholeMap })))

// Lazy-loaded pages for optimal initial bundle size
const UserDashboard = lazy(() => import('./pages/user/Dashboard').then(m => ({ default: m.UserDashboard })))
const ReportIssue = lazy(() => import('./pages/user/ReportIssue').then(m => ({ default: m.ReportIssue })))
const MyIssues = lazy(() => import('./pages/user/MyIssues').then(m => ({ default: m.MyIssues })))

const ContractorDashboard = lazy(() => import('./pages/contractor/ContractorDashboard').then(m => ({ default: m.ContractorDashboard })))
const ContractorTaskDetail = lazy(() => import('./pages/contractor/ContractorTaskDetail').then(m => ({ default: m.ContractorTaskDetail })))

const UploadHistory = lazy(() => import('./pages/UploadHistory').then(m => ({ default: m.UploadHistory })))
const ChatHistory = lazy(() => import('./pages/ChatHistory').then(m => ({ default: m.ChatHistory })))
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const AdminIssues = lazy(() => import('./pages/admin/AdminIssues').then(m => ({ default: m.AdminIssues })))
const AdminIssueDetail = lazy(() => import('./pages/admin/AdminIssueDetail').then(m => ({ default: m.AdminIssueDetail })))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications').then(m => ({ default: m.AdminNotifications })))
const AdminUserManagement = lazy(() => import('./pages/admin/AdminUserManagement').then(m => ({ default: m.AdminUserManagement })))
const ContractorAnalytics = lazy(() => import('./pages/admin/ContractorAnalytics').then(m => ({ default: m.ContractorAnalytics })))
const ContractorWorkReports = lazy(() => import('./pages/admin/ContractorWorkReports').then(m => ({ default: m.ContractorWorkReports })))

function PageLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
        <span className="text-xs font-medium tracking-wide">Loading CivicSync...</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <IssueProvider>
            <ToastProvider>
              <ConfirmProvider>
                <OfflineProvider>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <Routes>
                      <Route path="/" element={<Landing />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      
                      {/* Unified Single Pothole Map Page */}
                      <Route path="/map" element={<PotholeMap />} />
                      
                      {/* Redirect legacy map routes to unified map */}
                      <Route path="/public-map" element={<Navigate to="/map" replace />} />
                      <Route path="/heatmap" element={<Navigate to="/map" replace />} />
                      <Route path="/nearby" element={<Navigate to="/map" replace />} />

                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute role="citizen">
                            <UserDashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/report"
                        element={
                          <ProtectedRoute role="citizen">
                            <ReportIssue />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/my-issues"
                        element={
                          <ProtectedRoute role="citizen">
                            <MyIssues />
                          </ProtectedRoute>
                        }
                      />

                      {/* Contractor Routes */}
                      <Route
                        path="/contractor/dashboard"
                        element={
                          <ProtectedRoute role="contractor">
                            <ContractorDashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/contractor/task/:id"
                        element={
                          <ProtectedRoute role="contractor">
                            <ContractorTaskDetail />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/uploads"
                        element={
                          <ProtectedRoute>
                            <UploadHistory />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/chat-history"
                        element={
                          <ProtectedRoute>
                            <ChatHistory />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/notifications"
                        element={
                          <ProtectedRoute>
                            <Notifications />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute role="admin">
                            <AdminDashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/users"
                        element={
                          <ProtectedRoute role="admin">
                            <AdminUserManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/issues"
                        element={
                          <ProtectedRoute role="admin">
                            <AdminIssues />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/issues/:id"
                        element={
                          <ProtectedRoute role="admin">
                            <AdminIssueDetail />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/contractors"
                        element={
                          <ProtectedRoute role="admin">
                            <ContractorAnalytics />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/contractor-reports"
                        element={
                          <ProtectedRoute role="admin">
                            <ContractorWorkReports />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/notifications"
                        element={
                          <ProtectedRoute role="admin">
                            <AdminNotifications />
                          </ProtectedRoute>
                        }
                      />

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </OfflineProvider>
              </ConfirmProvider>
            </ToastProvider>
          </IssueProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  )
}
