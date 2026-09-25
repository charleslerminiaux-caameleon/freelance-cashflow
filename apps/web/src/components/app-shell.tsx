import type { ReactNode } from "react";

import { NavigationLinks } from "./navigation-links";

export function AppShell({ children, syncStatus = "Qonto : à configurer" }: { children: ReactNode; syncStatus?: string }) {
  return (
    <div className="app-shell">
      <header className="mobile-header">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <span className="brand-mark"><img src="/logo-green.png" alt="" width="36" height="36" /></span>
        </a>
        <span className="sync-status" aria-label="État de synchronisation">
          <img className="sidebar-qonto-logo" src="/qonto-logo.svg" alt="Qonto" width="62" height="20" />
          <span>{syncStatus}</span>
        </span>
      </header>

      <nav className="mobile-navigation" aria-label="Navigation mobile">
        <NavigationLinks />
      </nav>

      <aside className="sidebar" aria-label="Navigation principale">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <span className="brand-mark"><img src="/logo-green.png" alt="" width="40" height="40" /></span>
          <span>Freelance Cashflow</span>
        </a>
        <nav aria-label="Sections de Freelance Cashflow">
          <NavigationLinks />
        </nav>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}
