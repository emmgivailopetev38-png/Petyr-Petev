export type Procedure = {
  id: string;
  aop_id: string | null;
  source_url: string | null;
  title: string;
  publisher: string | null;
  vertical: string | null;
  estimated_value: number | null;
  deadline: string | null;
  risk_level: number;
  risk_notes: string | null;
  draft_appeal: string | null;
  raw_summary: string | null;
  fetched_at: string;
  analysed_at: string | null;
  created_at: string;
};

export type Briefing = {
  id: string;
  briefing_date: string;
  vertical: string | null;
  new_count: number;
  high_risk_count: number;
  procedure_ids: string[];
  summary: string | null;
  email_sent_at: string | null;
  generated_at: string;
};

export type ScrapedProcedure = {
  aop_id: string;
  source_url: string;
  title: string;
  publisher: string;
  estimated_value: number | null;
  deadline: string | null;
  raw_text: string;
};

export type AnalysisResult = {
  vertical: string;
  risk_level: number;
  risk_notes: string;
  draft_appeal: string | null;
};
