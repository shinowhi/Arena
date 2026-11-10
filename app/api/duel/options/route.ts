import { NextResponse } from "next/server";
import { HSA_CONFIG, VACT_CONFIG } from "@/lib/agents/exam";

// Duel setup options: exams + single sections. No DB touch.
export async function GET() {
  return NextResponse.json({
    exams: [VACT_CONFIG, HSA_CONFIG].map((c) => ({
      id: c.id,
      name: c.name,
      sections: c.sections.map((s) => ({ id: s.id, name: s.name, count: s.count })),
    })),
  });
}
