export type InventoryPriceRow = {
  id: string;
  kind: "PURCHASE" | "SALE";
  date: string;
  counterparty: string;
  document: string;
  condition: string;
  quantity: string;
  unitPrice: string | null;
  netUnitPrice: string | null;
  status: "ACTIVE" | "REVERSED" | "RETURNED" | "PARTIAL_RETURN" | "VOID";
};
export type InventoryPricePage = {
  rows: InventoryPriceRow[];
  total: number;
  page: number;
};
