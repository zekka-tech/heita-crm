export type DefaultPipelineStage = {
  key: string;
  label: string;
  order: number;
  isTerminal?: boolean;
  defaultFollowUpHours?: number | null;
  autoAdvanceOnReply?: boolean;
};

export const DEFAULT_PIPELINE_STAGES: DefaultPipelineStage[] = [
  { key: "ENQUIRY", label: "Enquiry", order: 10, defaultFollowUpHours: 24 },
  { key: "CONSULTATION", label: "Consultation", order: 20, defaultFollowUpHours: 24 },
  { key: "QUOTATION", label: "Quotation", order: 30, defaultFollowUpHours: 48 },
  { key: "CONSIDERATION", label: "Consideration", order: 40, defaultFollowUpHours: 72 },
  { key: "NEGOTIATION", label: "Negotiation", order: 50, defaultFollowUpHours: 48 },
  { key: "PAYMENT", label: "Payment", order: 60, defaultFollowUpHours: 24 },
  { key: "CONFIRMATION", label: "Confirmation", order: 70, defaultFollowUpHours: 24 },
  { key: "EXECUTION", label: "Execution", order: 80, defaultFollowUpHours: 72 },
  { key: "AFTER_SALES", label: "After sales", order: 90, defaultFollowUpHours: 336 },
  { key: "WON", label: "Won", order: 100, isTerminal: true, defaultFollowUpHours: null, autoAdvanceOnReply: false },
  { key: "LOST", label: "Lost", order: 110, isTerminal: true, defaultFollowUpHours: null, autoAdvanceOnReply: false }
];

export function defaultPipelineStageCreateManyData(businessId: string) {
  return DEFAULT_PIPELINE_STAGES.map((stage) => ({
    businessId,
    key: stage.key,
    label: stage.label,
    order: stage.order,
    isTerminal: stage.isTerminal ?? false,
    defaultFollowUpHours: stage.defaultFollowUpHours ?? null,
    autoAdvanceOnReply: stage.autoAdvanceOnReply ?? true
  }));
}
