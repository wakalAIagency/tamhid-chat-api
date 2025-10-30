import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);

export async function POST(req: Request) {
  try {
    const { logId, rating, comment } = await req.json();

    if (!logId || !Number.isInteger(logId)) {
      return NextResponse.json({ error: "Missing or invalid logId" }, { status: 400 });
    }
    if (![1, -1, "1", "-1"].includes(rating)) {
      return NextResponse.json({ error: "rating must be 1 or -1" }, { status: 400 });
    }

    const r = typeof rating === "string" ? parseInt(rating, 10) : rating;

    const { error } = await admin.from("chat_feedback").insert({
      log_id: logId,
      rating: r,
      comment: comment || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
