import type { Metadata } from "next";
import "./globals.css";
import { Geist, Signika_Negative } from "next/font/google";
import { cn } from "@/lib/utils";
import { PwaRegister } from "@/components/pwa-register";

const geist = Geist({subsets:['latin'],variable:'--font-body'});
const heading = Signika_Negative({subsets:['latin'],weight:['600','700'],variable:'--font-display'});

export const metadata: Metadata = {title: "Mecanismos Manager", description: "Gestión interna de Mecanismos Técnicos SAS"};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="es-CO" className={cn("font-sans", geist.variable, heading.variable)}><body>{children}<PwaRegister/></body></html>;
}
