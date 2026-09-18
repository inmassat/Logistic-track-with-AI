import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Database, Download, Eye, EyeOff, Filter, Flag, Fuel, Gauge, LayoutDashboard, Loader2, LockKeyhole, LogOut, Mail, Map, MoreHorizontal, PackageCheck, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Sparkles, Truck, Users, Zap } from 'lucide-react'
import BriefingCard from './components/BriefingCard'
import CopilotPanel from './components/CopilotPanel'
import RiskBadge from './components/RiskBadge'
import SmartSearch from './components/SmartSearch'
import type { ActivityEntry, ActivityKind, NetworkContext, Shipment, ShipmentStatus } from './data/network'
import type { RiskAssessment, SearchResult } from './lib/ai'
import { greeting, longDate, shortDate, timeAgo } from './lib/format'
import { useCreateShipment, useMarkForReview, useNetwork } from './lib/useNetwork'
import { useRiskAssessments } from './lib/useRiskAssessments'
import './App.css'
import './ai.css'

const EMPTY_SHIPMENTS: Shipment[] = []
const EMPTY_ACTIVITY: ActivityEntry[] = []
const ACTIVITY_PAGE_SIZE = 4
const SHIPMENTS_PAGE_SIZE = 5
const STATUS_TABS = ['All', 'In transit', 'At hub', 'Delivered'] as const

const ACTIVITY_STYLE: Record<ActivityKind, { icon: React.ReactNode; tone: string }> = {
  delivered: { icon: <Check size={15} />, tone: 'green' },
  delay: { icon: <AlertTriangle size={15} />, tone: 'orange' },
  fuel: { icon: <Fuel size={15} />, tone: 'blue' },
  driver: { icon: <Users size={15} />, tone: 'purple' },
  booked: { icon: <PackageCheck size={15} />, tone: 'green' },
  checkin: { icon: <Truck size={15} />, tone: 'blue' },
  review: { icon: <Flag size={15} />, tone: 'orange' },
}

