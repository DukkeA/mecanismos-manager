import { createHash } from "node:crypto";
import { db } from "../src/server/db";
import { saveAttachment } from "../src/server/attachment-service";
if (
  !process.env.DATABASE_URL?.includes("127.0.0.1:56322/") ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(":56321")
)
  throw Error("Solo se permiten datos locales.");
try {
  const actor = await db().member.findFirstOrThrow({
    where: { name: "Claudia Rojas", role: "ADMIN" },
  });
  const purchase = await db().purchase.findFirstOrThrow({
    where: { reference: "PED-PRUEBA-014" },
  });
  const content =
    "BT /F1 14 Tf 50 750 Td (MECANISMOS - SOPORTE DE PRUEBA) Tj 0 -35 Td (Pedido PED-PRUEBA-014) Tj 0 -25 Td (Arandelas de sello para inyector) Tj 0 -25 Td (6 unidades solicitadas. Entrega parcial.) Tj 0 -35 Td (Documento ficticio para probar archivos privados.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = Buffer.from(pdf),
    key = createHash("sha256")
      .update("fixture-purchase-support-v1")
      .digest("hex");
  const requestId = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
  await saveAttachment(
    actor,
    {
      requestId,
      entityType: "PURCHASE",
      entityId: purchase.id,
      name: "Soporte de entrega parcial · prueba",
    },
    new File([bytes], "entrega-prueba.pdf", { type: "application/pdf" }),
  );
  console.log("Soporte PDF privado disponible en la compra de prueba.");
} finally {
  await db().$disconnect();
}
