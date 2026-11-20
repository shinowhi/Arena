import { Suspense } from "react";
import FamilyClient from "./family-client";

// P5 family page: static-safe server shell (no data access here — the client
// fetches /api/family/me at runtime). Parent view / kid view / none view.
export const metadata = {
  title: "Gia đình — BossLearn",
  description: "Một gói Gia đình cho các con: chia sẻ VIP và báo cáo tiến độ đơn giản.",
};

export default function FamilyPage() {
  return (
    <Suspense>
      <FamilyClient />
    </Suspense>
  );
}
