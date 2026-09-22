import { useState, useEffect } from 'react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { TrustScore } from '../../components/ui/TrustScore'
import { getAllUsers, updateUserRole } from '../../services/adminService'
import type { User, UserRole } from '../../types'
import { Search, UserCheck, Shield, HardHat, User as UserIcon, History, AlertCircle, RefreshCw } from 'lucide-react'
import { useToast } from '../../context/ToastContext'

const DEPARTMENTS = [
  'Roads & Bridges Department',
  'General Municipal Services',
  'Traffic & Signals Department',
  'Water & Sewage Department',
  'Electrical & Streetlights',
  'Solid Waste Management',
  'Building & Public Safety',
]

export function AdminUserManagement() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all')

  // Change Role Modal State
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [targetRole, setTargetRole] = useState<UserRole>('citizen')
  const [targetCompanyName, setTargetCompanyName] = useState<string>('')
  const [targetAssignedDepartment, setTargetAssignedDepartment] = useState<string>(DEPARTMENTS[0])
  const [reason, setReason] = useState<string>('')
  const [updating, setUpdating] = useState<boolean>(false)
  const [showConfirm, setShowConfirm] = useState<boolean>(false)

  // Role History Modal State
  const [historyUser, setHistoryUser] = useState<User | null>(null)

  const loadUsers = async () => {
    try {
      setLoading(true)
      const list = await getAllUsers(search, selectedRoleFilter)
      setUsers(list)
    } catch (err: any) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [search, selectedRoleFilter])

  useEffect(() => {
    if (selectedUser || historyUser) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [selectedUser, historyUser])

  const handleOpenRoleModal = (u: User) => {
    setSelectedUser(u)
    setTargetRole(u.role)
    setTargetCompanyName(u.companyName || `${u.name} Infra Services`)
    setTargetAssignedDepartment(u.assignedDepartment || DEPARTMENTS[0])
    setReason('')
    setShowConfirm(false)
  }

  const handleExecuteRoleChange = async () => {
    if (!selectedUser) return
    try {
      setUpdating(true)
      const res = await updateUserRole(selectedUser.id, {
        role: targetRole,
        companyName: targetRole === 'contractor' ? targetCompanyName : undefined,
        assignedDepartment: targetRole === 'contractor' ? targetAssignedDepartment : undefined,
        reason: reason || undefined,
      })
      toast.success('Role Updated', res.message)
      setSelectedUser(null)
      setShowConfirm(false)
      await loadUsers()
    } catch (err: any) {
      toast.error('Update Failed', err.message || 'Failed to update user role')
    } finally {
      setUpdating(false)
    }
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-bold text-violet-300 border border-violet-500/30"><Shield className="h-3.5 w-3.5" /> Administrator</span>
      case 'contractor':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-500/30"><HardHat className="h-3.5 w-3.5" /> Contractor</span>
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2.5 py-1 text-xs font-bold text-slate-300 border border-slate-500/30"><UserIcon className="h-3.5 w-3.5" /> Citizen</span>
    }
  }

  // Summary counts
  const totalCount = users.length
  const citizenCount = users.filter(u => u.role === 'citizen').length
  const contractorCount = users.filter(u => u.role === 'contractor').length
  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Shield className="h-6 w-6 text-cyan-400" />
                USER & ROLE MANAGEMENT
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Unified authorization engine for Citizens, Contractors, and Administrators.
              </p>
            </div>
            <button onClick={loadUsers} className="btn-ghost text-xs flex items-center gap-1.5 py-2 px-3 text-cyan-300">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh List
            </button>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-center">
            <div className="glass-card p-3.5 border-white/5">
              <span className="text-[0.7rem] uppercase font-bold text-slate-400">Total Registered</span>
              <span className="text-xl font-extrabold text-slate-100 block mt-1">{totalCount}</span>
            </div>
            <div className="glass-card p-3.5 border-slate-500/20">
              <span className="text-[0.7rem] uppercase font-bold text-slate-400">Citizens</span>
              <span className="text-xl font-extrabold text-slate-300 block mt-1">{citizenCount}</span>
            </div>
            <div className="glass-card p-3.5 border-amber-500/20">
              <span className="text-[0.7rem] uppercase font-bold text-amber-400">Contractors</span>
              <span className="text-xl font-extrabold text-amber-300 block mt-1">{contractorCount}</span>
            </div>
            <div className="glass-card p-3.5 border-violet-500/20">
              <span className="text-[0.7rem] uppercase font-bold text-violet-400">Administrators</span>
              <span className="text-xl font-extrabold text-violet-300 block mt-1">{adminCount}</span>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name, email, or User ID..."
                className="input-dark w-full pl-9 text-xs"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1 bg-black/40 p-1 rounded-xl border border-white/5 text-xs">
              {['all', 'citizen', 'contractor', 'admin'].map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    selectedRoleFilter === r
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r === 'all' ? 'All Roles' : r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* User List Table */}
          <div className="glass-card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading user registry...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No users found matching query.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/40 text-slate-400 border-b border-white/5 uppercase text-[0.68rem] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">User Info</th>
                      <th className="py-3 px-4">Current Role</th>
                      <th className="py-3 px-4">Department / Company</th>
                      <th className="py-3 px-4">Trust & Reports</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-200">{u.name}</div>
                          <div className="text-[0.68rem] text-slate-400 font-mono">{u.email}</div>
                          <div className="text-[0.65rem] text-slate-500 font-mono">ID: {u.id}</div>
                        </td>
                        <td className="py-3 px-4">{getRoleBadge(u.role)}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {u.role === 'contractor' && (
                            <div>
                              <div className="font-bold text-amber-300">{u.companyName || 'Infra Services'}</div>
                              <div className="text-[0.68rem] text-slate-400">{u.assignedDepartment || 'Roads'}</div>
                            </div>
                          )}
                          {u.role === 'citizen' && <span className="text-slate-500">—</span>}
                          {u.role === 'admin' && <span className="text-violet-300 font-medium">Central System Operations</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <TrustScore score={u.trustScore} />
                            <span className="text-slate-400 text-[0.68rem]">({u.totalReports} reports)</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => setHistoryUser(u)}
                            className="px-2.5 py-1 text-[0.68rem] rounded-lg border border-slate-500/30 text-slate-300 hover:text-white bg-slate-800/50"
                          >
                            <History className="h-3 w-3 inline mr-1" /> Role History
                          </button>
                          <button
                            onClick={() => handleOpenRoleModal(u)}
                            className="px-3 py-1 text-xs font-bold rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                          >
                            Change Role
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>

      {/* Change Role Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-5 border-cyan-500/30 my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-cyan-400" /> Change User Role
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <div className="font-bold text-slate-200">{selectedUser.name}</div>
              <div className="text-xs text-slate-400">{selectedUser.email}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                <span>Current Role:</span> {getRoleBadge(selectedUser.role)}
              </div>
            </div>

            {!showConfirm ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-2">Select Target Role</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { r: 'citizen', label: 'Citizen', icon: UserIcon, color: 'border-slate-500/40' },
                      { r: 'contractor', label: 'Contractor', icon: HardHat, color: 'border-amber-500/40' },
                      { r: 'admin', label: 'Admin', icon: Shield, color: 'border-violet-500/40' },
                    ].map(({ r, label, icon: Icon, color }) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setTargetRole(r as UserRole)}
                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${color} ${
                          targetRole === r ? 'bg-cyan-500/20 text-white font-bold ring-2 ring-cyan-400' : 'bg-black/20 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contractor Fields */}
                {targetRole === 'contractor' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">Company / Infra Firm Name</label>
                      <input
                        type="text"
                        value={targetCompanyName}
                        onChange={(e) => setTargetCompanyName(e.target.value)}
                        placeholder="e.g. Apex Infra Repairs Ltd"
                        className="input-dark w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">Assigned Department Category</label>
                      <select
                        value={targetAssignedDepartment}
                        onChange={(e) => setTargetAssignedDepartment(e.target.value)}
                        className="input-dark w-full text-xs"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Change Reason / Audit Note (Optional)</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Approved contractor onboarding request"
                    className="input-dark w-full text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setSelectedUser(null)} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="btn-primary flex-1 py-2 text-xs font-bold"
                  >
                    Review & Confirm →
                  </button>
                </div>
              </div>
            ) : (
              /* Confirmation Screen */
              <div className="space-y-4 text-xs">
                <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="h-4 w-4" /> Confirm Role Transition
                  </div>
                  <p className="text-slate-300">
                    Are you sure you want to change <strong>{selectedUser.name}</strong>'s role from <strong>{selectedUser.role}</strong> to <strong>{targetRole}</strong>?
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowConfirm(false)} className="btn-ghost flex-1 py-2 text-xs">
                    ← Back
                  </button>
                  <button
                    onClick={handleExecuteRoleChange}
                    disabled={updating}
                    className="btn-primary flex-1 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {updating ? 'Saving Role...' : '✓ Confirm Role Change'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role History Drawer Modal */}
      {historyUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-fade-in">
          <div className="glass-card max-w-lg w-full p-6 space-y-4 border-purple-500/30 my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <History className="h-5 w-5 text-purple-400" /> Role Audit History Log
              </h3>
              <button onClick={() => setHistoryUser(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="text-xs text-slate-300">
              User: <strong>{historyUser.name}</strong> ({historyUser.email})
            </div>

            {historyUser.roleHistory && historyUser.roleHistory.length > 0 ? (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {historyUser.roleHistory.map((h, idx) => (
                  <div key={idx} className="bg-black/30 p-3 rounded-lg border border-white/5 text-xs space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span className="font-mono text-[0.68rem]">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="text-purple-300">By: {h.changedBy}</span>
                    </div>
                    <div className="font-bold text-slate-200">
                      {h.previousRole.toUpperCase()} → <span className="text-cyan-300">{h.newRole.toUpperCase()}</span>
                    </div>
                    {h.reason && <div className="text-[0.68rem] text-slate-400 italic">Note: {h.reason}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">No role history logs recorded for this account.</div>
            )}

            <button onClick={() => setHistoryUser(null)} className="btn-ghost w-full py-2 text-xs">Close History</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
