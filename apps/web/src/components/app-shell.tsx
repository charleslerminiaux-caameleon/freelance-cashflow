import type { ReactNode } from "react";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Opportunités", "/opportunities"],
  ["Commandes", "/engagements"],
  ["Facturation", "/invoices"],
  ["Trésorerie", "/cashflow"],
  ["Charges", "/expenses"],
  ["Intégrations", "/integrations"],
  ["Paramètres", "/settings"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="mobile-header">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <img src="/logo.jpeg" alt="" width="36" height="36" />
        </a>
        <span className="sync-status" aria-label="État de synchronisation">
          Synchronisation à configurer
        </span>
      </header>

      <nav className="mobile-navigation" aria-label="Navigation mobile">
        <ul>
          {navigation.map(([label, href]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <aside className="sidebar" aria-label="Navigation principale">
        <a className="brand" href="/dashboard" aria-label="Freelance Cashflow">
          <img src="/logo.jpeg" alt="" width="40" height="40" />
          <span>Freelance Cashflow</span>
        </a>
        <nav aria-label="Sections de Freelance Cashflow">
          <ul>
            {navigation.map(([label, href]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sync-status" aria-label="État de synchronisation">
          Synchronisation à configurer
        </div>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}
