import { Column, Entity } from "typeorm";
import { GenderEnum } from "../../shared/enum/gender.enum";
import { myBaseEntity } from "../../shared/entity/base.entity";

@Entity("user_profile")
export class UserProfileEntity extends myBaseEntity {
  @Column({
    nullable: true,
    name: "avatar_img_path",
  })
  avatarImgPath?: string;

  @Column({
    name: "postal_code",
    nullable: true,
  })
  postalCode?: string;

  @Column({
    nullable: true,
  })
  address?: string;

  @Column({
    nullable: false,
    default: GenderEnum.NOT_SET,
  })
  gender: number;

  @Column({
    nullable: false,
    name: "country_id",
  })
  countryId: number;
}
