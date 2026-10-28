import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl font-bold">Esta puerta no existe</h1>
      <p className="text-jano-muted">La página que buscas no está aquí.</p>
      <Link href="/" className="rounded-lg bg-jano-cobalto px-4 py-2 font-semibold text-white">
        Volver al centro de mando
      </Link>
    </main>
  );
}
