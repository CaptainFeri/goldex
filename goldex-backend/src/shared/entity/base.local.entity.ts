import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export class MyLocalBaseEntity {
  @PrimaryGeneratedColumn()
  public id: number;

  @CreateDateColumn({
    type: 'timestamptz',
    nullable: true,
    name: 'created_at',
  })
  createAt?: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    nullable: true,
    name: 'updated_at',
  })
  updateAt?: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    name: 'deleted_at',
  })
  deleteAt?: Date;
}
