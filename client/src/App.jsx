import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCheck, CheckCircle2, ChevronDown, ClipboardList,
  Clock3, Command, Download, FileText, FolderKanban, Image, LayoutDashboard,
  LogOut, Menu, MoreHorizontal, Paperclip, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, Users, X,
} from 'lucide-react'
import { api, apiFile } from './lib/api'
import './App.css'
import './Members.css'
import './Attachments.css'
import './GoogleAuth.css'

const AuthContext = createContext(null)
const SocketContext = createContext(null)
const SearchContext = createContext('')
const useAuth = () => useContext(AuthContext)
const useSocket = () => useContext(SocketContext)
const initials = (name = '') => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const dateLabel = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'No date'
const fileSizeLabel = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}
const todayLabel = () => new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('teamflow-user') || 'null') } catch { return null }
  })
  const [ready, setReady] = useState(() => !localStorage.getItem('teamflow-token'))
  useEffect(() => {
    const token = localStorage.getItem('teamflow-token')
    if (!token) return
    api('/auth/me').then(({ user: current }) => {
      setUser(current)
      localStorage.setItem('teamflow-user', JSON.stringify(current))
    }).catch((error) => {
      if (error.status === 401) {
        localStorage.removeItem('teamflow-token')
        localStorage.removeItem('teamflow-user')
        setUser(null)
      }
    }).finally(() => setReady(true))
  }, [])
  const signIn = (data) => {
    localStorage.setItem('teamflow-token', data.token)
    localStorage.setItem('teamflow-user', JSON.stringify(data.user))
    setUser(data.user)
  }
  const signOut = () => {
    localStorage.removeItem('teamflow-token')
    localStorage.removeItem('teamflow-user')
    setUser(null)
  }
  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>
}

function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)
  useEffect(() => {
    if (!user) return undefined
    const connection = io(import.meta.env.VITE_API_URL || window.location.origin, {
      path: '/socket.io',
      auth: { token: localStorage.getItem('teamflow-token') },
      reconnection: true,
      autoConnect: false,
    })
    connection.on('connect', () => setSocket(connection))
    connection.on('disconnect', () => setSocket(null))
    connection.connect()
    return () => { connection.disconnect(); setSocket(null) }
  }, [user])
  return <SocketContext.Provider value={user ? socket : null}>{children}</SocketContext.Provider>
}

function Protected({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="loading-screen"><div className="brand-mark">T</div><span className="loader" />Getting your workspace ready</div>
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />
}

function App() {
  return <BrowserRouter><AuthProvider><RealtimeProvider><Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/" element={<Protected><Shell /></Protected>}>
      <Route index element={<Dashboard />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/:projectId" element={<ProjectPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></RealtimeProvider></AuthProvider></BrowserRouter>
}

function AuthPage({ mode }) {
  const register = mode === 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submissionRef = useRef(false)
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (user) return <Navigate to="/" replace />
  async function submit(event) {
    event.preventDefault()
    if (submissionRef.current) return
    submissionRef.current = true
    setError('')
    setBusy(true)
    try {
      const { user: nextUser, token } = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify(form),
      })
      signIn({ user: nextUser, token })
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (reason) {
      setError(reason.message)
    } finally {
      submissionRef.current = false
      setBusy(false)
    }
  }
  async function submitGoogle(credential) {
    if (submissionRef.current) return
    submissionRef.current = true
    setError('')
    setBusy(true)
    try {
      const { user: nextUser, token } = await api('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, intent: register ? 'register' : 'login' }),
      })
      signIn({ user: nextUser, token })
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (reason) {
      setError(reason.message)
    } finally {
      submissionRef.current = false
      setBusy(false)
    }
  }
  return <main className="auth-layout">
    <section className="auth-story">
      <Link className="brand" to="/"><span className="brand-mark">T</span><span>teamflow</span></Link>
      <div className="story-content">
        <span className="eyebrow light-eyebrow"><Sparkles size={14} /> YOUR TEAM, IN SYNC</span>
        <h1>Make great work<br />happen <em>together.</em></h1>
        <p>One calm, clear place to plan projects, bring your people together, and get meaningful work done.</p>
        <div className="story-proof"><span className="story-proof-icon"><Users size={17} /></span><div><strong>Made for teams that care</strong><span>Thoughtful work starts here</span></div></div>
      </div>
      <div className="story-footer"><span>© 2026 TeamFlow</span><span>Work, in good company.</span></div>
      <div className="story-orb orb-one" /><div className="story-orb orb-two" />
    </section>
    <section className="auth-form-side">
      <div className="auth-form-wrap">
        <div className="mobile-brand"><Link className="brand" to="/"><span className="brand-mark">T</span><span>teamflow</span></Link></div>
        <div className="auth-heading"><div className="auth-icon"><ShieldCheck size={20} /></div><span className="eyebrow">A FRESH START FOR YOUR TEAM</span><h2>{register ? 'Create your workspace' : 'Welcome back'}</h2><p>{register ? 'Set up your account and get your projects moving.' : 'Sign in to pick up right where your team left off.'}</p></div>
        <GoogleButton onCredential={submitGoogle} disabled={busy} />
        <div className="auth-divider"><span>or continue with email</span></div>
        <form className="form-stack" onSubmit={submit}>
          {register && <label>Your name<input required autoComplete="name" minLength="2" maxLength="100" placeholder="e.g. Jordan Lee" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}
          <label>Email address<input required type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Password<input required type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} maxLength="72" placeholder={register ? 'At least 8 characters' : 'Enter your password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
        </form>
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to TeamFlow?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create your account'}</Link></p>
        <div className="auth-assurance"><ShieldCheck size={14} /> Your work is private and secure</div>
      </div>
      <span className="auth-corner">Made for focused work <span>✳</span></span>
    </section>
  </main>
}

let googleIdentityPromise

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (!googleIdentityPromise) {
    googleIdentityPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => {
        if (window.google?.accounts?.id) resolve(window.google)
        else {
          googleIdentityPromise = null
          reject(new Error('Google Sign-In could not be initialized. Please retry.'))
        }
      }
      script.onerror = () => {
        googleIdentityPromise = null
        reject(new Error('Google Sign-In could not be loaded. Check your connection and retry.'))
      }
      document.head.appendChild(script)
    })
  }
  return googleIdentityPromise
}

