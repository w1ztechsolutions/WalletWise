import type { TransactionType } from "@/types";

/**
 * Categories seeded into D1 for every new account.
 *
 * This lives outside `FinanceContext` because seeding runs inside Better Auth's
 * `user.create` hook on the server, and the context is a browser-only provider.
 */
export const DEFAULT_CATEGORIES: {
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}[] = [
  { name: "Salary", type: "income", color: "#10b981", icon: "Briefcase" },
  { name: "Freelance & Business", type: "income", color: "#06b6d4", icon: "Laptop" },
  { name: "Investments", type: "income", color: "#8b5cf6", icon: "TrendingUp" },
  { name: "Groceries & Food", type: "expense", color: "#f59e0b", icon: "ShoppingCart" },
  { name: "Rent & Housing", type: "expense", color: "#ef4444", icon: "Home" },
  { name: "Utilities & Internet", type: "expense", color: "#ec4899", icon: "Zap" },
  { name: "Transport & Fuel", type: "expense", color: "#6366f1", icon: "Car" },
  { name: "Entertainment & Leisure", type: "expense", color: "#14b8a6", icon: "Film" },
  { name: "Healthcare", type: "expense", color: "#f43f5e", icon: "HeartPulse" },
];