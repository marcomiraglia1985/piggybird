import { PageLoader } from "@/components/ui/page-loader";

/**
 * Root loading.tsx — fallback Suspense per QUALSIASI route che non ha
 * un loading.tsx dedicato. Mostrato durante la navigation (gap fra click
 * sul link e render della nuova pagina). Per le pagine pesanti
 * (/investimenti, /riepilogo) evita la sensazione di "app freezata".
 */
export default function Loading() {
  return <PageLoader />;
}