function GoogleButton({ onCredential, disabled = false }) {
  const containerRef = useRef(null)
  const callbackRef = useRef(onCredential)
  const [loadError, setLoadError] = useState('')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  useEffect(() => { callbackRef.current = onCredential }, [onCredential])
  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined
    let mounted = true
    loadGoogleIdentity().then((google) => {
      if (!mounted || !containerRef.current) return
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) callbackRef.current(response.credential)
        },
        auto_select: false,
      })
      google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(365, containerRef.current.clientWidth || 365),
      })
    }).catch((reason) => {
      if (mounted) setLoadError(reason.message)
    })
    return () => { mounted = false }
  }, [clientId])
  return <div className="google-signin-wrap">
    {clientId ? <div ref={containerRef} className={`google-signin-widget ${disabled ? 'google-signin-disabled' : ''}`} aria-disabled={disabled} /> :
      <button type="button" className="google-placeholder-button" disabled><GoogleGlyph /> Continue with Google</button>}
    {!clientId && <p className="google-config-hint">Set VITE_GOOGLE_CLIENT_ID to enable Google Sign-In.</p>}
    {loadError && <p className="google-config-hint google-load-error" role="status">{loadError}</p>}
  </div>
}

function GoogleGlyph() {
  return <svg className="google-glyph" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18l6.8-5.2Z" /><path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z" /></svg>
}

function Avatar({ name, color = 'green', size = '' }) {
  return <span aria-label={name} title={name} className={`avatar avatar-${color} ${size ? `avatar-${size}` : ''}`}>{initials(name)}</span>
}

const navItems = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'My projects', to: '/projects', icon: FolderKanban },
]

