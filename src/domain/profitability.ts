export type ProfitabilityJob = {
  id: string;
  saleId: string | null;
  orderId: string | null;
  originalSaleId: string | null;
  label: string;
  title: string;
  customer: string;
  purpose: string;
  status: string;
  revenue: string | null;
  material: string;
  labor: string;
  expenses: string;
  warrantyCost: string;
  cost: string;
  margin: string | null;
  balance: string | null;
  pending: string[];
};

export type ProfitabilityOverview = {
  period: string;
  revenue: string;
  materials: string;
  payroll: string;
  expenses: string;
  knownResult: string;
  result: string | null;
  pending: { label: string; href: string }[];
  jobs: ProfitabilityJob[];
  workInProgress: string;
  incompleteJobs: number;
};
