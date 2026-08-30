import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export abstract class myBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', nullable: true, name: 'created_at' })
  createAt?: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true, name: 'updated_at' })
  updateAt?: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'deleted_at' })
  deleteAt?: Date;
}
