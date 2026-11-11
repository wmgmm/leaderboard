import type { Category } from './useCases';

export interface CategoryMeta {
  name: Category;
  color: string; // 6-digit hex only: the UI appends transparency to it
}

// The leaderboard's eight sections, in page order.
export const CATEGORIES: CategoryMeta[] = [
  { name: 'Start here',           color: '#0071E3' },
  { name: 'Write and rewrite',    color: '#FF9F0A' },
  { name: 'Think it through',     color: '#BF5AF2' },
  { name: 'Learn and explain',    color: '#30B0C7' },
  { name: 'Organise information', color: '#34A853' },
  { name: "Learn AI's limits",  color: '#FF453A' },
  { name: 'Data and code',        color: '#5E5CE6' },
  { name: 'Just for you',         color: '#FF6B9D' },
];

export const CATEGORY_COLOR: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.name, c.color])
) as Record<Category, string>;