const volumePeriods = {
  'This week': { total: 186, trend: '8.4%', bars: [42, 58, 51, 76, 69, 92, 62], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  'Last week': { total: 172, trend: '4.1%', bars: [36, 64, 48, 61, 74, 68, 55], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  'This month': { total: 748, trend: '11.6%', bars: [48, 57, 68, 52, 81, 73, 92], labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'] },
} as const

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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
  const [isCopilotOpen, setIsCopilotOpen] = useState(false)
  const volume = volumePeriods[volumePeriod]

  const { data: network, isLoading, error, refetch, isFetching } = useNetwork()
  const { byId: riskById } = useRiskAssessments(network)
  const shipments = network?.shipments ?? EMPTY_SHIPMENTS
  const activity = network?.activity ?? EMPTY_ACTIVITY

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

  const navItems = [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Shipments', icon: PackageCheck, count: network ? String(shipments.length) : undefined }, { label: 'Fleet', icon: Truck }, { label: 'Routes', icon: Map }]

  if (!isAuthenticated) return <LoginPage onLogin={() => setIsAuthenticated(true)} />
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><span /></span><span>haul<span className="brand-dot">.</span>io</span></div><div className="workspace-switcher"><span className="workspace-avatar">AH</span><span><strong>Atlas Haulage</strong><small>Operations workspace</small></span><ChevronDown size={15} /></div>
      <nav className="main-nav" aria-label="Main navigation"><small className="nav-label">WORKSPACE</small>{navItems.map(({ label, icon: Icon, count }) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(label)}><Icon size={18} /><span>{label}</span>{count && <em>{count}</em>}</button>)}<small className="nav-label nav-label-spaced">MANAGE</small><button className="nav-item" onClick={() => setActiveNav('Drivers')}><Users size={18} /><span>Drivers</span></button><button className="nav-item" onClick={() => setActiveNav('Analytics')}><Activity size={18} /><span>Analytics</span></button></nav>
      <div className="sidebar-bottom"><button className="nav-item"><Settings size={18} /><span>Settings</span></button><button className="nav-item"><CircleHelp size={18} /><span>Help center</span></button><div className="profile"><div className="profile-avatar">JM</div><span><strong>Jamie Morgan</strong><small>Fleet manager</small></span><button className="logout-button" onClick={() => { setActiveNav('Overview'); setIsAuthenticated(false) }} aria-label="Log out"><LogOut size={16} /><span>Log out</span></button></div></div>
    </aside>
    <main className="main-content"><header className="topbar"><div className="crumbs"><span>Workspace</span><span>/</span><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Refresh data" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={18} className={isFetching ? 'spinning' : ''} /></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><button className="copilot-trigger" onClick={() => setIsCopilotOpen(true)}><Sparkles size={15} /> Ask copilot</button><div className="top-date"><CalendarDays size={16} /><span>{shortDate()}</span></div></div></header>
      <div className="page-content">{!network ? <DataState loading={isLoading} error={error} onRetry={() => void refetch()} /> : activeNav === 'Shipments' ? <ShipmentsPage network={network} riskById={riskById} /> : <div className="dashboard-content"><section className="page-intro"><div><p className="eyebrow"><span className="status-pulse" /> {longDate()}</p><h1>{greeting()}, Jamie<span>.</span></h1><p className="intro-copy">Here is what is happening across your network today.</p></div><button className="primary-button" onClick={() => setActiveNav('Shipments')}><Plus size={17} /> New shipment</button></section>
        <section className="metric-grid" aria-label="Network summary"><Metric icon={<Truck size={19} />} label="Active shipments" value={network.metrics.activeShipments.value} detail={network.metrics.activeShipments.detail} trend={network.metrics.activeShipments.trend} tone="orange" up /><Metric icon={<Gauge size={19} />} label="On-time rate" value={network.metrics.onTimeRate.value} detail={network.metrics.onTimeRate.detail} trend={network.metrics.onTimeRate.trend} tone="teal" up /><Metric icon={<Fuel size={19} />} label="Fleet utilization" value={network.metrics.fleetUtilization.value} detail={network.metrics.fleetUtilization.detail} trend={network.metrics.fleetUtilization.trend} tone="blue" /><Metric icon={<AlertTriangle size={19} />} label="Needs attention" value={network.metrics.needsAttention.value} detail={network.metrics.needsAttention.detail} trend={network.metrics.needsAttention.trend} tone="red" /></section>
        <BriefingCard context={network} />
        <section className="content-grid"><div className="main-column"><article className="panel map-panel"><PanelHeading kicker="NETWORK PULSE" title="Live route overview"><div className="heading-actions"><span className="live-indicator"><span /> Live</span><button className={liveTracking ? 'toggle is-on' : 'toggle'} onClick={() => setLiveTracking(!liveTracking)} aria-label="Toggle live tracking"><span /></button><button className="more-button" aria-label="More options"><MoreHorizontal size={19} /></button></div></PanelHeading><div className="map-canvas"><div className="map-label label-north">NORTH SEA</div><div className="map-label label-paris">PARIS</div><div className="map-label label-berlin">BERLIN</div><div className="map-label label-milan">MILAN</div><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="route-line route-one" /><div className="route-line route-two" /><div className="route-line route-three" /><MapNode className="node-antwerp" label="Antwerp" /><MapNode className="node-rotterdam" label="Rotterdam" /><MapNode className="node-paris" label="Paris" /><MapNode className="node-berlin" label="Berlin" /><MapNode className="node-milan" label="Milan" /><div className="vehicle-marker vehicle-a"><Truck size={14} /></div><div className="vehicle-marker vehicle-b"><Truck size={14} /></div><div className="map-zoom"><button>+</button><button>-</button></div><div className="map-legend"><span><i className="legend-dot green" /> On route</span><span><i className="legend-dot amber" /> At hub</span></div></div><div className="map-footer"><span><span className="footer-number">{network.fleet.vehiclesInMotion}</span> vehicles in motion</span><span><span className="footer-number">{String(network.fleet.vehiclesAtHubs).padStart(2, '0')}</span> at distribution hubs</span><span className="map-updated"><Zap size={13} /> Updated {timeAgo(network.asOf)}</span></div></article>
          <article className="panel shipments-panel"><PanelHeading kicker="OPERATIONS" title="Active shipments"><button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : 'View all shipments'} <ArrowUpRight size={15} /></button></PanelHeading><div className="shipment-filters"><div className="filter-tabs">{STATUS_TABS.map((item) => <button key={item} className={filter === item ? 'filter-tab selected' : 'filter-tab'} onClick={() => setFilter(item)}>{item}{item === 'All' && <span>{shipments.length}</span>}</button>)}</div><div className="period-menu"><button className="filter-button" onClick={() => setIsShipmentSortOpen(!isShipmentSortOpen)} aria-expanded={isShipmentSortOpen}><span>Sort: {shipmentSort}</span><ChevronDown size={14} /></button>{isShipmentSortOpen && <div className="period-popover shipment-sort-popover">{(['ETA', 'Progress', 'Shipment ID'] as const).map((sortOption) => <button key={sortOption} className={sortOption === shipmentSort ? 'period-option selected' : 'period-option'} onClick={() => { setShipmentSort(sortOption); setIsShipmentSortOpen(false) }}>{sortOption}</button>)}</div>}</div></div><div className="shipment-list">{visibleShipments.map((shipment) => <ShipmentRow key={shipment.id} shipment={shipment} risk={riskById[shipment.id]} />)}{visibleShipments.length === 0 && <div className="empty-state"><PackageCheck size={25} /><strong>No shipments in this status</strong><span>Try another tab.</span></div>}</div></article></div>
          <div className="side-column"><article className="panel chart-panel"><PanelHeading kicker="THROUGHPUT" title="Shipment volume"><div className="period-menu"><button className="filter-button" onClick={() => setIsVolumeMenuOpen(!isVolumeMenuOpen)} aria-expanded={isVolumeMenuOpen}><span>{volumePeriod}</span><ChevronDown size={14} /></button>{isVolumeMenuOpen && <div className="period-popover">{(Object.keys(volumePeriods) as Array<keyof typeof volumePeriods>).map((period) => <button key={period} className={period === volumePeriod ? 'period-option selected' : 'period-option'} onClick={() => { setVolumePeriod(period); setIsVolumeMenuOpen(false) }}>{period}</button>)}</div>}</div></PanelHeading><div className="chart-total"><strong>{volume.total}</strong><span>shipments dispatched</span><em><ArrowUpRight size={14} /> {volume.trend}</em></div><div className="bar-chart">{volume.bars.map((height, index) => <div className="bar-column" key={`${volumePeriod}-${index}`}><div className={index === 5 ? 'bar active' : 'bar'} style={{ height: `${height}%` }} /><small>{volume.labels[index]}</small></div>)}</div></article><article className="panel activity-panel"><PanelHeading kicker="LATEST UPDATES" title="Activity"><div className="activity-menu"><button className="more-button" aria-label="More activity options" onClick={() => setIsActivityMenuOpen(!isActivityMenuOpen)} aria-expanded={isActivityMenuOpen}><MoreHorizontal size={19} /></button>{isActivityMenuOpen && <div className="activity-popover"><button onClick={() => setIsActivityMenuOpen(false)}>Mark all as read</button><button onClick={() => { setActivityPage(Math.min(2, activityPages)); setIsActivityMenuOpen(false) }}>Show all updates</button></div>}</div></PanelHeading><div className="activity-list">{activityRows.map((entry) => <ActivityItem key={entry.id} icon={ACTIVITY_STYLE[entry.kind]?.icon ?? <Activity size={15} />} tone={ACTIVITY_STYLE[entry.kind]?.tone ?? 'blue'} title={entry.title} body={entry.body} time={timeAgo(entry.occurredAt)} />)}{activityRows.length === 0 && <div className="empty-state"><Activity size={25} /><strong>No activity yet</strong><span>Updates will appear here as they are logged.</span></div>}</div><div className="activity-pagination"><span>{activityFrom}-{activityTo} of {activity.length}</span><button disabled={currentActivityPage === 1} onClick={() => setActivityPage(currentActivityPage - 1)} aria-label="Previous activity page"><ChevronLeft size={14} /></button><strong>{currentActivityPage}</strong><button disabled={currentActivityPage >= activityPages} onClick={() => setActivityPage(currentActivityPage + 1)} aria-label="Next activity page"><ChevronRight size={14} /></button></div></article></div></section>
      </div>}</div></main>
    {network && <CopilotPanel open={isCopilotOpen} onClose={() => setIsCopilotOpen(false)} context={network} />}
  </div>
}
function DataState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  return <div className="dashboard-content"><article className="panel"><div className="empty-state">{loading ? <><Loader2 size={25} className="spinning" /><strong>Loading your network</strong><span>Reading shipments and activity from the database.</span></> : <><Database size={25} /><strong>Cannot reach the API</strong><span>{error instanceof Error ? error.message : 'Start the server with `npm run dev` and try again.'}</span><button className="secondary-button" onClick={onRetry} style={{ marginTop: 12 }}><RefreshCw size={15} /> Retry</button></>}</div></article></div>
}
function PanelHeading({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) { return <div className="panel-heading"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div>{children}</div> }
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [forgotNotice, setForgotNotice] = useState(false)
  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onLogin()
  }
  return <main className="login-page"><div className="login-atmosphere"><span className="login-grid" /><span className="login-route route-a" /><span className="login-route route-b" /><span className="login-node node-a" /><span className="login-node node-b" /><span className="login-node node-c" /></div><section className="login-card"><div className="login-brand"><span className="brand-mark"><span /></span><span>haul<span className="brand-dot">.</span>io</span></div><div className="login-heading"><p className="eyebrow"><span className="status-pulse" /> OPERATIONS PLATFORM</p><h1>Move with<br /><em>confidence.</em></h1><p>One clear view of every shipment, route, and vehicle in your network.</p></div><form className="login-form" onSubmit={submitLogin}><label>Email address<div className="login-input"><Mail size={17} /><input name="email" type="email" required placeholder="you@company.com" autoComplete="email" /></div></label><label>Password<div className="login-input"><LockKeyhole size={17} /><input name="password" type={showPassword ? 'text' : 'password'} required minLength={6} placeholder="Enter your password" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><div className="login-options"><label className="remember-option"><input type="checkbox" name="remember" /> <span>Remember me</span></label><button type="button" className="forgot-button" onClick={() => setForgotNotice(true)}>Forgot password?</button></div><button className="login-submit" type="submit">Sign in to workspace <ArrowRight size={17} /></button>{forgotNotice && <p className="forgot-notice" role="status">Password reset instructions will be sent to your workspace email.</p>}</form><div className="login-footer"><span>Secure workspace access</span><span className="footer-separator">·</span><span>Atlas Haulage</span></div></section><aside className="login-aside"><div className="aside-topline"><span>ATLAS HAULAGE</span><span>EST. 2018</span></div><div className="aside-copy"><span className="aside-overline">THE LOGISTICS CONTROL ROOM</span><h2>Every mile,<br /><strong>in view.</strong></h2><p>Coordinate the moving parts of your operation from one calm, connected workspace.</p></div><div className="login-stats"><div><strong>94.8%</strong><span>on-time network rate</span></div><div><strong>24</strong><span>active shipments</span></div><div><strong>142</strong><span>vehicles connected</span></div></div><div className="aside-mark"><span>AH</span><small>Atlas Haulage<br />Operations workspace</small></div></aside></main>
}
function MapNode({ className, label }: { className: string; label: string }) { return <div className={`map-node ${className}`}><span className="node-dot" /><small>{label}</small></div> }
function Metric({ icon, label, value, detail, trend, tone, up }: { icon: React.ReactNode; label: string; value: string; detail: string; trend: string; tone: string; up?: boolean }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><span className={up ? 'metric-trend positive' : tone === 'red' ? 'metric-trend attention' : 'metric-trend negative'}>{up && <ArrowUpRight size={13} />}{!up && tone !== 'red' && <ArrowDownRight size={13} />}{trend}</span></article> }
function ShipmentRow({ shipment, risk }: { shipment: Shipment; risk?: RiskAssessment }) { return <div className="shipment-row"><div className="shipment-id"><span className="shipment-color" style={{ backgroundColor: shipment.color }} /><strong>{shipment.id}</strong><small>{shipment.customer}</small></div><div className="route"><span>{shipment.origin}</span><div className="route-progress"><i style={{ width: `${shipment.progress}%`, backgroundColor: shipment.color }} /><span style={{ left: `${shipment.progress}%` }} /></div><span>{shipment.destination}</span></div><div className="shipment-eta"><Clock3 size={14} /><span>{shipment.eta}</span></div><span className={`status status-${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span><RiskBadge assessment={risk} /><button className="row-more" aria-label={`Options for ${shipment.id}`}><MoreHorizontal size={17} /></button></div> }
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
  const exportShipments = () => {
    const headers = ['Shipment', 'Customer', 'Origin', 'Destination', 'Progress', 'ETA', 'Status', 'Service']
    const rows = filtered.map((shipment) => [shipment.id, shipment.customer, shipment.origin, shipment.destination, `${shipment.progress}%`, shipment.eta, shipment.status, shipment.service])
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'haulio-shipments.csv'
    link.click()
    URL.revokeObjectURL(url)
    notifyAction(`${filtered.length} shipments exported`)
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
    <article className="panel all-shipments-panel"><SmartSearch context={network} onResult={applySmartResult} onClear={clearSmartResult} active={smartResult} /><div className="all-shipments-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search shipments, customers, routes..." /></div><div className="toolbar-actions"><div className="filter-menu"><button className={isFilterOpen ? 'secondary-button filter-active' : 'secondary-button'} onClick={() => setIsFilterOpen(!isFilterOpen)}><Filter size={15} /> Filters <span className="filter-count">{status === 'All' ? 0 : 1}</span></button>{isFilterOpen && <div className="filter-popover"><strong>Filter by status</strong>{STATUS_TABS.map((item) => <button key={item} className={status === item ? 'popover-option selected' : 'popover-option'} onClick={() => { setStatus(item); setPage(1); setIsFilterOpen(false) }}><span className="popover-radio" />{item}</button>)}<button className="clear-filter" onClick={() => { setStatus('All'); setQuery(''); setPage(1); setIsFilterOpen(false) }}>Clear all filters</button></div>}</div><button className="secondary-button" onClick={exportShipments}><Download size={15} /> Export</button></div></div><div className="status-switcher">{STATUS_TABS.map((item) => <button key={item} className={status === item ? 'filter-tab selected' : 'filter-tab'} onClick={() => { setStatus(item); setPage(1) }}>{item}{item === 'All' && <span>{shipments.length}</span>}</button>)}<button className="view-controls" aria-label="Table settings"><SlidersHorizontal size={16} /></button></div><div className="full-shipment-table"><div className="table-head"><span>SHIPMENT</span><span>ROUTE</span><span>PROGRESS</span><span>ETA</span><span>STATUS</span><span /></div>{pageRows.map((shipment) => <FullShipmentRow key={shipment.id} shipment={shipment} onAction={notifyAction} onReview={handleReview} risk={riskById[shipment.id]} />)}{pageRows.length === 0 && <div className="empty-state"><PackageCheck size={25} /><strong>No shipments found</strong><span>Try a different status or search term.</span></div>}</div><div className="table-footer"><span>Showing <strong>{filtered.length ? (currentPage - 1) * SHIPMENTS_PAGE_SIZE + 1 : 0}-{Math.min(currentPage * SHIPMENTS_PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong> shipments</span><div className="pagination"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={15} /></button></div></div></article>
    {(createdNotice || actionNotice) && <div className="created-notice" role="status"><Check size={16} /> {createdNotice || actionNotice}</div>}
    {isCreateOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCreateOpen(false) }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-shipment-title"><div className="modal-heading"><div><p className="section-kicker">OPERATIONS</p><h2 id="create-shipment-title">Create new shipment</h2><p>Set the route and delivery target for a new movement. It is saved to the SQLite database.</p></div><button className="modal-close" type="button" onClick={() => setIsCreateOpen(false)} aria-label="Close dialog">×</button></div><form onSubmit={handleCreateShipment}><div className="form-grid"><label>Customer<input name="customer" required placeholder="e.g. Nordmarkt GmbH" /></label><label>Reference<input name="reference" placeholder="Optional reference" /></label><label>Origin<input name="origin" required placeholder="e.g. Rotterdam" /></label><label>Destination<input name="destination" required placeholder="e.g. Berlin" /></label><label>Expected arrival<input name="eta" required placeholder="e.g. Tomorrow, 16:30" /></label><label>Service level<select name="service"><option>Standard road freight</option><option>Express delivery</option><option>Temperature controlled</option></select></label></div><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setIsCreateOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={createShipment.isPending}>{createShipment.isPending ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />} Create shipment</button></div></form></section></div>}
  </div>
}
function SummaryItem({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="summary-item"><span className={`summary-dot ${tone}`} /><div><small>{label}</small><strong>{value}</strong></div><ArrowUpRight size={15} /></div> }
function FullShipmentRow({ shipment, onAction, onReview, risk }: { shipment: Shipment; onAction: (message: string) => void; onReview: (shipment: Shipment) => void; risk?: RiskAssessment }) { const [isMenuOpen, setIsMenuOpen] = useState(false); const copyId = async () => { await navigator.clipboard?.writeText(shipment.id); setIsMenuOpen(false); onAction(`${shipment.id} copied to clipboard`) }; return <div className="full-shipment-row"><div className="full-id"><span className="shipment-color" style={{ backgroundColor: shipment.color }} /><div><strong>{shipment.id}</strong><small>{shipment.customer}</small></div></div><div className="full-route"><strong>{shipment.origin}</strong><ArrowUpRight size={13} /><strong>{shipment.destination}</strong></div><div className="full-progress"><div><i style={{ width: `${shipment.progress}%`, backgroundColor: shipment.color }} /></div><span>{shipment.progress}%</span></div><div className="full-eta"><Clock3 size={14} /><span>{shipment.eta}</span></div><span className={`status status-${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span><RiskBadge assessment={risk} /><div className="row-actions"><button className="row-more" aria-label={`More options for ${shipment.id}`} onClick={() => setIsMenuOpen(!isMenuOpen)}><MoreHorizontal size={17} /></button>{isMenuOpen && <div className="row-menu"><button onClick={copyId}>Copy tracking ID</button><button onClick={() => { setIsMenuOpen(false); onReview(shipment) }}>Mark for review</button></div>}</div></div> }
export default App
