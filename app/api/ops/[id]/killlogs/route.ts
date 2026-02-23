import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function parseVictim(line: string): string | null {
  // Esk killed Calm using weapon_x
  const match = line.match(/^(.+?) killed (.+?) using (.+)$/i);
  if (!match) return null;
  return match[2];
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lines, discord_id, display_name } = await req.json();

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "Keine Logs übermittelt." },
        { status: 400 }
      );
    }

    const inserts = lines
      .map((raw: string) => raw.trim())
      .filter(Boolean)
      .map((line: string) => ({
        operation_id: params.id,
        discord_id,
        display_name,
        text: line,
        victim: parseVictim(line),
      }));

    // supabaseAdmin ist eine Factory-Funktion -> erst Client holen
    const sb = supabaseAdmin();

    const { error } = await sb.from("operation_killlogs").insert(inserts);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "DB Fehler." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server Fehler." }, { status: 500 });
  }
}