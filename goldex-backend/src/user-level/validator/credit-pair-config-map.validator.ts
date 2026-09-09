import {
  registerDecorator,
  validateSync,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreditPairConfigDto } from "../../credit/dto/credit-pair-config.dto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a `{ [pairId]: CreditPairConfig }` map.
 *
 * The map is a jsonb column, so nothing else type-checks it: an unknown key or
 * an out-of-range percentage would sit in the database until the order path
 * quietly ignored it. Validating here turns that into a 400 the admin panel can
 * show against the field the operator just edited.
 */
export function IsCreditPairConfigMap(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isCreditPairConfigMap",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const errors = collectErrors(value);
          // Stash the detail so the message can name what actually failed.
          (args.object as Record<string, unknown>).__creditConfigErrors = errors;
          return errors.length === 0;
        },
        defaultMessage(args: ValidationArguments) {
          const errors = ((args.object as Record<string, unknown>).__creditConfigErrors ??
            []) as string[];
          return `creditConfigs is invalid: ${errors.join("; ")}`;
        },
      },
    });
  };
}

function collectErrors(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    return ["expected an object keyed by price pair id"];
  }

  const errors: string[] = [];
  for (const [pairId, config] of Object.entries(value as Record<string, unknown>)) {
    if (!UUID_RE.test(pairId)) {
      errors.push(`"${pairId}" is not a price pair id`);
      continue;
    }
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      errors.push(`${pairId}: expected an object of credit settings`);
      continue;
    }
    const instance = plainToInstance(CreditPairConfigDto, config, {
      enableImplicitConversion: false,
    });
    // whitelist + forbidNonWhitelisted so a misspelled rule is reported rather
    // than stored as a field nothing ever reads.
    const failures = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    for (const failure of failures) {
      const constraints = Object.values(failure.constraints ?? {}).join(", ");
      errors.push(`${pairId}.${failure.property}: ${constraints || "invalid"}`);
    }
  }
  return errors;
}
