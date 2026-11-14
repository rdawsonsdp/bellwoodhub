import type { Dictionary } from "@/lib/dictionaries";

// The five menus. Every page appears in exactly one menu — the current site
// lists Water, Ordinances and Public Works in two or three places each.
export type NavKey = keyof Dictionary["nav"]["items"];
export type MenuKey = keyof Dictionary["nav"]["menus"];

export type NavItem = { key: NavKey; href: string };
export type NavMenu = { key: MenuKey; href: string; items: NavItem[] };

export const menus: NavMenu[] = [
  {
    key: "services",
    href: "/services",
    items: [
      { key: "payBill", href: "/services/pay-a-bill" },
      { key: "reportProblem", href: "/services/report-a-problem" },
      { key: "permits", href: "/services/permits" },
      { key: "vehicleStickers", href: "/services/vehicle-stickers" },
      { key: "water", href: "/services/water" },
      { key: "trash", href: "/services/trash-recycling" },
      { key: "parking", href: "/services/parking" },
      { key: "alerts", href: "/services/alerts" },
    ],
  },
  {
    key: "government",
    href: "/government",
    items: [
      { key: "mayor", href: "/government/mayor" },
      { key: "board", href: "/government/village-board" },
      { key: "clerk", href: "/government/village-clerk" },
      { key: "meetings", href: "/government/meetings" },
      { key: "boards", href: "/government/boards-commissions" },
      { key: "ordinances", href: "/government/ordinances" },
      { key: "budget", href: "/government/budget-transparency" },
      { key: "bids", href: "/government/bids" },
      { key: "foia", href: "/government/foia" },
      { key: "jobs", href: "/government/jobs" },
      { key: "staff", href: "/government/staff-directory" },
    ],
  },
  {
    key: "departments",
    href: "/departments",
    items: [
      { key: "deptBuilding", href: "/departments/building" },
      { key: "deptCommunity", href: "/departments/community-relations-hr" },
      { key: "deptCounsel", href: "/departments/corporation-counsel" },
      { key: "deptEconomic", href: "/departments/economic-development" },
      { key: "deptFinance", href: "/departments/finance" },
      { key: "deptEmergency", href: "/departments/emergency-management" },
      { key: "deptFire", href: "/departments/fire" },
      { key: "deptPolice", href: "/departments/police" },
      { key: "deptPublicWorks", href: "/departments/public-works" },
      { key: "deptWater", href: "/departments/water" },
      { key: "deptZoning", href: "/departments/zoning" },
    ],
  },
  {
    key: "business",
    href: "/business",
    items: [
      { key: "openBusiness", href: "/business/open-a-business" },
      { key: "licenses", href: "/business/licenses" },
      { key: "tif", href: "/business/tif-districts" },
      { key: "properties", href: "/business/available-properties" },
      { key: "chamber", href: "/business/chamber-of-commerce" },
      { key: "directory", href: "/business/directory" },
    ],
  },
  {
    key: "community",
    href: "/community",
    items: [
      { key: "news", href: "/community/news" },
      { key: "events", href: "/community/events" },
      { key: "newsletters", href: "/community/newsletters" },
      { key: "newResidents", href: "/community/new-residents" },
      { key: "seniors", href: "/community/seniors" },
      { key: "teens", href: "/community/teens" },
      { key: "schools", href: "/community/schools" },
      { key: "library", href: "/community/library" },
      { key: "history", href: "/community/history" },
    ],
  },
];
