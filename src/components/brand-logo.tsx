import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <Image
    src={compact ? "/brand/monogram.png" : "/brand/logo.png"}
    alt="Mecanismos Técnicos"
    width={compact ? 652 : 1755}
    height={328}
    unoptimized
    className={cn("brand-logo", className)}
  />;
}
