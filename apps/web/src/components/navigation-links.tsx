"use client";

import { usePathname } from "next/navigation";

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

export function NavigationLinks() {
  const pathname = usePathname();
  return <ul>{navigation.map(([label, href]) => {
    const active = pathname === href || pathname?.startsWith(`${href}/`);
    return <li key={href}><a href={href} aria-current={active ? "page" : undefined}>{label}</a></li>;
  })}</ul>;
}
