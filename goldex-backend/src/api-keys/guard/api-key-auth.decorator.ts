import { UseGuards, applyDecorators } from "@nestjs/common";
import { ApiHeader, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { API_KEY_HEADER, KEYED_ROUTES } from "../api-key.constants";
import { ApiKeyGuard } from "./api-key.guard";

export { API_KEY_HEADER, KEYED_ROUTES };

/** Authenticate this route by API key instead of an operator session. */
export function ApiKeyAuth(): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const name =
      propertyKey === undefined
        ? (target as { name?: string }).name ?? "unknown"
        : `${target.constructor.name}.${String(propertyKey)}`;
    if (!KEYED_ROUTES.includes(name)) KEYED_ROUTES.push(name);

    const decorate = applyDecorators(
      UseGuards(ApiKeyGuard),
      ApiHeader({ name: API_KEY_HEADER, required: true, description: "An API key issued in the admin panel." }),
      ApiUnauthorizedResponse({ description: "Missing, unknown, or revoked API key." }),
    );
    return (decorate as (t: object, k?: string | symbol, d?: PropertyDescriptor) => void)(
      target,
      propertyKey,
      descriptor,
    );
  }) as MethodDecorator & ClassDecorator;
}
