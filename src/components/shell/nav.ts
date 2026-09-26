import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in Sidebar
  /** Visible when the user has this permission (or any of them, if an array). */
  permission?: Permission | Permission[];
  badgeKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const APPROVAL_PERMISSIONS: Permission[] = ["leave.approve", "claims.approve", "overtime.approve", "loans.manage", "compensation.manage"];

export const NAV: NavGroup[] = [
  {
    label: "Home",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: "employee.view" },
      { href: "/me", label: "Me", icon: "Smile" },
      { href: "/approvals", label: "Approvals", icon: "CheckCheck", permission: APPROVAL_PERMISSIONS, badgeKey: "approvals" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/employees", label: "Employees", icon: "Users", permission: "employee.view" },
      { href: "/directory", label: "Directory", icon: "Contact" },
      { href: "/org", label: "Organization", icon: "Network", permission: "org.manage" },
      { href: "/recruitment", label: "Recruitment", icon: "Magnet", permission: "recruitment.manage" },
      { href: "/onboarding", label: "Onboarding", icon: "Rocket", permission: "lifecycle.manage" },
      { href: "/offboarding", label: "Offboarding", icon: "DoorOpen", permission: "lifecycle.manage" },
    ],
  },
  {
    label: "Time",
    items: [
      { href: "/leave", label: "Leave", icon: "Palmtree", permission: "leave.approve" },
      { href: "/holidays", label: "Holidays", icon: "CalendarHeart" },
      { href: "/attendance", label: "Attendance", icon: "Fingerprint", permission: "attendance.manage" },
      { href: "/shifts", label: "Shifts & Roster", icon: "CalendarClock", permission: "attendance.manage" },
      { href: "/overtime", label: "Overtime", icon: "Timer", permission: "overtime.approve" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/payroll", label: "Payroll", icon: "Banknote", permission: "payroll.manage" },
      { href: "/pay-items", label: "Pay Items", icon: "ListPlus", permission: "payroll.manage" },
      { href: "/statutory", label: "EPF · SOCSO · EIS", icon: "Landmark", permission: "payroll.manage" },
      { href: "/tax", label: "Tax (LHDN)", icon: "Receipt", permission: "tax.manage" },
      { href: "/claims", label: "Claims", icon: "Wallet", permission: "claims.approve" },
      { href: "/loans", label: "Loans & Advances", icon: "HandCoins", permission: "loans.manage" },
      { href: "/compensation", label: "Compensation", icon: "TrendingUp", permission: "compensation.manage" },
      { href: "/benefits", label: "Benefits", icon: "HeartPulse", permission: "benefits.manage" },
    ],
  },
  {
    label: "Talent",
    items: [
      { href: "/performance", label: "Performance", icon: "Target", permission: "performance.review" },
      { href: "/training", label: "Training & HRD Corp", icon: "GraduationCap", permission: "training.manage" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { href: "/disciplinary", label: "Disciplinary", icon: "Gavel", permission: "er.manage" },
      { href: "/grievances", label: "Grievances", icon: "ShieldAlert", permission: "er.manage" },
      { href: "/foreign-workers", label: "Foreign Workforce", icon: "Globe2", permission: "foreign.manage" },
      { href: "/documents", label: "Letters & Policies", icon: "FileText", permission: "documents.manage" },
      { href: "/assets", label: "Assets", icon: "Laptop", permission: "assets.manage" },
    ],
  },
  {
    label: "Culture",
    items: [
      { href: "/engagement", label: "Engagement", icon: "PartyPopper" },
      { href: "/helpdesk", label: "Helpdesk", icon: "LifeBuoy" },
      { href: "/help", label: "Help & guides", icon: "BookOpen" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/reports", label: "Reports", icon: "BarChart3", permission: "reports.view" },
      { href: "/settings", label: "Settings", icon: "Settings", permission: "settings.manage" },
    ],
  },
];
