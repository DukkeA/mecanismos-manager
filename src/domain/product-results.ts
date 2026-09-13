export type ProductResult = {
  id: string;
  name: string;
  reference: string;
  category: string;
  businessCategoryId: string | null;
  businessCategory: string;
  quantity: string;
  revenue: string;
  cost: string | null;
  margin: string | null;
  missing: number;
};
export type ProductResults = {
  rows: ProductResult[];
  businessCategories: {
    id: string | null;
    name: string;
    revenue: string;
    cost: string | null;
    margin: string | null;
    marginPercent: string | null;
    missing: number;
  }[];
  categories: { category: string; revenue: string }[];
  total: number;
  page: number;
  pageSize: number;
};
export const productCategories: Record<string, string> = {
  SERVICE: "Servicios",
  NEW: "Repuestos nuevos",
  USED: "Repuestos usados",
  REBUILT: "Reconstruidos",
};
