import { it, expect } from "vitest";
import {
  catalogLabelKey,
  cleanCatalogLabel,
  catalogLabelError,
} from "@/domain/catalog-label";

it.each([
  ["Bombas de inyección", "bombas de inyeccion"],
  ["  BOMBAS   DE INYECCIÓN  ", "bombas de inyeccion"],
  ["Bombas\u00a0de\tinyeccio\u0301n", "bombas de inyeccion"],
  ["Ｂｏｍｂａｓ de inyección", "bombas de inyeccion"],
  ["Bоmbаs de inyección", "bombas de inyeccion"], // Cyrillic o/a.
  ["Bοmbαs de inyección", "bombas de inyeccion"], // Greek o/a.
  ["Bom\u200bbas de inyec\u00adción", "bombas de inyeccion"],
  ["Bom\ufe0fbas de inyección", "bombas de inyeccion"],
  ["Bom\u{e0100}bas de inyección", "bombas de inyeccion"],
  ["Bombas — de-inyección", "bombas de inyeccion"],
  ["Transmisiones automáticas", "transmisiones automaticas"],
  ["Escaneo 4.0", "escaneo 4 0"],
])("compares catalog label %s", (label, expected) => {
  expect(catalogLabelKey(label)).toBe(expected);
  expect(catalogLabelError(label)).toBeNull();
});
it("preserves display accents and meaningful distinctions", () => {
  expect(cleanCatalogLabel("  Transmisiones   automáticas  ")).toBe(
    "Transmisiones automáticas",
  );
  expect(catalogLabelKey("Bombas")).not.toBe(catalogLabelKey("Bomba"));
  expect(catalogLabelKey("Motor O1")).not.toBe(catalogLabelKey("Motor 01"));
  expect(catalogLabelError("---")).toBeTruthy();
  expect(catalogLabelError("a".repeat(101))).toBeTruthy();
  expect(catalogLabelError("Bombas Ж")).toBeTruthy();
});
