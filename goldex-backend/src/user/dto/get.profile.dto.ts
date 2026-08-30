import { GenderEnum } from '../../shared/enum/gender.enum';
import { CountryEntity } from '../../baseinfo/entity/country.entity';

export class GetProfileDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  gender: GenderEnum;
  country: CountryEntity;
  address: string;
  postalCode: string;
  avatarImgPath: string;
  createdAt: Date;
  updatedAt: Date;
  enum: any;
}
