export interface CreateConsultancy {
  name: string;
  aboutUs?: string;
  website?: string;
  specialtySkillIds?: string[];
  logo: {
    key?: string;
    url?: string;
    contentType?: string;
  };
  location: {
    country: string;
    city?: string;
    region?: string;
    timezone?: string;
  };
}
