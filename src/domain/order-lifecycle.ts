export const orderTransitions:Record<string,readonly string[]>={
  RECEIVED:["DIAGNOSING","CANCELLED"],
  DIAGNOSING:["IN_PROGRESS","ON_HOLD","CANCELLED"],
  IN_PROGRESS:["ON_HOLD","QUALITY_REVIEW"],
  ON_HOLD:["DIAGNOSING","IN_PROGRESS","CANCELLED"],
  QUALITY_REVIEW:["IN_PROGRESS","READY"],
  READY:["QUALITY_REVIEW","CLOSED"],
  CLOSED:[],CANCELLED:[],
};
export function assertOrderTransition(from:string,to:string) {
  if(!orderTransitions[from]?.includes(to)) throw new Error("Ese cambio de estado no está permitido.");
}
