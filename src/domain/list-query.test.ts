import { describe,it,expect } from "vitest";
import { matches,inDates,pageNumber,isDateKey } from "./list-query";
describe("Búsqueda y páginas",()=>{
  it("combina placa y responsable sin depender de tildes u orden de palabras",()=>{
    expect(matches("OT-0009 TST101 Luis Cárdenas", "cardenas tst101")).toBe(true);
    expect(matches("OT-0009 TST101 Luis Cárdenas", "cardenas tst102")).toBe(false);
  });
  it("incluye el día completo en Bogotá y permite rangos abiertos",()=>{
    expect(inDates("2026-09-11T04:59:59Z","2026-09-10","2026-09-10")).toBe(true);
    expect(inDates("2026-09-11T05:00:00Z","","2026-09-10")).toBe(false);
    expect(inDates(undefined,"2026-09-10","")).toBe(false);
    expect(inDates("2026-09-10","2026-09-11","2026-09-01")).toBe(false);
  });
  it("corrige páginas inexistentes o inválidas sin dejar la tabla vacía",()=>{
    expect(pageNumber("999",3)).toBe(3);
    expect(pageNumber("-1",3)).toBe(1);
    expect(pageNumber("Infinity",3)).toBe(1);
    expect(pageNumber("1.5",3)).toBe(1);
  });
});

it("rechaza fechas imposibles de la URL sin normalizarlas a otro mes",()=>{expect(isDateKey("2026-02-31")).toBe(false);expect(isDateKey("2026-02-29")).toBe(false);expect(isDateKey("2024-02-29")).toBe(true);expect(inDates("2026-02-31","2026-02-01","2026-03-31")).toBe(false);});
