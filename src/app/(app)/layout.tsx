import { Footer } from "@/components/layout";

/** The signed-in pages (rate, my ratings, sign-in) share the public footer and its trust links. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
