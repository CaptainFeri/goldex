import { SetMetadata } from "@nestjs/common";

export const REQUIRED_FEATURE_KEY = "required_feature";

export const RequireFeature = (featureKey: string) =>
  SetMetadata(REQUIRED_FEATURE_KEY, featureKey);
