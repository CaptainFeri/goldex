import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminScheduleEntity } from "./entity/admin-schedule.entity";
import { CreateScheduleDto } from "./dto/create-schedule.dto";

@Injectable()
export class AdminScheduleService {
  constructor(
    @InjectRepository(AdminScheduleEntity)
    private scheduleRepository: Repository<AdminScheduleEntity>,
  ) {}

  async create(dto: CreateScheduleDto): Promise<AdminScheduleEntity> {
    const existing = await this.scheduleRepository.findOne({
      where: { adminId: dto.adminId, dayOfWeek: dto.dayOfWeek },
    });
    if (existing) {
      throw new BadRequestException(`Schedule already exists for admin on this day`);
    }

    const schedule = this.scheduleRepository.create(dto);
    return await this.scheduleRepository.save(schedule);
  }

  async findByAdmin(adminId: string): Promise<AdminScheduleEntity[]> {
    return await this.scheduleRepository.find({
      where: { adminId, isActive: true },
      order: { dayOfWeek: "ASC" },
    });
  }

  async update(id: string, dto: Partial<CreateScheduleDto>): Promise<AdminScheduleEntity> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) throw new NotFoundException("Schedule not found");

    Object.assign(schedule, dto);
    return await this.scheduleRepository.save(schedule);
  }

  async remove(id: string): Promise<void> {
    await this.scheduleRepository.delete(id);
  }

  async isWithinWorkHours(adminId: string, timezone: string = "Asia/Tehran"): Promise<boolean> {
    const schedules = await this.findByAdmin(adminId);
    if (schedules.length === 0) return true;

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    const formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone });
    const parts = formatter.formatToParts(now);

    const dayNames: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };

    const dayPart = parts.find((p) => p.type === "weekday")?.value.toLowerCase() || "";
    const hourPart = parts.find((p) => p.type === "hour")?.value || "00";
    const minutePart = parts.find((p) => p.type === "minute")?.value || "00";

    const currentDayOfWeek = dayNames[dayPart];
    const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);

    const todaySchedule = schedules.find((s) => s.dayOfWeek === currentDayOfWeek);
    if (!todaySchedule) return false;

    const [startH, startM] = todaySchedule.startTime.split(":").map(Number);
    const [endH, endM] = todaySchedule.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
}
