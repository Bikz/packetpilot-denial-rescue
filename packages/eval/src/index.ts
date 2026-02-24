export type PacketQuestionnaireItem = {
  field_id: string;
  value: string | null;
  state: "missing" | "filled" | "verified" | string;
};

export type PacketCitationMapItem = {
  field_id: string;
  citations?: Array<Record<string, unknown>>;
};

export type PacketJson = {
  case_header?: Record<string, unknown>;
  questionnaire?: PacketQuestionnaireItem[];
  citation_map?: PacketCitationMapItem[];
};

export type EvalMetrics = {
  required_fields_total: number;
  required_fields_filled: number;
  required_fields_with_citations: number;
  required_fields_filled_pct: number;
  required_fields_with_citations_pct: number;
  completeness_score: number;
};

export function computeCompletenessMetrics(
  packet: PacketJson,
  requiredFieldIds: string[],
): EvalMetrics {
  const questionnaireMap = new Map(
    (packet.questionnaire ?? []).map((item) => [item.field_id, item]),
  );
  const citationSet = new Set(
    (packet.citation_map ?? [])
      .filter((item) => (item.citations ?? []).length > 0)
      .map((item) => item.field_id),
  );

  const requiredTotal = requiredFieldIds.length;
  const requiredFilled = requiredFieldIds.filter((fieldId) => {
    const answer = questionnaireMap.get(fieldId);
    if (!answer) return false;
    const value = String(answer.value ?? "").trim();
    return answer.state !== "missing" && value.length > 0;
  }).length;

  const requiredWithCitations = requiredFieldIds.filter((fieldId) => citationSet.has(fieldId)).length;

  const requiredFilledPct = requiredTotal > 0 ? (requiredFilled / requiredTotal) * 100 : 0;
  const requiredWithCitationsPct =
    requiredTotal > 0 ? (requiredWithCitations / requiredTotal) * 100 : 0;
  const completenessScore = (requiredFilledPct + requiredWithCitationsPct) / 2;

  return {
    required_fields_total: requiredTotal,
    required_fields_filled: requiredFilled,
    required_fields_with_citations: requiredWithCitations,
    required_fields_filled_pct: Number(requiredFilledPct.toFixed(2)),
    required_fields_with_citations_pct: Number(requiredWithCitationsPct.toFixed(2)),
    completeness_score: Number(completenessScore.toFixed(2)),
  };
}
