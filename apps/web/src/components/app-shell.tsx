import type { ReactNode } from "react";

import { NavigationLinks } from "./navigation-links";

export function AppShell({ children, syncStatus = "Qonto : à configurer" }: { children: ReactNode; syncStatus?: string }) {
  return (
    <div className="app-shell">
      <header className="mobile-header">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <img src="/logo.jpeg" alt="" width="36" height="36" />
        </a>
        <span className="sync-status" aria-label="État de synchronisation">
          {syncStatus}
        </span>
      </header>

      <nav className="mobile-navigation" aria-label="Navigation mobile">
        <NavigationLinks />
      </nav>

      <aside className="sidebar" aria-label="Navigation principale">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <img src="/logo.jpeg" alt="" width="40" height="40" />
          <span>Freelance Cashflow</span>
        </a>
        <nav aria-label="Sections de Freelance Cashflow">
          <NavigationLinks />
        </nav>
        <div className="sync-status" aria-label="État de synchronisation">
          {syncStatus}
        </div>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}
