export type OrderView = {
  responsibleId?: string | null;
  businessCategoryLocked?: boolean;
  businessCategoryId?: string | null;
  businessCategory?: string;
  id: string;
  number: number;
  title: string;
  reference: string;
  kind: "VEHICLE" | "COMPONENT";
  family: string;
  status: string;
  responsible: string;
  nextStep: string;
  customer: string;
  customerId?: string | null;
  problem: string;
  location: string;
  version?: number;
  receivedAt?: string;
  dueAt?: string | null;
  closedAt?: string | null;
  tasks: {
    id: string;
    title: string;
    done: boolean;
    status: string;
    minutes: number;
    plannedMinutes?: number | null;
    memberIds?: string[];
  }[];
  notes: {
    id: string;
    body: string;
    author: string;
    date: string;
    createdAt?: string;
  }[];
};

export const statusLabels: Record<string, string> = {
  RECEIVED: "Recibida",
  DIAGNOSING: "Diagnóstico",
  IN_PROGRESS: "En reparación",
  ON_HOLD: "En espera",
  QUALITY_REVIEW: "En prueba",
  READY: "Lista para entregar",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

export const demoOrders: OrderView[] = [
  {
    number: 261,
    title: "Chevrolet NHR",
    reference: "DEM-261",
    kind: "VEHICLE",
    family: "Sistema de inyección",
    status: "DIAGNOSING",
    responsible: "Luis Cárdenas",
    nextStep: "Revisar presión",
  },
  {
    number: 260,
    title: "Transmisión automática",
    reference: "CMP-042",
    kind: "COMPONENT",
    family: "Componente",
    status: "IN_PROGRESS",
    responsible: "Óscar Peña",
    nextStep: "Montaje de conjunto",
  },
  {
    number: 259,
    title: "Isuzu NPR",
    reference: "DEM-259",
    kind: "VEHICLE",
    family: "Motor diésel",
    status: "ON_HOLD",
    responsible: "Camilo Ríos",
    nextStep: "Confirmar repuestos",
  },
  {
    number: 258,
    title: "Bomba de inyección",
    reference: "CMP-038",
    kind: "COMPONENT",
    family: "Componente",
    status: "QUALITY_REVIEW",
    responsible: "Luis Cárdenas",
    nextStep: "Registrar resultado",
  },
  {
    number: 257,
    title: "Toyota Hilux",
    reference: "DEM-257",
    kind: "VEHICLE",
    family: "Inyectores",
    status: "READY",
    responsible: "Héctor Moreno",
    nextStep: "Coordinar entrega",
  },
  {
    number: 256,
    title: "Motor diésel",
    reference: "UP-012",
    kind: "COMPONENT",
    family: "Unidad propia",
    status: "IN_PROGRESS",
    responsible: "Óscar Peña",
    nextStep: "Verificar tolerancias",
  },
].map((order, index) => ({
  ...order,
  kind: order.kind as OrderView["kind"],
  id: `demo-${order.number}`,
  customer:
    index === 5
      ? "Mecanismos · unidad propia"
      : [
          "Transportes Alto de la Cruz SAS",
          "Distribuciones La Rivera SAS",
          "Mauricio Sánchez",
          "Taller Automotriz Los Sauces",
          "Patricia Gómez",
        ][index],
  problem: [
    "Arranque largo en frío y humo blanco.",
    "Golpe al pasar de segunda a tercera con la caja caliente.",
    "Pierde fuerza en subida.",
    "Fuga por la tapa lateral de la bomba.",
    "Olor a combustible dentro de la cabina.",
    "Unidad del taller para recuperar. Pendiente medir cilindros.",
  ][index],
  location: "Bodega / taller",
  tasks: [
    {
      id: `task-${index}`,
      title: order.nextStep,
      done: false,
      status: index === 2 ? "BLOCKED" : index === 1 ? "IN_PROGRESS" : "TODO",
      minutes: 0,
    },
  ],
  notes: [
    {
      id: `note-${index}`,
      body: [
        "Se revisaron mangueras. Pendiente medir retorno.",
        "Aceite oscuro y residuos en el cárter. Revisar discos.",
        "La válvula llega el viernes. Llamar antes de recoger.",
        "Se cambiaron empaques. Falta repetir prueba de estanqueidad.",
        "Prueba sin fugas. Cliente recoge mañana.",
        "Se desmontó el cigüeñal para medición.",
      ][index],
      author: "Paola Méndez",
      date: "Recepción",
    },
  ],
}));
