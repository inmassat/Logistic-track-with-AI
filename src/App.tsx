import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Database, Download, Eye, EyeOff, Filter, Flag, Fuel, Gauge, LayoutDashboard, Loader2, LockKeyhole, LogOut, Mail, Map, MoreHorizontal, PackageCheck, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Sparkles, Truck, Users, Zap } from 'lucide-react'
import AssistantPage from './components/AssistantPage'
import BriefingCard from './components/BriefingCard'
import RiskBadge from './components/RiskBadge'
import SmartSearch from './components/SmartSearch'
import type { ActivityEntry, ActivityKind, NetworkContext, ReportKind, Shipment, ShipmentStatus, User } from './data/network'
import { AiError, fetchCurrentUser, login, logout, reportDownloadUrl } from './lib/ai'
import type { RiskAssessment, SearchResult } from './lib/ai'
import { greeting, longDate, shortDate, timeAgo } from './lib/format'
import { useAddDriver, useCreateReport, useCreateShipment, useCreateSupportRequest, useDispatchVehicle, useMarkForReview, useNetwork, useReports, useSaveSettings, useSettings, useSupportRequests } from './lib/useNetwork'
import { useRiskAssessments } from './lib/useRiskAssessments'
import './App.css'
import './ai.css'

const EMPTY_SHIPMENTS: Shipment[] = []
const EMPTY_ACTIVITY: ActivityEntry[] = []
const ACTIVITY_PAGE_SIZE = 4
const SHIPMENTS_PAGE_SIZE = 5
const STATUS_TABS = ['All', 'In transit', 'At hub', 'Delivered'] as const
const DEMO_EMAIL = 'demo@haul.io'
const DEMO_PASSWORD = 'demo1234'

const ACTIVITY_STYLE: Record<ActivityKind, { icon: React.ReactNode; tone: string }> = {
  delivered: { icon: <Check size={15} />, tone: 'green' },
  delay: { icon: <AlertTriangle size={15} />, tone: 'orange' },
  fuel: { icon: <Fuel size={15} />, tone: 'blue' },
  driver: { icon: <Users size={15} />, tone: 'purple' },
  booked: { icon: <PackageCheck size={15} />, tone: 'green' },
  checkin: { icon: <Truck size={15} />, tone: 'blue' },
  review: { icon: <Flag size={15} />, tone: 'orange' },
  dispatch: { icon: <Truck size={15} />, tone: 'teal' },
}

