export enum AdminRole {
  SUPER_ADMIN = "superAdmin",
  ADMIN = "admin",
  FINANCE = "finance",
  WAREHOUSE = "warehouse",
}

// Role hierarchy for permission checking
export const RoleHierarchy = {
  [AdminRole.SUPER_ADMIN]: 4,
  [AdminRole.ADMIN]: 3,
  [AdminRole.FINANCE]: 2,
  [AdminRole.WAREHOUSE]: 1,
};

// Permission decorator helper
export const RolePermissions = {
  [AdminRole.SUPER_ADMIN]: ["*"], // Full access
  [AdminRole.ADMIN]: ["create", "read", "update", "suspend"],
  [AdminRole.FINANCE]: ["read", "update_finance"],
  [AdminRole.WAREHOUSE]: ["read", "update_inventory"],
};
