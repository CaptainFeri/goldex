export class AdminUserprofileDto {
  firstname: string;
  lastname: string;
  email: string;
  cellPhone: string;
  gender: string;
  country: CountryDTO;
  postalCode: string;
  avatarImgPath: string;
  twoFactorActivatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

class CountryDTO {
  id: number;
  isoCode: string;
  isoCode2: string;
  primaryName: string;
  region: string;
  secondaryName: string;
}