const volumePeriods = {
  'This week': { total: 186, trend: '8.4%', bars: [42, 58, 51, 76, 69, 92, 62], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  'Last week': { total: 172, trend: '4.1%', bars: [36, 64, 48, 61, 74, 68, 55], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  'This month': { total: 748, trend: '11.6%', bars: [48, 57, 68, 52, 81, 73, 92], labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'] },
} as const

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function App() {
  // undefined = still checking the saved session, null = signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [activeNav, setActiveNav] = useState('Overview')
  const [filter, setFilter] = useState<ShipmentStatus | 'All'>('All')
  const [liveTracking, setLiveTracking] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [shipmentSort, setShipmentSort] = useState<'ETA' | 'Progress' | 'Shipment ID'>('ETA')
  const [isShipmentSortOpen, setIsShipmentSortOpen] = useState(false)
  const [isActivityMenuOpen, setIsActivityMenuOpen] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [volumePeriod, setVolumePeriod] = useState<keyof typeof volumePeriods>('This week')
  const [isVolumeMenuOpen, setIsVolumeMenuOpen] = useState(false)
  const volume = volumePeriods[volumePeriod]
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((current) => { if (!cancelled) setUser(current) })
      .catch(() => { if (!cancelled) setUser(null) })
    return () => { cancelled = true }
  }, [])

  const { data: network, isLoading, error, refetch, isFetching } = useNetwork(Boolean(user))
  const { byId: riskById } = useRiskAssessments(network)
  const shipments = network?.shipments ?? EMPTY_SHIPMENTS
  const activity = network?.activity ?? EMPTY_ACTIVITY

  // A 401 on the snapshot means the session expired: show the login page again.
  // Signing in clears the query cache, which clears this error.
  const sessionExpired = error instanceof AiError && error.code === 'unauthorized'

  const visibleShipments = useMemo(() => {
    const filteredShipments = shipments.filter((shipment) => filter === 'All' || shipment.status === filter)
    const sortedShipments = [...filteredShipments].sort((left, right) => {
      if (shipmentSort === 'Progress') return right.progress - left.progress
      if (shipmentSort === 'Shipment ID') return left.id.localeCompare(right.id)
      return left.eta.localeCompare(right.eta)
    })
    return sortedShipments.slice(0, showAll ? 6 : 3)
  }, [shipments, filter, showAll, shipmentSort])

  const activityPages = Math.max(1, Math.ceil(activity.length / ACTIVITY_PAGE_SIZE))
  const currentActivityPage = Math.min(activityPage, activityPages)
  const activityRows = activity.slice((currentActivityPage - 1) * ACTIVITY_PAGE_SIZE, currentActivityPage * ACTIVITY_PAGE_SIZE)
  const activityFrom = activity.length ? (currentActivityPage - 1) * ACTIVITY_PAGE_SIZE + 1 : 0
  const activityTo = Math.min(currentActivityPage * ACTIVITY_PAGE_SIZE, activity.length)

  const navItems = [{ label: 'Overview', icon: LayoutDashboard }, { label: 'AI Assistant', icon: Sparkles, badge: 'AI' }, { label: 'Shipments', icon: PackageCheck, count: network ? String(shipments.length) : undefined }, { label: 'Fleet', icon: Truck }, { label: 'Routes', icon: Map }]

  const signIn = (signedIn: User) => {
    queryClient.clear()
    setUser(signedIn)
    setActiveNav('Overview')
  }

  const signOut = async () => {
    try { await logout() } catch { /* the cookie is cleared locally either way */ }
    queryClient.clear()
    setUser(null)
    setActiveNav('Overview')
  }

  if (user === undefined) return <main className="login-page"><div className="session-check"><Loader2 size={22} className="spinning" /> Checking your session</div></main>
  if (!user || sessionExpired) return <LoginPage onLogin={signIn} />
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><span /></span><span>haul<span className="brand-dot">.</span>io</span></div><div className="workspace-switcher"><span className="workspace-avatar">AH</span><span><strong>Atlas Haulage</strong><small>Operations workspace</small></span><ChevronDown size={15} /></div>
      <nav className="main-nav" aria-label="Main navigation"><small className="nav-label">WORKSPACE</small>{navItems.map(({ label, icon: Icon, count, badge }) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(label)}><Icon size={18} /><span>{label}</span>{count && <em>{count}</em>}{badge && <em className="nav-badge">{badge}</em>}</button>)}<small className="nav-label nav-label-spaced">MANAGE</small><button className="nav-item" onClick={() => setActiveNav('Drivers')}><Users size={18} /><span>Drivers</span></button><button className="nav-item" onClick={() => setActiveNav('Analytics')}><Activity size={18} /><span>Analytics</span></button></nav>
      <div className="sidebar-bottom"><button className={activeNav === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav('Settings')}><Settings size={18} /><span>Settings</span></button><button className={activeNav === 'Help center' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav('Help center')}><CircleHelp size={18} /><span>Help center</span></button><div className="profile"><div className="profile-avatar">{initials(user.name)}</div><span><strong>{user.name}</strong><small>{user.role}</small></span><button className="logout-button" onClick={() => void signOut()} aria-label="Log out"><LogOut size={16} /><span>Log out</span></button></div></div>
    </aside>
    <main className="main-content"><header className="topbar"><div className="crumbs"><span>Workspace</span><span>/</span><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Refresh data" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={18} className={isFetching ? 'spinning' : ''} /></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><button className="copilot-trigger" onClick={() => setActiveNav('AI Assistant')}><Sparkles size={15} /> Ask the AI assistant</button><div className="top-date"><CalendarDays size={16} /><span>{shortDate()}</span></div></div></header>
      <div className="page-content">{!network ? <DataState loading={isLoading} error={error} onRetry={() => void refetch()} /> : activeNav === 'AI Assistant' ? <AssistantPage network={network} user={user} /> : activeNav === 'Shipments' ? <ShipmentsPage network={network} riskById={riskById} /> : activeNav === 'Fleet' ? <FleetPage network={network} riskById={riskById} /> : activeNav === 'Drivers' ? <DriversPage network={network} /> : activeNav === 'Analytics' ? <AnalyticsPage network={network} /> : activeNav === 'Routes' ? <RoutesPage network={network} /> : activeNav === 'Settings' ? <SettingsPage user={user} onUserChange={setUser} /> : activeNav === 'Help center' ? <HelpPage /> : <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> {longDate()}</p><h1>{greeting()}, {user.name.split(' ')[0]}<span>.</span></h1><p className="intro-copy">Here is what is happening across your network today.</p></div><button className="primary-button" onClick={() => setActiveNav('Shipments')}><Plus size={17} /> New shipment</button></section>
        <section className="metric-grid" aria-label="Network summary"><Metric icon={<Truck size={19} />} label="Active shipments" value={network.metrics.activeShipments.value} detail={network.metrics.activeShipments.detail} trend={network.metrics.activeShipments.trend} tone="orange" up /><Metric icon={<Gauge size={19} />} label="On-time rate" value={network.metrics.onTimeRate.value} detail={network.metrics.onTimeRate.detail} trend={network.metrics.onTimeRate.trend} tone="teal" up /><Metric icon={<Fuel size={19} />} label="Fleet utilization" value={network.metrics.fleetUtilization.value} detail={network.metrics.fleetUtilization.detail} trend={network.metrics.fleetUtilization.trend} tone="blue" /><Metric icon={<AlertTriangle size={19} />} label="Needs attention" value={network.metrics.needsAttention.value} detail={network.metrics.needsAttention.detail} trend={network.metrics.needsAttention.trend} tone="red" /></section>
        <BriefingCard context={network} />
        <section className="content-grid"><div className="main-column"><article className="panel map-panel"><PanelHeading kicker="NETWORK PULSE" title="Live route overview"><div className="heading-actions"><span className="live-indicator"><span /> Live</span><button className={liveTracking ? 'toggle is-on' : 'toggle'} onClick={() => setLiveTracking(!liveTracking)} aria-label="Toggle live tracking"><span /></button><button className="more-button" aria-label="More options"><MoreHorizontal size={19} /></button></div></PanelHeading><div className="map-canvas"><div className="map-label label-north">NORTH SEA</div><div className="map-label label-paris">PARIS</div><div className="map-label label-berlin">BERLIN</div><div className="map-label label-milan">MILAN</div><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="route-line route-one" /><div className="route-line route-two" /><div className="route-line route-three" /><MapNode className="node-antwerp" label="Antwerp" /><MapNode className="node-rotterdam" label="Rotterdam" /><MapNode className="node-paris" label="Paris" /><MapNode className="node-berlin" label="Berlin" /><MapNode className="node-milan" label="Milan" /><div className="vehicle-marker vehicle-a"><Truck size={14} /></div><div className="vehicle-marker vehicle-b"><Truck size={14} /></div><div className="map-zoom"><button>+</button><button>-</button></div><div className="map-legend"><span><i className="legend-dot green" /> On route</span><span><i className="legend-dot amber" /> At hub</span></div></div><div className="map-footer"><span><span className="footer-number">{network.fleet.vehiclesInMotion}</span> vehicles in motion</span><span><span className="footer-number">{String(network.fleet.vehiclesAtHubs).padStart(2, '0')}</span> at distribution hubs</span><span className="map-updated"><Zap size={13} /> Updated {timeAgo(network.asOf)}</span></div></article>
          <article className="panel shipments-panel"><PanelHeading kicker="OPERATIONS" title="Active shipments"><button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : 'View all shipments'} <ArrowUpRight size={15} /></button></PanelHeading><div className="shipment-filters"><div className="filter-tabs">{STATUS_TABS.map((item) => <button key={item} className={filter === item ? 'filter-tab selected' : 'filter-tab'} onClick={() => setFilter(item)}>{item}{item === 'All' && <span>{shipments.length}</span>}</button>)}</div><div className="period-menu"><button className="filter-button" onClick={() => setIsShipmentSortOpen(!isShipmentSortOpen)} aria-expanded={isShipmentSortOpen}><span>Sort: {shipmentSort}</span><ChevronDown size={14} /></button>{isShipmentSortOpen && <div className="period-popover shipment-sort-popover">{(['ETA', 'Progress', 'Shipment ID'] as const).map((sortOption) => <button key={sortOption} className={sortOption === shipmentSort ? 'period-option selected' : 'period-option'} onClick={() => { setShipmentSort(sortOption); setIsShipmentSortOpen(false) }}>{sortOption}</button>)}</div>}</div></div><div className="shipment-list">{visibleShipments.map((shipment) => <ShipmentRow key={shipment.id} shipment={shipment} risk={riskById[shipment.id]} />)}{visibleShipments.length === 0 && <div className="empty-state"><PackageCheck size={25} /><strong>No shipments in this status</strong><span>Try another tab.</span></div>}</div></article></div>
          <div className="side-column"><article className="panel chart-panel"><PanelHeading kicker="THROUGHPUT" title="Shipment volume"><div className="period-menu"><button className="filter-button" onClick={() => setIsVolumeMenuOpen(!isVolumeMenuOpen)} aria-expanded={isVolumeMenuOpen}><span>{volumePeriod}</span><ChevronDown size={14} /></button>{isVolumeMenuOpen && <div className="period-popover">{(Object.keys(volumePeriods) as Array<keyof typeof volumePeriods>).map((period) => <button key={period} className={period === volumePeriod ? 'period-option selected' : 'period-option'} onClick={() => { setVolumePeriod(period); setIsVolumeMenuOpen(false) }}>{period}</button>)}</div>}</div></PanelHeading><div className="chart-total"><strong>{volume.total}</strong><span>shipments dispatched</span><em><ArrowUpRight size={14} /> {volume.trend}</em></div><div className="bar-chart">{volume.bars.map((height, index) => <div className="bar-column" key={`${volumePeriod}-${index}`}><div className={index === 5 ? 'bar active' : 'bar'} style={{ height: `${height}%` }} /><small>{volume.labels[index]}</small></div>)}</div></article><article className="panel activity-panel"><PanelHeading kicker="LATEST UPDATES" title="Activity"><div className="activity-menu"><button className="more-button" aria-label="More activity options" onClick={() => setIsActivityMenuOpen(!isActivityMenuOpen)} aria-expanded={isActivityMenuOpen}><MoreHorizontal size={19} /></button>{isActivityMenuOpen && <div className="activity-popover"><button onClick={() => setIsActivityMenuOpen(false)}>Mark all as read</button><button onClick={() => { setActivityPage(Math.min(2, activityPages)); setIsActivityMenuOpen(false) }}>Show all updates</button></div>}</div></PanelHeading><div className="activity-list">{activityRows.map((entry) => <ActivityItem key={entry.id} icon={ACTIVITY_STYLE[entry.kind]?.icon ?? <Activity size={15} />} tone={ACTIVITY_STYLE[entry.kind]?.tone ?? 'blue'} title={entry.title} body={entry.body} time={timeAgo(entry.occurredAt)} />)}{activityRows.length === 0 && <div className="empty-state"><Activity size={25} /><strong>No activity yet</strong><span>Updates will appear here as they are logged.</span></div>}</div><div className="activity-pagination"><span>{activityFrom}-{activityTo} of {activity.length}</span><button disabled={currentActivityPage === 1} onClick={() => setActivityPage(currentActivityPage - 1)} aria-label="Previous activity page"><ChevronLeft size={14} /></button><strong>{currentActivityPage}</strong><button disabled={currentActivityPage >= activityPages} onClick={() => setActivityPage(currentActivityPage + 1)} aria-label="Next activity page"><ChevronRight size={14} /></button></div></article></div></section>
      </div>}</div></main>
  </div>
}
function DataState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  return <div className="dashboard-content"><article className="panel"><div className="empty-state">{loading ? <><Loader2 size={25} className="spinning" /><strong>Loading your network</strong><span>Reading shipments and activity from the database.</span></> : <><Database size={25} /><strong>Cannot reach the API</strong><span>{error instanceof Error ? error.message : 'Start the server with `npm run dev` and try again.'}</span><button className="secondary-button" onClick={onRetry} style={{ marginTop: 12 }}><RefreshCw size={15} /> Retry</button></>}</div></article></div>
}
function PanelHeading({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) { return <div className="panel-heading"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div>{children}</div> }
function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [forgotNotice, setForgotNotice] = useState(false)
  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      onLogin(await login(email, password, remember))
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'Could not sign in. Please try again.')
    } finally {
      setPending(false)
    }
  }
  const useDemoAccount = () => {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError('')
  }
  return <main className="login-page"><div className="login-atmosphere"><span className="login-grid" /><span className="login-route route-a" /><span className="login-route route-b" /><span className="login-node node-a" /><span className="login-node node-b" /><span className="login-node node-c" /></div><section className="login-card"><div className="login-brand"><span className="brand-mark"><span /></span><span>haul<span className="brand-dot">.</span>io</span></div><div className="login-heading"><p className="eyebrow"><span className="status-pulse" /> OPERATIONS PLATFORM</p><h1>Move with<br /><em>confidence.</em></h1><p>One clear view of every shipment, route, and vehicle in your network.</p></div><form className="login-form" onSubmit={(event) => void submitLogin(event)}><label>Email address<div className="login-input"><Mail size={17} /><input name="email" type="email" required placeholder="you@company.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></label><label>Password<div className="login-input"><LockKeyhole size={17} /><input name="password" type={showPassword ? 'text' : 'password'} required minLength={6} placeholder="Enter your password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><div className="login-options"><label className="remember-option"><input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>Remember me</span></label><button type="button" className="forgot-button" onClick={() => setForgotNotice(true)}>Forgot password?</button></div>{error && <p className="login-error" role="alert">{error}</p>}<button className="login-submit" type="submit" disabled={pending}>{pending ? <Loader2 size={17} className="spinning" /> : <>Sign in to workspace <ArrowRight size={17} /></>}</button>{forgotNotice && <p className="forgot-notice" role="status">This demo has no password reset. Use the demo account below.</p>}<div className="demo-credentials"><div><strong>Demo account</strong><span>{DEMO_EMAIL} <em>/</em> {DEMO_PASSWORD}</span></div><button type="button" className="secondary-button" onClick={useDemoAccount}>Use demo account</button></div></form><div className="login-footer"><span>Secure workspace access</span><span className="footer-separator">·</span><span>Atlas Haulage</span></div></section><aside className="login-aside"><div className="aside-topline"><span>ATLAS HAULAGE</span><span>EST. 2018</span></div><div className="aside-copy"><span className="aside-overline">THE LOGISTICS CONTROL ROOM</span><h2>Every mile,<br /><strong>in view.</strong></h2><p>Coordinate the moving parts of your operation from one calm, connected workspace, with an AI assistant that knows every shipment.</p></div><div className="login-stats"><div><strong>94.8%</strong><span>on-time network rate</span></div><div><strong>24</strong><span>active shipments</span></div><div><strong>142</strong><span>vehicles connected</span></div></div><div className="aside-mark"><span>AH</span><small>Atlas Haulage<br />Operations workspace</small></div></aside></main>
}
function MapNode({ className, label }: { className: string; label: string }) { return <div className={`map-node ${className}`}><span className="node-dot" /><small>{label}</small></div> }
function Metric({ icon, label, value, detail, trend, tone, up }: { icon: React.ReactNode; label: string; value: string; detail: string; trend: string; tone: string; up?: boolean }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><span className={up ? 'metric-trend positive' : tone === 'red' ? 'metric-trend attention' : 'metric-trend negative'}>{up && <ArrowUpRight size={13} />}{!up && tone !== 'red' && <ArrowDownRight size={13} />}{trend}</span></article> }
function ShipmentRow({ shipment, risk }: { shipment: Shipment; risk?: RiskAssessment }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const copyId = async () => {
    await navigator.clipboard?.writeText(shipment.id)
    setIsMenuOpen(false)
    setNotice('Copied')
    window.setTimeout(() => setNotice(''), 1500)
  }
  const showRiskReason = () => {
    if (!risk) return
    setNotice(risk.reason)
    window.setTimeout(() => setNotice(''), 3500)
  }
  return <div className="shipment-row"><div className="shipment-id"><span className="shipment-color" style={{ backgroundColor: shipment.color }} /><strong>{shipment.id}</strong><small>{shipment.customer}</small></div><div className="route"><span>{shipment.origin}</span><div className="route-progress"><i style={{ width: `${shipment.progress}%`, backgroundColor: shipment.color }} /><span style={{ left: `${shipment.progress}%` }} /></div><span>{shipment.destination}</span></div><div className="shipment-eta"><Clock3 size={14} /><span>{shipment.eta}</span></div><span className={`status status-${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span><RiskBadge assessment={risk} onClick={showRiskReason} /><div className="row-actions"><button type="button" className="row-more" aria-label={`Options for ${shipment.id}`} onClick={() => setIsMenuOpen(!isMenuOpen)}><MoreHorizontal size={17} /></button>{isMenuOpen && <div className="row-menu"><button type="button" onClick={() => void copyId()}>Copy tracking ID</button></div>}{notice && <span className="row-action-notice" role="status">{notice}</span>}</div></div>
}
function ActivityItem({ icon, tone, title, body, time }: { icon: React.ReactNode; tone: string; title: string; body: string; time: string }) { return <div className="activity-item"><span className={`activity-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><p>{body}</p></div><time>{time}</time></div> }
function ShipmentsPage({ network, riskById }: { network: NetworkContext; riskById: Record<string, RiskAssessment> }) {
  const [status, setStatus] = useState<ShipmentStatus | 'All'>('All')
  const [smartResult, setSmartResult] = useState<SearchResult | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const [createdNotice, setCreatedNotice] = useState('')
  const createShipment = useCreateShipment()
  const markForReview = useMarkForReview()
  const shipments = network.shipments
  const smartIds = smartResult ? new Set(smartResult.matchingIds) : null
  const filtered = shipments.filter((shipment) => (status === 'All' || shipment.status === status) && (!smartIds || smartIds.has(shipment.id)) && `${shipment.id} ${shipment.customer} ${shipment.origin} ${shipment.destination}`.toLowerCase().includes(query.toLowerCase()))
  const counts = { inTransit: shipments.filter((shipment) => shipment.status === 'In transit').length, atHub: shipments.filter((shipment) => shipment.status === 'At hub').length, delivered: shipments.filter((shipment) => shipment.status === 'Delivered').length }
  const applySmartResult = (result: SearchResult) => {
    setSmartResult(result)
    setStatus(result.status === 'All' ? 'All' : (result.status as ShipmentStatus))
    setQuery('')
    setPage(1)
  }
  const clearSmartResult = () => {
    setSmartResult(null)
    setStatus('All')
    setPage(1)
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / SHIPMENTS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * SHIPMENTS_PAGE_SIZE, currentPage * SHIPMENTS_PAGE_SIZE)
  const notifyAction = (message: string) => {
    setActionNotice(message)
    window.setTimeout(() => setActionNotice(''), 2500)
  }
  const createReport = useCreateReport()
  const exportShipments = () => {
    createReport.mutate({ kind: 'shipments', shipmentIds: filtered.map((shipment) => shipment.id) }, {
      onSuccess: ({ report, csv }) => {
        downloadCsv(csv, report.filename)
        notifyAction(`${report.rowCount} shipments exported and saved as report #${report.id}`)
      },
      onError: (caught) => notifyAction(caught.message),
    })
  }
  const handleCreateShipment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    createShipment.mutate({
      customer: String(formData.get('customer') ?? ''),
      reference: String(formData.get('reference') ?? ''),
      origin: String(formData.get('origin') ?? ''),
      destination: String(formData.get('destination') ?? ''),
      eta: String(formData.get('eta') ?? ''),
      service: String(formData.get('service') ?? ''),
    }, {
      onSuccess: (created) => {
        setStatus('All')
        setQuery('')
        setSmartResult(null)
        setPage(1)
        setIsCreateOpen(false)
        setCreatedNotice(`${created.id} created and saved to the database`)
        window.setTimeout(() => setCreatedNotice(''), 3500)
      },
      onError: (caught) => notifyAction(caught.message),
    })
  }
  const handleReview = (shipment: Shipment) => {
    markForReview.mutate(shipment.id, {
      onSuccess: () => notifyAction(`${shipment.id} marked for review`),
      onError: (caught) => notifyAction(caught.message),
    })
  }
  return <div className="shipments-page"><section className="shipments-intro"><div><p className="eyebrow"><span className="status-pulse" /> OPERATIONS CENTER</p><h1>Shipments<span>.</span></h1><p className="intro-copy">Track, manage, and coordinate every movement across your network.</p></div><button className="primary-button" onClick={() => setIsCreateOpen(true)}><Plus size={17} /> New shipment</button></section>
    <section className="shipment-summary"><SummaryItem label="Total shipments" value={String(shipments.length)} tone="navy" /><SummaryItem label="In transit" value={String(counts.inTransit).padStart(2, '0')} tone="orange" /><SummaryItem label="At hub" value={String(counts.atHub).padStart(2, '0')} tone="coral" /><SummaryItem label="Delivered today" value={String(counts.delivered).padStart(2, '0')} tone="teal" /></section>
    <article className="panel all-shipments-panel"><SmartSearch context={network} onResult={applySmartResult} onClear={clearSmartResult} active={smartResult} /><div className="all-shipments-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search shipments, customers, routes..." /></div><div className="toolbar-actions"><div className="filter-menu"><button className={isFilterOpen ? 'secondary-button filter-active' : 'secondary-button'} onClick={() => setIsFilterOpen(!isFilterOpen)}><Filter size={15} /> Filters <span className="filter-count">{status === 'All' ? 0 : 1}</span></button>{isFilterOpen && <div className="filter-popover"><strong>Filter by status</strong>{STATUS_TABS.map((item) => <button key={item} className={status === item ? 'popover-option selected' : 'popover-option'} onClick={() => { setStatus(item); setPage(1); setIsFilterOpen(false) }}><span className="popover-radio" />{item}</button>)}<button className="clear-filter" onClick={() => { setStatus('All'); setQuery(''); setPage(1); setIsFilterOpen(false) }}>Clear all filters</button></div>}</div><button className="secondary-button" onClick={exportShipments} disabled={createReport.isPending}>{createReport.isPending ? <Loader2 size={15} className="spinning" /> : <Download size={15} />} Export</button></div></div><div className="status-switcher">{STATUS_TABS.map((item) => <button key={item} className={status === item ? 'filter-tab selected' : 'filter-tab'} onClick={() => { setStatus(item); setPage(1) }}>{item}{item === 'All' && <span>{shipments.length}</span>}</button>)}<button className="view-controls" aria-label="Table settings"><SlidersHorizontal size={16} /></button></div><div className="full-shipment-table"><div className="table-head"><span>SHIPMENT</span><span>ROUTE</span><span>PROGRESS</span><span>ETA</span><span>STATUS</span><span /></div>{pageRows.map((shipment) => <FullShipmentRow key={shipment.id} shipment={shipment} onAction={notifyAction} onReview={handleReview} risk={riskById[shipment.id]} />)}{pageRows.length === 0 && <div className="empty-state"><PackageCheck size={25} /><strong>No shipments found</strong><span>Try a different status or search term.</span></div>}</div><div className="table-footer"><span>Showing <strong>{filtered.length ? (currentPage - 1) * SHIPMENTS_PAGE_SIZE + 1 : 0}-{Math.min(currentPage * SHIPMENTS_PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong> shipments</span><div className="pagination"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={15} /></button></div></div></article>
    <SavedReportsPanel kind="shipments" />
    {(createdNotice || actionNotice) && <div className="created-notice" role="status"><Check size={16} /> {createdNotice || actionNotice}</div>}
    {isCreateOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCreateOpen(false) }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-shipment-title"><div className="modal-heading"><div><p className="section-kicker">OPERATIONS</p><h2 id="create-shipment-title">Create new shipment</h2><p>Set the route and delivery target for a new movement. It is saved to the SQLite database.</p></div><button className="modal-close" type="button" onClick={() => setIsCreateOpen(false)} aria-label="Close dialog">×</button></div><form onSubmit={handleCreateShipment}><div className="form-grid"><label>Customer<input name="customer" required placeholder="e.g. Nordmarkt GmbH" /></label><label>Reference<input name="reference" placeholder="Optional reference" /></label><label>Origin<input name="origin" required placeholder="e.g. Rotterdam" /></label><label>Destination<input name="destination" required placeholder="e.g. Berlin" /></label><label>Expected arrival<input name="eta" required placeholder="e.g. Tomorrow, 16:30" /></label><label>Service level<select name="service"><option>Standard road freight</option><option>Express delivery</option><option>Temperature controlled</option></select></label></div><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setIsCreateOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={createShipment.isPending}>{createShipment.isPending ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />} Create shipment</button></div></form></section></div>}
  </div>
}
function SummaryItem({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="summary-item"><span className={`summary-dot ${tone}`} /><div><small>{label}</small><strong>{value}</strong></div><ArrowUpRight size={15} /></div> }
function FleetPage({ network, riskById }: { network: NetworkContext; riskById: Record<string, RiskAssessment> }) {
  const allActiveShipments = network.shipments.filter((shipment) => shipment.status !== 'Delivered')
  const [assignmentPage, setAssignmentPage] = useState(1)
  const assignmentPages = Math.max(1, Math.ceil(allActiveShipments.length / SHIPMENTS_PAGE_SIZE))
  const currentAssignmentPage = Math.min(assignmentPage, assignmentPages)
  const activeShipments = allActiveShipments.slice((currentAssignmentPage - 1) * SHIPMENTS_PAGE_SIZE, currentAssignmentPage * SHIPMENTS_PAGE_SIZE)
  const [hubPage, setHubPage] = useState(1)
  const hubPages = Math.max(1, Math.ceil(network.fleet.hubs.length / SHIPMENTS_PAGE_SIZE))
  const currentHubPage = Math.min(hubPage, hubPages)
  const hubStart = (currentHubPage - 1) * SHIPMENTS_PAGE_SIZE
  const [isDispatchOpen, setIsDispatchOpen] = useState(false)
  const [dispatchHub, setDispatchHub] = useState(network.fleet.hubs[0] ?? '')
  const [dispatchShipment, setDispatchShipment] = useState(allActiveShipments[0]?.id ?? '')
  const [dispatchVehicle, setDispatchVehicle] = useState('')
  const [dispatchNotice, setDispatchNotice] = useState('')
  const dispatch = useDispatchVehicle()
  const notify = (message: string) => {
    setDispatchNotice(message)
    window.setTimeout(() => setDispatchNotice(''), 3500)
  }
  const openDispatch = () => {
    setDispatchHub(network.fleet.hubs[0] ?? '')
    setDispatchShipment(allActiveShipments[0]?.id ?? '')
    setDispatchVehicle('')
    setIsDispatchOpen(true)
  }
  const submitDispatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch.mutate({ shipmentId: dispatchShipment, hub: dispatchHub, vehicle: dispatchVehicle }, {
      onSuccess: (created) => {
        setIsDispatchOpen(false)
        notify(`${created.vehicle ? `${created.vehicle} with ` : ''}${created.shipmentId} dispatched from ${created.hub} and saved to the database`)
      },
      onError: (caught) => notify(caught.message),
    })
  }
  const recentDispatches = network.dispatches.slice(0, SHIPMENTS_PAGE_SIZE)

  return <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> FLEET CONTROL</p><h1>Fleet<span>.</span></h1><p className="intro-copy">Monitor connected vehicles, hubs, and the shipments currently on the road.</p></div><button className="primary-button" onClick={openDispatch}><Truck size={17} /> Dispatch vehicle</button></section>
    <section className="metric-grid" aria-label="Fleet summary"><Metric icon={<Truck size={19} />} label="Vehicles connected" value={String(network.fleet.vehiclesConnected)} detail="Across the network" trend="Live" tone="blue" /><Metric icon={<Gauge size={19} />} label="In motion" value={String(network.fleet.vehiclesInMotion)} detail="Currently on route" trend="Active" tone="teal" up /><Metric icon={<Map size={19} />} label="At hubs" value={String(network.fleet.vehiclesAtHubs)} detail="Awaiting dispatch" trend="Ready" tone="orange" /><Metric icon={<Fuel size={19} />} label="Utilization" value={network.metrics.fleetUtilization.value} detail={network.metrics.fleetUtilization.detail} trend={network.metrics.fleetUtilization.trend} tone="red" /></section>
    <section className="content-grid"><div className="main-column"><article className="panel shipments-panel"><PanelHeading kicker="LIVE ASSIGNMENTS" title="Vehicles in motion"><span className="live-indicator"><span /> Live</span></PanelHeading><div className="shipment-list">{activeShipments.map((shipment) => <ShipmentRow key={shipment.id} shipment={shipment} risk={riskById[shipment.id]} />)}{activeShipments.length === 0 && <div className="empty-state"><Truck size={25} /><strong>No vehicles in motion</strong><span>All current shipments are at their destination.</span></div>}</div></article></div><div className="side-column"><article className="panel activity-panel"><PanelHeading kicker="DISTRIBUTION NETWORK" title="Hubs"><span className="footer-number">{network.fleet.hubs.length}</span></PanelHeading><div className="activity-list">{network.fleet.hubs.map((hub, index) => <div className="activity-item" key={hub}><span className="activity-icon blue"><Map size={15} /></span><div><strong>{hub}</strong><p>{index % 2 === 0 ? 'Operating normally' : 'Receiving vehicles'}</p></div><time>{index % 2 === 0 ? 'Active' : 'Inbound'}</time></div>)}</div></article><article className="panel activity-panel"><PanelHeading kicker="DISPATCH LOG" title="Recent dispatches"><span className="footer-number">{network.dispatches.length}</span></PanelHeading><div className="activity-list">{recentDispatches.map((entry) => <div className="activity-item" key={entry.id}><span className="activity-icon teal"><Truck size={15} /></span><div><strong>{entry.vehicle ? `${entry.vehicle} · ${entry.shipmentId}` : entry.shipmentId}</strong><p>Left {entry.hub} hub · by {entry.dispatchedBy}</p></div><time>{timeAgo(entry.createdAt)}</time></div>)}{recentDispatches.length === 0 && <div className="empty-state"><Truck size={25} /><strong>No dispatches yet</strong><span>Dispatch a vehicle and it will be logged here.</span></div>}</div></article></div></section>
    {allActiveShipments.length > SHIPMENTS_PAGE_SIZE && <div className="fleet-pagination"><span>Showing <strong>{(currentAssignmentPage - 1) * SHIPMENTS_PAGE_SIZE + 1}-{Math.min(currentAssignmentPage * SHIPMENTS_PAGE_SIZE, allActiveShipments.length)}</strong> of <strong>{allActiveShipments.length}</strong> assignments</span><div className="pagination"><button disabled={currentAssignmentPage === 1} onClick={() => setAssignmentPage(currentAssignmentPage - 1)} aria-label="Previous assignments page"><ChevronLeft size={15} /></button><span>Page {currentAssignmentPage} of {assignmentPages}</span><button disabled={currentAssignmentPage >= assignmentPages} onClick={() => setAssignmentPage(currentAssignmentPage + 1)} aria-label="Next assignments page"><ChevronRight size={15} /></button></div></div>}
    {network.fleet.hubs.length > SHIPMENTS_PAGE_SIZE && <div className="fleet-pagination fleet-hubs-pagination"><span>Showing <strong>{hubStart + 1}-{Math.min(hubStart + SHIPMENTS_PAGE_SIZE, network.fleet.hubs.length)}</strong> of <strong>{network.fleet.hubs.length}</strong> hubs</span><div className="pagination"><button disabled={currentHubPage === 1} onClick={() => setHubPage(currentHubPage - 1)} aria-label="Previous hubs page"><ChevronLeft size={15} /></button><span>Page {currentHubPage} of {hubPages}</span><button disabled={currentHubPage >= hubPages} onClick={() => setHubPage(currentHubPage + 1)} aria-label="Next hubs page"><ChevronRight size={15} /></button></div></div>}
    {dispatchNotice && <div className="created-notice" role="status"><Check size={16} /> {dispatchNotice}</div>}
    {isDispatchOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsDispatchOpen(false) }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="dispatch-vehicle-title"><div className="modal-heading"><div><p className="section-kicker">FLEET CONTROL</p><h2 id="dispatch-vehicle-title">Dispatch vehicle</h2><p>Assign an available vehicle to the next shipment leaving a distribution hub.</p></div><button className="modal-close" type="button" onClick={() => setIsDispatchOpen(false)} aria-label="Close dialog">×</button></div><form onSubmit={submitDispatch}><div className="form-grid"><label>Departure hub<select value={dispatchHub} onChange={(event) => setDispatchHub(event.target.value)} required>{network.fleet.hubs.map((hub) => <option key={hub}>{hub}</option>)}</select></label><label>Shipment<select value={dispatchShipment} onChange={(event) => setDispatchShipment(event.target.value)} required>{allActiveShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.id} · {shipment.destination}{shipment.status === 'At hub' ? ' (at hub)' : ''}</option>)}</select></label><label>Vehicle ID (optional)<input value={dispatchVehicle} onChange={(event) => setDispatchVehicle(event.target.value)} placeholder="e.g. NL-42" /></label></div><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setIsDispatchOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={!allActiveShipments.length || dispatch.isPending}>{dispatch.isPending ? <Loader2 size={16} className="spinning" /> : <Truck size={16} />} Dispatch vehicle</button></div></form></section></div>}
  </div>
}
function DriversPage({ network }: { network: NetworkContext }) {
  const driverUpdates = network.activity.filter((entry) => entry.kind === 'driver' || entry.kind === 'checkin')
  const [driverPage, setDriverPage] = useState(1)
  const driverPages = Math.max(1, Math.ceil(driverUpdates.length / SHIPMENTS_PAGE_SIZE))
  const currentDriverPage = Math.min(driverPage, driverPages)
  const driverPageStart = (currentDriverPage - 1) * SHIPMENTS_PAGE_SIZE
  const visibleDriverUpdates = driverUpdates.slice(driverPageStart, driverPageStart + SHIPMENTS_PAGE_SIZE)
  const drivers = network.drivers
  const onRoute = drivers.filter((driver) => driver.status === 'On route').length
  const hubsCovered = new Set(drivers.map((driver) => driver.hub)).size
  const [rosterPage, setRosterPage] = useState(1)
  const rosterPages = Math.max(1, Math.ceil(drivers.length / SHIPMENTS_PAGE_SIZE))
  const currentRosterPage = Math.min(rosterPage, rosterPages)
  const rosterPageStart = (currentRosterPage - 1) * SHIPMENTS_PAGE_SIZE
  const visibleDrivers = drivers.slice(rosterPageStart, rosterPageStart + SHIPMENTS_PAGE_SIZE)
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false)
  const [driverNotice, setDriverNotice] = useState('')
  const createDriver = useAddDriver()
  const notify = (message: string) => {
    setDriverNotice(message)
    window.setTimeout(() => setDriverNotice(''), 3500)
  }
  const addDriver = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    createDriver.mutate({
      name: String(formData.get('name') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      hub: String(formData.get('hub') ?? ''),
      license: String(formData.get('license') ?? ''),
    }, {
      onSuccess: (created) => {
        setIsAddDriverOpen(false)
        setRosterPage(1)
        notify(`${created.name} added to the driver roster and saved to the database`)
      },
      onError: (caught) => notify(caught.message),
    })
  }

  return <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> DRIVER OPERATIONS</p><h1>Drivers<span>.</span></h1><p className="intro-copy">Keep track of driver check-ins and the latest activity across your network.</p></div><button className="primary-button" onClick={() => setIsAddDriverOpen(true)}><Users size={17} /> Add driver</button></section>
    <section className="metric-grid" aria-label="Driver summary"><Metric icon={<Users size={19} />} label="Active drivers" value={String(drivers.length)} detail={`${onRoute} on route · ${hubsCovered} hub${hubsCovered === 1 ? '' : 's'} covered`} trend="Live" tone="teal" up /><Metric icon={<Truck size={19} />} label="Fleet connected" value={String(network.fleet.vehiclesConnected)} detail="Vehicles reporting" trend="Online" tone="blue" /><Metric icon={<Check size={19} />} label="Check-ins today" value={String(driverUpdates.length)} detail="Recent driver activity" trend="Updated" tone="orange" /><Metric icon={<AlertTriangle size={19} />} label="Needs attention" value={network.metrics.needsAttention.value} detail={network.metrics.needsAttention.detail} trend={network.metrics.needsAttention.trend} tone="red" /></section>
    <section className="content-grid"><div className="main-column"><article className="panel activity-panel"><PanelHeading kicker="DRIVER ACTIVITY" title="Latest check-ins"><div className="live-indicator"><span /> Live</div></PanelHeading><div className="activity-list">{visibleDriverUpdates.map((entry) => <ActivityItem key={entry.id} icon={entry.kind === 'driver' ? <Users size={15} /> : <Truck size={15} />} tone={entry.kind === 'driver' ? 'purple' : 'blue'} title={entry.title} body={entry.body} time={timeAgo(entry.occurredAt)} />)}{driverUpdates.length === 0 && <div className="empty-state"><Users size={25} /><strong>No driver activity yet</strong><span>Check-ins will appear here as drivers report in.</span></div>}</div>{driverUpdates.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{driverPageStart + 1}-{Math.min(driverPageStart + SHIPMENTS_PAGE_SIZE, driverUpdates.length)} of {driverUpdates.length}</span><button disabled={currentDriverPage === 1} onClick={() => setDriverPage(currentDriverPage - 1)} aria-label="Previous driver activity page"><ChevronLeft size={14} /></button><strong>{currentDriverPage}</strong><button disabled={currentDriverPage >= driverPages} onClick={() => setDriverPage(currentDriverPage + 1)} aria-label="Next driver activity page"><ChevronRight size={14} /></button></div>}</article></div><div className="side-column"><article className="panel activity-panel"><PanelHeading kicker="ROSTER" title="Drivers"><span className="footer-number">{drivers.length}</span></PanelHeading><div className="activity-list">{visibleDrivers.map((driver) => <div className="activity-item" key={driver.id}><span className={`activity-icon ${driver.status === 'On route' ? 'teal' : driver.status === 'Available' ? 'green' : 'orange'}`}><Users size={15} /></span><div><strong>{driver.name}</strong><p>{driver.hub} hub · {driver.license} · {driver.phone}</p></div><time>{driver.status}</time></div>)}{drivers.length === 0 && <div className="empty-state"><Users size={25} /><strong>No drivers yet</strong><span>Add a driver to start building the roster.</span></div>}</div>{drivers.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{rosterPageStart + 1}-{Math.min(rosterPageStart + SHIPMENTS_PAGE_SIZE, drivers.length)} of {drivers.length}</span><button disabled={currentRosterPage === 1} onClick={() => setRosterPage(currentRosterPage - 1)} aria-label="Previous roster page"><ChevronLeft size={14} /></button><strong>{currentRosterPage}</strong><button disabled={currentRosterPage >= rosterPages} onClick={() => setRosterPage(currentRosterPage + 1)} aria-label="Next roster page"><ChevronRight size={14} /></button></div>}</article></div></section>
    {driverNotice && <div className="created-notice" role="status"><Check size={16} /> {driverNotice}</div>}
    {isAddDriverOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsAddDriverOpen(false) }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="add-driver-title"><div className="modal-heading"><div><p className="section-kicker">DRIVER OPERATIONS</p><h2 id="add-driver-title">Add driver</h2><p>Add a driver to your operations roster and assign their home hub.</p></div><button className="modal-close" type="button" onClick={() => setIsAddDriverOpen(false)} aria-label="Close dialog">×</button></div><form onSubmit={addDriver}><div className="form-grid"><label>Driver name<input name="name" required placeholder="e.g. Jordan Lee" /></label><label>Phone number<input name="phone" type="tel" required placeholder="e.g. +31 20 555 0180" /></label><label>Home hub<select name="hub" defaultValue={network.fleet.hubs[0] ?? ''}>{network.fleet.hubs.map((hub) => <option key={hub}>{hub}</option>)}</select></label><label>License class<select name="license" defaultValue="Class C"><option>Class C</option><option>Class CE</option><option>Class D</option></select></label></div><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setIsAddDriverOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={createDriver.isPending}>{createDriver.isPending ? <Loader2 size={16} className="spinning" /> : <Users size={16} />} Add driver</button></div></form></section></div>}
  </div>
}
function AnalyticsPage({ network }: { network: NetworkContext }) {
  const delivered = network.shipments.filter((shipment) => shipment.status === 'Delivered').length
  const inTransit = network.shipments.filter((shipment) => shipment.status === 'In transit').length
  const atHub = network.shipments.filter((shipment) => shipment.status === 'At hub').length
  const averageProgress = network.shipments.length ? Math.round(network.shipments.reduce((total, shipment) => total + shipment.progress, 0) / network.shipments.length) : 0
  const statusTotal = Math.max(1, network.shipments.length)
  const statusBars = [{ label: 'In transit', value: inTransit, tone: 'orange' }, { label: 'At hub', value: atHub, tone: 'coral' }, { label: 'Delivered', value: delivered, tone: 'teal' }]
  const [pulsePage, setPulsePage] = useState(1)
  const pulsePages = Math.max(1, Math.ceil(network.activity.length / SHIPMENTS_PAGE_SIZE))
  const currentPulsePage = Math.min(pulsePage, pulsePages)
  const pulseStart = (currentPulsePage - 1) * SHIPMENTS_PAGE_SIZE
  const visiblePulse = network.activity.slice(pulseStart, pulseStart + SHIPMENTS_PAGE_SIZE)
  const [exportNotice, setExportNotice] = useState('')
  const notify = (message: string) => {
    setExportNotice(message)
    window.setTimeout(() => setExportNotice(''), 3500)
  }
  const createReport = useCreateReport()
  const exportReport = () => {
    createReport.mutate({ kind: 'analytics' }, {
      onSuccess: ({ report, csv }) => {
        downloadCsv(csv, report.filename)
        notify(`Report #${report.id} exported and saved to the database`)
      },
      onError: (caught) => notify(caught.message),
    })
  }

  return <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> NETWORK INTELLIGENCE</p><h1>Analytics<span>.</span></h1><p className="intro-copy">Understand shipment performance and network activity at a glance.</p></div><button className="secondary-button" onClick={exportReport} disabled={createReport.isPending}>{createReport.isPending ? <Loader2 size={15} className="spinning" /> : <Download size={15} />} Export report</button></section>
    <section className="metric-grid" aria-label="Analytics summary"><Metric icon={<PackageCheck size={19} />} label="Total shipments" value={String(network.shipments.length)} detail="Across all statuses" trend="Tracked" tone="blue" /><Metric icon={<Gauge size={19} />} label="Average progress" value={`${averageProgress}%`} detail="Across all shipments" trend="Live" tone="teal" up /><Metric icon={<Check size={19} />} label="Delivered" value={String(delivered)} detail="Completed shipments" trend={`${Math.round(delivered / statusTotal * 100)}%`} tone="orange" /><Metric icon={<Activity size={19} />} label="Activity entries" value={String(network.activity.length)} detail="Logged in the network" trend="Updated" tone="red" /></section>
    <section className="content-grid"><div className="main-column"><article className="panel chart-panel"><PanelHeading kicker="SHIPMENT MIX" title="Current status"><span className="footer-number">{network.shipments.length}</span></PanelHeading><div className="analytics-bars">{statusBars.map((item) => <div className="analytics-bar-row" key={item.label}><div className="analytics-bar-label"><span>{item.label}</span><strong>{item.value}</strong></div><div className="analytics-bar-track"><i className={item.tone} style={{ width: `${item.value / statusTotal * 100}%` }} /></div></div>)}</div></article><article className="panel activity-panel"><PanelHeading kicker="NETWORK PULSE" title="Recent activity"><span className="footer-number">{network.activity.length}</span></PanelHeading><div className="activity-list">{visiblePulse.map((entry) => <ActivityItem key={entry.id} icon={ACTIVITY_STYLE[entry.kind]?.icon ?? <Activity size={15} />} tone={ACTIVITY_STYLE[entry.kind]?.tone ?? 'blue'} title={entry.title} body={entry.body} time={timeAgo(entry.occurredAt)} />)}</div>{network.activity.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{pulseStart + 1}-{Math.min(pulseStart + SHIPMENTS_PAGE_SIZE, network.activity.length)} of {network.activity.length}</span><button disabled={currentPulsePage === 1} onClick={() => setPulsePage(currentPulsePage - 1)} aria-label="Previous network pulse page"><ChevronLeft size={14} /></button><strong>{currentPulsePage}</strong><button disabled={currentPulsePage >= pulsePages} onClick={() => setPulsePage(currentPulsePage + 1)} aria-label="Next network pulse page"><ChevronRight size={14} /></button></div>}</article></div><div className="side-column"><article className="panel activity-panel"><PanelHeading kicker="PERFORMANCE" title="Network signals"><div className="live-indicator"><span /> Live</div></PanelHeading><div className="analytics-signals"><div><span>On-time rate</span><strong>{network.metrics.onTimeRate.value}</strong><small>{network.metrics.onTimeRate.detail}</small></div><div><span>Fleet utilization</span><strong>{network.metrics.fleetUtilization.value}</strong><small>{network.metrics.fleetUtilization.detail}</small></div><div><span>Needs attention</span><strong>{network.metrics.needsAttention.value}</strong><small>{network.metrics.needsAttention.detail}</small></div></div></article><SavedReportsPanel kind="analytics" /></div></section>
    {exportNotice && <div className="created-notice" role="status"><Check size={16} /> {exportNotice}</div>}
  </div>
}
/** Triggers a browser download of CSV text the server just generated. */
function downloadCsv(csv: string, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

/** The signed-in user's saved exports of one kind, from SQLite, each with a re-download link. */
function SavedReportsPanel({ kind }: { kind: ReportKind }) {
  const { data: allReports = [], isLoading } = useReports()
  const reports = allReports.filter((report) => report.kind === kind)
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(reports.length / SHIPMENTS_PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * SHIPMENTS_PAGE_SIZE
  const visible = reports.slice(start, start + SHIPMENTS_PAGE_SIZE)
  return <article className="panel activity-panel saved-reports-panel"><PanelHeading kicker="EXPORT HISTORY" title="Saved reports"><span className="footer-number">{reports.length}</span></PanelHeading><div className="activity-list">{visible.map((report) => <div className="activity-item" key={report.id}><span className="activity-icon blue"><Download size={15} /></span><div><strong>Report #{report.id} · {report.kind}</strong><p>{report.rowCount} rows · {report.filename}</p></div><a className="report-download" href={reportDownloadUrl(report.id)} download={report.filename} title="Download again">{timeAgo(report.createdAt)} <Download size={12} /></a></div>)}{!isLoading && reports.length === 0 && <div className="empty-state"><Download size={25} /><strong>No saved reports</strong><span>Export a report and it will be kept here for re-download.</span></div>}</div>{reports.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{start + 1}-{Math.min(start + SHIPMENTS_PAGE_SIZE, reports.length)} of {reports.length}</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous saved reports page"><ChevronLeft size={14} /></button><strong>{currentPage}</strong><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} aria-label="Next saved reports page"><ChevronRight size={14} /></button></div>}</article>
}
function RoutesPage({ network }: { network: NetworkContext }) {
  const routes = Array.from(new globalThis.Map<string, Shipment>(network.shipments.map((shipment) => [`${shipment.origin}-${shipment.destination}`, shipment])).values())
  const activeRoutes = routes.filter((shipment) => shipment.status !== 'Delivered').length
  const averageProgress = routes.length ? Math.round(routes.reduce((total, shipment) => total + shipment.progress, 0) / routes.length) : 0
  const [routePage, setRoutePage] = useState(1)
  const routePages = Math.max(1, Math.ceil(routes.length / SHIPMENTS_PAGE_SIZE))
  const currentRoutePage = Math.min(routePage, routePages)
  const routeStart = (currentRoutePage - 1) * SHIPMENTS_PAGE_SIZE
  const visibleRoutes = routes.slice(routeStart, routeStart + SHIPMENTS_PAGE_SIZE)
  const [exportNotice, setExportNotice] = useState('')
  const notify = (message: string) => {
    setExportNotice(message)
    window.setTimeout(() => setExportNotice(''), 3500)
  }
  const createReport = useCreateReport()
  const exportRoutes = () => {
    createReport.mutate({ kind: 'routes' }, {
      onSuccess: ({ report, csv }) => {
        downloadCsv(csv, report.filename)
        notify(`Report #${report.id} exported and saved to the database`)
      },
      onError: (caught) => notify(caught.message),
    })
  }

  return <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> ROUTE CONTROL</p><h1>Routes<span>.</span></h1><p className="intro-copy">Review active corridors, route progress, and delivery performance across your network.</p></div><button className="primary-button" onClick={exportRoutes} disabled={createReport.isPending}>{createReport.isPending ? <Loader2 size={15} className="spinning" /> : <Download size={15} />} Export routes</button></section>
    <section className="metric-grid" aria-label="Route summary"><Metric icon={<Map size={19} />} label="Active routes" value={String(activeRoutes)} detail="Currently moving" trend="Live" tone="teal" up /><Metric icon={<Gauge size={19} />} label="Average progress" value={`${averageProgress}%`} detail="Across unique routes" trend="Tracked" tone="blue" /><Metric icon={<Truck size={19} />} label="Vehicles in motion" value={String(network.fleet.vehiclesInMotion)} detail="On active corridors" trend="Active" tone="orange" /><Metric icon={<Check size={19} />} label="On-time rate" value={network.metrics.onTimeRate.value} detail={network.metrics.onTimeRate.detail} trend={network.metrics.onTimeRate.trend} tone="red" /></section>
    <article className="panel activity-panel routes-panel"><PanelHeading kicker="NETWORK CORRIDORS" title="Active routes"><span className="footer-number">{routes.length}</span></PanelHeading><div className="route-list">{visibleRoutes.map((shipment) => <div className="route-card" key={`${shipment.origin}-${shipment.destination}`}><div className="route-card-head"><div><strong>{shipment.origin}</strong><ArrowRight size={15} /><strong>{shipment.destination}</strong></div><span className={`status status-${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span></div><div className="route-card-meta"><span>{shipment.customer}</span><span>{shipment.eta}</span><strong>{shipment.progress}% complete</strong></div><div className="route-card-progress"><i style={{ width: `${shipment.progress}%`, backgroundColor: shipment.color }} /></div></div>)}{routes.length === 0 && <div className="empty-state"><Map size={25} /><strong>No routes available</strong><span>Routes will appear when shipments are added.</span></div>}</div>{routes.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{routeStart + 1}-{Math.min(routeStart + SHIPMENTS_PAGE_SIZE, routes.length)} of {routes.length}</span><button disabled={currentRoutePage === 1} onClick={() => setRoutePage(currentRoutePage - 1)} aria-label="Previous routes page"><ChevronLeft size={14} /></button><strong>{currentRoutePage}</strong><button disabled={currentRoutePage >= routePages} onClick={() => setRoutePage(currentRoutePage + 1)} aria-label="Next routes page"><ChevronRight size={14} /></button></div>}</article>
    <SavedReportsPanel kind="routes" />
    {exportNotice && <div className="created-notice" role="status"><Check size={16} /> {exportNotice}</div>}
  </div>
}
function SettingsPage({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const { data: settings, isLoading, error, refetch } = useSettings()
  const save = useSaveSettings()
  const [savedNotice, setSavedNotice] = useState('')
  const notify = (message: string) => {
    setSavedNotice(message)
    window.setTimeout(() => setSavedNotice(''), 3000)
  }
  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    save.mutate({
      name: String(formData.get('name') ?? ''),
      workspace: String(formData.get('workspace') ?? ''),
      riskAlerts: formData.get('riskAlerts') === 'on',
      driverUpdates: formData.get('driverUpdates') === 'on',
      dailyBriefing: formData.get('dailyBriefing') === 'on',
    }, {
      onSuccess: (result) => {
        onUserChange(result.user)
        notify('Settings saved to the database')
      },
      onError: (caught) => notify(caught.message),
    })
  }

  return <div className="dashboard-content settings-page"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> WORKSPACE PREFERENCES</p><h1>Settings<span>.</span></h1><p className="intro-copy">Manage your profile, workspace preferences, and operational notifications.</p></div></section>
    {!settings ? <DataState loading={isLoading} error={error} onRetry={() => void refetch()} /> : <form key={settings.updatedAt ?? 'defaults'} onSubmit={saveSettings}><section className="settings-grid"><article className="panel settings-panel"><div className="settings-panel-heading"><div><p className="section-kicker">PROFILE</p><h2>Account details</h2></div><span className="settings-avatar">{initials(settings.name)}</span></div><div className="form-grid"><label>Full name<input name="name" defaultValue={settings.name} maxLength={80} required /></label><label>Email address<input name="email" type="email" defaultValue={user.email} readOnly /></label><label>Role<input name="role" defaultValue={user.role} readOnly /></label><label>Workspace<input name="workspace" defaultValue={settings.workspace} maxLength={80} /></label></div></article><article className="panel settings-panel"><div className="settings-panel-heading"><div><p className="section-kicker">NOTIFICATIONS</p><h2>Stay informed</h2></div><Bell size={18} className="settings-heading-icon" /></div><label className="settings-toggle"><span><strong>Delay risk alerts</strong><small>Notify me when shipments need attention.</small></span><input type="checkbox" name="riskAlerts" defaultChecked={settings.riskAlerts} /></label><label className="settings-toggle"><span><strong>Driver check-ins</strong><small>Receive updates when drivers report in.</small></span><input type="checkbox" name="driverUpdates" defaultChecked={settings.driverUpdates} /></label><label className="settings-toggle"><span><strong>Daily briefing</strong><small>Send a summary of network activity each morning.</small></span><input type="checkbox" name="dailyBriefing" defaultChecked={settings.dailyBriefing} /></label></article></section><div className="settings-actions"><span className="settings-saved-at">{settings.updatedAt ? `Last saved ${timeAgo(settings.updatedAt)}` : 'Using default preferences'}</span><button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 size={16} className="spinning" /> : <Check size={16} />} Save settings</button></div></form>}
    {savedNotice && <div className="created-notice" role="status"><Check size={16} /> {savedNotice}</div>}</div>
}
function HelpPage() {
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [isContactOpen, setIsContactOpen] = useState(false)
  const topics = [
    { title: 'Getting started', detail: 'Learn how to read your network overview and daily briefing.' },
    { title: 'Managing shipments', detail: 'Create shipments, filter statuses, export tracking data, and flag risk.' },
    { title: 'Fleet and drivers', detail: 'Dispatch vehicles, review driver activity, and monitor hub coverage.' },
    { title: 'AI assistant', detail: 'Ask about delays, customers, corridors, and shipment tracking IDs.' },
    { title: 'Account settings', detail: 'Update workspace preferences and notification choices.' },
    { title: 'Data and exports', detail: 'Download analytics, route, and shipment reports as CSV files.' },
  ]
  const visibleTopics = topics.filter((topic) => `${topic.title} ${topic.detail}`.toLowerCase().includes(query.toLowerCase()))
  const { data: requests = [], isLoading: isLoadingRequests } = useSupportRequests()
  const sendRequest = useCreateSupportRequest()
  const [requestPage, setRequestPage] = useState(1)
  const requestPages = Math.max(1, Math.ceil(requests.length / SHIPMENTS_PAGE_SIZE))
  const currentRequestPage = Math.min(requestPage, requestPages)
  const requestPageStart = (currentRequestPage - 1) * SHIPMENTS_PAGE_SIZE
  const visibleRequests = requests.slice(requestPageStart, requestPageStart + SHIPMENTS_PAGE_SIZE)
  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }
  const contactSupport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    sendRequest.mutate({ subject: String(formData.get('subject') ?? ''), message: String(formData.get('message') ?? '') }, {
      onSuccess: (created) => {
        setIsContactOpen(false)
        setRequestPage(1)
        notify(`Request SR-${created.id} sent to support and saved to the database`)
      },
      onError: (caught) => notify(caught.message),
    })
  }

  return <div className="dashboard-content help-page"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> SUPPORT CENTER</p><h1>Help center<span>.</span></h1><p className="intro-copy">Find quick answers for the tools that keep your operation moving.</p></div><button className="primary-button" onClick={() => setIsContactOpen(true)}><CircleHelp size={17} /> Contact support</button></section><article className="panel help-search-panel"><div className="help-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics..." aria-label="Search help topics" /></div></article><section className="help-topic-grid">{visibleTopics.map((topic) => <article className="panel help-topic" key={topic.title}><span className="help-topic-icon"><CircleHelp size={17} /></span><div><h2>{topic.title}</h2><p>{topic.detail}</p><button className="text-button" onClick={() => setNotice(`${topic.title}: ${topic.detail}`)}>View topic <ArrowUpRight size={14} /></button></div></article>)}{visibleTopics.length === 0 && <article className="panel help-empty"><CircleHelp size={25} /><strong>No help topics found</strong><span>Try a different search term.</span></article>}</section><article className="panel activity-panel help-requests-panel"><PanelHeading kicker="YOUR REQUESTS" title="Support requests"><span className="footer-number">{requests.length}</span></PanelHeading><div className="activity-list">{visibleRequests.map((request) => <div className="activity-item" key={request.id}><span className={`activity-icon ${request.status === 'Open' ? 'orange' : 'green'}`}><Mail size={15} /></span><div><strong>SR-{request.id} · {request.subject}</strong><p>{request.message.length > 140 ? `${request.message.slice(0, 140)}…` : request.message}</p></div><time>{request.status} · {timeAgo(request.createdAt)}</time></div>)}{!isLoadingRequests && requests.length === 0 && <div className="empty-state"><Mail size={25} /><strong>No support requests yet</strong><span>Use "Contact support" and your request will be saved here.</span></div>}</div>{requests.length > SHIPMENTS_PAGE_SIZE && <div className="activity-pagination"><span>{requestPageStart + 1}-{Math.min(requestPageStart + SHIPMENTS_PAGE_SIZE, requests.length)} of {requests.length}</span><button disabled={currentRequestPage === 1} onClick={() => setRequestPage(currentRequestPage - 1)} aria-label="Previous support requests page"><ChevronLeft size={14} /></button><strong>{currentRequestPage}</strong><button disabled={currentRequestPage >= requestPages} onClick={() => setRequestPage(currentRequestPage + 1)} aria-label="Next support requests page"><ChevronRight size={14} /></button></div>}</article>{notice && <div className="created-notice" role="status"><Check size={16} /> {notice}</div>}{isContactOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsContactOpen(false) }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="contact-support-title"><div className="modal-heading"><div><p className="section-kicker">SUPPORT CENTER</p><h2 id="contact-support-title">Contact support</h2><p>Tell us what happened and we will help you get moving again. Your request is saved to your account.</p></div><button className="modal-close" type="button" onClick={() => setIsContactOpen(false)} aria-label="Close dialog">×</button></div><form onSubmit={contactSupport}><div className="form-grid"><label>Subject<input name="subject" required maxLength={120} defaultValue="Help with Haulio" /></label><label className="form-grid-wide">What can we help with?<textarea name="message" required maxLength={4000} rows={5} placeholder="Describe the issue you are seeing..." /></label></div><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setIsContactOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={sendRequest.isPending}>{sendRequest.isPending ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />} Send request</button></div></form></section></div>}</div>
}
function FullShipmentRow({ shipment, onAction, onReview, risk }: { shipment: Shipment; onAction: (message: string) => void; onReview: (shipment: Shipment) => void; risk?: RiskAssessment }) { const [isMenuOpen, setIsMenuOpen] = useState(false); const copyId = async () => { await navigator.clipboard?.writeText(shipment.id); setIsMenuOpen(false); onAction(`${shipment.id} copied to clipboard`) }; return <div className="full-shipment-row"><div className="full-id"><span className="shipment-color" style={{ backgroundColor: shipment.color }} /><div><strong>{shipment.id}</strong><small>{shipment.customer}</small></div></div><div className="full-route"><strong>{shipment.origin}</strong><ArrowUpRight size={13} /><strong>{shipment.destination}</strong></div><div className="full-progress"><div><i style={{ width: `${shipment.progress}%`, backgroundColor: shipment.color }} /></div><span>{shipment.progress}%</span></div><div className="full-eta"><Clock3 size={14} /><span>{shipment.eta}</span></div><span className={`status status-${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span><RiskBadge assessment={risk} /><div className="row-actions"><button className="row-more" aria-label={`More options for ${shipment.id}`} onClick={() => setIsMenuOpen(!isMenuOpen)}><MoreHorizontal size={17} /></button>{isMenuOpen && <div className="row-menu"><button onClick={copyId}>Copy tracking ID</button><button onClick={() => { setIsMenuOpen(false); onReview(shipment) }}>Mark for review</button></div>}</div></div> }
export default App
