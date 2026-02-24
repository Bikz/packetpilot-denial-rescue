export type FhirResourceType =
  | "Patient"
  | "Coverage"
  | "Condition"
  | "Observation"
  | "MedicationRequest"
  | "ServiceRequest"
  | "DocumentReference";

export type FhirReference = {
  reference?: string;
  display?: string;
};

export type FhirCoding = {
  system?: string;
  code?: string;
  display?: string;
};

export type FhirCodeableConcept = {
  coding?: FhirCoding[];
  text?: string;
};

export type FhirHumanName = {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
};

export type FhirPatient = {
  resourceType: "Patient";
  id?: string;
  name?: FhirHumanName[];
  birthDate?: string;
  gender?: string;
};

export type FhirCoverage = {
  resourceType: "Coverage";
  id?: string;
  beneficiary?: FhirReference;
  payor?: FhirReference[];
  status?: string;
};

export type FhirCondition = {
  resourceType: "Condition";
  id?: string;
  subject?: FhirReference;
  code?: FhirCodeableConcept;
  clinicalStatus?: FhirCodeableConcept;
};

export type FhirObservation = {
  resourceType: "Observation";
  id?: string;
  subject?: FhirReference;
  code?: FhirCodeableConcept;
  status?: string;
  valueString?: string;
};

export type FhirMedicationRequest = {
  resourceType: "MedicationRequest";
  id?: string;
  subject?: FhirReference;
  status?: string;
  medicationCodeableConcept?: FhirCodeableConcept;
};

export type FhirServiceRequest = {
  resourceType: "ServiceRequest";
  id?: string;
  subject?: FhirReference;
  code?: FhirCodeableConcept;
  status?: string;
};

export type FhirDocumentReference = {
  resourceType: "DocumentReference";
  id?: string;
  subject?: FhirReference;
  status?: string;
  description?: string;
};

export type SupportedFhirResource =
  | FhirPatient
  | FhirCoverage
  | FhirCondition
  | FhirObservation
  | FhirMedicationRequest
  | FhirServiceRequest
  | FhirDocumentReference;

type FhirBundleEntry<T extends SupportedFhirResource> = {
  resource: T;
};

type FhirBundle<T extends SupportedFhirResource> = {
  resourceType: "Bundle";
  entry?: FhirBundleEntry<T>[];
};

export type FhirPatientSnapshot = {
  patient: FhirPatient;
  coverage: FhirCoverage[];
  conditions: FhirCondition[];
  observations: FhirObservation[];
  medicationRequests: FhirMedicationRequest[];
  serviceRequests: FhirServiceRequest[];
  documentReferences: FhirDocumentReference[];
};

function trimBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function fetchBundle<T extends SupportedFhirResource>(
  baseUrl: string,
  resourceType: FhirResourceType,
  search: Record<string, string> = {},
): Promise<T[]> {
  const query = new URLSearchParams(search);
  query.set("_count", "50");

  const endpoint = `${trimBaseUrl(baseUrl)}/${resourceType}?${query.toString()}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/fhir+json, application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FHIR fetch failed for ${resourceType}: ${response.status}`);
  }

  const bundle = (await response.json()) as FhirBundle<T>;
  return (bundle.entry ?? []).map((entry) => entry.resource);
}

async function fetchResourceById<T extends SupportedFhirResource>(
  baseUrl: string,
  resourceType: FhirResourceType,
  id: string,
): Promise<T> {
  const endpoint = `${trimBaseUrl(baseUrl)}/${resourceType}/${id}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/fhir+json, application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FHIR fetch failed for ${resourceType}/${id}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createFhirClient(baseUrl: string) {
  return {
    listPatients: () => fetchBundle<FhirPatient>(baseUrl, "Patient"),
    listCoverageByPatient: (patientId: string) =>
      fetchBundle<FhirCoverage>(baseUrl, "Coverage", { beneficiary: `Patient/${patientId}` }),
    listConditionsByPatient: (patientId: string) =>
      fetchBundle<FhirCondition>(baseUrl, "Condition", { patient: patientId }),
    listObservationsByPatient: (patientId: string) =>
      fetchBundle<FhirObservation>(baseUrl, "Observation", { patient: patientId }),
    listMedicationRequestsByPatient: (patientId: string) =>
      fetchBundle<FhirMedicationRequest>(baseUrl, "MedicationRequest", { patient: patientId }),
    listServiceRequestsByPatient: (patientId: string) =>
      fetchBundle<FhirServiceRequest>(baseUrl, "ServiceRequest", { patient: patientId }),
    listDocumentReferencesByPatient: (patientId: string) =>
      fetchBundle<FhirDocumentReference>(baseUrl, "DocumentReference", { patient: patientId }),
    getPatient: (patientId: string) => fetchResourceById<FhirPatient>(baseUrl, "Patient", patientId),
    async getPatientSnapshot(patientId: string): Promise<FhirPatientSnapshot> {
      const [patient, coverage, conditions, observations, medicationRequests, serviceRequests, documentReferences] =
        await Promise.all([
          fetchResourceById<FhirPatient>(baseUrl, "Patient", patientId),
          fetchBundle<FhirCoverage>(baseUrl, "Coverage", { beneficiary: `Patient/${patientId}` }),
          fetchBundle<FhirCondition>(baseUrl, "Condition", { patient: patientId }),
          fetchBundle<FhirObservation>(baseUrl, "Observation", { patient: patientId }),
          fetchBundle<FhirMedicationRequest>(baseUrl, "MedicationRequest", { patient: patientId }),
          fetchBundle<FhirServiceRequest>(baseUrl, "ServiceRequest", { patient: patientId }),
          fetchBundle<FhirDocumentReference>(baseUrl, "DocumentReference", { patient: patientId }),
        ]);

      return {
        patient,
        coverage,
        conditions,
        observations,
        medicationRequests,
        serviceRequests,
        documentReferences,
      };
    },
  };
}
