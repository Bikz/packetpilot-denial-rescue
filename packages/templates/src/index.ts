import mriLumbarSpineTemplateJson from "../data/mri-lumbar-spine.json";

export type QuestionnaireItemType = "text" | "textarea" | "select" | "date";

export type QuestionnaireOption = {
  label: string;
  value: string;
};

export type QuestionnaireItem = {
  fieldId: string;
  label: string;
  type: QuestionnaireItemType;
  required: boolean;
  placeholder?: string;
  options?: QuestionnaireOption[];
};

export type QuestionnaireSection = {
  id: string;
  title: string;
  description: string;
  items: QuestionnaireItem[];
};

export type EvidenceChecklistItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

export type ServiceLineTemplate = {
  id: string;
  name: string;
  description: string;
  requiredFieldIds: string[];
  evidenceChecklist: EvidenceChecklistItem[];
  questionnaire: {
    sections: QuestionnaireSection[];
  };
};

export const MRI_LUMBAR_SPINE_TEMPLATE = mriLumbarSpineTemplateJson as ServiceLineTemplate;

export const SERVICE_LINE_TEMPLATES: ServiceLineTemplate[] = [MRI_LUMBAR_SPINE_TEMPLATE];

export function getServiceLineTemplate(templateId: string): ServiceLineTemplate | null {
  return SERVICE_LINE_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getTemplateFieldIds(template: ServiceLineTemplate): string[] {
  return template.questionnaire.sections.flatMap((section) => section.items.map((item) => item.fieldId));
}
