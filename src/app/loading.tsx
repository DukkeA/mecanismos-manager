import Image from "next/image";

export default function Loading() {
  return (
    <main className="app-loading" aria-busy="true">
      <div className="app-loading-content" role="status">
        <Image
          src="/brand/logo.png"
          alt="Mecanismos"
          width={1755}
          height={328}
          preload
          className="brand-logo app-loading-logo"
        />
        <div className="app-loading-track" aria-hidden="true">
          <span />
        </div>
        <span className="sr-only">Cargando el taller</span>
      </div>
    </main>
  );
}