function Shell() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [linkGoogleOpen, setLinkGoogleOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const socket = useSocket()
  const location = useLocation()
  const searchInputRef = useRef(null)
  const activeProject = location.pathname.startsWith('/projects/')
  const activeTitle = activeProject ? 'Project workspace' : location.pathname === '/projects' ? 'Projects' : 'Overview'
  async function loadNotifications() {
    try {
      const data = await api('/notifications')
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
      setError('')
    } catch (reason) { setError(reason.message) }
  }
  useEffect(() => {
    let mounted = true
    api('/notifications').then((data) => {
      if (mounted) { setNotifications(data.notifications); setUnreadCount(data.unreadCount) }
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  useEffect(() => {
    if (!socket) return undefined
    socket.on('notification:new', loadNotifications)
    return () => socket.off('notification:new', loadNotifications)
  }, [socket])
  async function markRead(id = 'all') {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' })
      await loadNotifications()
    } catch (reason) { setError(reason.message) }
  }
  const unread = unreadCount
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <Link className="brand sidebar-brand" to="/"><span className="brand-mark">T</span><span>teamflow</span></Link>
      <div className="workspace-switch"><span className="workspace-logo">T</span><span className="workspace-label"><strong>My workspace</strong><small>TeamFlow</small></span><ChevronDown size={15} /></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(({ label, to, icon: Icon }) => <Link key={to} className={`nav-link ${(to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)) ? 'nav-active' : ''}`} to={to} onClick={() => setMenuOpen(false)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'My projects' && <span className="nav-count">↗</span>}</Link>)}</nav>
      <div className="side-section-title"><span>YOUR PROJECTS</span><Link to="/projects" title="All projects"><Plus size={16} /></Link></div>
      <ProjectQuickList />
      <div className="sidebar-bottom">
        <div className="user-profile"><Avatar name={user?.name || 'Team Member'} color="green" /><div className="user-label"><strong>{user?.name}</strong><small>{user?.email}</small></div><button aria-label="Account menu" className="icon-button" onClick={() => setAccountMenuOpen(!accountMenuOpen)}><MoreHorizontal size={19} /></button></div>
        {accountMenuOpen && <div className="signout-menu account-menu">
          <button onClick={() => { setAccountMenuOpen(false); setLinkGoogleOpen(true) }}><GoogleGlyph /> Link Google account</button>
          <button onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>}
      </div>
    </aside>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button menu-trigger" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeTitle}</strong></div>
        <div className="topbar-actions"><div className="search-box"><Search size={16} /><input ref={searchInputRef} placeholder="Search this view..." aria-label="Search this view" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /><kbd><Command size={11} /> K</kbd></div>
          <span className="topbar-divider" /><button className={`icon-button notification-button ${notificationsOpen ? 'icon-selected' : ''}`} aria-label="Notifications" onClick={() => { setNotificationsOpen(!notificationsOpen); if (!notificationsOpen) loadNotifications() }}><Bell size={19} />{unread > 0 && <span className="notification-dot">{unread > 9 ? '9+' : unread}</span>}</button>
          <Avatar name={user?.name || 'Team Member'} color="green" />
        </div>
      </header>
      {notificationsOpen && <div className="notification-popover">
        <div className="popover-heading"><div><strong>Notifications</strong><span>{unread ? `${unread} unread` : 'You’re all caught up'}</span></div><button className="text-button" onClick={() => markRead()}>Mark all read</button></div>
        <div className="notification-list">{notifications.length ? notifications.map((item) => <button className={`notification-item ${item.is_read ? '' : 'notification-unread'}`} key={item.id} onClick={async () => { if (!item.is_read) await markRead(item.id); setNotificationsOpen(false); if (item.project_id) window.location.href = `/projects/${item.project_id}` }}>
          <span className="notification-icon"><Activity size={16} /></span><span><strong>{item.message}</strong><small>{new Date(item.created_at).toLocaleString()}</small></span>{!item.is_read && <span className="unread-indicator" />}
        </button>) : <div className="empty-notifications"><Bell size={21} /><p>No notifications yet</p><small>Updates about your projects will show here.</small></div>}</div>
        {error && <p className="inline-error">{error}</p>}
      </div>}
      <SearchContext.Provider value={globalSearch}><div className="page-content" onClick={() => notificationsOpen && setNotificationsOpen(false)}><Outlet /></div></SearchContext.Provider>
    </main>
    {linkGoogleOpen && <LinkGoogleDialog onClose={() => setLinkGoogleOpen(false)} />}
  </div>
}

function LinkGoogleDialog({ onClose }) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const submissionRef = useRef(false)
  async function linkGoogle(credential) {
    if (submissionRef.current) return
    submissionRef.current = true
    setBusy(true)
    setError('')
    try {
      await api('/auth/google/link', { method: 'POST', body: JSON.stringify({ credential }) })
      setSuccess(true)
    } catch (reason) {
      setError(reason.message)
    } finally {
      submissionRef.current = false
      setBusy(false)
    }
  }
  return <Modal title={success ? 'Google account linked' : 'Link your Google account'} subtitle={success ? 'You can now use Google Sign-In for this TeamFlow account.' : 'Verify with Google using the same email address as your TeamFlow account.'} onClose={onClose}>
    {success ? <div className="google-link-success"><CheckCircle2 size={22} /><p>Your Google account is linked securely.</p><button className="button button-primary" onClick={onClose}>Done</button></div> : <div className="google-link-form">
      <GoogleButton onCredential={linkGoogle} disabled={busy} />
      {busy && <p className="google-config-hint">Verifying your Google account…</p>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </div>}
  </Modal>
}

function ProjectQuickList() {
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    api('/projects').then((data) => {
      if (mounted) setProjects(data.projects)
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [])
  return <div className="quick-projects">{projects.slice(0, 5).map((project, index) => <Link className="quick-project" key={project.id} to={`/projects/${project.id}`}><span className={`project-dot dot-${index % 4}`} /><span>{project.title}</span><ArrowUpRight size={13} /></Link>)}{projects.length > 5 && <Link className="quick-project more-projects" to="/projects">+ {projects.length - 5} more</Link>}{error && <span className="quick-project-error" title={error}>Projects unavailable</span>}</div>
}

function Dashboard() {
  const { user } = useAuth()
  const search = useContext(SearchContext).trim().toLowerCase()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  async function load() {
    try { setData(await api('/notifications/dashboard')); setError('') } catch (reason) { setError(reason.message) }
  }
  useEffect(() => {
    let mounted = true
    api('/notifications/dashboard').then((result) => {
      if (mounted) { setData(result); setError('') }
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [])
  if (error && !data) return <ErrorState error={error} retry={load} />
  if (!data) return <LoadingState />
  const counts = data.taskCounts || {}
  const tasksTotal = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const recentProjects = data.projects.filter((project) => project.title.toLowerCase().includes(search))
  const assignedTasks = data.tasks.filter((task) => `${task.title} ${task.project_title}`.toLowerCase().includes(search))
  return <div className="dashboard-page">
    <div className="welcome-row"><div><span className="eyebrow"><span className="eyebrow-dot" /> {todayLabel()}</span><h1>{greeting()}, {user?.name?.split(' ')[0]} <span className="wave">✳</span></h1><p>Here’s what’s happening across your workspace today.</p></div><button className="button button-primary" onClick={() => setModal(true)}><Plus size={17} /> New project</button></div>
    {error && <div className="form-error page-error">{error}</div>}
    <section className="stats-grid">
      <StatCard label="Assigned to me" value={tasksTotal} icon={ClipboardList} color="stat-green" note={`${counts.todo || 0} to do`} />
      <StatCard label="In progress" value={counts.in_progress || 0} icon={Activity} color="stat-yellow" note="Keep the momentum" />
      <StatCard label="Completed" value={counts.done || 0} icon={CheckCircle2} color="stat-blue" note="Nice work, team" />
      <StatCard label="My projects" value={data.projects.length} icon={FolderKanban} color="stat-purple" note="Across your workspace" />
    </section>
    <div className="dashboard-columns">
      <section className="panel projects-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Recent projects</h2></div><Link className="subtle-link" to="/projects">View all <ArrowRight size={15} /></Link></div>
        {recentProjects.length ? <div className="recent-project-list">{recentProjects.slice(0, 4).map((project, index) => <ProjectRow key={project.id} project={project} index={index} />)}</div> : <EmptyState icon={FolderKanban} title={search ? 'No matching projects' : 'A fresh start'} message={search ? 'Try a different search.' : 'Create a project and bring your team’s work together.'} action={search ? undefined : 'Create a project'} onAction={() => setModal(true)} />}
      </section>
      <section className="panel focus-panel"><div className="panel-heading"><div><span className="eyebrow">ON YOUR PLATE</span><h2>My tasks</h2></div><span className="small-pill">{data.tasks.length} upcoming</span></div>
        {assignedTasks.length ? <div className="focus-task-list">{assignedTasks.map((task) => <Link className="focus-task" to={`/projects/${task.project_id}`} key={task.id}><span className={`task-check ${task.status === 'done' ? 'task-check-done' : ''}`}>{task.status === 'done' && <Check size={12} />}</span><span className="focus-task-copy"><strong>{task.title}</strong><small>{task.project_title}</small></span><span className={`priority-dot priority-${task.priority}`} title={task.priority} /><span className="task-date">{dateLabel(task.due_date)}</span></Link>)}</div> : <EmptyState icon={CheckCheck} title={search ? 'No matching tasks' : 'Clear head, full heart'} message={search ? 'Try a different search.' : 'Tasks assigned to you will appear here.'} />}
        {assignedTasks.length > 0 && <Link className="focus-footer" to="/projects">See all projects <ArrowRight size={14} /></Link>}
      </section>
    </div>
    <section className="bottom-note"><span className="note-icon"><Sparkles size={17} /></span><span><strong>Small steps add up.</strong> Your team's focus is your superpower.</span><span className="note-decoration">✳</span></section>
    {modal && <ProjectModal onClose={() => setModal(false)} onSaved={(project) => { setModal(false); window.location.href = `/projects/${project.id}` }} />}
  </div>
}

function StatCard({ label, value, icon: Icon, color, note }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={17} /></span></div><div className="stat-value">{value}<ArrowUpRight size={16} /></div><small>{note}</small></div>
}

function ProjectRow({ project, index = 0 }) {
  const percentage = project.task_count ? Math.round((Number(project.completed_count || 0) / Number(project.task_count)) * 100) : 0
  return <Link className="project-row" to={`/projects/${project.id}`}><span className={`project-emblem emblem-${index % 4}`}><FolderKanban size={17} /></span><span className="project-row-main"><strong>{project.title}</strong><small>{project.member_count} {project.member_count === 1 ? 'member' : 'members'} <span>·</span> Updated {new Date(project.updated_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</small></span><span className="project-progress"><span><span style={{ width: `${percentage}%` }} /></span><small>{percentage}%</small></span><ArrowRight className="project-row-arrow" size={16} /></Link>
}

function ProjectsPage() {
  const search = useContext(SearchContext).trim().toLowerCase()
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const load = useCallback(async () => {
    try { const result = await api('/projects'); setProjects(result.projects); setError('') } catch (reason) { setError(reason.message) }
  }, [])
  useEffect(() => {
    let mounted = true
    api('/projects').then((result) => {
      if (mounted) { setProjects(result.projects); setError('') }
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [])
  if (!projects && error) return <ErrorState error={error} retry={load} />
  if (!projects) return <LoadingState />
  const visibleProjects = projects.filter((project) => `${project.title} ${project.description}`.toLowerCase().includes(search))
  return <div className="projects-page"><div className="page-title-row"><div><span className="eyebrow"><span className="eyebrow-dot" /> COLLABORATE WITH CLARITY</span><h1>Your projects</h1><p>All your team's work, organized in one place.</p></div><button className="button button-primary" onClick={() => setModal(true)}><Plus size={17} /> New project</button></div>
    {error && <div className="form-error page-error">{error}</div>}
    {visibleProjects.length ? <div className="project-cards">{visibleProjects.map((project, index) => <ProjectCard key={project.id} project={project} index={index} />)}{!search && <button className="new-project-card" onClick={() => setModal(true)}><span><Plus size={19} /></span><strong>Start something new</strong><small>Make space for your next great idea</small></button>}</div> : search ? <div className="projects-empty"><div className="empty-illustration"><Search size={23} /></div><h2>No projects match that search.</h2><p>Try another title or project description.</p></div> :
      <div className="projects-empty"><div className="empty-illustration"><FolderKanban size={26} /></div><span className="eyebrow">A LITTLE ROOM TO GROW</span><h2>Your first project starts here.</h2><p>Create a home for the work you and your team want to make happen.</p><button className="button button-primary" onClick={() => setModal(true)}><Plus size={17} /> Create your first project</button></div>}
    {modal && <ProjectModal onClose={() => setModal(false)} onSaved={(project) => { setModal(false); window.location.href = `/projects/${project.id}` }} />}
  </div>
}

function ProjectCard({ project, index }) {
  const percentage = project.task_count ? Math.round((Number(project.completed_count || 0) / Number(project.task_count)) * 100) : 0
  return <Link className="project-card" to={`/projects/${project.id}`}><div className={`project-card-banner banner-${index % 4}`}><span className={`project-emblem emblem-${index % 4}`}><FolderKanban size={18} /></span><span className={`status-badge status-${project.status}`}>{project.status.replace('-', ' ')}</span><span className="card-decoration">{['✳', '✿', '◌', '✧'][index % 4]}</span></div><div className="project-card-body"><h3>{project.title}</h3><p>{project.description || 'A shared space for thoughtful work and great ideas.'}</p><div className="card-meta"><span><Users size={14} /> {project.member_count} members</span><span><ClipboardList size={14} /> {project.task_count} tasks</span></div><div className="card-progress-label"><span>Progress</span><strong>{percentage}%</strong></div><div className="progress-track"><span style={{ width: `${percentage}%` }} /></div><div className="card-updated"><Clock3 size={13} /> Updated {new Date(project.updated_at).toLocaleDateString('en', { month: 'long', day: 'numeric' })}<span className="card-open">Open board <ArrowRight size={14} /></span></div></div></Link>
}

function ProjectModal({ onClose, onSaved, project = null }) {
  const [form, setForm] = useState({ title: project?.title || '', description: project?.description || '', status: project?.status || 'active' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api(project ? `/projects/${project.id}` : '/projects', { method: project ? 'PATCH' : 'POST', body: JSON.stringify(form) })
      onSaved(result.project)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Modal title={project ? 'Project settings' : 'Create a project'} subtitle={project ? 'Keep your project details up to date.' : 'Give your team a place to do meaningful work.'} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}><label>Project name<input autoFocus required maxLength="160" placeholder="e.g. Website refresh" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>A little context <span className="optional-label">OPTIONAL</span><textarea rows="3" maxLength="5000" placeholder="What are you hoping to make happen?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label>Project status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="planning">Planning</option><option value="on-hold">On hold</option><option value="completed">Completed</option></select></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}<ArrowRight size={15} /></button></div></form>
  </Modal>
}

function ProjectPage() {
  const { projectId } = useParams()
  const globalSearch = useContext(SearchContext).trim().toLowerCase()
  const { user } = useAuth()
  const socket = useSocket()
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [filter, setFilter] = useState({ status: 'all', priority: 'all', assignee: 'all' })
  const [search, setSearch] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [loadedProjectId, setLoadedProjectId] = useState(null)
  const isOwner = Number(project?.owner_id) === Number(user?.id)
  const loadProject = useCallback(async () => {
    try {
      const [projectData, taskData] = await Promise.all([api(`/projects/${projectId}`), api(`/projects/${projectId}/tasks`)])
      setProject(projectData.project)
      setTasks(taskData.tasks)
      setLoadedProjectId(projectId)
      setError('')
    } catch (reason) { setError(reason.message) }
  }, [projectId])
  useEffect(() => {
    let mounted = true
    Promise.all([api(`/projects/${projectId}`), api(`/projects/${projectId}/tasks`)]).then(([projectData, taskData]) => {
      if (mounted) {
        setProject(projectData.project)
        setTasks(taskData.tasks)
        setLoadedProjectId(projectId)
        setError('')
      }
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [projectId])
  useEffect(() => {
    if (!socket) return undefined
    socket.emit('project:join', Number(projectId))
    const refresh = () => loadProject()
    socket.on('task:created', refresh)
    socket.on('task:updated', refresh)
    socket.on('task:deleted', refresh)
    socket.on('project:member-added', refresh)
    socket.on('project:member-removed', refresh)
    const accessDenied = () => setError('You no longer have access to this project.')
    const joinError = ({ message }) => setError(message)
    const accessRevoked = ({ projectId: revokedId }) => {
      if (Number(revokedId) === Number(projectId)) {
        setProject(null)
        setTasks(null)
        setLoadedProjectId(null)
        setError('You no longer have access to this project.')
      }
    }
    socket.on('project:access-denied', accessDenied)
    socket.on('project:join-error', joinError)
    socket.on('project:access-revoked', accessRevoked)
    return () => {
      socket.emit('project:leave', Number(projectId))
      socket.off('task:created', refresh); socket.off('task:updated', refresh); socket.off('task:deleted', refresh)
      socket.off('project:member-added', refresh); socket.off('project:member-removed', refresh)
      socket.off('project:access-denied', accessDenied); socket.off('project:join-error', joinError)
      socket.off('project:access-revoked', accessRevoked)
    }
  }, [socket, projectId, loadProject])
  if (error && (!project || loadedProjectId !== projectId)) return <ErrorState error={error} retry={loadProject} />
  if (!project || !tasks || loadedProjectId !== projectId) return <LoadingState />
  const visibleTasks = tasks.filter((task) =>
    (filter.status === 'all' || task.status === filter.status) &&
    (filter.priority === 'all' || task.priority === filter.priority) &&
    (filter.assignee === 'all' || String(task.assignee_id || '') === filter.assignee) &&
    `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase()) &&
    `${task.title} ${task.description}`.toLowerCase().includes(globalSearch),
  )
  const statusColumns = [{ id: 'todo', label: 'To do', color: 'column-gray' }, { id: 'in_progress', label: 'In progress', color: 'column-amber' }, { id: 'done', label: 'Done', color: 'column-green' }]
  async function moveTask(taskId, status) {
    try { await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) }) } catch (reason) { setError(reason.message) }
  }
  async function deleteProject() {
    try { await api(`/projects/${projectId}`, { method: 'DELETE' }); window.location.href = '/projects' } catch (reason) { setError(reason.message); setConfirmingDelete(false) }
  }
  return <div className="project-page">
    <Link to="/projects" className="back-link"><ArrowLeft size={15} /> All projects</Link>
    <section className="project-hero"><div className="project-hero-main"><span className={`project-emblem emblem-${Number(project.id) % 4}`}><FolderKanban size={18} /></span><div><span className={`status-badge status-${project.status}`}>{project.status.replace('-', ' ')}</span><h1>{project.title}</h1><p>{project.description || 'A shared space for thoughtful work and great ideas.'}</p></div></div><div className="project-hero-actions"><div className="avatar-stack project-avatars">{project.members.map((member, index) => <Avatar key={member.id} name={member.name} color={['green', 'lilac', 'peach', 'blue'][index % 4]} />)}<span className="member-count">{project.members.length} people</span></div>{isOwner && <div className="project-settings"><button className="button button-secondary" onClick={() => setModal('members')}><Users size={15} /> People</button><button className="button button-secondary" onClick={() => setModal('edit')}><Settings2 size={15} /> Settings</button><button className="icon-button" aria-label="Delete project" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /></button></div>}</div></section>
    {error && <div className="form-error page-error">{error}<button className="icon-button" onClick={() => setError('')}><X size={14} /></button></div>}
    <div className="board-toolbar"><div><span className="eyebrow">THE WORK, AT A GLANCE</span><h2>Project board <span className="task-total">{tasks.length}</span></h2></div><div className="board-actions"><div className="board-search"><Search size={15} /><input placeholder="Find a task" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select aria-label="Filter by status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="all">All statuses</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select><select aria-label="Filter by priority" value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}><option value="all">All priorities</option>{['urgent', 'high', 'medium', 'low'].map((item) => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)} priority</option>)}</select><select aria-label="Filter by assignee" value={filter.assignee} onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}><option value="all">Everyone</option><option value="">Unassigned</option>{project.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><button className="button button-primary" onClick={() => setModal('task')}><Plus size={16} /> Add task</button></div></div>
    <div className="kanban-board">{statusColumns.map((column) => {
      const items = visibleTasks.filter((task) => task.status === column.id)
      return <section className="kanban-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('task-id'); if (id) moveTask(id, column.id) }}>
        <div className="column-heading"><span className={`column-status-dot ${column.color}`} /><h3>{column.label}</h3><span className="column-count">{items.length}</span><button className="icon-button column-add" title="Add a task" onClick={() => setModal({ type: 'task', status: column.id })}><Plus size={15} /></button></div>
        <div className="task-stack">{items.map((task) => <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} onDragStart={(event) => event.dataTransfer.setData('task-id', String(task.id))} />)}
          {!items.length && <div className="column-empty">Nothing here just yet<span>Drop a task or add one below</span></div>}
          <button className="add-task-inline" onClick={() => setModal({ type: 'task', status: column.id })}><Plus size={15} /> Add a task</button>
        </div>
      </section>
    })}</div>
    {modal === 'edit' && <ProjectModal project={project} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadProject() }} />}
    {modal === 'members' && <MemberModal project={project} onClose={() => setModal(null)} onChanged={() => loadProject()} />}
    {modal && typeof modal === 'object' && modal.type === 'task' && <TaskModal project={project} initialStatus={modal.status} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadProject() }} />}
    {selectedTask && <TaskDetails task={selectedTask} project={project} onClose={() => setSelectedTask(null)} onChanged={loadProject} />}
    {confirmingDelete && <ConfirmDialog title="Delete this project?" message="This permanently removes the project, tasks, and comments for everyone. This cannot be undone." cancelLabel="Keep project" confirmLabel="Delete project" onCancel={() => setConfirmingDelete(false)} onConfirm={deleteProject} />}
  </div>
}

function MemberModal({ project, onClose, onChanged }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  async function addMember(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await api(`/projects/${project.id}/members`, { method: 'POST', body: JSON.stringify({ email }) })
      setEmail('')
      setError('')
      onChanged()
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  async function removeMember() {
    try {
      await api(`/projects/${project.id}/members/${removeTarget.id}`, { method: 'DELETE' })
      setRemoveTarget(null)
      onChanged()
    } catch (reason) { setError(reason.message); setRemoveTarget(null) }
  }
  return <Modal title="Project people" subtitle="Invite registered teammates and manage who can access this project." onClose={onClose}>
    <form className="member-add-form" onSubmit={addMember}><label htmlFor="member-email">Add a teammate by email</label><div><input id="member-email" type="email" required placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button button-primary" disabled={busy}>{busy ? 'Adding…' : <><Plus size={15} /> Add</>}</button></div><small>They need a TeamFlow account with this email address.</small></form>
    {error && <div className="form-error member-error">{error}</div>}
    <div className="member-list">{project.members.map((member, index) => <div className="member-row" key={member.id}><Avatar name={member.name} color={['green', 'lilac', 'peach', 'blue'][index % 4]} /><span><strong>{member.name}</strong><small>{member.email}</small></span><span className="member-role">{member.role}</span>{member.role !== 'owner' && <button className="icon-button member-remove" aria-label={`Remove ${member.name}`} onClick={() => setRemoveTarget(member)}><X size={15} /></button>}</div>)}</div>
    <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Done</button></div>
    {removeTarget && <ConfirmDialog title={`Remove ${removeTarget.name}?`} message="They’ll lose access to this project, and any tasks assigned to them will become unassigned." cancelLabel="Keep member" confirmLabel="Remove member" onCancel={() => setRemoveTarget(null)} onConfirm={removeMember} />}
  </Modal>
}

function TaskCard({ task, onClick, onDragStart }) {
  return <article className="task-card" draggable onDragStart={onDragStart}><button className="task-card-open" onClick={onClick}><span className="task-card-title">{task.title}</span><p>{task.description || 'No description added.'}</p></button><div className="task-card-bottom"><span className={`priority-label priority-label-${task.priority}`}><span className="priority-dot" />{task.priority}</span>{task.due_date && <span className="task-card-date"><CalendarDays size={12} />{dateLabel(task.due_date)}</span>}{task.assignee_name ? <Avatar name={task.assignee_name} color="lilac" size="small" /> : <span className="unassigned-avatar">+</span>}</div></article>
}

function TaskModal({ project, initialStatus = 'todo', onClose, onSaved, task = null }) {
  const [form, setForm] = useState({ title: task?.title || '', description: task?.description || '', status: task?.status || initialStatus, priority: task?.priority || 'medium', due_date: task?.due_date ? String(task.due_date).slice(0, 10) : '', assignee_id: task?.assignee_id || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = { ...form, due_date: form.due_date || null, assignee_id: form.assignee_id || null }
      await api(task ? `/tasks/${task.id}` : `/projects/${project.id}/tasks`, { method: task ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Modal title={task ? 'Edit task' : 'Add a task'} subtitle={task ? 'Update the details and keep everyone in the loop.' : `A small step forward in ${project.title}.`} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}><label>Task name<input autoFocus required maxLength="180" placeholder="What needs to get done?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Description <span className="optional-label">OPTIONAL</span><textarea rows="3" maxLength="5000" placeholder="Add a little more detail…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="form-two-col"><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><div className="form-two-col"><label>Due date<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label><label>Assign to<select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}><option value="">Unassigned</option>{project.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : task ? 'Save task' : 'Create task'}<ArrowRight size={15} /></button></div></form>
  </Modal>
}

function TaskDetails({ task: initialTask, project, onClose, onChanged }) {
  const [task, setTask] = useState(initialTask)
  const [comments, setComments] = useState(null)
  const [attachments, setAttachments] = useState(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const uploadInput = useRef(null)
  const { user } = useAuth()
  const socket = useSocket()
  const loadAttachments = useCallback(async () => {
    try {
      const result = await api(`/tasks/${task.id}/attachments`)
      setAttachments(result.attachments)
      setAttachmentError('')
    } catch (reason) {
      setAttachmentError(reason.message)
    }
  }, [task.id])
  const loadComments = useCallback(async () => {
    try { const result = await api(`/tasks/${task.id}/comments`); setComments(result.comments); setError('') } catch (reason) { setError(reason.message) }
  }, [task.id])
  useEffect(() => {
    let mounted = true
    api(`/tasks/${task.id}/comments`).then((result) => {
      if (mounted) { setComments(result.comments); setError('') }
    }).catch((reason) => {
      if (mounted) setError(reason.message)
    })
    return () => { mounted = false }
  }, [task.id])
  useEffect(() => {
    let mounted = true
    api(`/tasks/${task.id}/attachments`).then((result) => {
      if (mounted) {
        setAttachments(result.attachments)
        setAttachmentError('')
      }
    }).catch((reason) => {
      if (mounted) setAttachmentError(reason.message)
    })
    return () => { mounted = false }
  }, [task.id])
  useEffect(() => {
    if (!socket) return undefined
    const refresh = ({ taskId }) => { if (Number(taskId) === Number(task.id)) loadComments() }
    socket.on('comment:created', refresh)
    socket.on('comment:deleted', refresh)
    return () => {
      socket.off('comment:created', refresh)
      socket.off('comment:deleted', refresh)
    }
  }, [socket, task.id, loadComments])
  useEffect(() => {
    if (!socket) return undefined
    const refresh = ({ taskId }) => {
      if (Number(taskId) === Number(task.id)) loadAttachments()
    }
    socket.on('attachment:created', refresh)
    socket.on('attachment:deleted', refresh)
    return () => {
      socket.off('attachment:created', refresh)
      socket.off('attachment:deleted', refresh)
    }
  }, [socket, task.id, loadAttachments])
  async function uploadFile(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setAttachmentBusy(true)
    setAttachmentError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api(`/tasks/${task.id}/attachments`, { method: 'POST', body: formData })
      await loadAttachments()
    } catch (reason) {
      setAttachmentError(reason.message)
    } finally {
      setAttachmentBusy(false)
    }
  }
  async function downloadFile(attachment) {
    try {
      const blob = await apiFile(`/tasks/${task.id}/attachments/${attachment.id}`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.original_name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      setAttachmentError(reason.message)
    }
  }
  async function deleteAttachment(attachment) {
    if (!window.confirm(`Delete "${attachment.original_name}"?`)) return
    try {
      await api(`/tasks/${task.id}/attachments/${attachment.id}`, { method: 'DELETE' })
      await loadAttachments()
    } catch (reason) {
      setAttachmentError(reason.message)
    }
  }
  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    setBusy(true)
    try { await api(`/tasks/${task.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }); setComment(''); await loadComments() } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  async function deleteComment(id) {
    try { await api(`/tasks/${task.id}/comments/${id}`, { method: 'DELETE' }); await loadComments() } catch (reason) { setError(reason.message) }
  }
  async function deleteTask() {
    try { await api(`/tasks/${task.id}`, { method: 'DELETE' }); onChanged(); onClose() } catch (reason) { setError(reason.message) }
  }
  return <div className="drawer-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="task-drawer"><div className="drawer-header"><span className="eyebrow">TASK DETAILS</span><div><button className="icon-button" aria-label="Delete task" onClick={deleteTask}><Trash2 size={16} /></button><button className="icon-button" aria-label="Close details" onClick={onClose}><X size={18} /></button></div></div>
    <div className="drawer-content"><div className="task-detail-project"><FolderKanban size={14} /> {project.title} <span>/</span> Task</div><h2 className="task-detail-title">{task.title}</h2><p className="task-detail-description">{task.description || 'No description yet. Add a little context so your teammates know what this is all about.'}</p><div className="detail-properties"><div><span>Status</span><select value={task.status} onChange={async (e) => { try { const result = await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }); setTask(result.task); onChanged() } catch (reason) { setError(reason.message) } }}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div><div><span>Priority</span><span className={`priority-label priority-label-${task.priority}`}><span className="priority-dot" />{task.priority}</span></div><div><span>Due date</span><span>{dateLabel(task.due_date)}</span></div><div><span>Assigned to</span><span>{task.assignee_name || 'Unassigned'}</span></div></div><div className="detail-actions"><button className="button button-secondary" onClick={() => setEditing(true)}><Settings2 size={15} /> Edit task</button><span><Clock3 size={13} /> Created by {task.creator_name || 'a teammate'}</span></div>
      <section className="attachments-section"><div className="attachments-heading"><div className="comments-title"><h3>Attachments</h3><span>{attachments?.length ?? '…'}</span></div><button className="button button-secondary attachment-upload" onClick={() => uploadInput.current?.click()} disabled={attachmentBusy}><Upload size={14} />{attachmentBusy ? 'Uploading…' : 'Upload file'}</button><input ref={uploadInput} className="attachment-input" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={uploadFile} /></div>
        <p className="attachment-hint">PDF, PNG, JPG, or JPEG · up to 10 MB</p>
        {attachmentError && <div className="form-error attachment-error">{attachmentError}</div>}
        {attachments === null ? <div className="comment-loading"><span className="loader" /> Loading attachments</div> : attachments.length ? <div className="attachment-list">{attachments.map((attachment) => <div className="attachment-item" key={attachment.id}><span className="attachment-file-icon">{attachment.mime_type === 'application/pdf' ? <FileText size={16} /> : <Image size={16} />}</span><div className="attachment-info"><strong title={attachment.original_name}>{attachment.original_name}</strong><small>{fileSizeLabel(attachment.file_size)} <span>·</span> {new Date(attachment.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}{attachment.uploader_name ? ` · ${attachment.uploader_name}` : ''}</small></div><button className="icon-button attachment-action" title="Download file" aria-label={`Download ${attachment.original_name}`} onClick={() => downloadFile(attachment)}><Download size={15} /></button><button className="icon-button attachment-action" title="Delete file" aria-label={`Delete ${attachment.original_name}`} onClick={() => deleteAttachment(attachment)}><Trash2 size={14} /></button></div>)}</div> : <div className="attachment-empty"><Paperclip size={16} /><span>No files attached yet.</span></div>}
      </section>
      <div className="comments-section"><div className="comments-title"><h3>Conversation</h3><span>{comments?.length ?? '…'}</span></div>{comments === null ? <div className="comment-loading"><span className="loader" /> Loading comments</div> : comments.length ? <div className="comment-list">{comments.map((item) => <div className="comment-item" key={item.id}><Avatar name={item.author_name} color={item.author_id === user?.id ? 'green' : 'peach'} size="small" /><div className="comment-content"><div><strong>{item.author_name}</strong><time>{new Date(item.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>{Number(item.author_id) === Number(user?.id) && <button className="comment-delete" onClick={() => deleteComment(item.id)} aria-label="Delete comment"><Trash2 size={13} /></button>}</div><p>{item.body}</p></div></div>)}</div> : <div className="comment-empty">No comments yet. Start the conversation.</div>}
      {error && <div className="form-error">{error}</div>}<form className="comment-form" onSubmit={addComment}><Avatar name={user?.name || ''} color="green" size="small" /><div><textarea placeholder="Write a thoughtful note…" maxLength="2000" rows="2" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="button button-primary button-small" disabled={busy || !comment.trim()}>{busy ? 'Sending…' : 'Comment'}<ArrowRight size={14} /></button></div></form></div>
    </div>
    {editing && <TaskModal task={task} project={project} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); onClose() }} />}
  </aside></div>
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    function onKeyDown(event) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><span className="modal-icon"><Sparkles size={17} /></span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div>{children}</section></div>
}

function ConfirmDialog({ title, message, cancelLabel = 'Cancel', confirmLabel, onCancel, onConfirm }) {
  return <Modal title={title} subtitle={message} onClose={onCancel}><div className="modal-actions confirm-actions"><button className="button button-quiet" onClick={onCancel}>{cancelLabel}</button><button className="button button-danger" onClick={onConfirm}><Trash2 size={15} />{confirmLabel}</button></div></Modal>
}

function EmptyState({ icon: Icon, title, message, action, onAction }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon size={20} /></span><strong>{title}</strong><p>{message}</p>{action && <button className="button button-secondary" onClick={onAction}><Plus size={15} />{action}</button>}</div>
}

function ErrorState({ error, retry }) {
  return <div className="center-state error-state"><span className="empty-state-icon"><Activity size={20} /></span><h2>We couldn’t load this view.</h2><p>{error}</p><button className="button button-secondary" onClick={retry}>Try again</button></div>
}

function LoadingState() {
  return <div className="center-state"><span className="loader" /><p>Bringing your work together…</p></div>
}

export default App
