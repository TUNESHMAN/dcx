export type ConsultantStatus = "active" | "archived";
export type ConsultantSeniority = "junior" | "mid" | "senior" | "lead";
export type AvailabilityStatus =
  | "available_now"
  | "available_from"
  | "unavailable";

export interface Consultant {
  consultantId: string;
  consultancyId: string;
  firstName: string;
  lastName: string;

  title: string;
  summary: string;
  seniority: ConsultantSeniority;
  availability: {
    status: AvailabilityStatus;
    availableFrom?: string;
  };
  skillIds: string[];
  location: {
    country: string;
    city?: string;
    region?: string;
    timezone?: string;
  };
  status: ConsultantStatus;
  lastRefreshedAt: string;
  createdAt: string;
  updatedAt: string;
}
