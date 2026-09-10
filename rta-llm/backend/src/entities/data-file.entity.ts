import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('data_files')
export class DataFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  size: number;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  uploadedAt: Date;
}
