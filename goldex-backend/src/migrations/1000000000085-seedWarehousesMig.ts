import { MigrationInterface, QueryRunner } from "typeorm";

interface SeedWarehouse {
  name: string;
  description: string;
  location: string;
  capacityTotal: string;
  timeLimit: string;
}

const SEED_WAREHOUSES: SeedWarehouse[] = [
  {
    name: "انبار مرکزی تهران",
    description: "انبار مرکزی و اصلی طلا در تهران",
    location: "تهران، خیابان ولیعصر، نرسیده به میدان ونک",
    capacityTotal: "50000.00000000",
    timeLimit: "24h",
  },
  {
    name: "انبار بازار بزرگ",
    description: "انبار جنب بازار بزرگ تهران (راسته زرگرها)",
    location: "تهران، بازار بزرگ، راسته زرگرها",
    capacityTotal: "25000.00000000",
    timeLimit: "24h",
  },
  {
    name: "انبار غرب تهران",
    description: "انبار شعبه غرب تهران",
    location: "تهران، سعادت‌آباد، خیابان سرو",
    capacityTotal: "30000.00000000",
    timeLimit: "48h",
  },
  {
    name: "انبار شمال تهران",
    description: "انبار شعبه شمال تهران",
    location: "تهران، نیاوران، خیابان کامرانیه",
    capacityTotal: "20000.00000000",
    timeLimit: "48h",
  },
  {
    name: "انبار شرق تهران",
    description: "انبار شعبه شرق تهران",
    location: "تهران، تهرانپارس، فلکه اول",
    capacityTotal: "15000.00000000",
    timeLimit: "72h",
  },
  {
    name: "انبار جنوب تهران",
    description: "انبار شعبه جنوب تهران",
    location: "تهران، شهرری، بلوار امام حسین",
    capacityTotal: "10000.00000000",
    timeLimit: "72h",
  },
];

const DELIVERY_DATES: string[] = [
  "2026-08-29T00:00:00.000Z",
  "2026-08-30T00:00:00.000Z",
  "2026-08-31T00:00:00.000Z",
  "2026-09-01T00:00:00.000Z",
  "2026-09-02T00:00:00.000Z",
];

const DELIVERY_SCHEDULE = JSON.stringify({
  saturday: { start: "09:00", end: "18:00" },
  sunday: { start: "09:00", end: "18:00" },
  monday: { start: "09:00", end: "18:00" },
  tuesday: { start: "09:00", end: "18:00" },
  wednesday: { start: "09:00", end: "18:00" },
  thursday: { start: "09:00", end: "14:00" },
});

export class SeedWarehousesMig1000000000085 implements MigrationInterface {
  name = "SeedWarehousesMig1000000000085";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'warehouse'
      );
    `);

    if (!tableExists[0].exists) {
      console.log("Warehouse table does not exist yet. Skipping seed.");
      return;
    }

    for (const w of SEED_WAREHOUSES) {
      const existing = await queryRunner.query(
        `SELECT id FROM warehouse WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
        [w.name]
      );
      if (existing.length > 0) continue;

      await queryRunner.query(
        `INSERT INTO warehouse (
          name,
          description,
          location,
          capacity_total,
          capacity_used,
          capacity_remaining,
          delivery_dates,
          delivery_schedule,
          time_limit,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, 0, $4, $5, $6::jsonb, $7, 'ACTIVE', NOW(), NOW())`,
        [w.name, w.description, w.location, w.capacityTotal, JSON.stringify(DELIVERY_DATES), DELIVERY_SCHEDULE, w.timeLimit]
      );
      console.log(`Warehouse seeded: ${w.name}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'warehouse'
      );
    `);

    if (!tableExists[0].exists) return;

    const names = SEED_WAREHOUSES.map((w) => w.name);
    await queryRunner.query(
      `UPDATE warehouse SET deleted_at = NOW() WHERE name = ANY($1) AND deleted_at IS NULL`,
      [names]
    );
    console.log(`Soft deleted ${names.length} seeded warehouses.`);
  }
}