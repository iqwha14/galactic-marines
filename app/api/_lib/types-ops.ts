export type OperationOutcome = "Sieg" | "Teilerfolg" | "Rückzug" | "Niederlage" | "Unklar";

export type Operation = {
  id: string;
  title: string;
  planet: string;
  start_at: string; // ISO
  end_at: string | null;
  units: string[]; // ["Haupteinheit","Galactic Marine Elite","44th",...]
  outcome: OperationOutcome;
  summary: string;
  image_url: string | null;
  created_by_discord_id: string;
  created_at: string;
};

export type Participant = {
  operation_id: string;
  marine_card_id: string;
  role: string | null;
  is_lead: boolean;
};

export type OperationRating = {
  operation_id: string;
  discord_id: string;
  stars: number; // 1..5
  comment: string | null;
  created_at: string;
};

export type MarineRating = {
  operation_id: string;
  marine_card_id: string;
  discord_id: string;
  stars: number; // 1..5
  comment: string | null;
  created_at: string;
};

export type OperationReport = {
  id: string;
  operation_id: string;
  author_discord_id: string;
  title: string;
  content_md: string;
  created_at: string;
  updated_at: string;
};
