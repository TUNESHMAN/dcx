export interface CreateConsultant {
  consultantId: string;
  consultancyId: string;
  fullName: string;
  title: string;
  dayRate: string;
  seniority: "junior" | "mid" | "senior";
  availability: {
    availabilityStatus: "available_now" | "available_from";
    availableFrom?: string;
  };
  willingToTravel: boolean;
  skillIds: string[];
  location: {
    country: string;
    city: string;
  };
  lastRefreshedAt: string;
  createdAt: string;
  updatedAt: string;
}
