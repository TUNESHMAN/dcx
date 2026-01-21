export type ConsultancyStatus = "active" | "disabled";
export interface Consultancy {
  consultancyId: string;
  name: string;
  aboutUs: string;
  website: string;
  specialtySkillIds: string[];
  status: ConsultancyStatus;
  createdAt: string;
  updatedAt: string;
  location: {
    country: string;
    city: string;
    region?: string;
    timezone?: string;
  };
  logo?: {
    key: string;
    url: string;
    contentType: string;
  };
}
