export type OperationsView = {
  coverage?: { period: string; confirmed: boolean }[];
  archivedTasks?: OperationsView["tasks"];
  accounts: { id: string; name: string; balance: string }[];
  obligations: {
    salaryPeriod?: string | null;
    estimated?: boolean;
    id: string;
    title: string;
    category: string;
    period: string;
    amount: string;
    paid: string;
    dueOn: string;
  }[];
  cashEntries: {
    paymentId?: string;
    transferId?: string | null;
    id: string;
    accountId: string;
    obligationId: string | null;
    amount: string;
    direction: string;
    kind: string;
    counterparty: string;
    reference: string;
    note: string;
    occurredOn: string;
    reversed: boolean;
  }[];
  customers: {
    deletedAt?: string | null;
    id: string;
    name: string;
    document: string;
    phone: string;
    email: string;
    orders: number;
  }[];
  members: {
    id: string;
    name: string;
    email?: string;
    role?: string;
    active: boolean;
  }[];
  items: {
    id: string;
    code: string;
    name: string;
    brand: string;
    kind: string;
    unit: string;
    reference?: string;
    notes?: string;
  }[];
  suppliers: {
    email?: string;
    address?: string;
    deletedAt?: string | null;
    id: string;
    name: string;
    phone: string;
  }[];
  offers: {
    id: string;
    itemId: string;
    supplierId: string;
    condition: string;
    unitCost: string;
    reportedStock: string;
    observedAt: string;
    evidence: string;
  }[];
  balances: {
    costKnown?: boolean;
    itemId: string;
    locationId: string;
    condition: string;
    quantity: string;
    reserved: string;
    materialCost: string;
  }[];
  movements: {
    id: string;
    itemId: string;
    locationId: string;
    condition: string;
    quantity: string;
    materialAmount: string;
    kind: string;
    reason: string;
    date: string;
    reversed: boolean;
  }[];
  tasks: {
    plannedMinutes?: number | null;
    id: string;
    orderId: string | null;
    title: string;
    status: string;
    createdAt?: string;
    dueAt?: string | null;
    members: string[];
    photos?: {
      id: string;
      caption: string;
      createdAt: string;
      author: string;
    }[];
    description?: string;
    version?: number;
    deletedAt?: string | null;
    notes?: { id: string; body: string; author: string; createdAt: string }[];
    history?: {
      id: string;
      action: string;
      author: string;
      createdAt: string;
      details: Record<string, unknown>;
    }[];
    timeEntries?: {
      overtime?: boolean;
      id: string;
      minutes: number;
      workedOn: string;
      note: string;
      author: string;
    }[];
  }[];
};
export const emptyOperations: OperationsView = {
  accounts: [],
  obligations: [],
  cashEntries: [],
  customers: [],
  members: [],
  items: [],
  suppliers: [],
  offers: [],
  balances: [],
  movements: [],
  tasks: [],
};
export const demoOperations: OperationsView = {
  ...emptyOperations,
  customers: [
    {
      id: "customer-demo",
      name: "Transportes Alto de la Cruz SAS",
      document: "",
      phone: "",
      email: "",
      orders: 3,
    },
  ],
  members: [1, 2, 3, 4].map((n) => ({
    id: `tech-${n}`,
    name: ["Luis Cárdenas", "Óscar Peña", "Camilo Ríos", "Héctor Moreno"][
      n - 1
    ],
    active: true,
    role: "MECHANIC",
    email: "",
  })),
  items: [
    {
      id: "part-demo",
      code: "INY-DEMO-01",
      name: "Kit de reparación de inyector",
      brand: "",
      kind: "PART",
      unit: "unidad",
    },
  ],
  suppliers: [
    { id: "supplier-demo", name: "Diésel Repuestos del Altiplano", phone: "" },
  ],
  offers: [],
  movements: [],
  tasks: [],
  balances: [
    {
      itemId: "part-demo",
      locationId: "demo-location",
      condition: "NEW",
      quantity: "8",
      reserved: "0",
      materialCost: "960000.00",
    },
  ],
};
