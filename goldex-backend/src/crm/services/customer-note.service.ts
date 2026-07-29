import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CustomerNoteEntity, NoteCategoryEnum } from "../entity/customer-note.entity";

@Injectable()
export class CustomerNoteService {
  constructor(
    @InjectRepository(CustomerNoteEntity)
    private readonly noteRepository: Repository<CustomerNoteEntity>,
  ) {}

  async create(userId: string, adminId: string, content: string, category?: NoteCategoryEnum): Promise<CustomerNoteEntity> {
    const note = this.noteRepository.create({
      userId,
      adminId,
      content,
      category: category || NoteCategoryEnum.GENERAL,
    });
    return this.noteRepository.save(note);
  }

  async findByUser(userId: string): Promise<CustomerNoteEntity[]> {
    return this.noteRepository.find({
      where: { userId },
      order: { isPinned: "DESC", createAt: "DESC" },
      relations: { admin: true },
    });
  }

  async update(id: string, adminId: string, data: { content?: string; category?: NoteCategoryEnum; isPinned?: boolean }): Promise<CustomerNoteEntity> {
    const note = await this.noteRepository.findOne({ where: { id } });
    if (!note) throw new NotFoundException("Note not found");
    if (data.content !== undefined) note.content = data.content;
    if (data.category !== undefined) note.category = data.category;
    if (data.isPinned !== undefined) note.isPinned = data.isPinned;
    return this.noteRepository.save(note);
  }

  async remove(id: string): Promise<void> {
    const result = await this.noteRepository.softDelete(id);
    if (result.affected === 0) throw new NotFoundException("Note not found");
  }
}
