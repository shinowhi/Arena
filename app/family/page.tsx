import { Suspense } from "react";
import FamilyClient from "./family-client";

// P5 family page: static-safe server shell (no data access here — the client
// fetches /api/family/me at runtime). Parent view / kid view / none view.
export const metadata = {
  title: "Family — Arena",
  description: "One Family plan covers the kids: shared VIP and a simple progress report.",
};

export default function FamilyPage() {
  return (
    <Suspense>
      <FamilyClient />
    </Suspense>
  );
}
