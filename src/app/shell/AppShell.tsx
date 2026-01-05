import { NavLink, Outlet, useLocation } from 'react-router-dom'

const nav = [
    { to: '/', label: 'Importar', icon: 'upload' },
    { to: '/results', label: 'Resultados', icon: 'chart' },
    { to: '/aliases', label: 'Aliases', icon: 'link' },
    { to: '/targets', label: 'Metas', icon: 'target' },
    { to: '/structure', label: 'Estrutura', icon: 'tree' },
]

const icons: Record<string, React.ReactNode> = {
    upload: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
    ),
    chart: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" x2="18" y1="20" y2="10" />
            <line x1="12" x2="12" y1="20" y2="4" />
            <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
    ),
    link: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    ),
    target: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
        </svg>
    ),
    tree: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="6" height="6" x="3" y="3" rx="1" />
            <path d="M15 3h6v6h-6z" />
            <path d="M9 3v18" />
            <path d="M15 15h6v6h-6z" />
            <path d="M9 9h6" />
            <path d="M9 18h6" />
        </svg>
    ),
}

export function AppShell() {
    const loc = useLocation()

    return (
        <div className="h-screen flex flex-col" style={{ background: 'var(--color-surface-0)' }}>
            {/* Header */}
            <header
                className="sticky top-0 z-30"
                style={{
                    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                <div className="w-full px-4 md:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo & Title */}
                        <div className="flex items-center gap-4">
                            <div
                                className="flex items-center justify-center w-10 h-10 rounded-xl"
                                style={{
                                    background: 'linear-gradient(135deg, var(--color-accent) 0%, #14b8a6 100%)',
                                }}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="22"
                                    height="22"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M12 20V10" />
                                    <path d="M18 20V4" />
                                    <path d="M6 20v-4" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-white font-semibold text-sm tracking-tight">
                                    Produção vs Metas
                                </div>
                                <div className="text-slate-400 text-xs">
                                    Gestão Industrial • Sem login
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            {nav.map((item) => {
                                const active = loc.pathname === item.to
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        className="relative group"
                                    >
                                        <div
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                                            style={{
                                                color: active ? 'white' : 'rgb(148 163 184)',
                                                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            }}
                                        >
                                            <span className="transition-colors group-hover:text-white">
                                                {icons[item.icon]}
                                            </span>
                                            <span className="transition-colors group-hover:text-white">
                                                {item.label}
                                            </span>
                                        </div>
                                        {active && (
                                            <div
                                                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                                                style={{ background: 'var(--color-accent)' }}
                                            />
                                        )}
                                    </NavLink>
                                )
                            })}
                        </nav>

                        {/* Mobile menu indicator */}
                        <div className="md:hidden">
                            <button
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'rgb(148 163 184)',
                                }}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="4" x2="20" y1="12" y2="12" />
                                    <line x1="4" x2="20" y1="6" y2="6" />
                                    <line x1="4" x2="20" y1="18" y2="18" />
                                </svg>
                                <span>Menu</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Accent line */}
                <div
                    className="h-0.5"
                    style={{
                        background: 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-secondary) 50%, var(--color-accent) 100%)',
                        opacity: 0.7,
                    }}
                />
            </header>

            {/* Main content */}
            <main className="flex-1 min-h-0 overflow-auto w-full px-4 py-6 md:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    )
}
